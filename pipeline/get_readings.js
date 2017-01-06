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

var metricHeader = { "Accept-Language" : "fr_FR" };

// We don't allow values greater than 149. It would cause div by zero in some
// code paths.
function roundValue(x) {
  return Math.min(config.maxWeight - 1,
      Math.round(x * 10) / 10);
}

function getMin(arr) {
  var min = Infinity;
  for (var i = 0; i < arr.length; ++i) {
    min = Math.min(min, arr[i]);
  }
  return min;
}

// stream is passed through this
function getGoogleFitReadings(date_from_str, done) {
  var stream = this;

  // Converts 1 point in dataset to time/weight pair.
  function getPointInfo(point) {
    if (!point.value.length) {
      return false;
    }
    var avg = 0;
    for (var i = 0; i < point.value.length; ++i) {
      var single = point.value[i];
      avg += single.fpVal;
    }
    avg /= point.value.length;
    var ms = (point.startTimeNanos / 1e6 + point.endTimeNanos / 1e6) / 2;
    return {
      date: moment(ms).format("YYYY-MM-DD"),
      weight_kg: avg,
    };
  }

  var gfit = google.fitness("v1");

  googleApisClient.setCredentials({
    access_token: stream.access_token,
    refresh_token: stream.refresh_token,
  });

  var startNs =
    moment(date_from_str).add(1, "day").unix() * 1e9;
  var endNs =
    moment().unix() * 1e9;

  gfit.users.dataSources.datasets.get({
    auth: googleApisClient,
    userId: "me",
    dataSourceId:
      "derived:com.google.weight:com.google.android.gms:merge_weight",
    datasetId: startNs + "-" + endNs,
  }, function (err, result) {
    if (err) {
      return console.log(err);
    }
    var readings = {};
    for (var i = 0; i < result.point.length; ++i) {
      var info = getPointInfo(result.point[i]);
      if (info === false) {
        continue;
      }
      if (!readings.hasOwnProperty(info.date)) {
        readings[info.date] = [];
      }
      readings[info.date].push(roundValue(info.weight_kg));
    }
    var aggregatedReadings = [];
    for (var date_str in readings) {
      aggregatedReadings.push(
          [date_str, getMin(readings[date_str])]);
    }
    console.log("  Got readings for " + 
                aggregatedReadings.length + " days.");
    done(null, aggregatedReadings);
  });
}

// stream is passed through this
function getFitbitReadings(date_from_str, done) {
  var stream = this;

  function getWeightsForDateRange(date_range, done) {
    fitbitClient.get(
      "/body/log/weight/date/" + date_range[0] + "/"
                               + date_range[1] + ".json",
      stream.access_token,
      stream.fitbit_user_id,
      metricHeader
    ).nodeify(function (err, result) {
      if (err) {
        done(err);
      } else {
        done(null, result[0]);
      }
    });
  }

  async.waterfall([
    // Construct date ranges in increment of 30 days.
    function (cb) {
      var today = moment();
      var date_from = moment(date_from_str).add(1, "day");
      var pairs = [];

      console.log("  Querying data from " +
                  date_from.format("YYYY-MM-DD") +
                  " to " + today.format("YYYY-MM-DD"));

      while (date_from.isSameOrBefore(today)) {
        var date_from_delta = date_from.clone();
        date_from_delta.add(30, "days");
        pairs.push([
          date_from.format("YYYY-MM-DD"),
          date_from_delta.format("YYYY-MM-DD")
        ]);
        date_from_delta.add(1, "days");
        date_from = date_from_delta;
      }

      cb(null, pairs);
    },
    // Query fitbit api to get weights for date ranges
    function (date_ranges, cb) {
      async.mapSeries(
          date_ranges,
          getWeightsForDateRange,
          cb);
    // Extract weight data from result.
    }, function (readings_arr, cb) {
      var readings = {};
      for (var i = 0; i < readings_arr.length; ++i) {
        for (var j = 0; j < readings_arr[i].weight.length; ++j) {
          var reading = readings_arr[i].weight[j];
          if (!readings.hasOwnProperty(reading.date)) {
            readings[reading.date] = [];
          }
          readings[reading.date].push(roundValue(reading.weight));
        }
      }
      var aggregatedReadings = [];
      for (var date_str in readings) {
        aggregatedReadings.push(
            [date_str, getMin(readings[date_str])]);
      }
      console.log("  Got readings for " + 
                  aggregatedReadings.length + " days.");
      cb(null, aggregatedReadings);
    }
  ], done);
}

// Takes a stream_credentials row, downloads the stream data from fitbit and
// writes it into the database.
function saveStreamData(stream, done) {
  console.log("Processing stream " + stream.stream_name + " provider: " +
      stream.provider);

  async.waterfall([
    // Read the latest reading from the database.
    function (done) {
      db.getLatestMeasurement(stream.stream_id, done);
    },
    // Get the readings from service
    (stream.provider == "fitbit" ?
      getFitbitReadings.bind(stream) :
      getGoogleFitReadings.bind(stream)),
    // Write readings into the database.
    function (readings_arr, done) {
      db.writeDataPoints(
          stream.stream_id, stream.stream_name, readings_arr, done);
    },
    function (done) {
      console.log("  New readings written to db.");
      done(null);
    },
  ], done);
}

function getReadingsForStreamGoogleFit(stream, done) {
  googleApisClient.setCredentials({
    access_token: stream.access_token,
    refresh_token: stream.refresh_token,
  });
  googleApisClient.refreshAccessToken(function(err, token) {
    if (err) {
      return done(err);
    }
    stream.access_token = token.access_token;
    saveStreamData(stream, done);
    db.updateAccessToken(
      stream.stream_id,
      token.access_token,
      token.refresh_token, function (err) {
        if (err) {
          console.log("  Failed to write new access token: ", err);
        } else {
          console.log("  New access/refresh token written for ",
            stream.stream_name);
        }
      });
  });
}

function getReadingsForStream(stream, done) {
  if (stream.provider === "googlefit") {
    return getReadingsForStreamGoogleFit(stream, done);
  }

  // STEP 1, update access token.
  fitbitClient.refreshAccessToken(
    stream.access_token,
    stream.refresh_token)
  .nodeify(function (err, token) {
    if (err) {
      return done(err);
    }
    stream.access_token = token.access_token;
    saveStreamData(stream, done);
    // Save the new token to db.
    db.updateAccessToken(
      stream.stream_id,
      token.access_token,
      token.refresh_token, function (err) {
        if (err) {
          console.log("  Failed to write new access token: ", err);
        } else {
          console.log("  New access/refresh token written for ",
            stream.stream_name);
        }
      });
  });
}

module.exports.getReadings = function (done) {
  var stream_credentials = [];

  db.getStreamCredentials(function (err, stream) {
    if (err) {
      return done(err);
    }
    stream_credentials.push(stream);
  }, function (err) {
    if (err) {
      return done(err);
    }
    console.log("Needs to process " + stream_credentials.length + " streams.");
    async.eachSeries(stream_credentials, getReadingsForStream, done);
  });
};
