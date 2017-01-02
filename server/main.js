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

  res.render("main", {
    page : "main",
    user : req.user,
    top_traders : topTraders.getResult(),
    session : JSON.stringify(req.session),
    actual : req.actual,
    js_payload : JSON.stringify(res.js_payload),
  });
};

module.exports.path_txt = function (req, res) {
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

