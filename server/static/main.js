$.mobile.defaultPageTransition = "none";
$.mobile.ajaxEnabled = false;

$(function () {
  // persistent toolbars:
  // demos.jquerymobile.com/1.4.5/toolbar-fixed-persistent/
  // btw, I am not happy with mobile jquery at all.
  $( "[data-role='navbar']" ).navbar();
  $( "[data-role='header'], [data-role='footer']" ).toolbar();

  function applyBtnActive() {
    var current = $(".ui-page-active").attr("id");
    $("[data-role='navbar'] a.ui-btn-active").removeClass("ui-btn-active");
    $("[data-role='navbar'] a." + current).addClass("ui-btn-active");
  }

  $(document).on("pagecontainerchange", applyBtnActive);
  applyBtnActive();

  // Render the graph
  new Dygraph(
    document.getElementById("plot"), "/main/plot_txt", {
    legend: 'always',
    ylabel: 'Value (kg)',
  });
});

