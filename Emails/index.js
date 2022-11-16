/*jshint esversion: 6 */
const path = require('path');
const util = require('util');
const aws = require('aws-sdk');

aws.config.loadFromPath(path.join(__dirname, '..', 'shared/aws.json'));

// configure mail
const emailTo = 'dysbnewcomers@gmail.com';
const emailFrom = 'webmaster5@sbnewcomers.org';

// Send email with results of updated membership
const sendEmail = async ({ action, errors, log, newbieRecords, processed, skipped, updated }) => {
  // Create sendEmail params
  let listText,
    contact = '';
  let listHtml = '<ul>';
  newbieRecords.map((record) => {
    contact = util.format('%s %s (%d)', record.firstName, record.lastName, record.id);
    listText += '\n' + contact;
    listHtml += '<li>' + contact + '</li>';
  });

  const params = {
    Destination: {
      ToAddresses: [emailTo],
    },
    Message: {
      Body: {
        Html: {
          Charset: 'UTF-8',
          Data: util.format(
            '%s processed for %d newbie%s with %d updated, %d skipped, and %d error%s %s',
            action,
            processed,
            processed > 1 ? 's' : processed == 1 ? '' : 's',
            updated,
            skipped,
            errors,
            errors == 1 ? '' : 's',
            listHtml
          ),
        },
        Text: {
          Charset: 'UTF-8',
          Data: util.format(
            '%s processed for %d newbie%s with %d updated, %d skipped, and %d error%s\n%s',
            action,
            processed,
            processed > 1 ? 's' : processed == 1 ? '' : 's',
            updated,
            skipped,
            errors,
            errors == 1 ? '' : 's',
            listText
          ),
        },
      },
      Subject: {
        Charset: 'UTF-8',
        Data: util.format('%sNewbie to Newcomer update', errors > 0 ? '*** ERRORS: ' : ''),
      },
    },
    Source: emailFrom,
    ReplyToAddresses: ['no-reply@sbnewcomers.org'],
  };

  // Create the promise and SES service object
  const sendPromise = new aws.SES({ apiVersion: '2010-12-01' }).sendEmail(params).promise();
  log.info(
    '%s processed for %d newbie%s with %d updated, %d skipped, and %d error%s',
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
    .then(function (data) {
      // reset counters
      processed = 0;
      errors = 0;
      //console.log(data.MessageId);
    })
    .catch(function (err) {
      console.error(err, err.stack);
    });
};

module.exports = {
  sendEmail,
};
