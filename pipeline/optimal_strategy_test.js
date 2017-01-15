var os = require("./optimal_strategy.js"),
  moment = require("moment");

function toDate(b) {
  return moment("2016-01-01").add(b, "days");
}

function streamRow(id, day, weight) {
  return {
    stream_id: id,
    date: toDate(day),
    weight: weight,
  };
}

var clock_t0 = new Date().getTime();
function clock() {
  return new Date().getTime() - clock_t0;
}

function expectEq(lhs, rhs) {
  var l = JSON.stringify(lhs, null, 2);
  var r = JSON.stringify(rhs, null, 2);
  if (l !== r) {
    console.log("FAIL! expected: ", l, "got: ", r);
  }
}

// tests initWeights.
(function () {
  var o = new os.OptimalStrategy([
    // fills in missing values.
    streamRow(/* id = */ 1, /* day = */ 1, 10),
    streamRow(/* id = */ 1, /* day = */ 2, 20),
    streamRow(/* id = */ 1, /* day = */ 4, 40),
    streamRow(/* id = */ 1, /* day = */ 5, 50),

    // fills in Infinity before any measurements.
    streamRow(/* id = */ 2, /* day = */ 3, 30),
    streamRow(/* id = */ 2, /* day = */ 4, 40),

    // kicks out stream that is completely outside of date range.
    streamRow(/* id = */ 3, /* day = */ 0, 30),
    streamRow(/* id = */ 3, /* day = */ 6, 30),
  ], toDate(1), toDate(5));

  expectEq([
    [Infinity, Infinity], 
    [100, Infinity],
    [200, Infinity],
    [200, 300],
    [400, 400],
    [500, 400],
  ], o.getWeights_());
})();

// tests knapsack.
(function () {
  expectEq(14, os.knapsack(10, [6], [10]));
  expectEq(61, os.knapsack(10, [6, 3], [50, 10]));
  expectEq(70, os.knapsack(10, [4, 3], [30, 20]));
})();

// tests optimal strategy with one stream.
(function () {
  var o = new os.OptimalStrategy([
    // fills in missing values.
    streamRow(/* id = */ 1, /* day = */ 1, 10),
    streamRow(/* id = */ 1, /* day = */ 2, 20),
    streamRow(/* id = */ 1, /* day = */ 3, 30),
  ], toDate(1), toDate(3));

  // No time to trade from day 3 to day 3.
  expectEq(100, o.getOptimalStrategy(100, toDate(3)).best_cost);

  // From day 2 to day 3 it's best to buy 5 shares with cost '20' and sell them
  // with cost '30'. This is yields 150 money.
  expectEq(150, o.getOptimalStrategy(100, toDate(2)).best_cost);

  // On day 1 we can buy 10 shares.
  // On day 2 we will sell them and get 10 * 20 => 200 money.
  // On day 2 we can buy 10 shares again.
  // On day 3 we will sell them and get 300 money.
  expectEq(300, o.getOptimalStrategy(100, toDate(1)).best_cost);
})();

// tests optimal strategy with one stream.
(function () {
  var o = new os.OptimalStrategy([
    // fills in missing values.
    streamRow(/* id = */ 1, /* day = */ 1, 10),
    streamRow(/* id = */ 1, /* day = */ 2, 20),
    streamRow(/* id = */ 1, /* day = */ 3, 20),

    streamRow(/* id = */ 2, /* day = */ 1, 20),
    streamRow(/* id = */ 2, /* day = */ 2, 20),
    streamRow(/* id = */ 2, /* day = */ 3, 40),

  ], toDate(1), toDate(3));

  // We can double our value with stream 1 on the second day, and double it
  // again with stream 2 on the third day.
  expectEq(400, o.getOptimalStrategy(100, toDate(1)).best_cost);
})();

