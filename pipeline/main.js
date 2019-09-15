var
  config = require("../common/config.js"),
  db = new (require("../common/db.js").Db)(),
  fs = require("fs"),
  FitbitApiClient = require("fitbit-node"),
  moment = require("moment"),
  async = require("async"),
  update_plot = require("./update_plot.js"),
  update_latest = require("./update_latest.js"),
  update_total_money = require("./update_total_money.js"),
  refresh_tokens = require("./refresh_tokens.js"),
  update_opportunity = require("./update_opportunity.js"),
  update_stats = require("./update_stats.js"),
  get_readings = require("./get_readings.js");

function executeStepsInTransaction(steps) {
  async.series(
    [
      function (cb) {
        db.exec("BEGIN TRANSACTION", cb);
      }
    ].concat(steps),
    function (err) {
      if (err) {
        console.log("Something failed: ", JSON.stringify(err, null, "  "));
        db.exec("ROLLBACK;", function (err) {
          if (err) {
            console.log("rollback failed: ", err);
          } else {
            console.log("pipeline transaction rolled back.");
          }
        });
      } else {
        db.exec("COMMIT;", function (err) {
          if (err) {
            console.log("commit failed: ", err);
          } else {
            console.log("OK: pipeline transaction commited.");
          }
        });
      }
    }
  );
}

function getStreamData(done) {
  refresh_tokens.refreshTokens(function (err, valid_streams) {
    if (err) {
      console.log("internal refresh token error: ", err,
                  "; stopping the pipeline.");
      return done(err);
    }
    get_readings.getReadings(valid_streams, done);
  });
}

executeStepsInTransaction([
  getStreamData,
  update_plot.updatePlot,
  update_latest.updateLatest,
  update_total_money.updateTotalMoney,
  update_plot.updateTotalMoneyPlot,
  update_stats.updateStats,
  update_opportunity.updateOpportunity,
]);
