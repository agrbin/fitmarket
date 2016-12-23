/*jslint indent: 2, plusplus: true*/
"use strict";

module.exports = {
  db : "../data/db",

  port : 8080,

  fitbit : {
    clientID:     null,
    clientSecret: null,
    callbackURL:  null,
  },

  google : {
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
};

// in override file, do something like:
//
// module.exports = function (config) {
//   config.port = 555;
// };
if (require("fs").existsSync("../data/config.override.js")) {
  require("../data/config.override.js")(module.exports);
}
