// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.AutoRefresh= $.klass(Splunk.Module, {

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        this.checkConfig();
        Sideview.utils.applyCustomProperties(this);
        this.mode = this.getParam("mode");
    },

    onLoadStatusChange: function($super,statusInt) {
        if (this._alreadyChecked) return $super(statusInt);
        if (statusInt >= Sideview.utils.moduleLoadStates.WAITING_FOR_CONTEXT) {
            this.startTimer();
            this._alreadyChecked = true;
        }
    },
    
    getRefreshInterval: function() {
        if (this.isPageLoadComplete() && (this.getLoadState() >= Sideview.utils.moduleLoadStates.HAS_CONTEXT)) {
            var context  = this.getContext();
        } else {
            var context = new Splunk.Context();
        }

        var template = this.getParam("refreshEvery");
        return Sideview.utils.replaceTokensFromContext(template, context) * 1000
    },

    resetUI: function() {},

    checkConfig: function() {
        var refreshEvery = this.getParam("refreshEvery");
        
        if (refreshEvery.indexOf("$")==-1 && !Sideview.utils.isInteger(refreshEvery)) {
            this.displayInlineErrorMessage(_("ERROR - the refreshEvery param  must have an integer value"));
        }
        var mode = this.getParam("mode");
        var legalModes = {"pushDownstream":1,"reloadEntirePage":1};
        if (!legalModes.hasOwnProperty(mode)) {
            this.displayInlineErrorMessage(sprintf(_("Error: the mode param can only have values of pushDownstream or reloadEntirePage. It is set here to %s"), mode));
        }
    },
    
    startTimer: function() {
        var interval = this.getRefreshInterval();
        this.nextFire = new Date().valueOf() + (interval)
        if (interval) {
            this.timeout = setTimeout(this.doRefresh.bind(this), interval);
        }
        //this.debugTimeout = setTimeout(this.doDebug.bind(this),1000);
    },
    
    isHidden: function() {
        return (Sideview.utils.dictToString(this._invisibilityModes)!="")
    },

    doRefresh: function() {
        if (this.isHidden()) {
            this.startTimer();
            return;
        }
        if (this.mode=="pushDownstream") {
            this.pushContextToChildren();
            this.startTimer();
        }
        else if (this.mode=="reloadEntirePage") {
            document.location.reload();
        }
    },

    /*
    doDebug: function() {
        var now = new Date().valueOf()
        var remaining = (now - this.nextFire) / 1000
        console.log(this.moduleId + ", hidden " + this.isHidden() + ", " + remaining);
        this.debugTimeout = setTimeout(this.doDebug.bind(this),1000);
    },
    */

    onContextChange: function() {
        // checking to see if the interval actually changed doesn't make sense. 
        // onContextChange all modules here and downstream will get reset and 
        // rerender, so the user will expect the clock to start ticking again.
        clearTimeout(this.timeout);
        //clearTimeout(this.debugTimeout);
        this.startTimer();
    }
});




