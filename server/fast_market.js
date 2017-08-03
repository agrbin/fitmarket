// This file provides logic for fast-market transactions.

var config = require("../common/config.js");

// Converts bids such as {"123" : true, "~234" : true} to shares structure,
// described  in init_db.sql.
function getFastMarketShares(user, actual, bids) {
  // We promised that we will split the user's capital in equal shares.
  // 'money_per_bid' is the amount of money we have per each bid.
  var bids_count = Object.keys(bids).length;
  var money_per_bid = user.total_money / bids_count;
  var result = {};

  for (var stream_id in actual) {
    var stream = actual[stream_id];
    if (stream_id in bids) {
      // treba odlucit koliko dionica cemo mu dat.
      result[stream_id] = Math.floor(money_per_bid / stream.latest_weight);
    }
  }

  return result;
}

module.exports.getFreeMoney = function (user, actual, new_shares) {
  var result = user.total_money;
  for (var stream_id in new_shares) {
    if (!(stream_id in actual)) {
      throw "unexpected new_shares, " + stream_id + " not in actual.";
    }
    result -= actual[stream_id].latest_weight * new_shares[stream_id];
  }
  return result;
};

// Returns { stream_id : true, ... } for current bids.
function getCurrentBids(user) {
  // collect current bids from shares.
  var current_bids = {};
  for (var stream_id in user.shares) {
    var count = user.shares[stream_id];
    if (count <= 0) {
      console.log("Unexpected number of shares <= 0, ",
                  user.user_id, user.shares);
      continue;
    }
    current_bids[stream_id] = true;
  }
  return current_bids;
}

// Returns current bids if user is compatible with fast market.
function isFastMarketCompatible(user, actual) {
  var bids = getCurrentBids(user);
  var fastmarket_shares = getFastMarketShares(user, actual, bids);
  if (JSON.stringify(fastmarket_shares) == JSON.stringify(user.shares)) {
    return bids;
  } else {
    return false;
  }
}

module.exports.validateFastSubmitRequest = function (body, actual) {
  var dict = {};
  for (var stream_id in actual) {
    dict[actual[stream_id].stream_name] = stream_id;
  }
  var result = {};
  for (var stream_name in body) {
    if (!(stream_name in dict)) {
      return false;
    }
    if (dict[stream_name] in result) {
      return false;
    }
    if (body[stream_name] != "1") {
      return false;
    }
    result[dict[stream_name]] = 1;
  }
  for (var id in result) {
    if (("~" + id) in result) {
      return false;
    }
  }
  return result;
};

module.exports.isFastMarketCompatible = isFastMarketCompatible;
module.exports.getFastMarketShares = getFastMarketShares;

// ----------------------------- tests.

function test1() {
  var result = getFastMarketShares(
      /* user = */ {
        total_money: 1000
      },
      /* actual = */ {
        "0" : {latest_weight: 100}, "~0" : {latest_weight: 50},
        "1" : {latest_weight: 80}, "~1" : {latest_weight: 70},
      },
      /* bids = */ {
        "0" : true,
        "~1" : true,
      });
  var expected = {"0" : 5, "~1" : 7};
}

function test2() {
  var result = getCurrentBids(
      /* user = */ {
        total_money: 1000,
        shares : {
          "0" : 1,
          "~1" : 1,
          "2" : 0,
          "3" : -1,
        }
      });
  var expected = {"0" : true, "~1" : true};
  console.log(JSON.stringify(result) == JSON.stringify(expected));
}

function test3() {
  console.log(isFastMarketCompatible(
      /* user = */ {
        total_money: 1000,
        shares : {
          "0" : 1,
          "~1" : 1,
        }
      },
      /* actual = */ {
        "0" : {latest_weight: 100}, "~0" : {latest_weight: 50},
        "1" : {latest_weight: 80}, "~1" : {latest_weight: 70},
      }) == false);
  console.log(isFastMarketCompatible(
      /* user = */ {
        total_money: 1000,
        shares : {
          "0" : 5,
          "~1" : 7,
        }
      },
      /* actual = */ {
        "0" : {latest_weight: 100}, "~0" : {latest_weight: 50},
        "1" : {latest_weight: 80}, "~1" : {latest_weight: 70},
      }) == true);
}

// test3();
