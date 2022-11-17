/*jshint esversion: 6 */
/*jslint node: true */
'use strict';

const _ = require('lodash');
const async = require('async');
const path = require('path');
const Client = require('node-rest-client').Client;
const config = require('./config');

// configure logging
const bunyan = require('bunyan');
const RotatingFileStream = require('bunyan-rotating-file-stream');
const log = bunyan.createLogger({
  name: 'wildapricot',
  streams: [
    {
      stream: process.stderr,
      level: 'info',
    },
    {
      stream: new RotatingFileStream({
        path: path.join(__dirname, '.', 'logs/wild_apricot_client.log'),
        period: '1d', // daily rotation
        totalFiles: 500, // keep up to 500 back copies
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

let options = {
    tokenHost: 'https://oauth.wildapricot.org',
    tokenEndpoint: '/auth/token',
    resourceHost: 'https://api.wildapricot.org',
    resourceEndpoint: '/v2.1',
  },
  client = null,
  accessToken = null,
  scope = null,
  tokenExpiresAt = new Date();

const authenticate = (callback) => {
  const args = {
    data: [
      'grant_type=password&username=',
      options.user,
      '&password=',
      options.pass,
      '&scope=',
      options.scope,
    ].join(''),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };

  client.post(options.tokenHost + options.tokenEndpoint, args, function (data, response) {
    if (data && data.error) {
      log.error(data);
      throw new Error(data.error + (data.error_description ? ': ' + data.error_description : ''));
    } else if (data && data.access_token) {
      accessToken = data.access_token;
      log.trace('OAuth token: %s', accessToken);
      tokenExpiresAt = new Date();
      tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + data.expires_in);
    }
    if (_.isFunction(callback)) callback();
  });
};

const isTokenExpired = () => new Date() > tokenExpiresAt;

const getHeaders = () => ({
  Authorization: 'Bearer ' + accessToken,
  'Content-Type': 'application/json',
});

const wrapMethods = () => {
  // Wrap all of our registered WildApricot methods so we can silently inject the authentication headers
  _.each(client.methods, function (method, methodName) {
    client.methods[methodName] = _.wrap(method, function (originalMethod, args, callback) {
      if (!args) args = {};
      if (!args.headers) args.headers = {};

      async.series(
        [
          (cb) => {
            if (!accessToken || isTokenExpired()) authenticate(cb);
            else cb();
          },
          (cb) => {
            _.extend(args.headers, getHeaders());
            cb();
          },
        ],
        () => originalMethod(args, callback)
      );
    });
  });
};

const registerClientMethods = () => {
  const baseURL = options.resourceHost + options.resourceEndpoint;
  const accountURL = baseURL + '/accounts/${accountId}';

  // Contacts: https://app.swaggerhub.com/apis-docs/WildApricot/wild-apricot_public_api/7.24.0#/Contacts
  const contactsURL = accountURL + '/contacts';
  const contactURL = contactsURL + '/${contactId}';
  client.registerMethod('listContacts', contactsURL, 'GET');
  client.registerMethod('listContact', contactURL, 'GET');
  client.registerMethod('updateContact', contactURL, 'PUT');

  // Event registrations: https://api.wildapricot.org/v2.1/accounts/:accountId/eventregistrations?eventId=:eventId
  const eventRegistrationsURL = accountURL + '/eventregistrations';
  client.registerMethod('listEventRegs', eventRegistrationsURL, 'GET');

  // DAN THINKS THIS MAY BE POINTING TO THE WRONG ENDPOINT
  // Event registrations: https://api.wildapricot.org/v2.1/accounts/:accountId/eventregistrations?contactId=:contactId
  client.registerMethod('listContactEventRegs', eventRegistrationsURL, 'GET');

  // Event: https://api.wildapricot.org/v2.1/accounts/:accountId/events/:eventId
  const eventsURL = accountURL + '/events';
  const eventURL = eventsURL + '/${eventId}';
  client.registerMethod('listEvents', eventsURL, 'GET');
  client.registerMethod('listEvent', eventURL, 'GET');

  // Invoice: https://api.wildapricot.org/v2.1/accounts/:accountId/Invoices/:invoiceId",
  const invoiceURL = accountURL + '/invoices/${invoiceId}';
  client.registerMethod('listInvoice', invoiceURL, 'GET');

  // Membership levels: Invoice: https://api.wildapricot.org/v2.1/accounts/:accountId/MembershipLevels",
  const membershipLevelsURL = accountURL + '/membershiplevels';
  client.registerMethod('listMembershipLevels', membershipLevelsURL, 'GET');

  wrapMethods();
};

module.exports = {
  init: () => {
    const _options = {
      account: config.accountId,
      user: config.userId,
      pass: config.password,
      client: config.clientId,
      secret: config.secret,
      scope: config.scope,
    };
    const requiredOptions = ['user', 'pass', 'client', 'secret', 'scope'],
      missingOptions = _.difference(requiredOptions, _.keys(_options));

    if (missingOptions.length) {
      throw new Error('The following options are required: ' + missingOptions.join(', '));
    }

    _.extend(options, _options);

    client = new Client({
      user: _options.client,
      password: _options.secret,
    });
    scope = _options.scope;

    registerClientMethods();

    return client;
  },
};
