var express = require("express"),
  passport = require("passport"),
  session = require("express-session"),
  bodyParser = require("body-parser"),
  FitbitStrategy =
    require("passport-fitbit-oauth2").FitbitOAuth2Strategy,
  GoogleStrategy =
    require("passport-google-oauth20").Strategy,
  ensureLoggedIn = require("connect-ensure-login").ensureLoggedIn,
  ensureLoggedOut = require("connect-ensure-login").ensureLoggedOut,
  config = require("../common/config.js"),
  new_stream = require("./new_stream.js"),
  lastLine = null;

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

function setUpAuth() {
  passport.use(new FitbitStrategy(
    config.fitbit,
    function(accessToken, refreshToken, profile, done) {
      done(null, {
        fitbit_id: profile.id,
        accessToken: accessToken,
        refreshToken: refreshToken,
      });
    }
  ));

  passport.use(new GoogleStrategy(
    config.google,
    function(accessToken, refreshToken, profile, cb) {
      return cb(null, profile.id);
    }
  ));

  passport.serializeUser(function(user, done) {
    done(null, user);
  });

  passport.deserializeUser(function(user, done) {
    done(null, user);
  });

  app.use(session(config.session));
  app.use(passport.initialize());
  app.use(passport.session());

  app.get("/google/init",
    passport.authenticate("google",
      {scope: ["https://www.googleapis.com/auth/userinfo.email"]}));

  app.get("/google/callback", 
    passport.authenticate("google", {failureRedirect: "/"}),
    function (req, res) {
      req.session.google = clone(req.session.passport.user);
      res.redirect("/main");
    }
  );

  app.get("/fitbit/init",
    passport.authenticate("fitbit", {scope: ["profile", "weight"]}));

  app.get("/fitbit/callback",
    passport.authenticate("fitbit", {failureRedirect: "/"}),
    function (req, res) {
      req.session.fitbit = clone(req.session.passport.user);
      res.redirect("/main");
    }
  );
}

var app = express();
setUpAuth();

app.set("views", "views");
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));

// If logged out, show this landing page.
app.get("/",
  ensureLoggedOut("/main"),
  function (req, res) { res.render("landing"); }
);

// Only logged in users see /main.
app.get("/main",
  ensureLoggedIn("/google/init"),
  function (req, res) {
    res.render("main", {session : JSON.stringify(req.session)});
  }
);

app.get("/new_stream", new_stream.landing);
app.post("/new_stream/submit", new_stream.submit);

app.listen(config.port, function () {
  console.log("Listening on port ", config.port);
});

