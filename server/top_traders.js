var
  config = require("../common/config.js");

function createOpportunity(user, user_opportunity) {
  var result = {
    user_name: user.user_name,
    initial_money: user_opportunity.initial_money,
    total_money: user.total_money,
    best_cost: user_opportunity.best_cost,
  };
  if (result.initial_money === 0) {
    throw "initial money is 0";
  }
  result.total_money_ratio = result.total_money / result.initial_money;
  result.best_cost_ratio = result.best_cost / result.initial_money;
  if (result.best_cost_ratio === 1) {
    result.efficiency = Math.sign(result.total_money_ratio - 1);
  } else {
    result.efficiency =
      (result.total_money_ratio - 1)
      / (result.best_cost_ratio - 1);
  }
  return result;
}

module.exports.TopTraders = function (db) {
  var result = [];
  var opportunities = {};

  function updateResult() {
    db.getTopTraders(function (err, rows) {
      if (err || !('length' in rows)) {
        console.log("failed to update all traders", err);
        return;
      }
      // amo prvo sortirat i popunit result
      result = [];
      for (var i = 0; i < rows.length; ++i) {
        result.push({
          user_name: rows[i].user_name,
          total_money: rows[i].total_money,
        });
      }
      result.sort(function (lhs, rhs) {
        return rhs.total_money - lhs.total_money;
      });
      result = result.slice(0, config.topTraders);
      // amo sad popunit opportunities.
      opportunities = {};
      for (var periodId in config.opportunityIntervals) {
        opportunities[periodId] = [];
      }
      for (var i = 0; i < rows.length; ++i) {
        try {
          var opportunity = JSON.parse(rows[i].opportunity);
          if (typeof opportunity !== 'object') {
            continue;
          }
          for (var periodId in config.opportunityIntervals) {
            if (opportunity.hasOwnProperty(periodId)) {
              opportunities[periodId].push(
                  createOpportunity(rows[i], opportunity[periodId]));
            }
          }
        } catch (e) {
          console.log("while parsing opportunity: ", e);
        }
      }
      var toDelete = [];
      for (var periodId in config.opportunityIntervals) {
        opportunities[periodId].sort(function (lhs, rhs) {
          return rhs.efficiency - lhs.efficiency;
        });
        opportunities[periodId] =
          opportunities[periodId].slice(0, config.topTraders);
        if (opportunities[periodId].length == 0) {
          toDelete.push(periodId);
        }
      }
      for (var i = 0; i < toDelete.length; ++i) {
        delete opportunities[toDelete[i]];
      }
    });
  }

  // [
  //    {
  //    user_name: ,
  //    total_money:
  //    },
  // ]
  this.getResult = function () {
    return result;
  };

  /*
    {
      "1d" : [
        {
          user_name: "ganton",
          initial_money: 10000,
          total_money: 10100,
          total_money_ratio: 10100 / 10000,
          best_cost: 10200,
          best_cost_ratio: 10200 / 10000,
          efficiency: 0.5,
        },
        ...
      ],
      "3d" : ..
    }
  */
  this.getOpportunities = function () {
    return opportunities;
  };

  (function () {
    updateResult();
    setInterval(updateResult, 60 * 1000);
  }());
};
