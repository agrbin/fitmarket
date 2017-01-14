var
  config = require("../common/config.js"),
  moment = require("moment");

// Objects of class i take sizes[i] space and gives you weights[i] weight.
// What is the maximum weight you can get by fitting objects into 'space'.
// There are infinite amount of objects in each class.
// * space, sizes and costs are integral.
// Exposed for testing purposes.
function knapsack(space, sizes, weights) {
  var dp = {}; 
  var n = sizes.length;
  if (sizes.length !== weights.length) {
    throw "invalid input: " + JSON.stringify([sizes, weights]);
  }

  // What is the max weight if I have 'k' space left.
  function solve(k) {
    if (k < 0) {
      return -Infinity;
    }
    if (dp.hasOwnProperty(k)) {
      return dp[k];
    }
    var sol = 0;
    for (var i = 0; i < n; ++i) {
      sol = Math.max(sol, solve(k - sizes[i]) + weights[i]);
    }
    dp[k] = sol;
    return sol;
  }

  return solve(space);
} 
module.exports.knapsack = knapsack;

/*
 * streamData is an array of rows from stream_data [
 *  {
 *    stream_id,
 *    stream_name,
 *    date,
 *    weight
 *  },
 *  ...
 * ]
 *
 * including inverse streams values.
 *
 * Internally, weight will be converted to integral number by multilying with
 * 10 and rounding.
 *
 * All string representations of dates are in format YYYY-MM-DD.
 * streamData with date < minDateStr will be ignored.
 */
module.exports.OptimalStrategy =
function (streamData, minDateStr, finalDateStr) {
  // weights is complete infromation about weights for each day indexed by
  // dateToIndex.
  // weights[dateToIndex(date)] existis for all dates in [minDateStr,
  // finalDateStr] and it's array.
  // weights[i][streamToIndex(stream)] represents the stream cost. It exists
  // for all stream regardless of whether this stream had a measurement that
  // day or not. If stream didn't begin yet on that day, the cost will be
  // +Infinity. If stream didn't had measurement on that day, it will take the
  // value from the previous day.
  var weights = [];

  // Returns integral date from the date string.
  // minDateStr => 1st day.
  var minDateMoment = moment(minDateStr).add(-1, 'days');
  function dateToIndex(date_str) {
    return moment(date_str).diff(minDateMoment, 'days') | 0;
  }
  var lastDay = dateToIndex(finalDateStr);

  // Returns integral weight from the real weight.
  function normalizeValue(weight) {
    return Math.round(weight * 10) | 0;
  }
  function inverseNormalizeValue(weight) {
    return weight / 10;
  }

  function forEachStream(cb) {
    for (var i = 0; i < streamData.length; ++i) {
      var day = dateToIndex(streamData[i].date);
      if (day <= 0 || day > lastDay) {
        continue;
      }
      cb({
        day : day,
        stream :  streamToIndex(streamData[i].stream_id),
        weight : normalizeValue(streamData[i].weight),
      });
    }
  }

  // Converts from streamId to streamIndex.
  var streamIndex = {};
  var streamCount = 0;
  function streamToIndex(stream_id) {
    if (!streamIndex.hasOwnProperty(stream_id)) {
      streamIndex[stream_id] = streamCount++;
    }
    return streamIndex[stream_id];
  }
  forEachStream(function() {}); // initialize streamCount

  // Fills in 'weights' array.
  function initWeights() {
    // by_stream[stream_index] 
    var by_stream = [];
    for (var i = 0; i < streamCount; ++i) {
      by_stream.push([Infinity]);
    }
    forEachStream(function (stream) {
      // day, stream, weight
      var measurements = by_stream[stream.stream];
      var last_value = measurements[measurements.length - 1];
      while (measurements.length < stream.day) {
        measurements.push(last_value);
      }
      // by_stream[stream.stream][stream.day] = stream.weight;
      measurements.push(stream.weight);
    });
    for (var i = 0; i <= lastDay; ++i) {
      var day_measurements = [];
      for (var j = 0; j < streamCount; ++j) {
        day_measurements.push(
          by_stream[j][Math.min(i, by_stream[j].length - 1)]
        );
      }
      weights.push(day_measurements);
    }
  }
  initWeights();

  // Exposed for test purposes.
  this.getWeights_ = function () { return weights; };

  // Retruns optimal strategy for a player that on date 'date' has
  // 'initial_money' money. The strategy maximizes 'best_cost' on finalDate.
  // Player has 'finalDateStr' - 'initial_date_str' strategies to play.
  //
  // Reconstruction is not implemented yet.
  //
  // {
  //  best_cost:
  // }
  //
  // If initial_date < minDate, raises an error.
  //
  this.getOptimalStrategy = function (initial_money, initial_date_str) {
    var initial_day = dateToIndex(initial_date_str);
    if (initial_day < 0 || initial_day > lastDay) {
      return {};
    }
    // Optimal strategy is greedy: maximize the profit every day. Within one
    // day, we solve knapsack problem to maximize the profit.
    var best_cost = normalizeValue(initial_money);
    for (var day = initial_day; day < lastDay; ++day) {
      best_cost = knapsack(best_cost, weights[day], weights[day + 1]);
    }
    return {
      best_cost: inverseNormalizeValue(best_cost)
    };
  };
};
