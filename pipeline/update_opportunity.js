var
  config = require("../common/config.js"),
  db = new (require("../common/db.js").Db)(),
  async = require("async");

module.exports.updateOpportunity = function(done) {
  // treba mi cijeli stream data unazad od configa najvise sto dobijem.
  done(null);
};
