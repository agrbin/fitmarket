$.mobile.defaultPageTransition = "none";
$.mobile.ajaxEnabled = false;

// http://stackoverflow.com/questions/149055/how-can-i-format-numbers-as-money-in-javascript
Number.prototype.formatMoney = function(c, d, t){
  var n = this, 
      c = isNaN(c = Math.abs(c)) ? 2 : c, 
      d = d == undefined ? "." : d, 
      t = t == undefined ? "," : t, 
      s = n < 0 ? "-" : "", 
      i = String(parseInt(n = Math.abs(Number(n) || 0).toFixed(c))), 
      j = (j = i.length) > 3 ? j % 3 : 0;
  return s + (j ? i.substr(0, j) + t : "") + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : "");
};

function formatValue(x) {
  return x.formatMoney(1, ".", ",");
}

function shareOwner(stream_id) {
  return stream_id.charAt(0) == '~' ? stream_id.substr(1) : stream_id;
}

// update table.
function updateTable(additionalState) {
  var free_money_delta = 0;
  var user = js_payload.user;

  // fill values.
  $(".share_row").each(function (i, elem) {
    var stream_id = $(elem).data("stream_id");
    var user_shares = user.shares;
    var stream = js_payload.actual[stream_id];
    var user_count = user_shares[stream_id] || 0;
    var row_in_update = false;

    if (additionalState != null) {
      if (additionalState.stream_id == stream_id) {
        row_in_update = true;
        var buy_factor = additionalState.is_buy ? 1 : -1;
        user_count += buy_factor * additionalState.count;
        free_money_delta = (-buy_factor) *
            additionalState.count *
            stream.latest_weight;
      }
    }

    $("td.name", elem).text(stream.stream_name);
    $("td.count .how_many", elem).text(user_count);
    $("td.count .latest_weight", elem).text(
      formatValue(stream.latest_weight));
    $("span.total_value", elem).text(
      formatValue(user_count * stream.latest_weight)
    );

    if (user_count > 0 || row_in_update) {
      $(elem).show();
    } else {
      $(elem).hide();
    }

    if (row_in_update) {
      $(elem).addClass("in_update_" +
          (additionalState.is_buy ? "buy" : "sell"));
    } else {
      $(elem).removeClass("in_update_buy");
      $(elem).removeClass("in_update_sell");
    }
  });

  if (free_money_delta != 0) {
    $("tr.free_money span.value").text(formatValue(
          user.free_money + free_money_delta));
  }
}

// updating table when transaction is active
function onSliderChange() {
  // NOTE, optimization idea: this state can obtained by different means.
  var slider = $("input#count");
  var form = slider.parent("form")[0];
  var is_buy = ($(".which_action", form).attr("value") == "buy");
  var stream_id = $("select.select_stream", form).val();

  updateTable({
    stream_id: stream_id,
    is_buy: is_buy,
    count: slider.val()
  });
}

// buy/sell button events.
function setUpBuySellButtons() {
  var user = js_payload.user;
  var user_shares = user.shares;
  var actual = js_payload.actual;
  $(".buy-sell-form").hide();

  function getViableShares(is_buy) {
    var result = {};
    var cnt = 0;
    for (var stream_id in actual) {
      if (!js_payload.enableSelfShares &&
          shareOwner(stream_id) == user.user_id) {
        continue;
      }
      if (is_buy) {
        // If I have enough money to buy at least one, I can buy.
        if (user.free_money >= actual[stream_id].latest_weight) {
          result[stream_id] = true;
          ++cnt;
        }
      } else {
        // If I own at least one share, I can sell.
        if (user_shares[stream_id] > 0) {
          result[stream_id] = true;
          ++cnt;
        }
      }
    }
    result.num_viable = cnt;
    return result;
  }

  function show(is_buy) {
    var classname = is_buy ? "show-buy" : "show-sell";

    // If already active, ignore the click.
    if ($("." + classname).hasClass("ui-btn-active")) {
      return;
    }

    // Activate the correct button.
    $(".show-sth").removeClass("ui-btn-active");
    $("." + classname).addClass("ui-btn-active");

    // Change the form submit button text.
    $(".buy-sell-form .header-title").text(is_buy ? "Kupi" : "Prodaj");

    // Change the form style.
    $(".buy-sell-form .which_action").val(is_buy ? "buy" : "sell");

    // Activate the first option.
    $("select.select_stream").val("");
    $("select.select_stream").selectmenu("refresh", true);

    // za svaku opciju, jeli disabled?
    var viable = getViableShares(is_buy);
    $("select.select_stream option").each(function (i, elem) {
      var stream_id = $(elem).attr("value");
      if (viable[stream_id]) {
        $(elem).prop("disabled", false);
      } else {
        $(elem).prop("disabled", true);
      }
    });

    // Show the form.
    $(".buy-sell-form").show();
    $(".slider-container").hide();
    updateTable();
  }

  // Setup the handlers.
  for (var is_buy = 0; is_buy < 2; ++is_buy) {
    var classname = is_buy ? ".show-buy" : ".show-sell";
    if (getViableShares(is_buy).num_viable == 0) {
      $(classname).addClass("ui-state-disabled");
    } else {
      $(classname).click(function (e) {
        e.preventDefault();
        show($(this).hasClass("show-buy") ? true : false);
        $(this).blur();
      });
    }
  }
}

// personal -> when stream is selected
$(function () {
  $("div.slider-container").hide();

  updateTable();
  setUpBuySellButtons();

  $("select.select_stream").on("change", function () {
    var stream = js_payload.actual[this.value];
    var user = js_payload.user;
    var form = $(this).parent("form")[0];
    var is_buy = ($(".which_action", form).attr("value") == "buy");

    var max_cnt = 0;
    if (is_buy) {
      max_cnt = Math.floor(user.free_money / stream.latest_weight);
    } else {
      max_cnt = user.shares[stream.stream_id];
    }

    $("input#count", form)
      .attr("max", max_cnt)
      .val(max_cnt)
      .slider("refresh");

    $(".slider-container", form).show();

    // Set-up slider change handler
    onSliderChange();
    $("input#count").on("change", onSliderChange);
  });
});

// navigation between market and personal + stock time frame buttons + recent
// trader timeframe buttons.
$(function () {
  // persistent toolbars:
  // demos.jquerymobile.com/1.4.5/toolbar-fixed-persistent/
  // btw, I am not happy with mobile jquery at all.
  $( "[data-role='navbar']" ).navbar();
  $( "[data-role='header'], [data-role='footer']" ).toolbar();
  var plot = null;
  var current = $(".ui-page-active").attr("id");

  function applyBtnActive() {
    $("[data-role='navbar'] a.ui-btn-active").removeClass("ui-btn-active");
    $("[data-role='navbar'] a." + current).addClass("ui-btn-active");

    var options = {
      axes : {
        y : {
          axisLabelWidth : 25,
        },
      },
      highlightSeriesOpts: {
        strokeWidth: 5,
        strokeBorderWidth: 2,
        highlightCircleSize: 5
      },
      strokeWidth : 1,
      labelsSeparateLines: false,
      highlightCircleSize : 2,
      gridLineColor : "#ccc",
      connectSeparatedPoints : true,
      legend: false,
      drawPoints: true,
      drawCallback: setUpZoomButtons,
    };

    if (current == "market" && plot === null) {
      // Render the graph
      plot = new Dygraph(
          document.getElementById("plot"),
          "/main/plot_txt",
          options);
    }
    if (current == "total-money" && plot === null) {
      // Render the graph
      plot = new Dygraph(
          document.getElementById("plot"),
          "/main/total_money_plot_txt",
          options);
      window.plot = plot;
    }
    $(document).click(function () {
      if (plot) {
        plot.clearSelection();
      }
    });
  }

  $(document).on("pagecontainerchange", applyBtnActive);
  applyBtnActive();

  var originalRange = null;

  // Stock time-range buttons.
  function activate() {
    $(".plot-btn.time-span-buttons a").removeClass("ui-btn-active");
    $(this).addClass("ui-btn-active");
    $(this).blur();
    var span_str = $(this).text().trim();
    var span_ms = 0;
    var now = new Date().getTime();
    switch (span_str) {
      case "1y":
        span_ms = 365 * 24 * 3600 * 1000;
        break;
      case "3m":
        span_ms = 30 * 2 * 24 * 3600 * 1000;
        break;
      case "1m":
        span_ms = 30 * 24 * 3600 * 1000;
        break;
      case "1w":
        span_ms = 7 * 24 * 3600 * 1000;
        break;
      default:
        span_ms = originalRange[1] - originalRange[0];
        break;
    }
    opt = {dateWindow: [now - span_ms, now]};
    plot.updateOptions(opt);
  }

  function setUpZoomButtons() {
    if (originalRange !== null) {
      return;
    }
    for (var i = 0; i < plot.getLabels().length; ++i) {
      var name = plot.getLabels()[i];
      var prop = plot.getPropertiesForSeries(name);
      if (name == "date") {
        continue;
      }
      if (name.charAt(0) != '~') {
        $("<span></span>")
          .css("color", prop.color)
          .data("id", plot.indexFromSetName(name) - 1)
          .data("name", name)
          .attr('unselectable', 'on')
          .css('user-select', 'none')
          .on('selectstart', false)
          .text(name).appendTo($("div#legend"));
      }
    }
    // get all series, colors and ids.
    $("div#legend span").click(function (e) {
      e.preventDefault();
      var id = $(this).data("id");
      $(this).toggleClass("hide");
      plot.setVisibility(id, !$(this).hasClass("hide"));
    });
    originalRange = plot.xAxisRange();
    $(".plot-btn.time-span-buttons a").click(activate);
    activate.call($(".plot-btn a.initial")[0]);
  }

  // toplist period navigation
  function activateToplist() {
    $(".toplist-btn.time-span-buttons a").removeClass("ui-btn-active");
    $(this).addClass("ui-btn-active");
    $(this).blur();
    var span_str = $(this).text().trim();
    $(".toplist-div").hide();
    $(".toplist-div." + span_str).show();
  }

  if (current != "total-money") {
    $(".toplist-div").hide();
    $(".toplist-btn.time-span-buttons a").click(activateToplist);
    activateToplist.call(
      $(".toplist-btn.time-span-buttons a:contains(3d)")[0]);
  }
});

