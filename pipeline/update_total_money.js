var
  config = require("../common/config.js"),
  db = new (require("../common/db.js").Db)(),
  async = require("async");

// this function returns {
//  user_id:
//  total_money:
// }
function calculateNewAssets(userAsset, actual) {
  var total_money = userAsset.free_money;
  var shares = JSON.parse(userAsset.shares);
  for (var stream_id in shares) {
    if (!actual.hasOwnProperty(stream_id)) {
      throw "user " + userAsset.user_id + " has nonexistent share: " +
        stream_id;
    }
    var latest = actual[stream_id].latest_weight;
    var count = shares[stream_id];
    total_money += latest * count;
  } 
  return {
    user_id: userAsset.user_id,
    total_money: total_money,
  };
}

module.exports.updateTotalMoney = function(done) {
  async.series({
    latestWeights : db.getLatestWeights,
    userAssets : db.getAllUserAssets,
  }, function (err, results) {
    if (err) {
      return done(err);
    }
    var newAssets = [];
    for (var user_id in results.userAssets) {
      try {
        newAssets.push(calculateNewAssets(
          results.userAssets[user_id],
          results.latestWeights));
      } catch (e) {
        return done(e);
      }
    }
    db.updateTotalMoney(newAssets, function (err) {
      if (err) {
        return done(err);
      }
      console.log("Total money updated!");
      done(null);
    });
  });
};
