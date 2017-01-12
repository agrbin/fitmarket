var sqlite3 = require("sqlite3").verbose(),
  TransactionDatabase = require("sqlite3-transactions").TransactionDatabase,
  config = require("../common/config.js"),
  fs = require("fs"),
  async = require("async"),
  moment = require("moment");

// One connection per process.
var db = new TransactionDatabase(new sqlite3.Database(config.db));

module.exports.Db = function () {
  // ------------------- transactions

  this.exec = function (sql, cb) {
    db.exec(sql, cb);
  };

  this.applyTransaction = function(t, done) {
    var sql_user = '                                 \
        UPDATE "user" SET                            \
          free_money = $new_free_money,              \
          shares = $new_shares                       \
        WHERE user_id = $user_id                     ';
    var vars_user = {
      $user_id: t.user_id,
      $new_shares: JSON.stringify(t.new_shares),
      $new_free_money: t.new_free_money,
    };

    var sql_log = '                                    \
          INSERT INTO transaction_log (                \
            datetime, user_id, user_name,              \
            stream_id, stream_name, stream_weight,     \
            action, count                              \
            )                                          \
          VALUES (                                     \
            $datetime, $user_id, $user_name,           \
            $stream_id, $stream_name, $stream_weight,  \
            $action, $count                            \
            );                                         ';
    var vars_log = {
      $datetime: t.datetime,
      $action: t.action,
      $stream_id: t.stream_id,
      $count: t.count,
      $stream_name: t.stream_name,
      $stream_weight: t.stream_weight,
      $user_id: t.user_id,
      $user_name: t.user_name,
    };

    // TODO, can this be less entangled??
    db.beginTransaction(function (err, transaction) {
      if (err) {
        return done(err);
      }
      transaction.run(sql_user, vars_user,
        function (err) {
          if (err) {
            transaction.rollback(function () {
              done(err);
            });
          }
          if (this.changes !== 1) {
            transaction.rollback(function () {
              done("didn't update user as expected.");
            });
          }
          transaction.run(sql_log, vars_log,
            function (err) {
              if (err) {
                transaction.rollback(function () {
                  done(err);
                });
              } else {
                transaction.commit(done);
              }
            });
      });
    });
  };

  // ------------------- user handling

  this.updateTotalMoney = function (pairs, done) {
    // 1. create temp table
    // 2. populate with data
    // 3. run update
    // 4. delete temp table
    var timestamp = new Date().getTime();
    async.series([
      function (cb) {
        db.run("DELETE FROM total_money_log " +
                "WHERE timestamp = ?;",
                timestamp, cb);
      },
      function (cb) {
        var stmt = db.prepare(
            "INSERT INTO total_money_log " +
            "(timestamp, user_id, total_money) " + 
            "VALUES (?, ?, ?);");
        for (var i = 0; i < pairs.length; i++) {
          stmt.run(timestamp,
            pairs[i].user_id,
            pairs[i].total_money);
        }
        stmt.finalize(cb);
      },
      function (cb) {
        var sql = "UPDATE user SET total_money = ( " +
            "SELECT total_money FROM total_money_log a1 " +
            "WHERE a1.user_id = user.user_id AND " +
            "      timestamp = ?);";
        db.run(sql, timestamp, done);
      },
    ], done);
  };

  this.getTopTraders = function (done) {
    db.all(' \
        SELECT user_name, total_money \
        FROM "user" \
        WHERE user_name != "changeme" \
        ORDER BY total_money DESC \
        LIMIT ?; \
        ',
        config.topTraders,
        done);
  };

  this.getAllUserAssets = function (done) {
    db.all(' \
        SELECT user_id, free_money, shares \
        FROM "user" \
        ',
        done);
  };

  this.updateUser = function (user_id, user_name, done) {
    db.run("UPDATE user SET user_name = ? " +
           "WHERE user_id = ?", user_name, user_id, done); 
  };

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
        WHERE \
          sd1.stream_id = stream_credentials.stream_id AND \
          sd1.date = ( \
          SELECT MAX(sd2.date) \
            FROM stream_data sd2 \
            WHERE sd2.stream_id = stream_credentials.stream_id) \
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
    db.each("SELECT stream_id, stream_name, " +
            "provider, provider_user_id, access_token, refresh_token " +
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
  // back to now() - 2 years.
  this.getLatestMeasurement = function (stream_id, cb) {
    var yearAgo = moment().subtract(2 * 365, "days");
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

  this.addNewStream = function (stream_id, stream_name, provider,
      provider_user_id, access_token, refresh_token, done) {

    db.run("INSERT INTO stream_credentials " +
           "(stream_id, stream_name, provider, " +
              "provider_user_id, access_token, refresh_token)   " +
           "VALUES (?, ?, ?, ?, ?, ?)",
           stream_id,
           stream_name,
           provider,
           provider_user_id,
           access_token,
           refresh_token,
           done);
  };

  // ------------------------- Called from init_db.js
 
  this.initializeDb = function (done) {
    var sql = fs.readFileSync("../common/init_db.sql", "utf8");
    db.exec(sql, done);
  };
};

