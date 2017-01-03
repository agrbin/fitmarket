var db = new (require("../common/db.js").Db)();

console.log("are you sure??");
if (0) {
  db.initializeDb(function (err) {
    console.log(err);
  });
}
