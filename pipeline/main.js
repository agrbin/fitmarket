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
  update_opportunity = require("./update_opportunity.js"),
  get_readings = require("./get_readings.js");

async.series(
  [
    function (cb) {
      db.exec("BEGIN TRANSACTION", cb);
    },
    get_readings.getReadings,
    update_plot.updatePlot,
    update_plot.updateTotalMoneyPlot,
    update_latest.updateLatest,
    update_total_money.updateTotalMoney,
    update_opportunity.updateOpportunity,
  ],
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
          console.log("pipeline transaction commited.");
          console.log("All green!");
        }
      });
    }
  }
);
