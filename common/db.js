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

  // ------------------- user handling

  this.updateUser = function (user_id, user_name, done) {
    db.run("UPDATE user SET user_name = ? " +
           "WHERE user_id = ?", user_name, user_id, done); 
  };

  function deserializeShares(user) {
    try {
      user.shares = JSON.parse(user.shares);
    } catch (exp) {
      console.log("while deserializing shares: ", exp);
      user.shares = [];
    }
  }

  function createInitialUser(user_id, done) {
    var tmpl = JSON.parse(JSON.stringify(config.initial_user_tmpl));
    tmpl.user_id = user_id;
    db.run("INSERT INTO user " +
           "(user_id, user_name, " +
              "free_money, total_money, shares)   " +
           "VALUES (?, ?, ?, ?, ?)",
           tmpl.user_id,
           tmpl.user_name,
           tmpl.free_money,
           tmpl.total_money,
           tmpl.shares,
           function (err) { done(err, tmpl); });
  }

  // Returns the user's row. Initializes the user if row is still not there.
  this.getUser = function (user_id, done) {
    db.get("SELECT user_id, user_name, free_money, total_money, shares " +
           "FROM user " +
           "WHERE user_id = ?", user_id, function (err, row) {
      if (err) {
        return done(err);
      }
      if (!row) {
        createInitialUser(user_id, done);
      } else {
        done(null, row);
      }
    });
  };

  // ------------------- stream handling

  this.getLatestWeights = function (done) {
    var actual = {};
    db.each(" \
      SELECT stream_id, stream_name, latest_weight \
      FROM stream_credentials",
      function (err, row) {
        if (err) return done(err);
        if (row.latest_weight > 0) {
          actual[row.stream_id] = {
            stream_id : row.stream_id,
            stream_name : row.stream_name,
            latest_weight : row.latest_weight,
          }
          var inv_id = "~" + row.stream_id;
          actual[inv_id] = {
            stream_id : inv_id,
            stream_name : "~" + row.stream_name,
            latest_weight : config.maxWeight - row.latest_weight,
          }
        }
      },
      function (err) {
        if (err) return done(err);
        done(null, actual);
      });
  };

  this.updateLatestWeight = function (done) {
    var sql = " \
      UPDATE stream_credentials SET latest_weight = ( \
        SELECT weight FROM stream_data sd1 \
        WHERE sd1.date = ( \
          SELECT MAX(sd2.date) \
            FROM stream_data sd2 \
            WHERE sd1.stream_id = sd2.stream_id) \
      )";
    db.run(sql, done);
  };

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

