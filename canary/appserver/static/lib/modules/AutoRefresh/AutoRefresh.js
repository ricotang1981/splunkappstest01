// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule",
  "context"],
  function($, Sideview, Module, Context) {

class AutoRefresh extends Module {

    constructor(container, params) {
        super(container, params);
        this.checkConfig();
        this.mode = this.getParam("mode");
    }

    getRefreshInterval() {
        if (this.isPageLoadComplete() && (this.getLoadState() >= Sideview.moduleLoadStates.HAS_CONTEXT)) {
            var context  = this.getContext();
        } else {
            var context = new Context();
        }

        var template = this.getParam("refreshEvery");
        return Sideview.replaceTokensFromContext(template, context) * 1000
    }

    resetUI() {}

    checkConfig() {
        var refreshEvery = this.getParam("refreshEvery");

        if (refreshEvery.indexOf("$")==-1 && !Sideview.isInteger(refreshEvery)) {
            this.displayInlineErrorMessage(_("ERROR - the refreshEvery param  must have an integer value"));
        }
        var mode = this.getParam("mode");
        var legalModes = {"pushDownstream":1,"reloadEntirePage":1};
        if (!legalModes.hasOwnProperty(mode)) {
            this.displayInlineErrorMessage(sprintf(_("Error: the mode param can only have values of pushDownstream or reloadEntirePage. It is set here to %s"), mode));
        }
    }

    startTimer() {
        var interval = this.getRefreshInterval();
        this.nextFire = new Date().valueOf() + (interval)
        if (interval) {
            this.timeout = setTimeout(this.doRefresh.bind(this), interval);
        }
        //this.debugTimeout = setTimeout(this.doDebug.bind(this),1000);
    }

    doRefresh() {
        if (!this.isVisible()) {
            this.startTimer();
            return;
        }
        if (this.mode=="pushDownstream") {
            this.pushDownstream();
            this.startTimer();
        }
        else if (this.mode=="reloadEntirePage") {
            document.location.reload();
        }
    }

    /*
    doDebug() {
        var now = new Date().valueOf()
        var remaining = (now - this.nextFire) / 1000
        console.log(this.moduleId + ", hidden " + this.isHidden() + ", " + remaining);
        this.debugTimeout = setTimeout(this.doDebug.bind(this),1000);
    },
    */

    onContextChange(context) {
        // checking to see if the interval actually changed doesn't make sense.
        // onContextChange all modules here and downstream will get reset and
        // rerender, so the user will expect the clock to start ticking again.
        clearTimeout(this.timeout);
        //clearTimeout(this.debugTimeout);
        this.startTimer();
    }
}
    return AutoRefresh;

});