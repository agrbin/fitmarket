var
  config = require("../common/config.js"),
  db = new (require("../common/db.js").Db)(),
  FitbitApiClient = require("fitbit-node"),
  moment = require("moment"),
  async = require("async");

var fitbitClient = new FitbitApiClient(
    config.fitbit.clientID,
    config.fitbit.clientSecret);

var metricHeader = { "Accept-Language" : "fr_FR" };

// Takes a stream_credentials row, downloads the stream data from fitbit and
// writes it into the database.
function saveStreamData(stream, done) {
  console.log("Processing stream " + stream.stream_name);

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

  function getMin(arr) {
    var min = Infinity;
    for (var i = 0; i < arr.length; ++i) {
      min = Math.min(min, arr[i]);
    }
    return min;
  }

  async.waterfall([
    // Read the latest reading from the database.
    function (done) {
      db.getLatestMeasurement(stream.stream_id, done);
    },
    // Construct date ranges in increment of 30 days.
    function (date_from_str, done) {
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

      done(null, pairs);
    },
    // Query fitbit api to get weights for date ranges
    function (date_ranges, done) {
      async.mapSeries(
          date_ranges,
          getWeightsForDateRange,
          done);
    // Extract weight data from result.
    }, function (readings_arr, done) {
      var readings = {};
      for (var i = 0; i < readings_arr.length; ++i) {
        for (var j = 0; j < readings_arr[i].weight.length; ++j) {
          var reading = readings_arr[i].weight[j];
          if (!readings.hasOwnProperty(reading.date)) {
            readings[reading.date] = [];
          }
          readings[reading.date].push(reading.weight);
        }
      }
      var aggregatedReadings = [];
      for (var date_str in readings) {
        aggregatedReadings.push(
            [date_str, getMin(readings[date_str])]);
      }
      console.log("  Got readings for " + 
                  aggregatedReadings.length + " days.");
      done(null, aggregatedReadings);
    // Write readings into the database.
    }, function (readings_arr, done) {
      db.writeDataPoints(
          stream.stream_id, stream.stream_name, readings_arr, done);
    },
    function (done) {
      console.log("  New readings written to db.");
      done(null);
    },
  ], done);
}

db.getStreamCredentials(function (err, stream) {
  if (err) {
    return console.log("while reading db: ", err);
  }

  fitbitClient.refreshAccessToken(
    stream.access_token,
    stream.refresh_token)
  .nodeify(function (err, token) {
    if (err) {
      return console.log("failed to refresh token", err);
    }
    db.updateAccessToken(
      stream.stream_id,
      token.access_token,
      token.refresh_token, function (err, done) {
        if (err) {
          console.log("failed to update access token: ", err);
        } else {
          console.log("  New access/refresh token written for ",
            stream.stream_name);
        }
      });
    stream.access_token = token.access_token;
    saveStreamData(stream);
  });
});
