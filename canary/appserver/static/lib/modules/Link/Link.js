// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "context",
  "svmodule"],
  function($, Sideview,Context,Module) {

class Link extends Module {

    constructor(container, params) {
        super(container, params);

        this.allowSoftSubmit = (this.getParam("allowSoftSubmit")=="True");
        this.open = this.allowSoftSubmit;
        this.useMetaKey = /mac/.test(navigator.userAgent.toLowerCase());
        this.DOWNSTREAM_VISIBILITY_MODE = "Link modules with allowAutoSubmit=false hide children onload";

        this.searchFields = [];
        this.resultsKeys = [];
        this.searchFieldPairs = [];

        this.findDynamicKeys();
        this.SELF_HIDING_MODE = "Link modules hide themselves by default until the search is dispatched";
        this.hideUntilPushReceived = (this.getParam("hideUntilPushReceived")=="True");
        if (!this.hideUntilPushReceived) {
            this.show(this.SELF_HIDING_MODE);
        }

        this.renderLabel(new Context());

        $("a", this.container).mousedown(this.linkMouseDown.bind(this));
        $("a", this.container).click(this.linkClick.bind(this));
    }

    linkMouseDown(evt) {
        if (this.hasOnlyRedirectorChild()) {
            this.useRedirectorUrlAndTarget();
        }
    }
    linkClick(evt) {
        this.modifierKeyHeld = this.isModifierKeyHeld(evt);
        if (this.customClickHandler()) {
            if (this.hasOnlyRedirectorChild()) {
                return true;
            } else {
                this.open = true;
                this.pushDownstream();
                this.open = this.allowSoftSubmit;
            }
        }

        this.modifierKeyHeld = false;
        return false;
    }

    requiresResults() {return this.isDynamic;}

    customClickHandler() {return true}

    resetUI() {}

    hasOnlyRedirectorChild() {
        return (this._children.length==1 && this._children[0].moduleType=="Redirector")
    }

    useRedirectorUrlAndTarget() {
        var redirectorModule = this._children[0];
        var context = this.getContext();
        var url = redirectorModule.getURL(context);
        var link = $("a", this.container)
        link.attr("href",url);
        var target = redirectorModule.getParam("target");
        if (target)  link.attr("target",target);
    }

    onHierarchyApplied() {
        if (!this.getAutoSubmit()) {
            this.hideDescendants(this.DOWNSTREAM_VISIBILITY_MODE + this.moduleId);
        }
    }

    pushDownstream(pageIsLoading) {
        var isReady = this.isReadyForContextPush();
        if (isReady == this.CONTINUE) {
            this.showDescendants(this.DOWNSTREAM_VISIBILITY_MODE + this.moduleId);
        }
        else if (!this.isPageLoadComplete() && isReady==this.CANCEL) {
            this.markPageLoadComplete();
            this.withEachDescendantInDispatchTier(function(downstreamModule) {
                downstreamModule.markPageLoadComplete();
            });
        }
        return this._pushDownstream(pageIsLoading);
    }

    /**
     * look for any tokens that refer to properties or field values in
     * the search RESULTS. If there are any present, then this module
     * behaves quite differently.
     */
    findDynamicKeys() {
        // part 1. get the list of keys requested.
        var retVal = Sideview.findDynamicKeys(this.getParam("label") || "");

        this.searchFieldPairs = retVal[0];
        this.resultsKeys = retVal[1];
        this.allKeys = retVal[2];

        retVal = Sideview.findDynamicKeys(this.getParam("cssClass") || "");
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
    }

    /**
     * if the module is configured dynamically then we have to tell the
     * framework to put the field(s) into the requiredFields list
     * on the job before it gets kicked off.
     */
    onBeforeJobDispatched(search) {
        if (this.isDynamic) {
            // we have to manually copy the array (to workaround SPL-37431)
            var requiredFields = $.extend(true,[],this.searchFields);
            search.setRequiredFields(requiredFields);
        }
    }

    /**
     * pulled out as a template method just to make
     * customBehavior overrides easier
     */
    addCustomKeys(context) {}

    getLabel(context) {
        var template = this.getParam("label") || "";
        //Sideview.setStandardTimeRangeKeys(context);
        //Sideview.setStandardJobKeys(context, true);

        // Link module html-escapes ALL KEYS
        Sideview.withEachContextValue(context, this.allKeys, function(value) {
            return $('<div/>').text(value).html();
        });
        return Sideview.replaceTokensFromContext(template, context);
    }

    isModifierKeyHeld(evt) {
        if (!evt) return false;
        return this.useMetaKey ? evt.metaKey : evt.ctrlKey;
    }

    getAutoSubmit() {
        var p = this.getParam("allowAutoSubmit");
        if (p.indexOf("$")!=-1) {
            p = Sideview.replaceTokensFromContext(p, this.getContext());
        }
        return (p=="True");
    }

    getSoftSubmit() {
        var s = this.getParam("allowSoftSubmit");
        if (s.indexOf("$")!=-1) {
            s = Sideview.replaceTokensFromContext(s, this.getContext());
        }
        return (s=="True");
    }

    isReadyForContextPush() {
        // if we're still loading the page then we return the autoSubmit value.
        if (!this.isPageLoadComplete()) {
            return this.getAutoSubmit() ? this.CONTINUE : this.CANCEL;
        }
        // this is vestige from the death of autoRun.
        // commenting it out because it seems pointless.
        //else if (!this.parent) {
        //    return this.CONTINUE;
        //}
        return this.open ? this.CONTINUE : this.CANCEL;
    }

    /**
     * get the loadingText, which might be 'Loading...' or
     * in fancy cases,  'Loading values of $someSelectedField$...'
     */
    getLoadingText(context) {
        // i18n peoples will have to preserve any $foo$ values in the string.
        var template = _(this.getParam("loadingText"));
        return Sideview.replaceTokensFromContext(template, context)
    }

    /**
     * This washes the context through so that all the 'results[0].fieldName'
     * keys get populated with whatever text is in the 'loadingText' param.
     */
    addPlaceholderValues(context) {
        var placeholderValue = this.getLoadingText(context);
        for (var i=0,len=this.searchFieldPairs.length; i<len; i++) {
            var row = this.searchFieldPairs[i]["row"];
            var name = this.searchFieldPairs[i]["name"];
            context.set("results[" + row + "]." + name, placeholderValue);
        }
    }

    /**
     * clients call this when it may or may not be time to make the donuts.
     */
    doWeNeedResults(context) {
        var search = context.getSplunkSearch();
        return (this.searchFields.length>0 && (search.isDone() || (search.getResultCount() > 0)))
    }

    renderLabel(context) {
        this.addCustomKeys(context);
        var label = this.getLabel(context);
        var link = $("a", this.container);
        if (link.length==0) {
            link = $("<a>")
                .attr("href","#")
                .attr("label", label)
                .appendTo(this.container);
        }
        link.text(label)

    }

    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        if (this.hideUntilPushReceived) {
            this.show(this.SELF_HIDING_MODE);
        }
        if (this.isDynamic && this.doWeNeedResults(context)) {
            this.addPlaceholderValues(context);
            this.getResults();
        }
        Sideview.applyCustomCssClass(this,context);
        this.renderLabel(context);
    }

    /**
     * it may or may not be time to make the donuts
     */
    onJobDone() {
        if (this.searchFields.length > 0) {
            this.getResults();
        }
        // if we have things like 'results.count' update now.
        if (this.resultsKeys.length>0 && this.searchFields==0) {
            this.renderLabel(this.getContext());
        }
    }

    /**
     * it may or may not be time to make the donuts
     */
    onJobProgress() {
        if (this.isDynamic) {
            var context = this.getContext();
            var search  = context.getSplunkSearch();
            // if it's done it'll get updated by onJobDone.
            if (search.isDone()) return;
            // if we have things like 'results[0].fieldName'
            if (search.canGetResults() && this.doWeNeedResults(context)) {
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
    }

    getSplunkResultParams(context,search) {
        var params = {};
        var existingPostProcess = search.getPostProcess() || "";
        params["search"] = existingPostProcess + " | fields " + this.searchFields.join(",");
        params["count"] = this.maxRow+1;
        params["output_mode"] = "json";
        return params;
    }


    /**
     * called each time we get new data from the server.
     * once we have the data, we make the donuts.
     * if you are reading these comments then I probably know you already and
     * you're one of my favorite splunk developers. If one or both statements
     * are temporarily untrue email me to rectify both.
     */
    renderResults(jsonResponse) {
        var context = this.getContext();
        if (jsonResponse) {
            var row, name, field;
            for (var i=0,len=jsonResponse.results.length;i<len;i++) {
                row = jsonResponse.results[i];
                for (field in row) {
                    if (row.hasOwnProperty(field)) {
                        name = "results[" + i + "]." + field;
                        context.set(name, row[field]);
                    }
                };
            };
        }
        this.renderLabel(context);
        Sideview.applyCustomCssClass(this,context);
    }

    getModifiedContext(context) {
        context = context || this.getContext();
        if (this.modifierKeyHeld) context.set("click.modifierKey", this.modifierKeyHeld);
        var link = $("a", this.container);
        context.set("click.selectedElement", Sideview.makeUnclonable(link));
        return context;
    }

    dispatchSuccess(runningSearch) {
        this.open = true;
        var retVal = this._dispatchSuccess(runningSearch);
        this.open = this.allowSoftSubmit;
        return retVal;
    }

};
    return Link;
});