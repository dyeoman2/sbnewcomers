const cfg = {
  accountId: process.env.WILDAPRICOT_ACCOUNT_ID,
  userId: process.env.WILDAPRICOT_USER_ID,
  password: process.env.WILDAPRICOT_PASSWORD,
  clientId: process.env.WILDAPRICOT_CLIENT_ID,
  secret: process.env.WILDAPRICOT_CLIENT_SECRET,
  scope: process.env.WILDAPRICOT_SCOPE,
};

const requiredConfig = [cfg.accountId, cfg.userId, cfg.password, cfg.clientId, cfg.secret];
const isConfigured = requiredConfig.every((configValue) => configValue || false);

if (!isConfigured) {
  const errorMessage =
    'WILDAPRICOT_ACCOUNT_ID, WILDAPRICOT_USER_ID, WILDAPRICOT_PASSWORD, WILDAPRICOT_CLIENT_ID, and WILDAPRICOT_CLIENT_SECRET must be set.';
  throw new Error(errorMessage);
}

// Export configuration object
module.exports = cfg;
