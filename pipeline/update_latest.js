var
  config = require("../common/config.js"),
  db = new (require("../common/db.js").Db)(),
  async = require("async");

module.exports.updateLatest = function(done) {
  db.updateLatestWeight(done);
};
