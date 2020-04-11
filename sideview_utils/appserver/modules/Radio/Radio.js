// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.Radio= $.klass(Sideview.utils.getBaseClass(true), {

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        this.name = this.getParam("name");
        this.searchFields = this.getSearchFields();
        
        this.staticFields = this.getParam('staticRadios') || [];
        // we use this flag to keep track of whether we're still loading data.
        this.inFlight = this.searchFields.length > 0;
        this.hasClearedURLLoader = false;

        this.selectedValueToApply = false;
        
        if ($.browser.msie) {
            this.container.bind("click", this.onChange.bind(this));
        } else {
            this.container.bind("change", this.onChange.bind(this));
        }
        this.changeEventsAreReal = true;

        this.checkConfig();
        
        Sideview.utils.applyCustomProperties(this);
    },

    getSearchFields: function() {
        if (this.getParam("valueField")) {
            var obj = {};
            obj.value = this.getParam("valueField");
            if (this.getParam("labelField")) {
                obj.label = this.getParam("labelField");
            }
            return [obj];
        }
        return [];
    },


    /**
     * overall function to check for configuration errors.
     */
    checkConfig: function() {
        this.checkNameConfig();
        this.checkFieldsConfig();
    },

    /**
     * make sure the 'name' param is OK.
     */
    checkNameConfig: function() {
        if (this.name=="search") alert(this.moduleType + " Error - you do not want to set " + this.moduleType + "'s 'name' param to a value of 'search' as this will disrupt underlying functionality in Splunk.");
    },
    
    /**
     * make sure the fields params are OK.
     */
    checkFieldsConfig: function() {
        try {
            
            if (this.searchFields.length==0 && this.staticFields.length ==0) {
                alert("ERROR - a Radio module MUST be configured with at least one static radio button or a dynamic config to render radio buttons from search results.");
            } else if (this.searchFields.length==0 && this.getParam("postProcess")) {
                alert("ERROR - a Radio module is configured with a postProcess param but no search fields. One of these is a mistake.");
            }
        } catch(e) {
            alert("ERROR - unexpected exception during Radio.checkFieldsConfig. Look for typos in the valueField, labelField or staticRadios params.");
            console.error(e);
        }
    },

    requiresResults: function() {
        return (this.searchFields.length>0);
    },

    /**
     * if the module is configured dynamically then we have to trigger 
     * a new dispatched search. Note that we actually defer to 
     * DispatchingModule to calculate it.
     */
    requiresDispatch: function($super, search) {
        if (!this.requiresResults()) return false;
        else return $super(search);
    },

    /** 
     * see comment on DispatchingModule.requiresTransformedResults
     */
    requiresTransformedResults: function() {
        return true;
    },

    /**
     * If the configuration refers to a field, and we're triggering a dispatch, 
     * we tell the framework to put the field(s) into the requiredFields list 
     * on the job before it gets kicked off.
     */
    onBeforeJobDispatched: function(search) {
        var fieldsStr = this.getParam("requiredFields");
        var fields = [];
        if (fieldsStr || this.searchFields.length>0) {
            var c = this.getContext().clone();
            c.set("name", this.getParam("name"));
            if (fieldsStr) {
                fields = Sideview.utils.replaceTokensFromContext(fieldsStr, c).split(",");
            } else {
                var value = Sideview.utils.replaceTokensFromContext(this.searchFields[0].value, c);
                var label = Sideview.utils.replaceTokensFromContext(this.searchFields[0].label, c);
                fields.push(value);
                if (label && fields.indexOf(label)==-1) {
                    fields.push(label);
                }
            }
        }
        if (fieldsStr || Sideview.utils.mightNeedStatusBuckets(search)) {
            search.setMinimumStatusBuckets(1);
            search.setRequiredFields(fields);
        }
    },

    /** 
     * get a dictionary of our search fields. keys are 'label' and 'value'.
     */
    getFields: function() {
        if (this.searchFields.length>0) {
            var value = this.searchFields[0].value;
            var label = this.searchFields[0].label || value;

            // do a quick token replacement.
            var c = this.getContext().clone();
            c.set("name", this.name);
            value = Sideview.utils.replaceTokensFromContext(value, c);
            label = Sideview.utils.replaceTokensFromContext(label, c);

            return {
                "value" : value,
                "label" : label
            }
        }
        return {};
    },

    /** 
     * This template method in the module framework allows us to tell the 
     * framework that we are "not ready" and so it will defer the push of 
     * our data to downstream modules until we ARE ready.
     */
    isReadyForContextPush: function($super) {
        if (this.inFlight) return Splunk.Module.DEFER;
        return $super();
    },

    /**
     * tell the URLLoader that we've absorbed their value so they dont keep 
     * telling us (and reselecting the value) over and over.
     */
    clearURLLoader: function(context) {
        context = context || this.getContext();
        // only do this once 
        if (!this.hasClearedURLLoader && context.has("sideview.onSelectionSuccess")) {
            var callback = context.get("sideview.onSelectionSuccess");
            callback(this.name, this);
            this.hasClearedURLLoader = true;
        }
    },


    setSelection: function(val) {
        
        this.changeEventsAreReal = false;
        $("input",this.container).each(function() {
            var input = $(this);
            // if this checkbox's value att is in the array.
            if (input.val() == val) {
                input.prop('checked',true);
                return true;
            } else {
                input.removeAttr("checked");
            }
        });
        this.changeEventsAreReal = true;
    },

    getSelection: function() {
        return $("input:checked",this.container).val();
    },

    getSelectedLabel: function() {
        var id = $("input:checked",this.container).attr("id");
        if (id) {
            return $("label[for='"+id+"']", this.container).text();
        }
        return "";
    },

    resetUI: function() {},
    
    setToContextValue: function(c) {
        var value = Sideview.utils.getValueForFormElementSelection(this.name,c);

        if (!value && value!="") return;
        if (this.searchFields.length>0) {
            this.setSelection(value);
            if (this.getSelection() != value) {
                this.selectedValueToApply = value;
            }
        } else {
            this.setSelection(value);
        }
    },

    /**
     * If this returns true, then the Radio module will be allowed to 
     * reload its dynamic buttons onContextChange.   Pulled out as its own 
     * method mostly so as to allow customBehavior overrides.
     */
    allowReload: function(context) {
        return (!this._previousResultURL || this._previousResultURL != this.getResultURL({})); 
    },
    

    /**
     * time to get some search results and render a new set of dynamic 
     * radio buttons. 
     */
    reloadDynamicRadios: function(context) {
        var selectedRadios = $('input:checked', this.container);
        // if a valid dynamic value is selected, we preserve the selection
        if (selectedRadios.filter(".dynamic").length>0) {
            this.selectedValueToApply = this.getSelection();
        }
        // if a valid *static* value was selected it's ok; it'll remain
        // selected in the DOM until renderResults and survive that too.

        // clear all the old dynamic ones.
        this.clearDynamicRadios();
        
        // add in our 'Loading...' text.
        
        $(".dynamicContainer",this.container).append(
            $("<div>")
                .addClass("radioWrapper")
                .addClass("dynamic")
                .text(_("Loading..."))
        );
        
        // go get the fresh data.
        if (context.get("search").job.isDone()) {
            this.getResults();
        } else {
            this.inFlight = true;
        }
    },

    /**
     * called when a module from upstream changes the context data
     */
    onContextChange: function() {
        var context = this.getContext();
        Sideview.utils.applyCustomCssClass(this,context);
        // handles purely dynamic config as well as the mixed case. 
        if (this.searchFields.length>0 && this.allowReload(context)) {   
            this.reloadDynamicRadios(context);
            this._previousResultURL = this.getResultURL({});
        } 
        // purely static configuration, or dynamic config that doesn't need 
        // to be reloaded.
        else if (!this.hasClearedURLLoader) {
            this.setToContextValue(context);
            this.clearURLLoader(context);
        }
    },




    /**
     * called when a module from downstream requests new context data
     */
    getModifiedContext: function(context) {
        var context = context || this.getContext();
        
        var value = this.getSelection();
        context.set(this.name + ".rawValue", value);
        var template = this.getParam("template");

        var templatizedValue = Sideview.utils.safeTemplatize(context, template, this.name, value);
        context.set(this.name + ".value", templatizedValue);
        context.set(this.name, templatizedValue);

        context.set(this.name + ".label",this.getSelectedLabel());

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
    
    onPassiveChange: function() {
        var context = this.getContext();
        if (context.has("sideview.onEditableStateChange")) {
            var callback = context.get("sideview.onEditableStateChange");
            callback(this.name, this.getSelection(), this);
        }
    },

    /**
     * called when the user changes the checkbox selections.
     */
    onChange: function(evt) {
        if (this.changeEventsAreReal) {
            /* we have to be a little more circumspect because on IE
               we bind to click events and not to change events */
            if ($.browser.msie) {
                var target = evt.target;
                if (target.tagName!="INPUT" && target.tagName!="LABEL") return false;
            }
            if (this.isPageLoadComplete()) {
                this.selectedValueToApply = false;
                this.onPassiveChange();
                this.pushContextToChildren();
            }
            this.clearURLLoader();
        }
    },

    /**
     * called when the currently running job completes.
     */
    onJobDone: function() {
        if (this.searchFields.length>0) {
            this.getResults();
        }
    },

    /** 
     * template method we expose that is to be called after rendering completes. 
     * this greatly simplifies some custom wiring use cases.
     */
    onRendered: function() {},

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
        params["count"] = this.getParam("count");

        var upstreamPostProcess = search.getPostProcess();
        if (this.getParam("postProcess")) {
            // we sneak in our own name so it can be referred to 
            // as $name$ in the postProcess param's value
            context.set("name", this.name);
            context.set("postProcess", upstreamPostProcess || "");
            var p = Sideview.utils.replaceTokensFromContext(this.getParam("postProcess"), context);
            params["search"] = p;
        } else if (upstreamPostProcess) {
            params["search"] = upstreamPostProcess;
        }
        params["outputMode"] = "json";
        return url + "?" + Sideview.utils.dictToString(params);
    },

    clearDynamicRadios: function() {
        $("div.dynamic",this.container).remove();
    },

    /**
     * We just use splunkWeb's proxy to splunkd, so the results will come back 
     * in JSON format.  This method builds out <input type="radio"> elements 
     * from that JSON.
     */
    buildDynamicRadiosFromResults: function(jsonStr) {
        // technically all this does is clear our loading... message.
        // since the radio buttons themselves were cleared when the request 
        // was made.
        this.clearDynamicRadios();
        
        if (!jsonStr) {
            this.logger.warn("empty string returned in " + this.moduleType + ".renderResults ("+this.name+")");
            this.logger.debug(jsonStr);
            return;
        }
        // always returns a 2 element dictionary with 'label' and 'value'.
        var fieldDict = this.getFields();

        var results = Sideview.utils.getResultsFromJSON(jsonStr);
        
        for (var i=0,len=results.length;i<len;i++) {
            this.buildRadio(results[i],fieldDict,i);
        };
    },
    
    buildRadio: function(row,fieldDict,index) { 
        var value = row[fieldDict["value"]];
        var label = row[fieldDict["label"]];
        if (!value && value!="") {
            this.logger.error("ERROR - a " + this.moduleType + " module (" + this.moduleId + ") received a result row that had no value for the value field (" + fieldDict["value"] + ").");
            value="";
            label="(no value found)";
        }
        else if (!label && label!="") {
            this.logger.warn("a " + this.moduleType + " module received a result row that had no value for the label field (" + fieldDict["label"] + ").  Using the value field instead (" + fieldDict["value"] + ").");
            label = value;
        }
        var dynamicContainer = $(".outerRadioWrapper",this.container);
        var id = this.moduleId + "_dynamic_" + index;
        dynamicContainer.append($("<div>")
            .addClass("radioWrapper")
            .addClass("dynamic")
            .append($("<input>")
                .addClass("dynamic")
                .attr("type","radio")
                .attr("name",this.moduleId + "_button")
                .attr("id",id)
                .attr("value",value)
            ).append($("<label>")
                .attr("for",id)
                .text(label))
            );
    },

    /** 
     * called each time we render our dynamic checkbox data from the server.
     */
    renderResults: function(jsonStr) {
        var context = this.getContext();
        
        var value = this.selectedValueToApply 
             || Sideview.utils.getValueForFormElementSelection(this.name,context);

        this.buildDynamicRadiosFromResults(jsonStr);
        if (value) {
            this.setSelection(value);
            if (this.getSelection() == this.selectedValueToApply || this.getSelection()==value) {
                this.clearURLLoader(context);
                this.selectedValueToApply = false;
            } 
        }
        this.inFlight = false;
        this.onRendered();
        this.pushContextToChildren();
    },

    getResultsErrorHandler: function(xhr, textStatus, errorThrown) {
        this.resetXHRStatus();
        if (textStatus == 'abort') {
            this.logger.debug(this.moduleType, '.getResults() aborted');
        } else {
            try {
                this.logger.error(this.moduleType, " error response from server. status=" + xhr.status);
                var messages = JSON.parse(xhr.responseText).messages;
                for (var i=0;i<messages.length;i++) {
                    this.logger.error(messages[i].message);
                }
            } catch(e) {
                this.logger.error(this.moduleType, " exception thrown trying to log an error from the server.");
                this.logger.error(xhr.responseText);
            }
        }
    }, 

    /**
     * called when a module receives new context data from downstream. 
     * This is rare, and only happens in configurations where custom behavior
     * logic is sending values upstream during interactions, for TextField
     * and Pulldown instances to 'catch'. 
     */
     applyContext: function(context) {
        if (!this.isPageLoadComplete()) {
            this.logger.error(this.moduleType + " is not designed to work with the oldschool Search resurrection system.");
        }
        if (this.isPageLoadComplete() && context.has(this.name)) {
            var oldValue = this.getSelection();
            var newValue = context.get(this.name);
            this.setSelection(newValue);
            if (this.getSelection() == newValue) {
                context.remove(this.name);
                this.onPassiveChange();
                if (Sideview.utils.contextIsNull(context)) {
                    this.pushContextToChildren();
                    // stop the upward-travelling context.
                    return true;
                }
            } else {
                this.setSelection(oldValue);
            }
        }
     }
});
