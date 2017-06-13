// TODO: introduce a js class that handles plot and remove duplicate code
// between total_money and market.
$(function () {
  var plot = null;
  var current = js_payload.page;
  var originalRange = null;

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
      labelsKMB : true,
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
        "/main/total_money_plot_txt",
        options);
    window.plot = plot;

    $(document).click(function () {
      if (plot) {
        plot.clearSelection();
      }
    });
  }

  initializePlot();

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

  function setUpZoomButtons(devnull, is_initial) {
    if (!is_initial) {
      return;
    }
    originalRange = plot.xAxisRange();
    var visible = [];
    for (var i = 0; i < js_payload.top_traders.length; ++i) {
      var name = js_payload.top_traders[i].user_name;
      var prop = plot.getPropertiesForSeries(name);
      var id = plot.indexFromSetName(name) - 1;
      var div = $("<div></div>");
      div
        .css("color", prop.color)
        .data("id", id)
        .data("name", name)
        .attr('unselectable', 'on')
        .css('user-select', 'none')
        .on('selectstart', false)
        .text(name);
      if (i >= 5) {
        div.addClass("hide");
        visible[id] = false;
      } else {
        visible[id] = true;
      }
      div.appendTo($("div#legend"));
    }
    plot.setVisibility(visible);
    // get all series, colors and ids.
    $("div#legend div").click(function (e) {
      e.preventDefault();
      var id = $(this).data("id");
      $(this).toggleClass("hide");
      plot.setVisibility(id, !$(this).hasClass("hide"));
    });
    $(".plot-btn.time-span-buttons a").click(activate);
    activate.call($(".plot-btn a.initial")[0]);
  }

  (function () {
  })();
});
