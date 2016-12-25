var config = require("../common/config.js"),
  db = new (require("../common/db.js").Db)();

module.exports.landing = function (req, res) {
  var has_google = !!req.session.google;
  var has_fitbit = !!req.session.fitbit;
  res.render("new_stream", {
    has_google: has_google,
    has_fitbit: has_fitbit,
  });
};

module.exports.submit = function (req, res) {
  var has_google = !!req.session.google;
  var has_fitbit = !!req.session.fitbit;
  var has_name = !!req.body.name;
  if (!has_google || !has_fitbit || !has_name) {
    return res.redirect("/new_stream");
  }
  db.addNewStream(
    // TODO hash this ID. stream_id shouldn't point to the google user. we will
    // share stream_id with the browser.
    req.session.google,
    req.body.name,
    req.session.fitbit.fitbit_id,
    req.session.fitbit.accessToken,
    req.session.fitbit.refreshToken,
    function (err) {
      res.send(err ? err : "stream added.");
    }
  );
};
