const _ = require("lodash");
const async = require("async");
const path = require("path");
const util = require("util");
const fs = require("fs");

const { sendEmail } = require("../emails");

const accountId = process.env.WILDAPRICOT_ACCOUNT_ID;

// configure logging
const logsDir = path.join(__dirname, "./logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
const bunyan = require("bunyan");
const RotatingFileStream = require("bunyan-rotating-file-stream");
let log = bunyan.createLogger({
  name: "membership_updates",
  streams: [
    {
      stream: process.stderr,
      level: "trace",
    },
    {
      stream: new RotatingFileStream({
        path: path.join(__dirname, ".", "logs/membership_updates.log"),
        period: "1d", // daily rotation
        totalFiles: 1000, // keep up to 1000 back copies
        rotateExisting: true, // Give ourselves a clean file when we start up, based on period
        threshold: "1m", // Rotate log files larger than 1 megabyte
        totalSize: "1g", // Don't keep more than 1gb of archived log files
        gzip: true, // Compress the archive log files to save space
      }),
      level: "trace",
    },
  ],
  level: bunyan.TRACE,
});

let apiClientMethods = null;

/******************************
 * Search the member database *
 ******************************/
const getContacts = (args, action) => {
  const interval = 10000;

  // send the member query to the API
  apiClientMethods.listContacts(args, (contactData, response) => {
    if (!_.isNil(contactData) && !_.isNil(contactData.State)) {
      // good response
      let resId;
      switch (contactData.State) {
        case "Waiting":
        case "Processing":
          // asyncrounous request may take a few seconds to complete
          resId = contactData.ResultId;
          log.trace(
            "Request processing (result ID: %s) ... keep checking for results every %d seconds",
            resId,
            interval / 1000
          );
          setTimeout(getContacts, interval, args, action);
          break;

        case "Complete":
          // process results
          if (!_.isNil(contactData.Contacts)) {
            if (_.isArray(contactData.Contacts)) {
              log.trace(
                "%s contacts retrieved",
                contactData.Contacts.length > 0
                  ? contactData.Contacts.length
                  : "No"
              );
            }
            if (contactData.Contacts.length > 0) {
              processContacts(
                contactData.Contacts.filter((contact) => {
                  return (
                    contact.FieldValues.filter((field) => {
                      return field.FieldName === "Membership enabled";
                    })[0].Value == true
                  );
                }),
                action
              );
            }
          } else {
            // query complete -- get the results (an extra API call)
            resId = contactData.ResultId;
            log.trace(
              "Request complete (result ID: %s) -- retrieving contacts with action %s ...",
              resId,
              action
            );
            let resArgs = _.clone(args);
            resArgs.parameters = { resultId: resId };
            setTimeout(getContacts, 1000, resArgs, action); // delay one more second...
          }
          break;

        case "Failed":
          // query failed -- this should not happen unless the parameters were changed
          log.error(contactData);
          break;

        default:
          log.trace(
            "This should not happen unless the API is changed -- returned state is '%s'",
            contactData.State
          );
      }
    }
    return 1;
  });
};

// allowable actions
const actions = ["newbieToNewcomerUpdate", "makeAlumniUpdate"];
let processed = 0;
let updated = 0;
let skipped = 0;
let errors = 0;

/*************************
 * process member record *
 *************************/
const processContact = (contact, index, callback) => {
  log.trace(
    "%d >>> Processing contact ID %s (%s %s)",
    index + 1,
    contact.id,
    contact.firstName,
    contact.lastName
  );
  processed++;

  // Update membership level
  log.trace(
    "%d >>> Updating membership level to '%s' for %s %s (contact ID: %s)",
    updated,
    contact.membershipLevel,
    contact.firstName,
    contact.lastName,
    contact.id
  );

  const levelUpdateArgs = {
    path: { accountId: accountId, contactId: contact.id.toString() },
    data: {
      Id: contact.id,
      MembershipLevel: {
        Id: contact.membershipLevelId,
      },
    },
  };
  /*****************************
   * Update the contact record *
   *****************************/
  apiClientMethods.updateContact(
    levelUpdateArgs,
    (contactDataUpd, response) => {
      if (!_.isNil(contactDataUpd) && !_.isNil(contactDataUpd.Id)) {
        updated++;
        log.trace(
          "%d >>> Membership level successfully updated to for %s %s (contact ID: %s)",
          index + 1,
          contactDataUpd.FirstName,
          contactDataUpd.LastName,
          contactDataUpd.Id
        );
        setTimeout(function () {
          callback();
        }, 1000);
      } else {
        errors++;
        const msg = util.format(
          "%d >>> Failed to update membership level for %s %s (contact ID %s) -- %s (%s)",
          index + 1,
          contact.firstName,
          contact.lastName,
          contact.id,
          response.statusMessage,
          response.statusCode
        );
        log.error(msg);
        setTimeout(function () {
          callback();
        }, 1000);
      }
    }
  );
};

/*************************
 * Process member records *
 *************************/
const processContacts = (members, action) => {
  if (actions.indexOf(action) < 0) {
    throw new Error(util.format("Unsupported action (%s)", action));
  }

  log.info("%d members to process", members.length);

  // For each member, prepare payload with updated membership level
  const memberRecords = members.map((member) => {
    const { Id: id, FirstName: firstName, LastName: lastName } = member;
    const currentMembershipLevel = member.MembershipLevel.Name;
    const isNewbie = currentMembershipLevel.includes("Newbie");
    let membershipLevel = isNewbie ? "NewcomerMember" : "Alumni";
    const isVUUser = currentMembershipLevel.includes("VU");
    if (isVUUser) membershipLevel = membershipLevel + " VU";
    const membershipLevelId = lookupMembershipLevel(membershipLevel);
    const membershipStatusSysCode = member.FieldValues.filter((field) => {
      return field.FieldName == "Membership status";
    })[0].SystemCode;
    const subject = isNewbie
      ? "Newbie to Newcomer Updates"
      : "Alumni Updates - " + currentMembershipLevel;

    return {
      action: action,
      membershipLevel,
      membershipLevelId,
      membershipStatusSysCode,
      status: "Active",
      subject,
      firstName,
      lastName,
      id,
    };
  });

  console.log("memberRecords length", memberRecords.length);
  console.log("memberRecords", memberRecords);

  if (memberRecords.length) {
    // Process each contact record
    async.eachOfSeries(memberRecords, processContact, (err) => {
      if (err) log.error(err);
      else
        sendEmail({
          action,
          errors,
          log,
          memberRecords,
          processed,
          skipped,
          updated,
        });
    });
  }

  return processed;
};

/*****************
 * Error handler *
 *****************/
process.on("uncaughtException", (err) => log.error(1, `${err}`));

/****************************
 * Membership levels lookup *
 ****************************/
const levels = []; // populated below by apiClient.methods.listMembershipLevels
const lookupMembershipLevel = (ml) =>
  levels.filter((level) => level.name == ml)[0].id;

const args = {
  path: { accountId: accountId },
  parameters: { $async: false },
};

module.exports = {
  alumniUpdates: (apiClient) => {
    apiClientMethods = apiClient.methods;
    return apiClientMethods.listMembershipLevels(
      args,
      (levelData, response) => {
        if (!_.isNil(levelData)) {
          // good response
          if (_.isArray(levelData)) {
            log.trace(
              "%d initial membership levels retrieved",
              levelData.length
            );
          }
          if (levelData.length > 0) {
            for (const level of levelData) {
              levels.push({
                id: level.Id,
                name: level.Name,
              });
            }

            const today = new Date();
            const todayIso = today.toISOString().substring(0, 10); // keep the yyyy-mm-dd portion

            const alumniMembershipLevels = [
              "ExtendedNewcomer",
              "ExtendedNewcomer VU",
              "NewcomerMember",
              "NewcomerMember VU",
            ];

            const alumniArgs = (membershipLevel) => ({
              path: { accountId: accountId },
              parameters: {
                $select:
                  "'First name','Last name','Membership status','Membership enabled','Member since', 'Renewal due",
                $filter:
                  "'Membership status' eq 'Active'" +
                  " AND 'Membership level ID' eq " +
                  lookupMembershipLevel(membershipLevel) +
                  " AND 'Renewal due' lt '" +
                  todayIso +
                  "'",
              },
            });

            // Convert applicable members to Alumni
            alumniMembershipLevels.forEach((level) => {
              const args = alumniArgs(level);
              getContacts(args, "makeAlumniUpdate", apiClientMethods);
            });
          }
        }
      }
    );
  },
  newbieUpdates: (apiClient) => {
    apiClientMethods = apiClient.methods;
    return apiClientMethods.listMembershipLevels(
      args,
      (levelData, response) => {
        if (!_.isNil(levelData)) {
          // good response
          if (_.isArray(levelData)) {
            log.trace(
              "%d initial membership levels retrieved",
              levelData.length
            );
          }
          if (levelData.length > 0) {
            for (const level of levelData) {
              levels.push({
                id: level.Id,
                name: level.Name,
              });
            }

            const today = new Date();
            today.setDate(today.getDate() + 641);
            const todayPlus640 = today.toISOString().substring(0, 10); // keep the yyyy-mm-dd portion

            const newbieArgs = (membershipLevel) => ({
              path: { accountId: accountId },
              parameters: {
                $select:
                  "'First name','Last name','Membership status','Membership enabled','Member since', 'Renewal due",
                $filter:
                  "'Membership status' eq 'Active'" +
                  " AND 'Membership level ID' eq " +
                  lookupMembershipLevel(membershipLevel) +
                  " AND 'Renewal due' le '" +
                  todayPlus640 +
                  "'",
              },
            });

            const membershipLevels = ["NewbieNewcomer", "NewbieNewcomer VU"];

            // Convert applicable Newbies to Newcomers
            membershipLevels.forEach((level) => {
              const args = newbieArgs(level);
              getContacts(args, "newbieToNewcomerUpdate", apiClientMethods);
            });
          }
        }
      }
    );
  },
};
