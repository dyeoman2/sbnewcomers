const util = require('util');
const { ses } = require('../lib/aws');

// configure mail
const emailTo = process.env.EMAIL_TO;
const emailFrom = process.env.EMAIL_FROM;
const emailCc = process.env.EMAIL_CC;

// Send email with results of updated membership
const sendEmail = async ({ action, errors, log, memberRecords, processed, skipped, updated }) => {
  const subject = memberRecords[0].subject;
  // Create sendEmail params
  let listText,
    contact = '';
  let listHtml = '<ul>';
  memberRecords.map((record) => {
    contact = util.format('%s %s (%d)', record.firstName, record.lastName, record.id);
    listText += '\n' + contact;
    listHtml += '<li>' + contact + '</li>';
  });

  const newbieText = `The Newbie members below were automatically updated to Newcomer members in WildApricot because they have been members for more than ninety days.`;
  const alumniText = `The members below were automatically updated to Alumni members in WildApricot because their renewal date was less than the current date. If you think one of the members below should not be an Alumni, please update their profile in WildApricot and make sure to update their renewal date to some point in the future.`;

  const isNewbie = action === 'newbieToNewcomerUpdate';
  const introText = isNewbie ? newbieText : alumniText;

  const techTextHtml =
    'More details about this automated process are located in Google Drive "TECH > 3RD PARTY INFO > AWS Login Info (Custom Code Scripts).docx" and in the <a href="https://github.com/dyeoman2/sbnewcomers" target="_blank">Github Repository</a>.';
  const techText =
    'More details about this automated process are located in Google Drive "TECH > 3RD PARTY INFO > AWS Login Info (Custom Code Scripts).docx" and in the Github Repository https://github.com/dyeoman2/sbnewcomers.';
  const helpText =
    'If you run into any issues with this process, please contact the SB Newcomers Tech Team or Daniel Yeoman at dyeoman2@gmail.com';

  const params = {
    Destination: {
      ToAddresses: [emailTo],
      CcAddresses: [emailCc],
    },
    Message: {
      Body: {
        Html: {
          Charset: 'UTF-8',
          Data: `${introText}\n${listHtml}</ul><p>${techTextHtml}</p><p>${helpText}</p>`,
        },
        Text: {
          Charset: 'UTF-8',
          Data: `${introText}\n${listText}\n${techText}\n${helpText}`,
        },
      },
      Subject: {
        Charset: 'UTF-8',
        Data: util.format('%s' + subject, errors > 0 ? '*** ERRORS: ' : ''),
      },
    },
    Source: emailFrom,
    ReplyToAddresses: ['no-reply@sbnewcomers.org'],
  };

  // Create the promise and SES service object
  const sendPromise = ses.sendEmail(params).promise();

  log.info(
    '%s processed for %d member%s with %d updated, %d skipped, and %d error%s',
    action,
    processed,
    processed > 1 ? 's' : processed == 1 ? '' : 's',
    updated,
    skipped,
    errors,
    errors == 1 ? '' : 's'
  );

  // Handle promise's fulfilled/rejected states
  sendPromise
    .then((data) => {
      // reset counters
      processed = 0;
      errors = 0;
      //console.log(data.MessageId);
    })
    .catch((err) => {
      console.error(err, err.stack);
    });
};

module.exports = {
  sendEmail,
};
