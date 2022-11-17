const aws = require('aws-sdk');

const awsConfig = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
};

aws.config.update(awsConfig);

const ses = new aws.SES({ apiVersion: '2010-12-01' });

module.exports = {
  aws,
  ses,
};
