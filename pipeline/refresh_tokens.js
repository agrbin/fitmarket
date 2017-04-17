var
  config = require("../common/config.js"),
  db = new (require("../common/db.js").Db)(),
  fs = require("fs"),
  FitbitApiClient = require("fitbit-node"),
  google = require('googleapis'),
  moment = require("moment"),
  async = require("async");

var fitbitClient = new FitbitApiClient(
    config.fitbit.clientID,
    config.fitbit.clientSecret);

var googleApisClient = new google.auth.OAuth2(
    config.googleFit.clientID,
    config.googleFit.clientSecret,
    config.googleFit.callbackURL);

function logAndSwallowError(stream, error, done) {
  console.log("  ERROR: New token for stream " +
    stream.stream_name + " failed with error: " +
    JSON.stringify(error));
  done(null, false);
}

// takes stream and invokes callback with (null, new_stream) if there are no
// errors
function forGoogleFit(stream, done) {
  googleApisClient.setCredentials({
    access_token: stream.access_token,
    refresh_token: stream.refresh_token,
  });
  googleApisClient.refreshAccessToken(function(err, token) {
    if (err) {
      return logAndSwallowError(stream, err, done);
    }
    console.log("  INFO: new token for " +
                stream.stream_name + ": " + JSON.stringify(token));
    stream.access_token = token.access_token;
    db.updateAccessToken(
      stream.stream_id,
      token.access_token,
      token.refresh_token, function (err) {
        if (err) {
          return logAndSwallowError(stream, err, done);
        } else {
          console.log("  INFO: new access/refresh token written for ",
            stream.stream_name);
          done(null, stream);
        }
      });
  });
};

// Takes stream and invokes callback with (null, new_stream) if there are no errors, or with (null, false) if stream had an error.
// Error is logged on stdout.
function forFitbit(stream, done) {
  // STEP 1, update access token.
  fitbitClient.refreshAccessToken(
    stream.access_token,
    stream.refresh_token)
  .nodeify(function (err, token) {
    if (err) {
      return logAndSwallowError(stream, err, done);
    }
    console.log("new token for " +
                stream.stream_name + ": " + JSON.stringify(token));
    stream.access_token = token.access_token;

    // Save the new token to db.
    db.updateAccessToken(
      stream.stream_id,
      token.access_token,
      token.refresh_token, function (err) {
        if (err) {
          return logAndSwallowError(stream, err, done);
        } else {
          console.log("  New access/refresh token written for ",
            stream.stream_name);
          done(null, stream);
        }
      });
  });
};

function refreshTokens(stream, done) {
  if (stream.provider == 'fitbit') {
    forFitbit(stream, done);
  } else if (stream.provider == 'googlefit') {
    forGoogleFit(stream, done);
  } else {
    logAndSwallowError(stream, "  unknown provider: " + stream.provider, done);
  }
}

// function returns list of streams with valid access tokens.
module.exports.refreshTokens = function (done) {
  var stream_credentials = [];

  function postProcessing(err, results) {
    if (err) {
      console.log(" internal: didn't expect an error here.");
      return done(err);
    }
    return done(null, results.filter(function (x) {
      return x !== false;
    }));
  }

  db.getStreamCredentials(function (err, stream) {
    if (err) {
      return done(err);
    }
    stream_credentials.push(stream);
  }, function (err) {
    if (err) {
      return done(err);
    }
    console.log("Trying to refresh tokens for " + stream_credentials.length + " streams.");
    async.mapSeries(stream_credentials, refreshTokens, postProcessing);
  });
}
