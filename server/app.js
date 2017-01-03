var express = require("express"),
  passport = require("passport"),
  session = require("express-session"),
  sha1 = require('sha1'),
  bodyParser = require("body-parser"),
  FitbitStrategy =
    require("passport-fitbit-oauth2").FitbitOAuth2Strategy,
  GoogleStrategy =
    require("passport-google-oauth20").Strategy,
  ensureLoggedIn = require("connect-ensure-login").ensureLoggedIn,
  ensureLoggedOut = require("connect-ensure-login").ensureLoggedOut,
  config = require("../common/config.js"),
  new_stream = require("./new_stream.js"),
  main = require("./main.js"),
  db = new (require("../common/db.js").Db)(),
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
      return cb(null, sha1(profile.id));
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
      res.redirect("/new_stream");
    }
  );
}

var app = express();
setUpAuth();

app.set("views", "views");
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('./static'))

// Attaches .info() and .error() on response.
app.use(function (req, res, next) {
  // js_payload will be used to transmit information to the client.
  res.js_payload = {
    info : [],
    error : [],
  };
  res.info = function (msg) {
    console.log(msg);
    res.js_payload.info.push(msg);
  };
  res.error = function (msg) {
    console.log(msg);
    res.status(500).send(msg);
  };
  next();
});

// If logged out, show this landing page.
app.get("/",
  ensureLoggedOut("/main"),
  function (req, res) { res.render("landing"); }
);

// I was considering using passport.deserializeUser but that doesn't play well
// with fitbit auth.
function getUserFromDb(req, res, next) {
  if (!req.session.google) {
    return res.redirect("/google/init");
  }
  db.getUser(req.session.google, function (err, user) {
    if (err) {
      return res.error(err);
    }
    req.user = user;
    try {
      req.user.shares = JSON.parse(req.user.shares);
    } catch (e) {
      console.log("can't parse user shares: ", req.user, e);
      req.user.shares = {};
    }
    next();
  });
}

// attaches req.actual with latest weights.
function getLatestWeights(req, res, next) {
  db.getLatestWeights(function (err, actual) {
    if (err) {
      return res.error(err);
    }
    req.actual = actual;
    next();
  });
}

var mainMid = [
  ensureLoggedIn("/google/init"),
  getUserFromDb,
  getLatestWeights,
];

app.get("/main/plot_txt", mainMid, main.path_txt); 
app.get("/main", mainMid, main.landing);
app.post("/main/personal/update", mainMid, main.personalUpdate);
app.post("/main/personal/submit", mainMid, main.submitTransaction);

app.get("/new_stream", new_stream.landing);
app.post("/new_stream/submit", new_stream.submit);

app.listen(config.port, function () {
  console.log("Listening on port ", config.port);
});

