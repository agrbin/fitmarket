var
  config = require("../common/config.js"),
  db = new (require("../common/db.js").Db)(),
  fs = require("fs"),
  FitbitApiClient = require("fitbit-node"),
  google = require('googleapis'),
  moment = require("moment"),
  async = require("async"),
  retry = require("retry"),
  request = require("request");

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
function getGoogleFitReadings(stream, date_from_str, done) {

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
    done(null, date_from_str, aggregatedReadings);
  });
}

// stream is passed through this
function getFitbitReadings(stream, date_from_str, done) {

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
      cb(null, date_from_str, aggregatedReadings);
    }
  ], done);
}

// date_from_str is latest measurement for this stream, or now() - 2 years.
// in this function 'date_from_str' is ignored. we always return everything
// here.
function getSnapscaleReadings(stream, date_from_str, done) {
  // get and parse stream.access_token url.
  // aggregatedReadings is array of pairs:
  //  [date_str, float roundValue'ed minimum raeding for that date]
  //  looks like it's ok if we just output everything every time.

  request(stream.access_token, function (error, response, body) {
    if (error) {
      return done(error);
    }
    if (!response || response.statusCode != 200) {
      return done("unexpected status code: " + response.statusCode);
    }
    var rows = body.split("\n");
    var header = rows.shift();
    var kHeader = "unix_timestamp_s,local_datetime,local_timezone,weight,weight_unit";
    if (header != kHeader) {
      return done("unexpected csv header: " + header);
    }

    var readings = {};
    rows.forEach(function (row, index) {
      var items = row.split(",");
      if (items.length !== 5) {
        return false;
      }
      var datetime = items[1];
      var datestr = datetime.split(" ")[0];
      var weight = items[3];
      var metric = items[4];
      if (metric !== "kg") {
        return false;
      }
      if (!readings.hasOwnProperty(datestr)) {
        readings[datestr] = []
      }
      readings[datestr].push(roundValue(weight));
    });

    var aggregatedReadings = [];
    for (var date_str in readings) {
      aggregatedReadings.push(
          [date_str, getMin(readings[date_str])]);
    }
    done(null, date_from_str, aggregatedReadings);
  });
}

function wrapRetry(func) {
  return (function (stream, date_from_str, done) {
    var operation = retry.operation({
        retries: 3,
    });
    operation.attempt(function (currentAttempt) {
      func(stream, date_from_str, function (err, date_from_str, aggregatedReadings) {
        if (err) {
          console.log(err);
          console.log("get reading error " + currentAttempt + ", maybe retrying..");
        }
        if (operation.retry(err)) {
          return;
        }
        done(err ? operation.mainError() : null, date_from_str, aggregatedReadings);
      });
    });
  });
}

// Takes a stream_credentials row, downloads the stream data from fitbit and
// writes it into the database.
function saveStreamData(stream, done) {
  console.log("Processing stream " + stream.stream_name + " provider: " +
      stream.provider);

  var providerHandlers = {
    "fitbit" : wrapRetry(getFitbitReadings),
    "googlefit" : wrapRetry(getGoogleFitReadings),
    "snapscale" : wrapRetry(getSnapscaleReadings),
  };

  async.waterfall([
    // Read the latest reading from the database.
    function (done) {
      db.getLatestMeasurement(stream.stream_id, function (err, latest_date_str) {
        if (err) {
          return done(err);
        }
        done(null, stream, latest_date_str);
      });
    },
    // Get the readings from service
    providerHandlers[stream.provider],
    // Write readings into the database.
    function (date_from_str, readings_arr, done) {
      var fallback = moment().subtract(2 * 365, "days").format("YYYY-MM-DD");
      if (date_from_str === fallback) {
        // first time seen this stream. write everything.
        console.log("  first time seen this feed. writing all.");
        db.writeDataPoints(
            stream.stream_id, stream.stream_name, readings_arr, done);
      } else if (readings_arr.length > 0) {
        console.log("  writing new readings only for today.")
        // Write only the value for today. This will be the minimum value of
        // all new readings.  New readings happened only after noon at
        // yesterday. If they happened before, they would be processed
        // yesterday and we wouldn't download them now.
        var todaysWeight = null;
        var maxDate = null;
        for (var i = 0; i < readings_arr.length; ++i) {
          var date = readings_arr[i][0];
          if (maxDate === null || date > maxDate) {
            maxDate = date;
            todaysWeight = readings_arr[i][1];
          }
        }
        var todaysDate = moment().format("YYYY-MM-DD");
        if (todaysDate == maxDate) {
          var overridenReadings = [[todaysDate, todaysWeight]];
          db.writeDataPoints(
              stream.stream_id, stream.stream_name, overridenReadings, done);
        } else {
          console.log("  discarding readings from day before: "
                      + todaysDate + " vs " + maxDate + ". ",
                      "next message is rubish.");
          done(null);
        }
      } else {
        console.log("  no new readings, next message is rubish.");
        done(null);
      }
    },
    function (done) {
      console.log("  New readings written to db.");
      done(null);
    },
  ], done);
}

// gets list of valid streams.
module.exports.getReadings = function (stream_credentials, done) {
  console.log("\nNeeds to process " + stream_credentials.length + " streams.");
  async.eachSeries(stream_credentials, function (stream, inner_done) {
    saveStreamData(stream, function (err) {
      if (err) {
        console.log("unrecoverable error while saving stream: ", stream.stream_name);
        console.log(err);
      }
      inner_done();
    });
  }, done);
};
