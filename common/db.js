var sqlite3 = require("sqlite3").verbose(),
  config = require("../common/config.js"),
  fs = require("fs");

module.exports.Db = function () {
  var db = new sqlite3.Database(config.db);

  this.initializeDb = function (done) {
    var sql = fs.readFileSync("../common/init_db.sql", "utf8");
    db.exec(sql, done);
  };

  this.addNewStream = function (user_id, name, access_token, done) {
    db.run("INSERT INTO stream_credentials " +
           "(user_id, name, access_token)   " +
           "VALUES (?, ?, ?)",
           user_id,
           name,
           access_token,
           done);
  };
};

