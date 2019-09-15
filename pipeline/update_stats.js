var
  config = require("../common/config.js"),
  db = new (require("../common/db.js").Db)(),
  fs = require("fs"),
  moment = require("moment"),
  async = require("async"),
  regression = require("regression");

function getRelevantDates() {
  var result = {};
  var intervals = config.statsIntervals;
  for (var periodId in intervals) {
    result[periodId] = {
      first_date : moment().subtract(
        intervals[periodId].count,
        intervals[periodId].unit).format("YYYY-MM-DD")
    };
  }
  return result;
}

// return YYYY-MM-DD of the first day for which we need data based on the
// config.opportunityIntervals.
function getFirstDay() {
  // NOTE, whole pipeline should have a fixed 'today' date. Getting a time here
  // is furnelable although we get it always at noon.
  var min = null;
  var dates = getRelevantDates();
  for (var periodId in dates) {
    var first = dates[periodId].first_date;
    if (min === null || first < min) {
      min = first;
    }
  }
  return min;
}

// data is sorted and it's sliced to a given period which has n_days days.
function getStats(data, first_date, n_days) {
  var result = {
    min: null,
    max: null,
    range: null,
    median: null,
    latest_weight: null,
    trend_kg_per_day: null,
    availability_ratio: null,
    volatility_ratio: null,
  };
  var values = [];
  var regression_values = [];
  data.forEach(function (row, index) {
    var weight = row.weight;
    var day_index = moment(row.date).diff(moment(first_date), "days");
    regression_values.push([day_index, weight]);
    values.push(weight);
    if (result.min === null || weight < result.min) {
      result.min = weight;
    }
    if (result.max === null || weight > result.max) {
      result.max = weight;
    }
  });
  if (values.length > 0) {
    result.latest_weight = values[values.length - 1];
    result.first_weight = values[0];
    result.last_minus_first = Math.round((result.latest_weight - result.first_weight) * 10) / 10.0;
    result.rel_delta = result.latest_weight / result.first_weight;
  }
  values.sort();
  // Regression is quite broken! If a person only has measurements in last year
  // on two consecutive days and values were 75kg, 76kg the trend would be
  // 1kg/day in last year which is misleading.
  if (regression_values.length >= 2) {
    var reg = regression.linear(regression_values, {
      precision: 3,
    });
    result.trend_kg_per_day = reg.equation[0];
    result.trend_yintercept = reg.equation[1];
  }
  if (values.length > 0) {
    result.median = values[(values.length / 2) | 0];
    result.availability_ratio = 1.0 * values.length / n_days;
    result.range = Math.round((result.max - result.min) * 10) / 10.0;
    result.volatility_ratio = result.range / result.median;
  }
  return result;
}

function buildStats(period_id, stream_id, first_date, stream_name, data) {
  var today_date = moment().format("YYYY-MM-DD");
  data = data.filter(function (row) {
    return row.date >= first_date && row.date <= today_date;
  });
  var n_days = moment(today_date).diff(moment(first_date), "days");
  // sort data ascending
  data.sort(function (lhs, rhs) {
    return lhs.date.localeCompare(rhs.date);
  });

  return Object.assign({
    period_id: period_id,
    n_days: n_days,
    stream_id: stream_id,
    first_date: first_date,
    stream_name: stream_name,
  }, getStats(data, first_date, n_days));
}
module.exports.updateStats = function(done) {
  var lastDay = moment().format("YYYY-MM-DD");
  // result[ periodID ][ stream_id ] => {
  //  stream_name:
  //  latest_weight:
  //  min_weight:
  //  max_weight:
  //  median_weight:
  //  trend_kg_per_day:
  //  availability_pct:
  //  volatility_pct:
  // }
  var first_dates = getRelevantDates();

  async.series([
    // Read everything here, to get the ordering of streams that
    // is same as in plot.
    db.getStreamData.bind(this, "0000-00-00", lastDay),
  ], function (err, results) {
    if (err) {
      return done(err);
    }
    var stream_data = results[0];

    console.log("  calcualting stats..");
    var t0 = new Date().getTime();

    // drop inverse streams.
    stream_data = stream_data.filter(function (row) {
      return row.stream_id[0] !== '~';
    });

    var by_stream_id = {}
    var stream_name = {}
    var ordered_stream_ids = [];
    stream_data.forEach(function (row, index) {
      if (!by_stream_id.hasOwnProperty(row.stream_id)) {
        by_stream_id[row.stream_id] = [];
        ordered_stream_ids.push(row.stream_id);
      }
      stream_name[row.stream_id] = row.stream_name;
      by_stream_id[row.stream_id].push(row);
    });
    var stream_ids = Object.keys(by_stream_id);

    var result = {};
    for (var periodId in first_dates) {
      result[periodId] = {};
    }
    stream_ids.forEach(function (stream_id, index) {
      for (var periodId in first_dates) {
        result[periodId][stream_id] = buildStats(
          periodId,
          stream_id,
          first_dates[periodId].first_date,
          stream_name[stream_id],
          by_stream_id[stream_id]);
      }
    });

    // result2 has streams ordered in each period.
    var result2 = {}
    for (var period_id in first_dates) {
      result2[period_id] = []
      ordered_stream_ids.forEach(function (stream_id) {
        result2[period_id].push(result[period_id][stream_id]);
      });
    }

    var write_stream = fs.createWriteStream(
        config.stats_json_txt,
        {encoding : "utf8"});
    write_stream.write(JSON.stringify(result2, null, 2));
    write_stream.end();
    console.log(config.stats_json_txt + " updated.");
    done(null);
  });
};

