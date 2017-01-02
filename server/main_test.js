var main = require("./main.js");

var tmpl = {
  action : "buy",
  stream_id : "6",
  count : 2,
};

var user = {
  user_id : "5",
  user_name : "test_user",
  free_money : 200,
  shares : {"6" : 3},
};

var actual = {
  "6" : {
    stream_id : "6",
    stream_name : "six",
    latest_weight : 50,
  },
  "~6" : {
    stream_id : "~6",
    stream_name : "~six",
    latest_weight : 150 - 50,
  },
  "5" : {
    stream_id : "5",
    stream_name : "five",
    latest_weight : 70,
  },
  "~5" : {
    stream_id : "~5",
    stream_name : "~five",
    latest_weight : 150 - 70,
  },
};

var config = {
  enableSelfShares : false,
};

(function testOK() {
  verifyExpectations(tmpl, actual, user, config, null);
}());

(function invalidCount() {
  var tmpl_ = clone(tmpl);
  tmpl_.count = -1;
  verifyExpectations(tmpl_, actual, user, config, "valid count");
  tmpl_.count = 1.5;
  verifyExpectations(tmpl_, actual, user, config, "valid count");
  tmpl_.count = 0;
  verifyExpectations(tmpl_, actual, user, config, "valid count");
}());

(function invalidAction() {
  var tmpl_ = clone(tmpl);
  tmpl_.action = "b";
  verifyExpectations(tmpl_, actual, user, config, "is not a valid action");
}());

(function invalidAction() {
  var tmpl_ = clone(tmpl);
  tmpl_.stream_id = "nonexistent";
  verifyExpectations(tmpl_, actual, user, config, "is not a valid stream");
}());

(function testSelfShares() {
  var tmpl_ = clone(tmpl);
  tmpl_.stream_id = "5";
  verifyExpectations(tmpl_, actual, user, config, "that you own");
  tmpl_.stream_id = "~5";
  verifyExpectations(tmpl_, actual, user, config, "that you own");
  var config_ = clone(config);
  config_.enableSelfShares = true;
  verifyExpectations(tmpl_, actual, user, config_, null);
}());

(function testBuyLimit() {
  var tmpl_ = clone(tmpl);
  tmpl_.count = 4;
  verifyExpectations(tmpl_, actual, user, config, null);
  tmpl_.count = 5;
  verifyExpectations(tmpl_, actual, user, config, "funds available");
}());

(function testSellLimits() {
  var tmpl_ = clone(tmpl);
  tmpl_.action = "sell";
  tmpl_.count = 3;
  verifyExpectations(tmpl_, actual, user, config, null);
  tmpl_.count = 5;
  verifyExpectations(tmpl_, actual, user, config, "tried to sell more");
}());

(function testOutputBuy() {
  main.validateTransaction(tmpl, actual, user, config,
  function (err, t) {
    var expected = { action: 'buy',
      stream_id: '6',
      count: 2,
      stream_name: 'six',
      stream_weight: 50,
      user_id: '5',
      user_name: 'test_user',
      new_shares: {"6" : 5},
      new_free_money: 200 - 2 * 50,
    };
    if (JSON.stringify(expected) !== JSON.stringify(t)) {
      console.log("unexpected output transaction: ", t, " expected: ",
        expected);
    } else {
      console.log("test ok.");
    }
  });
}());

(function testOutputBuyNew() {
  var tmpl_ = clone(tmpl);
  tmpl_.stream_id = "~6";
  tmpl_.stream_name = "~six";
  tmpl_.stream_weight = 150 - 50;

  main.validateTransaction(tmpl_, actual, user, config,
  function (err, t) {
    var expected = {
      action: 'buy',
      stream_id: '~6',
      count: 2,
      stream_name: '~six',
      stream_weight: 100,
      user_id: '5',
      user_name: 'test_user',
      new_shares: {"6" : 3, "~6" : 2},
      new_free_money: 200 - 2 * (150 - 50),
    };
    if (JSON.stringify(expected) !== JSON.stringify(t)) {
      console.log("unexpected output transaction: ", t, " expected: ",
        expected);
    } else {
      console.log("test ok.");
    }
  });
}());

(function testOutputSell() {
  var tmpl_ = clone(tmpl);
  tmpl_.action = "sell";

  main.validateTransaction(tmpl_, actual, user, config,
  function (err, t) {
    var expected = { action: 'sell',
      stream_id: '6',
      count: 2,
      stream_name: 'six',
      stream_weight: 50,
      user_id: '5',
      user_name: 'test_user',
      new_shares: {"6" : 1},
      new_free_money: 200 + 2 * 50,
    };
    if (JSON.stringify(expected) !== JSON.stringify(t)) {
      console.log("unexpected output transaction: ", t, " expected: ",
        expected);
    } else {
      console.log("test ok.");
    }
  });
}());

(function testOutputSellZero() {
  var tmpl_ = clone(tmpl);
  tmpl_.action = "sell";
  tmpl_.count = 3;

  main.validateTransaction(tmpl_, actual, user, config,
  function (err, t) {
    var expected = { action: 'sell',
      stream_id: '6',
      count: 3,
      stream_name: 'six',
      stream_weight: 50,
      user_id: '5',
      user_name: 'test_user',
      new_shares: {},
      new_free_money: 200 + 3 * 50,
    };
    if (JSON.stringify(expected) !== JSON.stringify(t)) {
      console.log("unexpected output transaction: ", t, " expected: ",
        expected);
    } else {
      console.log("test ok.");
    }
  });
}());

// ------------- internal

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

function verifyExpectations(tmpl, actual, user, config, expected_err_substr) {
  main.validateTransaction(tmpl, actual, user, config, function (err, t) {
    if (err === null && expected_err_substr !== null) {
      return console.log("expected failure, but got OK.\n", tmpl, actual, user,
        config, t);
    }
    if (err !== null && expected_err_substr === null) {
      return console.log("expected OK, but got failure: ", err, tmpl, actual, user,
        config);
    }
    if (err !== null && expected_err_substr !== null) {
      if (err.indexOf(expected_err_substr) === -1) {
        return console.log("got failure, but not the expected one: ", err,
          expected_err_substr);
      }
    }
    console.log("test ok!");
  });
}

