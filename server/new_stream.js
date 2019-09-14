var config = require("../common/config.js"),
  db = new (require("../common/db.js").Db)();

module.exports.populateMyStream = function (req, res, next) {
  var myStream = null;
  db.getStreamCredentials(function (err, row) {
    if (err) {
      return res.error(err);
    }
    if (row.stream_id == req.user.user_id) {
      myStream = row;
    }
  }, function (err) {
    if (err) {
      return res.error(err);
    }
    req.myStream = myStream;
    next();
  });
};

module.exports.landing = function (req, res) {
  var has_google = !!req.session.google;
  var has_googlefit = !!req.session.googlefit;
  var has_fitbit = !!req.session.fitbit;
  var has_snapscale = !!req.session.snapscale;
  req.session.returnTo = "/new_stream";

  if (!has_google) {
    return res.error("Ocekivao sam da imas google.");
  }

  res.render("new_stream", {
    message: req.session.message || "",
    has_google: has_google,
    has_googlefit: has_googlefit,
    has_fitbit: has_fitbit,
    has_snapscale: has_snapscale,
    existing_stream: req.myStream,
    session : JSON.stringify(req.session)
  });
};

module.exports.submit = function (req, res) {
  var has_google = !!req.session.google;
  var has_googlefit = !!req.session.googlefit;
  var has_fitbit = !!req.session.fitbit;
  var has_name = !!req.body.name;
  var has_snapscale = !!req.session.snapscale;
  var existing_stream = req.myStream;

  if (!has_google) {
    req.session.message = "prijavi se s googlom da dodas svoj stream.";
    return res.redirect("/new_stream");
  }

  if (!req.body.provider || (req.body.provider !== "googlefit" &&
                             req.body.provider !== "fitbit" &&
                             req.body.provider !== "snapscale")) {
    req.session.message = "klikni na kruzic.";
    return res.redirect("/new_stream");
  }

  if (req.body.provider == "googlefit" && !has_googlefit) {
    req.session.message = "googlefit provider ali nisi logiran sa googlefit";
    return res.redirect("/new_stream");
  }

  if (req.body.provider == "fitbit" && !has_fitbit) {
    req.session.message = "fitbit provider ali nisi logiran sa fitbitom";
    return res.redirect("/new_stream");
  }

  if (req.body.provider == "snapscale" && !has_snapscale) {
    req.session.message = "snapscale provider ali nisi logiran sa snapscale";
    return res.redirect("/new_stream");
  }

  if (!req.body.name) {
    req.session.message = "enter stream name.";
    return res.redirect("/new_stream");
  }

  // existing stream
  if (existing_stream) {
    if (req.body.name != existing_stream.stream_name) {
      req.session.message = "Can't change stream name.";
      return res.redirect("/new_stream");
    }
  }

  var credentials;
  if (req.body.provider == "googlefit") credentials = req.session.googlefit;
  if (req.body.provider == "fitbit") credentials = req.session.fitbit;
  if (req.body.provider == "snapscale") credentials = req.session.snapscale;

  if (existing_stream) {
    db.updateExistingStream(
      req.session.google,
      req.body.provider,
      credentials.profile_id,
      credentials.accessToken,
      credentials.refreshToken,
      function (err) {
        res.send(err ? err : "stream updated.");
      }
    );
  } else {
    db.addNewStream(
      req.session.google,
      req.body.name,
      req.body.provider,
      credentials.profile_id,
      credentials.accessToken,
      credentials.refreshToken,
      function (err) {
        res.send(err ? err : "stream added.");
      }
    );
  }
};
