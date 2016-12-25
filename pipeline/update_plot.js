var
  config = require("../common/config.js"),
  db = new (require("../common/db.js").Db)(),
  fs = require("fs"),
  async = require("async");

// Reads all data series and produces .txt file used by dygraph for plotting.
module.exports.updatePlot = function(done) {
  var write_stream = fs.createWriteStream(
      config.plot_txt,
      {encoding : "utf8"});

  var columns = [];
  var columnSet = { /* name => true */ };
  var per_date = { /* date => { column => weight } */ };

  db.getDataPointsForPlot(function (err, row) {
    if (err) {
      return done(err);
    }
    if (!columnSet.hasOwnProperty(row.stream_name)) {
      columnSet[row.stream_name] = true;
      columns.push(row.stream_name);
    }
    if (!per_date.hasOwnProperty(row.date)) {
      per_date[row.date] = {};
    }
    per_date[row.date][row.stream_name] = row.weight;
  }, function (err) {
    if (err) {
      return done(err);
    }
    write_stream.write("date,");
    write_stream.write(columns.join(","));
    write_stream.write("\n");
    for (var date in per_date) {
      write_stream.write(date + ",");
      write_stream.write(columns.map(function (column) {
          return JSON.stringify(per_date[date][column]);
        }).join(","));
      write_stream.write("\n");
    }
    write_stream.end();
    console.log(config.plot_txt + " updated.");
    done(null);
  });
};
