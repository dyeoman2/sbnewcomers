/*jshint esversion: 6 */
const path = require('path');
const dotenv = require('dotenv');
var cfg = {};

if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  dotenv.config({
    path: path.join(__dirname, '.', '.env'),
  });
} else {
  dotenv.config({
    path: path.join(__dirname, '.', '.env.test'),
    silent: true,
  });
}

cfg.accountId = process.env.WILDAPRICOT_ACCOUNT_ID;
cfg.userId = process.env.WILDAPRICOT_USER_ID;
cfg.password = process.env.WILDAPRICOT_PASSWORD;
cfg.clientId = process.env.WILDAPRICOT_CLIENT_ID;
cfg.secret = process.env.WILDAPRICOT_CLIENT_SECRET;
cfg.scope = process.env.WILDAPRICOT_SCOPE;

var requiredConfig = [cfg.accountId, cfg.userId, cfg.password, cfg.clientId, cfg.secret];
var isConfigured = requiredConfig.every(function (configValue) {
  return configValue || false;
});

if (!isConfigured) {
  var errorMessage =
    'WILDAPRICOT_ACCOUNT_ID, WILDAPRICOT_USER_ID, WILDAPRICOT_PASSWORD, WILDAPRICOT_CLIENT_ID, and WILDAPRICOT_CLIENT_SECRET must be set.';
  throw new Error(errorMessage);
}

// Export configuration object
module.exports = cfg;
