// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.Checkboxes= $.klass(Sideview.utils.getBaseClass(true), {

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        this.name = this.getParam("name");
        this.searchFields = this.getSearchFields();
        
        this.staticFields = this.getParam('staticCheckboxes') || [];
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
     * certain template params are encoded such that '+' signs are interpreted
     * as spaces.  This is to workaround a problem in splunk's view config 
     * system whereby leading and trailing spaces get trimmed on module params
     */
    getParam: function($super, name) {
        if (name=="outerTemplate" || name=="separator") {
            var orig = $super(name);
            if (!orig) return orig;
            return Sideview.utils.replacePlusSigns(orig);
        }
        return $super(name);
    },

    /**
     * overall function to check for configuration errors.
     */
    checkConfig: function() {
        this.checkNameConfig();
        this.checkFieldsConfig();
        this.checkMultipleSelectionConfig();
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
                alert("ERROR - a Checkboxes module MUST be configured with at least one static checkbox or a dynamic config to render checkboxes from search results.");
            } else if (this.searchFields.length==0 && this.getParam("postProcess")) {
                alert("ERROR - a Checkboxes module is configured with a postProcess param but no search fields. One of these is a mistake.");
            }
        } catch(e) {
            alert("ERROR - unexpected exception during Checkboxes.checkFieldsConfig. Look for typos in the valueField, labelField or staticCheckboxes params.");
            console.error(e);
        }
    },

    /**
     *
     */
    checkMultipleSelectionConfig: function() {
        if (!this.getParam("outerTemplate") || ("" + this.getParam("outerTemplate")).length==0) {
            alert("ERROR - you do not want to set the Checkboxes module outerTemplate param to an empty string as this means the module will never output any value besides emptystring. ");
        }
    },

    requiresResults: function() {
        return (this.searchFields.length>0);
    },

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
        var selectAll = (val=="*");
        if (!$.isArray(val)) {
            var valStr = val;
            val = [];
            val.push(valStr);
        }
        
        this.changeEventsAreReal = false;
        $("input",this.container).each(function() {
            var input = $(this);
            // if this checkbox's value att is in the array.
            if (selectAll || val.indexOf(input.attr("value"))!=-1) {
                input.attr("checked", "checked");
            } else {
                input.removeAttr("checked");
            }
        });
        this.changeEventsAreReal = true;
    },

    getSelection: function() {
        var selectedArray = [];
        var c;
        $("input",this.container).each(function() {
            c = $(this);
            if (c.is(":checked")) {
                selectedArray.push(c.attr("value"));
            }
        })
        return selectedArray;
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
     * If this returns true, then the Checkboxes module will be allowed to 
     * reload its dynamic checkoxes onContextChange.   Pulled out as its own 
     * method mostly so as to allow customBehavior overrides.
     */
    allowReload: function(context) {
        return (!this._previousResultURL || this._previousResultURL != this.getResultURL({})); 
    },
    
    /**
     * time to get some search results and render a new set of dynamic 
     * checkboxes. 
     */
    reloadDynamicCheckboxes: function(context) {
        var selectedCheckboxes = $('input:checked', this.container);
        // if a valid dynamic value is selected, we preserve the selection
        if (selectedCheckboxes.filter(".dynamic").length>0) {
            this.selectedValueToApply = this.getSelection();
        }
        // if a valid *static* value was selected it's ok; it'll remain
        // selected in the DOM until renderResults and survive that too.

        // clear all the old dynamic ones.
        this.clearDynamicCheckboxes();
        
        // add in our 'Loading...' text.
        this.container.append(
            $("<div>")
                .addClass("checkboxWrapper")
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
            this.reloadDynamicCheckboxes(context);
            this._previousResultURL = this.getResultURL({});
        } 
        // purely static configuration, or dynamic config that doesn't need 
        // to be reloaded.
        else {
            this.setToContextValue(context);
            this.clearURLLoader(context);
        }
    },

    

    /**
     * Given all the template, size, separator, outerTemplate params we might 
     * be dealing with, what is the final string value to send downstream.
     */
    getStringValue: function(context) {
        var template = this.getParam("template");
        
        var values = this.getSelection();
        var templatizedValues = [];
        var value, templatizedValue;
        for (var i=0,len=values.length;i<len;i++) {
            templatizedValue = Sideview.utils.safeTemplatize(context, template, this.name, values[i]);
            templatizedValues.push(templatizedValue);
        }
        var separator = this.getParam("separator") || "";
        var gluedValue = templatizedValues.join(separator);
        var outerTemplate = this.getParam("outerTemplate");
        // we do not escape slashes in the outer template. It's not input 
        // from the user. And to the extent that other $foo$ tokens will
        // be in here, they will have been backslashed upstream.
        return Sideview.utils.templatize(context, outerTemplate, this.name, gluedValue);
    },

    getLabels: function() {
        var labels = []
        $("input",this.container).each(function() {
            c = $(this);
            if (c.is(":checked")) {
                var id = c.attr("id")
                labels.push($("label[for=" + id + "]", this.container).text());
            }
        })
        return labels.join(", ")
    },

    /**
     * called when a module from downstream requests new context data
     */
    getModifiedContext: function(context) {
        var context = context || this.getContext();
        
        context.set(this.name + ".rawValue", this.getSelection());

        var value = this.getStringValue(context);
        context.set(this.name + ".value", value);
        context.set(this.name + ".label", this.getLabels());
        context.set(this.name, value);

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
        if (!this.changeEventsAreReal) return false;
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

    clearDynamicCheckboxes: function() {
        $("div.dynamic",this.container).remove();
    },

    /**
     * We just use splunkWeb's proxy to splunkd, so the results will come back 
     * in JSON format.  This method builds out <input type="checkbox"> 
     * elements from that JSON.
     */
    buildDynamicCheckboxesFromResults: function(jsonStr) {
        // technically all this does is clear our loading... message.
        // since the checkboxes themselves were cleared when the request was 
        // made.
        this.clearDynamicCheckboxes();
        
        if (!jsonStr) {
            this.logger.warn("empty string returned in " + this.moduleType + ".renderResults ("+this.name+")");
            this.logger.debug(jsonStr);
            return;
        }
        // always returns a 2 element dictionary with 'label' and 'value'.
        var fieldDict = this.getFields();

        var results = Sideview.utils.getResultsFromJSON(jsonStr);
        
        for (var i=0,len=results.length;i<len;i++) {
            this.buildCheckbox(results[i],fieldDict,i);
        };
    },
    
    buildCheckbox: function(row,fieldDict,index) { 
        var value = row[fieldDict["value"]];
        var label = row[fieldDict["label"]];
        if (!value && value!="") {
            this.logger.error("ERROR - a Checkboxes module (" + this.moduleId + ") received a result row that had no value for the value field (" + fieldDict["value"] + ").");
            value="";
            label="(no value found)";
        }
        else if (!label && label!="") {
            this.logger.warn("a Checkboxes module received a result row that had no value for the label field (" + fieldDict["label"] + ").  Using the value field instead (" + fieldDict["value"] + ").");
            label = value;
        }
        var id = this.moduleId + "_dynamic_" + index;
        this.container.append($("<div>")
            .addClass("checkboxWrapper")
            .addClass("dynamic")
            .append($("<input>")
                .addClass("dynamic")
                .attr("type","checkbox")
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

        //probably unnecessary so I'm commenting it out.
        //this.clearDynamicCheckboxes();

        this.buildDynamicCheckboxesFromResults(jsonStr);
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
