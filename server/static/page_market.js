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
  function activate(span_str, arg) {
    $(".plot-btn.time-span-buttons a").removeClass("ui-btn-active");
    $(".plot-btn.time-span-buttons a.d" + span_str).addClass("ui-btn-active");
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
        // out of all visible plots, find the widest one.
        span_ms = originalRange[1] - originalRange[0];
        break;
    }
    opt = {dateWindow: [now - span_ms, now]};
    plot.updateOptions(opt);
    if (arg != "ignore_update") {
      updateDefaultUIs("initial_plot_btn", span_str);
    }
  }

  function onLineVisibilityUpdate() {
    // get all lines and their visibility.
    // if period is max, update plot time range.
    // update stats table
    var all_periods = [];
    $(".stats-btn a").each(function (i, e) {
      all_periods.push($(e).text().trim());
    });
    $("div#legend div").each(function (i, e) {
      var elem = $(e);
      var stream_name = elem.data("name");
      if (stream_name === "__all__") {
        return;
      }
      var is_visible = !elem.hasClass("hide");

      var correct_class = is_visible ? "enabled" : "disabled";
      var other_class = !is_visible ? "enabled" : "disabled";

      $("tr.tr" + stream_name, $("div.stats tbody." +
          correct_class)).show();
      $("tr.tr" + stream_name, $("div.stats tbody." +
          other_class)).hide();
    });
  }

  function streamNameClick(elem) {
    var id = elem.data("id");
    if (id === "__all__") {
      var is_on = !elem.hasClass("hide");
      $("div#legend div").each(function (i, e) {
        var stream_elem = $(e);
        var stream_id = stream_elem.data("id");
        if (stream_id === "__all__") {
          return;
        }
        if (is_on) {
          stream_elem.addClass("hide");
        } else {
          stream_elem.removeClass("hide");
        }
        plot.setVisibility(stream_id, !stream_elem.hasClass("hide"));
      });
      elem.toggleClass("hide");
    } else {
      elem.toggleClass("hide");
      plot.setVisibility(id, !elem.hasClass("hide"));
    }
    onLineVisibilityUpdate();
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
          .addClass("stream_name_" + name)
          .attr('unselectable', 'on')
          .css('user-select', 'none')
          .on('selectstart', false)
          .text(name).appendTo($("div#legend"));
        // hack: change colors in fastmarket container
        $(".fastmarket-container #stock-" + name)
          .css("color", prop.color);
        $(".tdstream" + name).css("color", prop.color);
      }
    }
    $("<div></div>")
      .css("color", "black")
      .data("id", "__all__")
      .data("name", "__all__")
      .addClass("__all__")
      .attr('unselectable', 'on')
      .css('user-select', 'none')
      .on('selectstart', false)
      .text("SVE").appendTo($("div#legend"));
    // get all series, colors and ids.
    $("div#legend div").click(function (e) {
      e.preventDefault();
      streamNameClick($(this));
    });
    originalRange = plot.xAxisRange();

    $(".plot-btn.time-span-buttons a").click(function () {
      $(this).blur();
      activate($(this).text().trim());
      activateStats($(this).text().trim());
    });

    activate(
      $(".plot-btn.time-span-buttons").data("initial"),
      "ignore_update"
    );
    onLineVisibilityUpdate();
  }

  // toplist period navigation
  function activateToplist(arg) {
    $(".toplist-btn.time-span-buttons a").removeClass("ui-btn-active");
    $(this).addClass("ui-btn-active");
    $(this).blur();
    var span_str = $(this).text().trim();
    $(".toplist-div").hide();
    $(".toplist-div." + span_str).show();
    if (arg != "ignore_update") {
      updateDefaultUIs("initial_toplist_btn", span_str);
    }
  }

  $(".toplist-btn.time-span-buttons a").click(activateToplist);
  var initial_text = $(".toplist-btn.time-span-buttons").data("initial");
  activateToplist.call($(".toplist-btn.time-span-buttons a.d" + initial_text), "ignore_update");

  // stats period nevigation
  function activateStats(span_str) {
    $(".stats-btn.time-span-buttons a").removeClass("ui-btn-active");
    $(".stats-btn.time-span-buttons a.d" + span_str).addClass("ui-btn-active");
    $(".stats-div").hide();
    $(".stats-div." + span_str).show();
  }

  $(".stats-btn.time-span-buttons a").click(function () {
    $(this).blur();
    activate($(this).text().trim());
    activateStats($(this).text().trim());
  });

  activateStats(
    $(".plot-btn.time-span-buttons").data("initial"),
    "ignore_update"
  );

  $("div.stats .tdstream span").click(function (e) {
    e.preventDefault();
    var stream_name = $(this).text();
    streamNameClick($("div#legend div.stream_name_" + stream_name));
  });
});

var update_default_uis_throttle_timer = null;
function updateDefaultUIs(key, value) {
  js_payload.ui_defaults[key] = value;
  // wait for 5 seconds, if another call happened in those 5 seconds cancel the
  // current timer. this sends at most 1 request per 5 seconds.
  clearTimeout(update_default_uis_throttle_timer);
  update_default_uis_throttle_timer = setTimeout(
      function () {
        $.post(
          "/api/update_default_uis?token=" + js_payload.user.api_token,
          js_payload.ui_defaults);
      }, 5000);
}

// hide show sections
$(function () {
  function updateVisibility(elem, arg) {
    var ui_corner_all = $(elem).parent().parent();
    var visible = $(elem).data("visible");
    if (visible == 'no') {
      $(".ui-bar .time-span-buttons", ui_corner_all).hide();
      $(".section-wrapper", ui_corner_all).hide();
    } else {
      $(".ui-bar .time-span-buttons", ui_corner_all).show();
      $(".section-wrapper", ui_corner_all).show();
    }
    $(elem)
      .removeClass("h3-visible-yes h3-visible-no")
      .addClass("h3-visible-" + visible);
    var name = $(elem).data("name");
    if (name == "section_fastmarket_visible") {
      var scrollingElement = (document.scrollingElement || document.body);
      scrollingElement.scrollTop = scrollingElement.scrollHeight;
    }
    if (arg != "ignore_update") {
      updateDefaultUIs(name, visible);
    }
  }

  $(".ui-corner-all h3").click(function () {
    var ui_corner_all = $(this).parent().parent();
    var visible = $(this).data("visible");
    $(this).blur();
    if (visible == 'yes') {
      visible = 'no';
    } else {
      visible = 'yes';
    }
    $(this).data("visible", visible);
    updateVisibility($(this));
  });

  $(".ui-corner-all h3").each(function (i, e) {
    updateVisibility(e, "ignore_update");
  });
  $(".ui-corner-all h3")
    .attr('unselectable', 'on')
    .css('user-select', 'none')
    .on('selectstart', false);
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
