/*jshint esversion: 6 */
const _ = require('lodash');
const async = require('async');
const path = require('path');
const util = require('util');
const fs = require('fs');

const { sendEmail } = require('../Emails');
const { accountId } = require(path.join(__dirname, '..', 'shared/config'));

// configure logging
const logsDir = path.join(__dirname, './logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);
const bunyan = require('bunyan');
const RotatingFileStream = require('bunyan-rotating-file-stream');
let log = bunyan.createLogger({
  name: 'newbie_to_newcomer',
  streams: [
    {
      stream: process.stderr,
      level: 'trace',
    },
    {
      stream: new RotatingFileStream({
        path: path.join(__dirname, '.', 'logs/newbie_to_newcomer.log'),
        period: '1d', // daily rotation
        totalFiles: 1000, // keep up to 1000 back copies
        rotateExisting: true, // Give ourselves a clean file when we start up, based on period
        threshold: '1m', // Rotate log files larger than 1 megabyte
        totalSize: '1g', // Don't keep more than 1gb of archived log files
        gzip: true, // Compress the archive log files to save space
      }),
      level: 'trace',
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

  // send the newbie query to the API
  apiClientMethods.listContacts(args, (contactData, response) => {
    if (!_.isNil(contactData) && !_.isNil(contactData.State)) {
      // good response
      let resId;
      switch (contactData.State) {
        case 'Waiting':
        case 'Processing':
          // asyncrounous request may take a few seconds to complete
          resId = contactData.ResultId;
          log.trace(
            'Request processing (result ID: %s) ... keep checking for results every %d seconds',
            resId,
            interval / 1000
          );
          setTimeout(getContacts, interval, args, action);
          break;

        case 'Complete':
          // process results
          if (!_.isNil(contactData.Contacts)) {
            if (_.isArray(contactData.Contacts)) {
              log.trace(
                '%s contacts retrieved',
                contactData.Contacts.length > 0 ? contactData.Contacts.length : 'No'
              );
            }
            if (contactData.Contacts.length > 0) {
              processContacts(
                contactData.Contacts.filter((contact) => {
                  return (
                    contact.FieldValues.filter((field) => {
                      return field.FieldName === 'Membership enabled';
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
              'Request complete (result ID: %s) -- retrieving contacts with action %s ...',
              resId,
              action
            );
            let resArgs = _.clone(args);
            resArgs.parameters = { resultId: resId };
            setTimeout(getContacts, 1000, resArgs, action); // delay one more second...
          }
          break;

        case 'Failed':
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
const actions = ['newbieToNewcomerUpdate'];
let processed = 0;
let updated = 0;
let skipped = 0;
let errors = 0;

/*************************
 * process member record *
 *************************/
const processContact = (contact, index, callback) => {
  log.trace(
    '%d >>> Processing contact ID %s (%s %s)',
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

  console.log('levelUpdateArgs', levelUpdateArgs);
  callback();
  /*****************************
   * Update the contact record *
   *****************************/
  // apiClient.methods.updateContact(levelUpdateArgs, function (contactDataUpd, response) {
  //   if (!_.isNil(contactDataUpd) && !_.isNil(contactDataUpd.Id)) {
  //     updated++;
  //     log.trace(
  //       '%d >>> Membership level successfully updated to for %s %s (contact ID: %s)',
  //       index + 1,
  //       contactDataUpd.FirstName,
  //       contactDataUpd.LastName,
  //       contactDataUpd.Id
  //     );
  //     setTimeout(function () {
  //       callback();
  //     }, 1000);
  //   } else {
  //     errors++;
  //     const msg = util.format(
  //       '%d >>> Failed to update membership level for %s %s (contact ID %s) -- %s (%s)',
  //       index + 1,
  //       contact.firstName,
  //       contact.lastName,
  //       contact.id,
  //       response.statusMessage,
  //       response.statusCode
  //     );
  //     log.error(msg);
  //     setTimeout(function () {
  //       callback();
  //     }, 1000);
  //   }
  // });
};

/*************************
 * Process member records *
 *************************/
const processContacts = (newbies, action) => {
  if (actions.indexOf(action) < 0) {
    throw new Error(util.format('Unsupported action (%s)', action));
  }

  log.info('%d newbies to process', newbies.length);

  // For each newbie, prepare payload with updated membership level
  const newbieRecords = newbies.map((newbie) => {
    const { Id: id, FirstName: firstName, LastName: lastName } = newbie;
    const isVUUser = newbie.MembershipLevel.Name.includes('VU');
    const membershipLevel = isVUUser ? 'NewcomerMember VU' : 'NewcomerMember';
    const membershipLevelId = lookupMembershipLevel(membershipLevel);
    const membershipStatusSysCode = newbie.FieldValues.filter((field) => {
      return field.FieldName == 'Membership status';
    })[0].SystemCode;

    return {
      action: action,
      membershipLevel,
      membershipLevelId,
      membershipStatusSysCode,
      status: 'Active',
      firstName,
      lastName,
      id,
    };
  });

  console.log('newbieRecords', newbieRecords);

  if (newbieRecords.length) {
    // Process each contact record
    async.eachOfSeries(newbieRecords, processContact, (err) => {
      if (err) log.error(err);
      else sendEmail({ action, errors, log, newbieRecords, processed, skipped, updated });
    });
  }

  return processed;
};

/*****************
 * Error handler *
 *****************/
process.on('uncaughtException', (err) => log.error(1, `${err}`));

/*******************************
 * set query filter parameters *
 *******************************/
const today = new Date();
today.setDate(today.getDate() + 641);
const todayPlus640 = today.toISOString().substring(0, 10); // keep the yyyy-mm-dd portion
console.log('Today + 640 days: ' + todayPlus640);

/****************************
 * Membership levels lookup *
 ****************************/
const levels = []; // populated below by apiClient.methods.listMembershipLevels
const lookupMembershipLevel = (ml) => levels.filter((level) => level.name == ml)[0].id;

const args = {
  path: { accountId: accountId },
  parameters: { $async: false },
};

module.exports = {
  init: (apiClient) => {
    apiClientMethods = apiClient.methods;
    return apiClientMethods.listMembershipLevels(args, (levelData, response) => {
      if (!_.isNil(levelData)) {
        // good response
        if (_.isArray(levelData)) {
          log.trace('%d initial membership levels retrieved', levelData.length);
        }
        if (levelData.length > 0) {
          for (const level of levelData) {
            levels.push({
              id: level.Id,
              name: level.Name,
            });
          }

          /***********************
           * run the main script *
           ***********************/
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

          const membershipLevels = ['NewbieNewcomer', 'NewbieNewcomer VU'];

          membershipLevels.forEach((level) => {
            const args = newbieArgs(level);
            getContacts(args, 'newbieToNewcomerUpdate', apiClientMethods);
          });
        }
      }
    });
  },
};
