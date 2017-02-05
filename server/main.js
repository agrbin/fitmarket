var express = require("express"),
  path = require("path"),
  config = require("../common/config.js"),
  moment = require("moment"),
  db = new (require("../common/db.js").Db)(),
  TopTraders = require("./top_traders.js").TopTraders;

var topTraders = new TopTraders(db);

module.exports.landing = function (req, res) {
  res.js_payload.actual = req.actual;
  res.js_payload.user = req.user;
  res.js_payload.enableSelfShares = config.enableSelfShares;

  res.render("main", {
    page : "main",
    user : req.user,
    top_traders : topTraders.getResult(),
    session : JSON.stringify(req.session),
    actual : req.actual,
    js_payload : JSON.stringify(res.js_payload),
    opportunity_intervals : config.opportunityIntervals,
    opportunities : topTraders.getOpportunities(),
  });
};

module.exports.path_txt = function (req, res) {
  res.header("Content-Type", "text/csv");
  res.sendFile(path.resolve(config.plot_txt));
};

module.exports.personalUpdate = function (req, res) {
  db.updateUser(req.user.user_id, req.body.personal_user_name, function (err) {
    if (err) {
      return res.error(err);
    }
    res.redirect("/main#personal");
  });
};

// x is a valid number if it's positive and and integral.
function isValidCount(x) {
  if (!x) {
    return false;
  }
  return Math.round(x).toString() == x.toString() && x > 0;
}

function streamOwner(stream_id) {
  return stream_id.charAt(0) == "~" ? stream_id.substr(1) : stream_id;
}

// tmpl was sent by user.
// actual was read from the db.
// user was read from the session.
// config was read from the config file.
function validateTransaction(tmpl, actual, user, config, done) {
  if (tmpl.action !== "buy" && tmpl.action !== "sell") {
    return done(tmpl.action + " is not a valid action");
  }

  if (!actual.hasOwnProperty(tmpl.stream_id)) {
    return done(tmpl.stream_id + " is not a valid stream");
  }

  // Attach denormalized stream info.
  var stream = actual[tmpl.stream_id];
  tmpl.stream_name = stream.stream_name;
  tmpl.stream_weight = stream.latest_weight;

  // Attach user info.
  tmpl.user_id = user.user_id;
  tmpl.user_name = user.user_name;

  if (!isValidCount(tmpl.count)) {
    return done(tmpl.count + " is not a valid count number.");
  }

  if (!config.enableSelfShares &&
      streamOwner(tmpl.stream_id) === user.user_id) {
    return done("can't " + tmpl.action + " shares that you own.");
  }

  // Copy the new user shares.
  tmpl.new_shares = JSON.parse(JSON.stringify(user.shares));
  tmpl.new_free_money = user.free_money;

  // Verify sell/buy limits.
  if (tmpl.action === "buy") {
    var total_cost = tmpl.stream_weight * tmpl.count;
    if (user.free_money < total_cost) {
      return done(
          "tried to buy " + total_cost +
          " of value, but only has " + user.free_money +
          " funds available.");
    }
    tmpl.new_free_money -= total_cost;
    if (!tmpl.new_shares.hasOwnProperty(tmpl.stream_id)) {
      tmpl.new_shares[tmpl.stream_id] = 0;
    }
    tmpl.new_shares[tmpl.stream_id] += tmpl.count;
  } else if (tmpl.action === "sell") {
    if (!user.shares.hasOwnProperty(tmpl.stream_id)) {
      return done("tried to sell a share that you don't have.");
    }
    var owned_count = user.shares[tmpl.stream_id];
    if (owned_count < tmpl.count) {
      return done("tried to sell more shares than what you own.");
    }
    tmpl.new_free_money += tmpl.count * tmpl.stream_weight;
    tmpl.new_shares[tmpl.stream_id] -= tmpl.count;
    if (tmpl.new_shares[tmpl.stream_id] == 0) {
      delete tmpl.new_shares[tmpl.stream_id];
    }
  } else {
    return done("expected action to be 'sell' or 'buy'");
  }

  done(null, tmpl);
};

module.exports.submitTransaction = function (req, res) {
  validateTransaction(
    {
      datetime: moment().format("YYYY-MM-DD HH:mm:ss.SSS"),
      stream_id: req.body.stream,
      action: req.body.action,
      count: Number(req.body.count),
      is_api: false,
    },
    req.actual,
    req.user,
    config,
    function (err, transaction) {
      if (err) {
        return res.error(err);
      }
      db.applyTransaction(
        transaction,
        function (err) {
          if (err) {
            return res.error(err);
          }
          res.redirect("/main#personal");
        });
    }
  );
};

module.exports.validateTransaction = validateTransaction;

module.exports.apiToken = function (req, res) {
  if (req.user.api_token === null) {
    console.log("reinitializing token for: ", req.user.user_id);
    db.resetToken(req.user.user_id, function (err, new_token) {
      if (err) {
        return res.error(err);
      }
      res.send(new_token);
    });
  } else {
    res.send(req.user.api_token);
  }
};

module.exports.resetToken = function (req, res) {
  if (req.query.old_token !== req.user.api_token) {
    return res.error("old token mismatch.");
  }
  db.resetToken(req.user.user_id,
    function (err, new_token) {
      if (err) {
        return res.error(err);
      }
      res.send(new_token);
    });
};

function roundTo1(x) {
  return Math.round(x * 10) / 10;
}

module.exports.apiMyState = function (req, res) {
  var result = {
    total_money: roundTo1(req.user.total_money),
    free_money: roundTo1(req.user.free_money),
    shares: [],
  };
  for (var stream_id in req.user.shares) {
    result.shares.push({
      stream_name: req.actual[stream_id].stream_name,
      latest_weight: req.actual[stream_id].latest_weight,
      count: req.user.shares[stream_id],
    });
  }
  res.json(result);
};

module.exports.apiActualState = function (req, res) {
  var result = [];
  for (var stream_id in req.actual) {
    result.push({
      stream_name: req.actual[stream_id].stream_name,
      latest_weight: roundTo1(req.actual[stream_id].latest_weight),
    });
  }
  res.json(result);
};

module.exports.apiSubmit = function (req, res) {
  if (!req.body.stream_name) {
    return res.error("must specifyc stream_name in POST params.");
  }
  if (!req.actualByStreamName.hasOwnProperty(req.body.stream_name)) {
    return res.error("unknown stream: " + req.body.stream_name);
  }
  validateTransaction(
    {
      datetime: moment().format("YYYY-MM-DD HH:mm:ss.SSS"),
      stream_id: req.actualByStreamName[req.body.stream_name].stream_id,
      action: req.body.action,
      count: Number(req.body.count),
      is_api: true,
    },
    req.actual,
    req.user,
    config,
    function (err, transaction) {
      if (err) {
        return res.error(err);
      }
      db.applyTransaction(
        transaction,
        function (err) {
          if (err) {
            return res.error(err);
          }
          res.send("submitted!\n");
        });
    }
  );
};

module.exports.apiSellAll = function (req, res) {
  db.applyTransaction({
    user_id : req.user.user_id,
    new_shares : [],
    new_free_money : req.user.total_money,
    datetime: moment().format("YYYY-MM-DD HH:mm:ss.SSS"),
    action: "sell_all",
    stream_id: null,
    count: null,
    stream_name: null,
    stream_weight: null,
    user_name : req.user.user_name,
    is_api: 1,
  }, function (err) {
    if (err) {
      return res.error(err);
    }
    res.send("submitted!\n");
  });
};

