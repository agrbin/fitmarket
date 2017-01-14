var
  config = require("../common/config.js"),
  db = new (require("../common/db.js").Db)(),
  moment = require("moment"),
  optimal_strategy = require("./optimal_strategy.js"),
  async = require("async");

function getRelevantDates() {
  var result = {};
  var intervals = config.opportunityIntervals;
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

module.exports.updateOpportunity = function(done) {
  var firstDay = getFirstDay();
  var lastDay = moment().format("YYYY-MM-DD");
  // opp[ periodID ][ user_id ] => {
  //  total_money:
  //  best_cost:
  // }
  var opp = getRelevantDates();

  async.series([
    db.getStreamData.bind(this, firstDay, lastDay),
    db.getTotalMoneyLogs.bind(this, firstDay)
  ], function (err, results) {
    if (err) {
      return done(err);
    }
    var stream_data = results[0];
    var total_money_logs = results[1];

    console.log("  calcualting optimal strategies..");
    var t0 = new Date().getTime();

    // fill in total_money_by_date.
    // date => user_id => total_money
    var total_money_by_date = {};
    // holds all seen user_id.
    var user_ids = {};
    for (var i = 0; i < total_money_logs.length; ++i) {
      var log = total_money_logs[i];
      if (!total_money_by_date.hasOwnProperty(log.date)) {
        total_money_by_date[log.date] = {};
      }
      total_money_by_date[log.date][log.user_id] = log.total_money;
      user_ids[log.user_id] = true;
    }

    var optimal = new optimal_strategy.OptimalStrategy(
      stream_data, firstDay, lastDay);

    for (var periodId in opp) {
      var total_money = total_money_by_date[opp[periodId].first_date];
      opp[periodId].per_user = {};
      if (!total_money) {
        continue;
      }
      for (var user_id in total_money) {
        var initial_money = total_money[user_id];
        opp[periodId].per_user[user_id] = {
          initial_money: initial_money,
          best_cost: optimal.getOptimalStrategy(
              initial_money,
              opp[periodId].first_date).best_cost
        };
      }
    }

    console.log("  took: " + (new Date().getTime() - t0) + " ms.");
    console.log("  updating db..");

    // Update all opportunities.
    var fns = [];
    for (var user_id in user_ids) {
      var opportunity = {};
      for (var periodId in opp) {
        if (!opp[periodId].per_user.hasOwnProperty(user_id)) {
          continue;
        }
        opportunity[periodId] = opp[periodId].per_user[user_id];
      }
      fns.push(db.updateOpportunity.bind(
            this, user_id, JSON.stringify(opportunity)));
    }

    async.series(fns, function (err, results) {
      console.log("  done!");
      done(err);
    });
  });
};

