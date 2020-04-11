// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.

define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class ResultsValueSetter extends Module {

    constructor(container, params) {
        super(container, params);
        this.inFlight = true;
        this.fields = this.getFieldsParam();
        this.valueMap = {};
    }

    requiresResults() {return true;}

    resetUI() {}

    getFieldsParam() {
        var fields = this.getParam("fields").split(",");
        for (var i=0,len=fields.length;i<len;i++) {
            fields[i] = $.trim(fields[i]);
        }
        return fields;
    }

    getSubstitutedFields() {
        var fieldsStr = this.fields.join(",");
        var c = this.getContext();
        var substitutedFields = Sideview.replaceTokensFromContext(fieldsStr, c).split(",");
        if (substitutedFields.length != this.fields.length) {
            console.warn(this.moduleType + " $foo$ substitution led to a change in the number of fields requested... This is quite unusual but perhaps intentional.");
        }
        return substitutedFields;
    }

    /**
     * Tell the framework to put the field(s) into the requiredFields list
     * on the job before it gets kicked off.
     */
    onBeforeJobDispatched(search) {
        if (Sideview.mightNeedStatusBuckets(search)) {
            var fieldsStr = this.getSubstitutedFields();
            search.setMinimumStatusBuckets(1);
            search.setRequiredFields(fieldsStr);
        }
    }

    /**
     * This template method in the module framework allows us to tell the
     * framework that we are "not ready" and so it will defer the push of
     * our data to downstream modules until we ARE ready.
     */
    isReadyForContextPush() {
        if (this.inFlight) return this.DEFER;
        return this.CONTINUE;
    }

    /**
     * called when a module from upstream changes the context data
     */
    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        this.valueMap = {};
        if (context.getSplunkSearch().isDone()) {
            this.getResults();
        } else {
            this.inFlight = true;
        }
    }

    /**
     * called when a module from downstream requests new context data
     */
    getModifiedContext(context) {
        context = context || this.getContext();
        if (this.inFlight) {
            return context;
        }
        for (key in this.valueMap) {
            context.set(key, this.valueMap[key]);
        }
        return context;
    }

    /**
     * called when we have to send new context data to downstream modules.
     */
    pushDownstream(pageIsLoading) {
        /* see notes in Checkbox.js */
        this.withEachDescendant(function(module) {
            module.dispatchAlreadyInProgress = false;
        });
        return this._pushDownstream(pageIsLoading);
    }

    /**
     * called when the currently running job completes.
     */
    onJobDone() {
        this.getResults();
    }

    /**
     * template method we expose that is to be called after rendering completes.
     * this greatly simplifies some custom wiring use cases.
     */
    onRendered() {

    }

    /**
     * Goes and gets new results that we'll turn into our <option> values.
     */
    getResults() {
        this.inFlight = true;
        return this._getResults()
    }

    getSplunkResultParams(context,search) {
        var params = {};

        var postProcess = search.getPostProcess() || "";
        if (this.fields.length!=1 || this.fields[0]!="*") {
            postProcess += " | fields " + this.getSubstitutedFields()
        }
        params["search"] = postProcess;
        params["output_mode"] = "json";

        return params;
    }


    /**
     * called each time we get results back from splunk.
     */
    renderResults(jsonResponse) {
        var jsonResults = jsonResponse.results;

        var map = {};
        if (jsonResults.length>=1) {
            this.valueMap = $.extend(true,{},jsonResults[0])
        } else if (length==0) {
            console.warn(this.moduleType + " -- there were no results, thus no fields");
        } else {
            console.warn(this.moduleType + " -- Note that this module currently will only retrieve field values from the first event.");
        }
        this.inFlight = false;
        this.onRendered();
        //PULL THIS CALL UP INTO MODULE. CHCEK RETURN FROM ISREADY, IF ITS DEFERRED THEN AUTOMATICALLY PUSH AFTER RENDERRESULTS
        this.pushDownstream();
    }

}
    return ResultsValueSetter;
});