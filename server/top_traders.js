var
  config = require("../common/config.js");

module.exports.TopTraders = function (db) {
  var result = [];

  function updateResult() {
    db.getTopTraders(function (err, rows) {
      if (err || !('length' in rows)) {
        console.log("failed to update all traders", err);
        return;
      }
      result = rows;
    });
  }

  // [
  //    {
  //    user_name: ,
  //    total_money:
  //    },
  // ]
  this.getResult = function () {
    return result;
  };

  (function () {
    updateResult();
    setInterval(updateResult, 60 * 1000);
  }());
};
