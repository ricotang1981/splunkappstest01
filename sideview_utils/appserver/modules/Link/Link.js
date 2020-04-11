// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.Link= $.klass(Sideview.utils.getBaseClass(true), {

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        this.allowSoftSubmit = Sideview.utils.normalizeBoolean(this.getParam("allowSoftSubmit"));
        this.open = this.allowSoftSubmit;
        this.useMetaKey = /mac/.test(navigator.userAgent.toLowerCase());
        this.DOWNSTREAM_VISIBILITY_MODE = "Link modules with allowAutoSubmit=false hide children onload";
        
        this.searchFields = [];
        this.resultsKeys = [];
        this.searchFieldPairs = [];
        
        this.findDynamicKeys();
        this.SELF_HIDING_MODE = "Link modules hide themselves by default until the search is dispatched";
        this.hideUntilPushReceived = Sideview.utils.normalizeBoolean(this.getParam("hideUntilPushReceived"));
        if (!this.hideUntilPushReceived) {
            this.show(this.SELF_HIDING_MODE);
        }
        $("a", this.container).mousedown(function(evt) {
            if (this.hasOnlyRedirectorChild()) {
                this.useRedirectorUrlAndTarget();
            }
        }.bind(this));
        $("a", this.container).click(function(evt) {
            this.modifierKeyHeld = this.isModifierKeyHeld(evt);
            if (this.customClickHandler()) {
                if (this.hasOnlyRedirectorChild()) {
                    return true;
                } else {
                    this.open = true;
                    this.pushContextToChildren();
                    this.open = this.allowSoftSubmit;
                }
            }
            
            this.modifierKeyHeld = false;
            return false;
        }.bind(this));
        Sideview.utils.applyCustomProperties(this);
    },

    requiresResults: function() {return this.isDynamic;},

    requiresDispatch: function($super, search) {
        if (!this.requiresResults()) return false;
        else return $super(search);
    },

    customClickHandler: function() {return true},

    resetUI: function() {},

    hasOnlyRedirectorChild: function() {
        return (this._children.length==1 && this._children[0].moduleType=="Splunk.Module.Redirector") 
    },
    
    useRedirectorUrlAndTarget: function() {
        var redirectorModule = this._children[0];
        var context = this.getContext();
        var url = redirectorModule.getURL(context);
        var link = $("a", this.container)
        link.attr("href",url);
        var target = redirectorModule.getParam("target");
        if (target)  link.attr("target",target);
    },

    onLoadStatusChange: function($super,statusInt) {
        if (this._alreadyChecked) return;
        
        if (!this.getAutoSubmit()) {
            if (statusInt >= Sideview.utils.moduleLoadStates.WAITING_FOR_CONTEXT) {
                this.hideDescendants(this.DOWNSTREAM_VISIBILITY_MODE + this.moduleId);
                this._alreadyChecked = true;
            }
        }
    },

    pushContextToChildren: function($super, explicitContext) {
        var retVal = $super(explicitContext);
        var isReady = this.isReadyForContextPush();
        if (isReady == Splunk.Module.CONTINUE) {
            this.showDescendants(this.DOWNSTREAM_VISIBILITY_MODE + this.moduleId);
        } 
        else if (!this.isPageLoadComplete() && isReady==Splunk.Module.CANCEL) {
            this.withEachDescendant(function(downstreamModule) {
                downstreamModule.markPageLoadComplete();
            });
        }
        return retVal;
    },
    /**
     * look for any tokens that refer to properties or field values in 
     * the search RESULTS. If there are any present, then this module 
     * behaves quite differently.
     */
    findDynamicKeys: function() {
        // part 1. get the list of keys requested.
        retVal = Sideview.utils.findDynamicKeys(this.getParam("label") || "");
        
        this.searchFieldPairs = retVal[0];
        this.resultsKeys = retVal[1];
        this.allKeys = retVal[2];

        retVal = Sideview.utils.findDynamicKeys(this.getParam("cssClass") || "");
        $.merge(this.searchFieldPairs,retVal[0]);
        $.merge(this.resultsKeys,retVal[1]);
        $.merge(this.allKeys,retVal[2]);

        this.maxRow = 0;

        //dedup the names and get the highest row #
        var fields = {};
        var pair; 
        for (var i=0,len=this.searchFieldPairs.length; i<len; i++) {
            pair = this.searchFieldPairs[i];
            fields[pair["name"]] = 1;
            this.maxRow = Math.max(this.maxRow, pair["row"]);
        }
        if (this.maxRow>=parseInt(this.getParam("maxRows"),10)) {
            alert("a Link module is configured to get " + (this.maxRow+1) + " rows, but the maxRows param is only set to " + this.getParam("maxRows") + ".  The answer is probably to rework the configuration at the search language level to need fewer rows.");
        }
        for (var name in fields) {
            this.searchFields.push(name);
        }
        this.isDynamic = (this.searchFields.length + this.resultsKeys.length > 0);
    },

    
    
    /** 
     * see comment on DispatchingModule.requiresTransformedResults
     */
    requiresTransformedResults: function() {
        return this.isDynamic;
    },
    
    /**
     * if the module is configured dynamically then we have to tell the 
     * framework to put the field(s) into the requiredFields list 
     * on the job before it gets kicked off.
     */
    onBeforeJobDispatched: function(search) {
        if (this.isDynamic) {
            // we have to manually copy the array (to workaround SPL-37431)
            var requiredFields = $.extend(true,[],this.searchFields);
            search.setRequiredFields(requiredFields);
        }
    },

    /** 
     * pulled out as a template method just to make 
     * customBehavior overrides easier
     */
    addCustomKeys: function(context) {},

    getLabel: function(context) {
        template = this.getParam("label") || "";
        Sideview.utils.setStandardTimeRangeKeys(context);
        Sideview.utils.setStandardJobKeys(context, true);
        
        // Link module html-escapes ALL KEYS
        Sideview.utils.withEachContextValue(context, this.allKeys, function(value) {
            return $('<div/>').text(value).html();
        });
        return Sideview.utils.replaceTokensFromContext(template, context);
    },
    

    isModifierKeyHeld: function(evt) {
        return this.useMetaKey ? evt.metaKey : evt.ctrlKey;
    },

    getAutoSubmit: function() {
        var p = this.getParam("allowAutoSubmit");
        if (p.indexOf("$")!=-1) {
            p = Sideview.utils.replaceTokensFromContext(p, this.getContext());
        }
        return Sideview.utils.normalizeBoolean(p);
    },

    getSoftSubmit: function() {
        var s = this.getParam("allowSoftSubmit");
        if (s.indexOf("$")!=-1) {
            s = Sideview.utils.replaceTokensFromContext(s, this.getContext());
        }
        return Sideview.utils.normalizeBoolean(s);
    },

    isReadyForContextPush: function() {
        // if we're still loading the page then we return the autoSubmit value.
        if (!this.isPageLoadComplete()) {
            return this.getAutoSubmit() ? Splunk.Module.CONTINUE : Splunk.Module.CANCEL;
        }
        // odd case, but autoRun pushes are *after* pageload, and setting the 
        // open flag right in the constructor would require access to the 
        // context...   Fortunately we can hardwire it.
        else if (Sideview.utils.normalizeBoolean(this.getParam("autoRun"))) {
            return Splunk.Module.CONTINUE;
        }
        return this.open ? Splunk.Module.CONTINUE : Splunk.Module.CANCEL;
    },

    /**
     * get the loadingText, which might be 'Loading...' or 
     * in fancy cases,  'Loading values of $someSelectedField$...'
     */
    getLoadingText: function(context) {
        // i18n peoples will have to preserve any $foo$ values in the string.
        var template = _(this.getParam("loadingText"));
        return Sideview.utils.replaceTokensFromContext(template, context)
    },

    /**
     * This washes the context through so that all the 'results[0].fieldName'
     * keys get populated with whatever text is in the 'loadingText' param.
     */
    addPlaceholderValues: function(context) {
        var placeholderValue = this.getLoadingText(context);
        for (var i=0,len=this.searchFieldPairs.length; i<len; i++) {
            var row = this.searchFieldPairs[i]["row"];
            var name = this.searchFieldPairs[i]["name"];
            context.set("results[" + row + "]." + name, placeholderValue);
        }
    },
    
    /**
     * clients call this when it may or may not be time to make the donuts.
     */
    worthRequestingNewRows: function(context) {
        var job = context.get("search").job;
        return (this.searchFields.length>0 && (job.isDone() || (job.getResultCount() > 0)))
    },



    renderLabel: function(context) {
        var label = this.getParam("label");
        this.addCustomKeys(context);
        label = this.getLabel(context);
        $("a", this.container).text(label);
    },



    onContextChange: function() {
        if (this.hideUntilPushReceived) {
            this.show(this.SELF_HIDING_MODE);
        }
        var context = this.getContext();
        if (this.isDynamic && this.worthRequestingNewRows(context)) {
            this.addPlaceholderValues(context);
            this.getResults();
        }
        Sideview.utils.applyCustomCssClass(this,context);
        this.renderLabel(context);
    },

    /**
     * it may or may not be time to make the donuts
     */
    onJobDone: function() {
        if (this.searchFields.length > 0) {
            this.getResults();
        }
        // if we have things like 'results.count' update now.
        if (this.resultsKeys.length>0 && this.searchFields==0) {
            this.renderLabel(this.getContext());
        }
    },

    /**
     * it may or may not be time to make the donuts
     */
    onJobProgress: function() {
        if (this.isDynamic) {
            var context = this.getContext();
            var search  = context.get("search");
            // if it's done it'll get updated by onJobDone.
            if (search.job.isDone()) return;
            // if we have things like 'results[0].fieldName' 
            if (search.job.isPreviewable() && this.worthRequestingNewRows(context)) {
                this.getResults();
            }
            // if we have things like 'results.count' update now.
            if (this.resultsKeys.length>0 && this.searchFields==0) {
                this.renderLabel(context);
            }
        }
        if (this.hideUntilPushReceived) {
            this.show(this.SELF_HIDING_MODE);
        }
    },

    /**
     * returns the URL used by the module to GET its results.
     */
    getResultURL: function(params) {
        var context = this.getContext();
        var search  = context.get("search");
        // sadly the getUrl method has a bug where it doesnt handle params
        // properly in the 'results' endpoint.
        var url = search.getUrl("results");

        // as of a while ago S&I changed it so that results_preview is always safe. 
        url = url.replace("/results", "/results_preview");
        params["count"] = this.maxRow+1;
        
        var existingPostProcess = search.getPostProcess() || "";
        params["search"] = existingPostProcess + " | fields " + this.searchFields.join(",");
        params["outputMode"] = "json";

        return url + "?" + Sideview.utils.dictToString(params);
    },


    /** 
     * called each time we get new data from the server.
     * once we have the data, we make the donuts.
     * if you are reading these comments then I probably know you already and 
     * you're one of my favorite splunk developers. If one or both statements 
     * are temporarily untrue email me to rectify both.
     */
    renderResults: function(jsonStr) {
        var context = this.getContext();
        if (jsonStr) {
            var results = Sideview.utils.getResultsFromJSON(jsonStr);
            var row, name;
            for (var i=0,len=results.length;i<len;i++) {
                row = results[i];
                for (field in row) {
                    if (row.hasOwnProperty(field)) {
                        name = "results[" + i + "]." + field;
                        context.set(name, row[field]);
                    }
                };
            };
        } 
        this.renderLabel(context);
        Sideview.utils.applyCustomCssClass(this,context);
    },


    

    getModifiedContext: function() {
        var context = this.getContext();
        if (this.modifierKeyHeld) context.set("click.modifierKey", this.modifierKeyHeld);
        var link = $("a", this.container);
        context.set("click.selectedElement",Sideview.utils.makeUnclonable(link));
        return context;
    },

    _fireDispatchSuccessHandler: function($super,runningSearch) {
        this.open = true;
        var retVal = $super(runningSearch);
        this.open = this.allowSoftSubmit;
        return retVal;
    }
});
