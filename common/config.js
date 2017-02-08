/*jslint indent: 2, plusplus: true*/
"use strict";

module.exports = {
  db : "../data/db",

  port : 8080,

  google : {
    clientID:     null,
    clientSecret: null,
    callbackURL:  null,
  },

  fitbit : {
    clientID:     null,
    clientSecret: null,
    callbackURL:  null,
  },

  googleFit : {
    clientID:     null,
    clientSecret: null,
    callbackURL:  null,
  },

  session : {
    secret: "keyboard cat",
    resave: false,
    saveUninitialized: false
  },

  plot_txt : "../data/plot.txt",

  initial_user_tmpl : {
    user_name : "changeme",
    free_money : 10000,
    total_money : 10000,
    shares : "{}",
  },

  maxWeight : 150,

  enableSelfShares : true,

  userIdHashSalt : "secret",

  topTraders : 15,

  // We calculate optimal strategies for each player in these intervals.
  opportunityIntervals : {
    "1d": {
      count: 1,
      unit: "day",
    },
    "3d": {
      count: 3,
      unit: "days",
    },
    "1w": {
      count: 1,
      unit: "week",
    },
    "1m": {
      count: 1,
      unit: "month",
    },
  },
};

// in override file, do something like:
//
// module.exports = function (config) {
//   config.port = 555;
// };
if (require("fs").existsSync("../data/config.override.js")) {
  require("../data/config.override.js")(module.exports);
}
