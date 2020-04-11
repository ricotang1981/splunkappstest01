


/*

Sideview.declareCustomBehavior("setPageStateIfCriticalHealthCheckFailed", function(htmlModule) {
    //var methodReference = htmlModule.renderHTML.bind(htmlModule);
    htmlModule.onHTMLRendered = function(context) {
        var severityLevel = context.get("results[0].severity_level");
        // there's an initial render before the results are actually back.
        alert(severityLevel)
        if (severityLevel==null) {
            return
        }
        this.hide("Homepage users don't care about critical health checks if they PASS")
        if (severityLevel>=3) {
            $("criticalHealthChecksHaveFailed").show();
        }
    }
});
*/



var getSplunkVersion = function() {
    if (Sideview.isCanary) {
        return Sideview.getConfigValue("SPLUNK_VERSION");
    }
    else {
        return Splunk.util.getConfigValue("VERSION_LABEL");
    }
}

var canaryIsInstalled = function() {
    // 8.0
    if (!Sideview) {
        window.setTimeout(function() {alert("the canary app is installed, but Sideview Utils is not.  Please Install Sideview Utils from Splunkbase and return later.  ")},0);
        foo = bar;
    }

    if (!Sideview.isCanary) {
        makeTheSwitch(CANARY_URL);
    }
}.bind(this)
var canaryIsNotInstalled = function() {
    alert("The Canary app does not appear to be installed, but it is required.  Install the Canary app (and the Sideview Utils app)  from Splunkbase, restart Splunk and then come back.  I am very sorry for the inconvenience.");
}
// if we are in it, therefore it's installed.
if (Sideview && Sideview.isCanary) {
    canaryIsInstalled();
}
// it might still be installed, we're just not "in" it.
else {
    var url = Splunk.util.make_url("/splunkd/__raw/services/apps/local/canary?output_mode=json");
    $.get(url,canaryIsInstalled)
        .fail(canaryIsNotInstalled);

}
