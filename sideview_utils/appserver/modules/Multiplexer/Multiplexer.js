// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.Multiplexer= $.klass(Sideview.utils.getBaseClass(true), {
    /**
     * time to make the guy who makes the guys who make the donuts.
     */ 
    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        if (this.getParam("fields")) {
            this.fields = this.getFieldsParam();
        } else if (this.getParam("field")) {
            this.fields = [this.getParam("field")];
        } else {
            this.fields = [];
        }
        this.visibilityId = "This is the multiplex source module";
        this.checkConfig();
        this.hugoSimpson = null;
        Sideview.utils.applyCustomProperties(this);
    },
    requiresResults: function(){return true;},

    checkConfig: function() {
        if (this.getParam("field") && this.getParam("fields")) {
            this.displayInlineErrorMessage('ERROR - Multiplexer is configured with both "field" and "fields" param. You can use only one of the two.');
        }
        if (!this.getParam("field") && !this.getParam("fields")) {
            this.displayInlineErrorMessage('ERROR - Multiplexer is configured with no "fields" param. This is a configuration error.');
        }
        if (this.getParam("field") && this.getParam("field").indexOf(",")!=-1) {
            this.displayInlineErrorMessage('ERROR - Multiplexer has a field param with a comma in it (' + this.getParam("field") + '). You probably meant to use the "fields" param.');
        }
    },

    getFieldsParam: function() {
        var fields = this.getParam("fields").split(",");
        for (var i=0,len=fields.length;i<len;i++) {
            fields[i] = $.trim(fields[i]);
        }
        return fields;
    },

    /**
     * Hugo is a child the system doesn't know about. We keep him hidden and
     * periodically use him for our evil cloning experiments.
     */
    onLoadStatusChange: function($super,statusInt) {
        if (!this.isPageLoadComplete() && statusInt >= Sideview.utils.moduleLoadStates.WAITING_FOR_CONTEXT) {
            if (this.hugoSimpson) {
                this.hugoSimpson.hide(this.visibilityId);
                this.hugoSimpson.hideDescendants(this.visibilityId);
            }
        }
    },

    addChild: function($super,child) {
        if (!this.hugoSimpson) {
            this.hugoSimpson = child;
            
        } else {
            if (!this.isPageLoadComplete()) {
                Sideview.utils.broadcastMessage('error', 'splunk', "ERROR: The creator of this view has given a Multiplexer (" + this.moduleId + ") more than one child module.  This is a mistake as there is no reason to do so and those extra child modules will not work properly.");
            }
            return $super(child);
        }
    },

    onJobDone: function(event) {
        this.getResults();
    },

    resetUI: function() {
        for (var i=this._children.length-1;i>-1;i--) {
            var child = this._children[i];
            child.withEachDescendant(function(module) {
                module.container.remove();
            });
            child.container.remove();
            this.removeChild(child);
            
        }
    },

    onContextChange: function() {
        var context = this.getContext();
        var job = context.get("search").job;
        if (job.isDone()) {
            this.resetUI();
            this.getResults();
        }
    },

    getResultURL: function(params) {
        var context = this.getContext();
        var search  = context.get("search");
        var url = search.getUrl("results");
        
        var postProcess = search.getPostProcess();
        if (postProcess) {
            params["search"] = postProcess;
        }
        var pageSize   = this.getContext().get("results.count");
        var pageOffset = this.getContext().get("results.offset");
        if (pageSize) {
            params["count"] = pageSize;
        } 
        else {
            params["count"] = this.getParam("maxRows");
        }
        if (pageOffset) {
            params["offset"] = pageOffset;
        }
        return url + "?" + Sideview.utils.dictToString(params);
    },

    getModifiedContext: function() {
        var context = this.getContext();
        context.set("results.offset", 0);
        context.set("results.upstreamPagerCallback", null);
        // in case anyone still uses the old Paginator module.
        context.set("results.upstreamPaginator", null);
        // disable ALL chart color synchronization because the charting
        // framework will get into an infinite loop and crash the browser.
        context.set("charting.legend.masterLegend","");
        return context;
    },

    /**
     * we got our values back from the server.  Now we start cloning subtrees
     * and all hell breaks loose.
     */
    renderResults: function(xmlDoc) {
        var fieldSelectorStr = "field[k='%s']";
        var multiplexValues = [];
        var moduleReference = this;
        $(xmlDoc).find("results result").each(function() {
            var valueDict = {};
            for (var i=0,len=moduleReference.fields.length;i<len;i++) {
                var fieldSelector = sprintf(fieldSelectorStr, moduleReference.fields[i]) + " text";
                valueDict[moduleReference.fields[i]] = $.trim($(this).find(fieldSelector).text());
            }
            multiplexValues.push(valueDict);
        });
        this.multiplex(multiplexValues);
        this.pushContextToChildren();
    },

    multiplex: function(valueDicts) {
        this.resetUI();
            
        var cloningFrom = this.hugoSimpson;
        cloningFrom.show(this.visibilityId);
        cloningFrom.showDescendants(this.visibilityId);
        
        var reasonsToBeInvisible = [];
        for (mode in this._invisibilityModes) {
            if (mode!="hidden module") {
                reasonsToBeInvisible.push(mode);
            }
        }
        var clone, lastInserted = this.container;
        for (var i=0,len=valueDicts.length;i<len;i++) {
            // Note we have to keep track of the most-recently-inserted module
            // for what is effectively a FlowLayout.  AND we have to keep track
            // of the cloningFrom element of the most recently cloned branch to inject
            // $foo$ tokens into it's context. 
            // this necessitates the double return value below. 
            var multiplexId = this.moduleId + "_clone" + i;

            // TOP LEVEL CALLS ARE DIFFERENT from recursive calls in two ways. 
            // 1)  Note that we pass the i var as the last argument.   This is the trigger that causes the multiplexedBlock 
            // div to get written out, and insertionPoint left pointing therein. 
            // 2) NOTE that lastInserted below, is NOT retVal[1],  but rather we get a reference to the last written 
            // multiplexedBlock div.
            var retVal = Sideview.utils.cloneBranch(cloningFrom, this, multiplexId, lastInserted, reasonsToBeInvisible, i);
            clone = retVal[0];

            lastInserted = $("#" + multiplexId + "_multiplexedBlock_" + i);

            Sideview.utils.injectValuesIntoContext(clone,"", valueDicts[i]);
        }
        cloningFrom.hide(this.visibilityId);
        cloningFrom.hideDescendants(this.visibilityId);
    }

});
