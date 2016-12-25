var express = require("express"),
  path = require("path"),
  config = require("../common/config.js"),
  db = new (require("../common/db.js").Db)();

module.exports.landing = function (req, res) {
  res.render("main", {
    page : "main",
    user : req.user,
    session : JSON.stringify(req.session),
    actual : req.actual,
    js_payload : JSON.stringify(res.js_payload)
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
