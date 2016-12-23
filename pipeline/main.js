var
  config = require("../common/config.js"),
  db = new (require("../common/db.js").Db)(),
  fs = require("fs"),
  FitbitApiClient = require("fitbit-node"),
  moment = require("moment"),
  async = require("async"),
  update_plot = require("./update_plot.js"),
  get_readings = require("./get_readings.js");

async.series(
  [
    get_readings.getReadings,
    update_plot.updatePlot,
  ],
  function (err) {
    if (err) {
      console.log("Something failed: ", err);
    } else {
      console.log("All green!");
    }
  }
);
