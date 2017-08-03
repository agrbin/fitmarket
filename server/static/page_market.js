// navigation between market and personal + stock time frame buttons + recent
// trader timeframe buttons.
$(function () {
  // persistent toolbars:
  // demos.jquerymobile.com/1.4.5/toolbar-fixed-persistent/
  // btw, I am not happy with mobile jquery at all.
  var plot = null;
  var current = js_payload.page;

  function initializePlot() {
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

    // Render the graph
    plot = new Dygraph(
        document.getElementById("plot"),
        "/main/plot_txt",
        options);

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

  initializePlot();

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
        $("<div></div>")
          .css("color", prop.color)
          .data("id", plot.indexFromSetName(name) - 1)
          .data("name", name)
          .attr('unselectable', 'on')
          .css('user-select', 'none')
          .on('selectstart', false)
          .text(name).appendTo($("div#legend"));
        // hack: change colors in fastmarket container
        $(".fastmarket-container #stock-" + name)
          .css("color", prop.color);
      }
    }
    // get all series, colors and ids.
    $("div#legend div").click(function (e) {
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

  $(".toplist-btn.time-span-buttons a").click(activateToplist);
  activateToplist.call(
    $(".toplist-btn.time-span-buttons a:contains(3d)")[0]);
});

// fastmarket implementation
$(function () {
  function getBids() {
    var result = {};
    $(".fastmarket-container input.updown:checked").each(function (i, e) {
      var stream_id = $(e).attr("name");
      var val = $(e).val();
      if (val == "down") {
        result["~" + stream_id] = "1";
      } else if (val == "up") {
        result[stream_id] = "1";
      } else {
        throw ("unexpected value: " + val);
      }
    });
    return result;
  }

  var in_flight = 0;
  var latest_response = null;
  var latest_sent = getBids();
  grayOut(latest_sent);

  function onProcessed(response) {
    latest_response = response;
  }

  function bidsEq(bids1, bids2) {
    return JSON.stringify(bids1) === JSON.stringify(bids2);
  }

  // Takes bids as input and grays out titles (left buttons) that are not
  // invested.
  function grayOut(bids) {
    $(".fastmarket-container label.title").addClass("hide");
    for (var stream_id in bids) {
      if (stream_id[0] == '~') {
        stream_id = stream_id.substr(1);
      }
      $(".fastmarket-container label.title#stock-" +
          stream_id).removeClass("hide");
    }
  }

  // Starts the submit process. Can exit early if last latest_sent is equal to
  // current state.
  function initSubmit() {
    var bids = getBids();
    if (bidsEq(bids, latest_sent)) {
      // don't send the same request twice.
      return;
    }
    grayOut(bids);
    ++in_flight;
    latest_sent = bids;
    $(".fastmarket-loading").show();
    $.post(
      "/api/fast_submit?token=" + js_payload.user.api_token,
      bids, onProcessed, "json")
    .always(function () {
      --in_flight;
      if (in_flight == 0) {
        $(".fastmarket-loading").hide();
        if (JSON.stringify(latest_response) !== JSON.stringify(getBids())) {
          console.log(
            JSON.stringify(latest_response),
            JSON.stringify(getBids()));
          alert("something went wrong with the UI. reloading the page");
          document.location = document.location;
        }
      }
    });
  }

  $(".fastmarket-container .title-input").click(function () {
    $(this).attr("checked", false);
  });

  $(".fastmarket-container input").click(initSubmit);
});
