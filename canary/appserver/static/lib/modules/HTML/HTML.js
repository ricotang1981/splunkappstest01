// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview, Module) {

class HTML extends Module {



    constructor(container, params) {
        super(container, params);
        this.searchFields = [];
        this.resultsKeys = [];
        this.searchFieldPairs = [];

        //get the list of row+name dictionaries
        this.findDynamicKeys();

        this.urlEncodeKeys  = this.getArrayParam("urlEncodeKeys");
        this.htmlEscapeKeys = this.getArrayParam("htmlEscapeKeys");

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
            alert("an HTML module is configured to get " + (this.maxRow+1) + " rows, but the maxRows param is only set to " + this.getParam("maxRows") + ".  The answer is probably to rework the configuration at the search language level to need fewer rows.");
        }
        for (var name in fields) {
            this.searchFields.push(name);
        }
        this.isDynamic = (this.searchFields.length + this.resultsKeys.length > 0);
    }

    resetUI() {
        var context = this.getContext();
        this.renderHTML(context);
    }

    getArrayParam(name) {
        var value = this.getParam(name);
        if (!value) return [];
        var arr = value.toString().split(",");
        for (var i=0,len=arr.length; i<len; i++) {
            arr[i] =  $.trim(arr[i]);
        }
        return arr;
    }

    /**
     * look for any tokens that refer to properties or field values in
     * the search RESULTS. If there are any present, then this module
     * behaves quite differently.
     */
    findDynamicKeys() {
        // part 1. get the list of keys requested.
        // to do this we cheat. We modify a context to sneak in as a mole.
        var html = this.getParam("html") || "";

        var retVal = Sideview.findDynamicKeys(html);

        this.searchFieldPairs = retVal[0];
        this.resultsKeys = retVal[1];

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

    requiresResults() {return this.isDynamic;}

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
     * These 2 are pulled out as template methods just to make
     * customBehavior overrides easier
     */
    addCustomKeys(context) {}

    getHTML(html, context) {
        Sideview.setStandardTimeRangeKeys(context);
        Sideview.setStandardJobKeys(context, true);
        Sideview.withEachContextValue(context, this.urlEncodeKeys, function(value) {
            return encodeURIComponent(value)
        });
        Sideview.withEachContextValue(context, this.htmlEscapeKeys, function(value) {
            return $('<div/>').text(value).html();
        });

        return Sideview.replaceTokensFromContext(html, context)
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
     * returns true if we have things like $results[0].fieldName$,  where we
     * actually need the results to render something.
     */
    doWeNeedResults(context) {
        var search = context.getSplunkSearch();
        return (this.searchFields.length>0 && (search.isDone() || (search.getResultCount() > 0)))
    }

    /**
     * time to make the donuts
     */
    renderHTML(context) {
        this.container.html("");
        var template = this.getParam("html", "") || ""
        this.addCustomKeys(context);
        var html = this.getHTML(template, context);
        this.container.html(html);
        this.onHTMLRendered();
    }

    /**
     * someone on the outside may want to barge in the moment there are donuts
     */
    onHTMLRendered() {}

    /**
     * if we're configured with any static values then we'll have to go get our data.
     */
    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        if (this.isDynamic && this.doWeNeedResults(context)) {
            this.addPlaceholderValues(context);
            this.getResults();
        }
        Sideview.applyCustomCssClass(this,context);
        this.renderHTML(context);
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
            this.renderHTML(this.getContext());
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

            if (search.canGetResults() && this.doWeNeedResults(context)) {
                this.getResults();
            }
            // if we have things like 'results.count' update now.
            if (this.resultsKeys.length>0 && this.searchFields==0) {
                this.renderHTML(context);
            }
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
            var results = jsonResponse.results;
            var row, name;
            for (var i=0,len=results.length;i<len;i++) {
                row = results[i];
                for (var field in row) {
                    if (row.hasOwnProperty(field)) {
                        name = "results[" + i + "]." + field;
                        context.set(name, row[field]);
                    }
                };
            };
        }
        this.renderHTML(context);
    }
}
return HTML;
});