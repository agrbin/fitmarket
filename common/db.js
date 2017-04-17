var sqlite3 = require("sqlite3").verbose(),
  TransactionDatabase = require("sqlite3-transactions").TransactionDatabase,
  config = require("../common/config.js"),
  fs = require("fs"),
  async = require("async"),
  crypto = require("crypto"),
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
            action, count, is_api                      \
            )                                          \
          VALUES (                                     \
            $datetime, $user_id, $user_name,           \
            $stream_id, $stream_name, $stream_weight,  \
            $action, $count, $is_api                  \
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
      $is_api: t.is_api,
    };

    // TODO, can this be less entangled??
    db.beginTransaction(function (err, transaction) {
      if (err) {
        return done(err);
      }
      transaction.run(sql_user, vars_user,
        function (err) {
          if (err) {
            return transaction.rollback(function () {
              done(err);
            });
          }
          if (this.changes !== 1) {
            return transaction.rollback(function () {
              done("didn't update user as expected.");
            });
          }
          transaction.run(sql_log, vars_log,
            function (err) {
              if (err) {
                return transaction.rollback(function () {
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

  this.updateOpportunity = function (user_id, opportunity_str, done) {
    db.run("UPDATE user SET opportunity = ? WHERE user_id = ?;",
          opportunity_str, user_id, done);
  };

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
        SELECT user_name, total_money, opportunity \
        FROM "user" \
        WHERE user_name != "changeme"; \
        ',
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

  // done is called with random token.
  function generateApiToken(done) {
    crypto.randomBytes(10, function(err, buffer) {
      if (err) {
        return err;
      }
      var str = buffer.toString('hex');
      var i = (Math.random() * str.length) | 0;
      done(null,
        str.substr(0, i) + "s1ava0cu" + str.substr(i));
    });
  }

  function createInitialUser(user_id, done) {
    var tmpl = JSON.parse(JSON.stringify(config.initial_user_tmpl));
    tmpl.user_id = user_id;
    generateApiToken(function (err, api_token) {
      if (err) {
        return done(err);
      }
      db.run("INSERT INTO user " +
             "(user_id, user_name, " +
                "free_money, total_money, shares, api_token) " +
             "VALUES (?, ?, ?, ?, ?, ?)",
             tmpl.user_id,
             tmpl.user_name,
             tmpl.free_money,
             tmpl.total_money,
             tmpl.shares,
             api_token,
             function (err) { done(err, tmpl); });
    });
  }

  // Returns the user's row. Initializes the user if row is still not there.
  this.getUser = function (user_id, done) {
    db.get("SELECT user_id, user_name, free_money, " +
           "total_money, shares, api_token " +
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

  this.getUserByToken = function (token, done) {
    db.get("SELECT user_id, user_name, free_money, " +
           "total_money, shares, api_token " +
           "FROM user " +
           "WHERE api_token = ?", token, function (err, row) {
      if (err) {
        return done(err);
      }
      if (!row) {
        done("unknown token.");
      } else {
        done(null, row);
      }
    });
  };

  this.resetToken = function (user_id, done) {
    generateApiToken(function (err, new_token) {
      if (err) {
        return done(err);
      }
      db.run("UPDATE user " +
             "SET api_token = ? " +
             "WHERE user_id = ?",
             new_token,
             user_id,
             function (err) {
               if (err) {
                 return done(err);
               }
               done(null, new_token);
             });
    });
  };

  // ------------------- stream handling

  function getInverseLatestReading(row) {
    var result = JSON.parse(JSON.stringify(row));
    result.stream_id = "~" + result.stream_id;
    result.stream_name = "~" + result.stream_name;
    result.latest_weight = config.maxWeight - result.latest_weight;
    return result;
  }

  function getInverseReading(row) {
    var result = JSON.parse(JSON.stringify(row));
    result.stream_id = "~" + result.stream_id;
    result.stream_name = "~" + result.stream_name;
    result.weight = config.maxWeight - result.weight;
    return result;
  }

  // returns all stream data in date interval [firstDate, lastDate]
  this.getStreamData = function (firstDate, lastDate, done) {
    db.all("SELECT date, stream_id, stream_name, weight " +
           "FROM stream_data " +
           "WHERE date >= ? AND date <= ?;",
           firstDate,
           lastDate,
           function (err, arr) {
             if (err) {
               return done(err);
             }
             var original_length = arr.length;
             for (var i = 0; i < original_length; ++i) {
               arr.push(getInverseReading(arr[i]));
             }
             done(null, arr);
           });
  };

  // returns full total money for all users on dates newer than firstDate.
  this.getTotalMoneyLogs = function (firstDate, done) {
    db.all(" \
      SELECT \
        STRFTIME('%Y-%m-%d', timestamp/1e3, 'unixepoch') AS date, \
        user_id, \
        MAX(total_money) AS total_money \
      FROM \
        total_money_log \
      WHERE \
        date >= ? \
      GROUP BY date, user_id; \
      "
      , firstDate, done);
  }

  this.getLatestWeights = function (done) {
    var actual = {};
    db.each(" \
      SELECT stream_id, stream_name, latest_weight \
      FROM stream_credentials",
      function (err, row) {
        if (err) return done(err);
        if (row.latest_weight > 0) {
          var inverse_row = getInverseLatestReading(row);
          actual[row.stream_id] = {
            stream_id : row.stream_id,
            stream_name : row.stream_name,
            latest_weight : row.latest_weight,
          };
          actual[inverse_row.stream_id] = {
            stream_id : inverse_row.stream_id,
            stream_name : inverse_row.stream_name,
            latest_weight : inverse_row.latest_weight,
          };
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

  this.getTotalMoneyForPlot = function (cb, done) {
    var sql = "SELECT " +
      "  user_name," +
      "  STRFTIME('%Y-%m-%d', timestamp/1e3, 'unixepoch') AS date," +
      "  total_money_log.total_money as total_money " +
      "FROM total_money_log JOIN " +
      "  user ON total_money_log.user_id = user.user_id " +
      "WHERE user_name != 'changeme'";
    db.each(sql, cb, done);
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

  this.updateExistingStream = function (stream_id, provider,
      provider_user_id, access_token, refresh_token, done) {
    db.run("UPDATE stream_credentials SET " +
             "provider = $provider, " +
             "provider_user_id = $provider_user_id, " +
             "access_token = $access_token, " +
             "refresh_token = $refresh_token " +
           "WHERE stream_id = $stream_id",
           {
             $stream_id : stream_id,
             $provider : provider,
             $provider_user_id : provider_user_id,
             $access_token : access_token,
             $refresh_token : refresh_token,
           },
           function (err) {
             if (err) {
               return done(err);
             }
             if (this.changes !== 1) {
               return done("failed to find the row!");
             }
             done(null);
           });
  };

  // ------------------------- Called from init_db.js
 
  this.initializeDb = function (done) {
    var sql = fs.readFileSync("../common/init_db.sql", "utf8");
    db.exec(sql, done);
  };
};

