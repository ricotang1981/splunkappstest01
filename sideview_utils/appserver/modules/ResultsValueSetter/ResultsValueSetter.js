// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.ResultsValueSetter = $.klass(Sideview.utils.getBaseClass(true), {

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        this.inFlight = true;
        this.fields = this.getFieldsParam();
        this.valueMap = {};
        Sideview.utils.applyCustomProperties(this);
    },
    requiresResults: function() {return true;},

    resetUI: function() {},

    /** 
     * see comment on DispatchingModule.requiresTransformedResults
     */
    requiresTransformedResults: function() {
        return true;
    },

    getFieldsParam: function() {
        var fields = this.getParam("fields").split(",");
        for (var i=0,len=fields.length;i<len;i++) {
            fields[i] = $.trim(fields[i]);
        }
        return fields;
    },

    getSubstitutedFields: function() {
        var fieldsStr = this.fields.join(",");
        var c = this.getContext();
        var substitutedFields = Sideview.utils.replaceTokensFromContext(fieldsStr, c).split(",");
        if (substitutedFields.length != this.fields.length) {
            this.logger.warn(this.moduleType + " $foo$ substitution led to a change in the number of fields requested... This is quite unusual but perhaps intentional.");
        }
        return substitutedFields;
    },

    /**
     * Tell the framework to put the field(s) into the requiredFields list 
     * on the job before it gets kicked off.
     */
    onBeforeJobDispatched: function(search) {
        if (Sideview.utils.mightNeedStatusBuckets(search)) {
            var fieldsStr = this.getSubstitutedFields();
            search.setMinimumStatusBuckets(1);
            search.setRequiredFields(fieldsStr);
        }
    },

    /** 
     * This template method in the module framework allows us to tell the 
     * framework that we are "not ready" and so it will defer the push of 
     * our data to downstream modules until we ARE ready.
     */
    isReadyForContextPush: function($super) {
        if (this.inFlight) {
            return Splunk.Module.DEFER;
        }
        return $super();
    },

    /**
     * called when a module from upstream changes the context data
     */
    onContextChange: function() {
        var context = this.getContext();
        this.valueMap = {};
        if (context.get("search").job.isDone()) {
            this.getResults();
        } else {
            this.inFlight = true;
        }
    },

    /**
     * called when a module from downstream requests new context data
     */
    getModifiedContext: function(context) {
        var context = context || this.getContext();
        if (this.inFlight) {
            this.setChildContextFreshness(false);
            return context;
        }
        for (key in this.valueMap) {
            //this.logger.debug("setting " + key + " to " + this.valueMap[key]);
            context.set(key, this.valueMap[key]);
        }
        return context;
    },
    
    /**
     * called when we have to send new context data to downstream modules.
     */
    pushContextToChildren: function($super, explicitContext) {
        /* see notes in Checkbox.js */
        this.withEachDescendant(function(module) {
            module.dispatchAlreadyInProgress = false;
        });
        return $super(explicitContext);
    },
    
    /**
     * called when the currently running job completes.
     */
    onJobDone: function() {
        this.getResults();
    },

    /** 
     * template method we expose that is to be called after rendering completes. 
     * this greatly simplifies some custom wiring use cases.
     */
    onRendered: function() {

    },

    /**
     * Goes and gets new results that we'll turn into our <option> values.
     */
    getResults: function($super) {
        this.inFlight = true;
        return $super()
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
        var postProcess = search.getPostProcess() || "";
        if (this.fields.length!=1 || this.fields[0]!="*") {
            postProcess += " | fields " + this.getSubstitutedFields()
        }
        params["search"] = postProcess;
        params["outputMode"] = "json";
        return url + "?" + Sideview.utils.dictToString(params);
    },


    /** 
     * called each time we get results back from splunk.
     */
    renderResults: function(jsonStr) {
        if (!jsonStr) {
            this.logger.error("empty string returned in " + this.moduleType + ".renderResults");
            this.logger.debug(jsonStr);
        }
        else {
            var results = Sideview.utils.getResultsFromJSON(jsonStr);
            var map = {};
            if (results.length>=1) {
                this.valueMap = $.extend(true,{},results[0])
            } else if (length==0) {
                this.logger.warn(this.moduleType + " -- there were no results, thus no fields");
            } else {
                this.logger.warn(this.moduleType + " -- Note that this module currently will only retrieve field values from the first event.");
            }
        }
        this.inFlight = false;
        this.onRendered();
        this.pushContextToChildren();
    }

});
