var sqlite3 = require("sqlite3").verbose(),
  config = require("../common/config.js"),
  fs = require("fs"),
  moment = require("moment");

module.exports.Db = function () {
  var db = new sqlite3.Database(config.db);

  this.SELL = "SELL";
  this.BUY = "BUY";

  this.initializeDb = function (done) {
    var sql = fs.readFileSync("../common/init_db.sql", "utf8");
    db.exec(sql, done);
  };

  // ------------------- stream handling
  
  this.getDataPointsForPlot = function (cb, done) {
    db.each("SELECT stream_name, date, weight " +
            "FROM stream_data " + 
            "ORDER BY date, stream_name",
            cb, done);
  };

  // Callback is called with each stream_credentials row in the db.
  this.getStreamCredentials = function(cb, done) {
    db.each("SELECT stream_id, stream_name, access_token, refresh_token " +
            "FROM stream_credentials", cb, done);
  };

  this.writeDataPoints = function (stream_id, stream_name,
      date_weight_pairs, done) {
    var stmt = db.prepare(
        "INSERT INTO stream_data " +
        "(stream_id, stream_name, date, weight) " + 
        "VALUES (?, ?, ?, ?);");
    for (var i = 0; i < date_weight_pairs.length; i++) {
      stmt.run(stream_id, stream_name,
          date_weight_pairs[i][0],
          date_weight_pairs[i][1]);
    }
    stmt.finalize(done);
  };

  // Returns the date of the latest data-point for stream for 'user_id'. Falls
  // back to now() - 1 year.
  this.getLatestMeasurement = function (stream_id, cb) {
    var yearAgo = moment().subtract(365, "days");
    var fallback = yearAgo.format("YYYY-MM-DD");

    db.get("SELECT date FROM stream_data " +
            "WHERE stream_id = ? " +
            "ORDER BY date DESC " +
            "LIMIT 1", stream_id,
    function (err, stream) {
      if (err) {
        return cb(err);
      }
      if (stream && stream.date > fallback) {
        cb(null, stream.date);
      } else {
        cb(null, fallback);
      }
    });
  };

  this.updateAccessToken = function (stream_id, access_token, refresh_token,
      done) {
    db.run("UPDATE stream_credentials " +
           "SET access_token = ?, refresh_token = ? " +
           "WHERE stream_id = ?",
           access_token,
           refresh_token,
           stream_id,
           done);
  };

  this.addNewStream = function (stream_id, stream_name,
      fitbit_user_id, access_token, refresh_token, done) {

    // don't add new stream if user_id already has stream!
    db.run("INSERT INTO stream_credentials " +
           "(stream_id, stream_name, " +
              "fitbit_user_id, access_token, refresh_token)   " +
           "VALUES (?, ?, ?, ?, ?)",
           stream_id,
           stream_name,
           fitbit_user_id,
           access_token,
           refresh_token,
           done);
  };
};

