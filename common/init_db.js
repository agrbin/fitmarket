var db = new (require("../common/db.js").Db)();

db.initializeDb(function (err) {
  console.log(err);
});
