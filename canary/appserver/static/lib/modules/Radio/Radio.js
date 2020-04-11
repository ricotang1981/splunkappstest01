// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.


define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class Radio extends Module {

    constructor(container, params) {
        super(container, params);

        this.name = this.getParam("name");
        this.searchFields = this.getSearchFields();

        this.staticFields = this.getParam('staticRadios') || [];
        // we use this flag to keep track of whether we're still loading data.
        this.inFlight = this.searchFields.length > 0;
        this.hasClearedURLLoader = false;

        this.selectedValueToApply = false;

        if (Sideview.isIE()) {
            this.container.bind("click", this.onChange.bind(this));
        } else {
            this.container.bind("change", this.onChange.bind(this));
        }
        this.changeEventsAreReal = true;

        this.checkConfig();
    }

    getSearchFields() {
        if (this.getParam("valueField")) {
            var obj = {};
            obj.value = this.getParam("valueField");
            if (this.getParam("labelField")) {
                obj.label = this.getParam("labelField");
            }
            return [obj];
        }
        return [];
    }

    /**
     * overall function to check for configuration errors.
     */
    checkConfig() {
        this.checkNameConfig();
        this.checkFieldsConfig();
    }

    /**
     * make sure the 'name' param is OK.
     */
    checkNameConfig() {
        if (this.name=="search") alert(this.moduleType + " Error - you do not want to set " + this.moduleType + "'s 'name' param to a value of 'search' as this will disrupt underlying functionality in Splunk.");
    }

    /**
     * make sure the fields params are OK.
     */
    checkFieldsConfig() {
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
    }

    requiresResults() {
        return (this.searchFields.length>0);
    }

    /**
     * If the configuration refers to a field, and we're triggering a dispatch,
     * we tell the framework to put the field(s) into the requiredFields list
     * on the job before it gets kicked off.
     */
    onBeforeJobDispatched(search) {
        var fieldsStr = this.getParam("requiredFields");
        var fields = [];
        if (fieldsStr || this.searchFields.length>0) {
            var c = this.getContext();
            c.set("name", this.getParam("name"));
            if (fieldsStr) {
                fields = Sideview.replaceTokensFromContext(fieldsStr, c).split(",");
            } else {
                var value = Sideview.replaceTokensFromContext(this.searchFields[0].value, c);
                var label = Sideview.replaceTokensFromContext(this.searchFields[0].label, c);
                fields.push(value);
                if (label && fields.indexOf(label)==-1) {
                    fields.push(label);
                }
            }
        }
        if (fieldsStr || Sideview.mightNeedStatusBuckets(search)) {
            search.setMinimumStatusBuckets(1);
            search.setRequiredFields(fields);
        }
    }

    /**
     * get a dictionary of our search fields. keys are 'label' and 'value'.
     */
    getFields() {
        if (this.searchFields.length>0) {
            var value = this.searchFields[0].value;
            var label = this.searchFields[0].label || value;

            // do a quick token replacement.
            var c = this.getContext();
            c.set("name", this.name);
            value = Sideview.replaceTokensFromContext(value, c);
            label = Sideview.replaceTokensFromContext(label, c);

            return {
                "value" : value,
                "label" : label
            }
        }
        return {};
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
     * tell the URLLoader that we've absorbed their value so they dont keep
     * telling us (and reselecting the value) over and over.
     */
    clearURLLoader(context) {
        context = context || this.getContext();
        // only do this once
        if (!this.hasClearedURLLoader && context.has("sideview.onSelectionSuccess")) {
            var callback = context.get("sideview.onSelectionSuccess");
            callback(this.name, this);
            this.hasClearedURLLoader = true;
        }
    }


    setSelection(val) {

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
    }

    getSelection() {
        return $("input:checked",this.container).val();
    }

    getSelectedLabel() {
        var id = $("input:checked",this.container).attr("id");
        if (id) {
            return $("label[for='"+id+"']", this.container).text();
        }
        return "";
    }

    resetUI() {}

    setToContextValue(c) {
        var value = Sideview.getValueForFormElementSelection(this.name,c);

        if (!value && value!="") return;
        if (this.searchFields.length>0) {
            this.setSelection(value);
            if (this.getSelection() != value) {
                this.selectedValueToApply = value;
            }
        } else {
            this.setSelection(value);
        }
    }

    /**
     * If this returns true, then the Radio module will be allowed to
     * reload its dynamic buttons onContextChange.   Pulled out as its own
     * method mostly so as to allow customBehavior overrides.
     */
    allowReload(context) {
        return this.hasResultsURLChanged();
    }

    /**
     * time to get some search results and render a new set of dynamic
     * radio buttons.
     */
    reloadDynamicRadios(context) {
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
        if (context.getSplunkSearch().isDone()) {
            this.getResults();
        } else {
            this.inFlight = true;
        }
    }

    /**
     * called when a module from upstream changes the context data
     */
    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        Sideview.applyCustomCssClass(this,context);
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
    }

    /**
     * called when a module from downstream requests new context data
     */
    getModifiedContext(context) {
        context = context || this.getContext();

        var value = this.getSelection();
        context.set(this.name + ".rawValue", value);
        var template = this.getParam("template");

        var templatizedValue = Sideview.safeTemplatize(context, template, this.name, value);
        context.set(this.name + ".value", templatizedValue);
        context.set(this.name, templatizedValue);

        context.set(this.name + ".label",this.getSelectedLabel());

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

    onPassiveChange() {
        var context = this.getContext();
        if (context.has("sideview.onEditableStateChange")) {
            var callback = context.get("sideview.onEditableStateChange");
            callback(this.name, this.getSelection(), this);
        }
    }

    /**
     * called when the user changes the checkbox selections.
     */
    onChange(evt) {
        if (this.changeEventsAreReal) {
            /* we have to be a little more circumspect because on IE
               we bind to click events and not to change events */
            if (Sideview.isIE()) {
                var target = evt.target;
                if (target.tagName!="INPUT" && target.tagName!="LABEL") return false;
            }
            if (this.isPageLoadComplete()) {
                this.selectedValueToApply = false;
                this.onPassiveChange();
                this.pushDownstream();
            }
            this.clearURLLoader();
        }
    }

    /**
     * called when the currently running job completes.
     */
    onJobDone() {
        if (this.searchFields.length>0) {
            this.getResults();
        }
    }

    /**
     * template method we expose that is to be called after rendering completes.
     * this greatly simplifies some custom wiring use cases.
     */
    onRendered() {}

    /**
     * Goes and gets new results that we'll turn into our <option> values.
     */
    getResults() {
        this.inFlight = true;
        return this._getResults()
    }


    getSplunkResultParams(context,search) {
        var params = {};

        params["count"] = this.getParam("count");

        var upstreamPostProcess = search.getPostProcess();
        if (this.getParam("postProcess")) {
            // we sneak in our own name so it can be referred to
            // as $name$ in the postProcess param's value
            context.set("name", this.name);
            context.set("postProcess", upstreamPostProcess || "");
            var p = Sideview.replaceTokensFromContext(this.getParam("postProcess"), context);
            params["search"] = p;
        } else if (upstreamPostProcess) {
            params["search"] = upstreamPostProcess;
        }
        params["output_mode"] = "json";

        return params;
    }

    clearDynamicRadios() {
        $("div.dynamic",this.container).remove();
    }

    /**
     * We just use splunkWeb's proxy to splunkd, so the results will come back
     * in JSON format.  This method builds out <input type="radio"> elements
     * from that JSON.
     */
    buildDynamicRadiosFromResults(results) {
        // technically all this does is clear our loading... message.
        // since the radio buttons themselves were cleared when the request
        // was made.
        this.clearDynamicRadios();

        // always returns a 2 element dictionary with 'label' and 'value'.
        var fieldDict = this.getFields();

        for (var i=0,len=results.length;i<len;i++) {
            this.buildRadio(results[i],fieldDict,i);
        };
    }

    buildRadio(row,fieldDict,index) {
        var value = row[fieldDict["value"]];
        var label = row[fieldDict["label"]];
        if (!value && value!="") {
            console.error("ERROR - a " + this.moduleType + " module (" + this.moduleId + ") received a result row that had no value for the value field (" + fieldDict["value"] + ").");
            value="";
            label="(no value found)";
        }
        else if (!label && label!="") {
            console.warn("a " + this.moduleType + " module received a result row that had no value for the label field (" + fieldDict["label"] + ").  Using the value field instead (" + fieldDict["value"] + ").");
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
    }

    /**
     * called each time we render our dynamic checkbox data from the server.
     */
    renderResults(jsonResponse) {
        var context = this.getContext();

        var value = this.selectedValueToApply
             || Sideview.getValueForFormElementSelection(this.name,context);

        this.buildDynamicRadiosFromResults(jsonResponse.results);
        if (value) {
            this.setSelection(value);
            if (this.getSelection() == this.selectedValueToApply || this.getSelection()==value) {
                this.clearURLLoader(context);
                this.selectedValueToApply = false;
            }
        }
        this.inFlight = false;
        this.onRendered();
    }

    /**
     * called when a module receives new context data from downstream.
     * This is rare, and only happens in configurations where custom behavior
     * logic is sending values upstream during interactions, for TextField
     * and Pulldown instances to 'catch'.
     */
     applyContext(context) {
        if (this.isPageLoadComplete() && context.has(this.name)) {
            var oldValue = this.getSelection();
            var newValue = context.get(this.name);
            this.setSelection(newValue);
            if (this.getSelection() == newValue) {
                context.remove(this.name);
                this.onPassiveChange();
                if (context.isNull()) {
                    this.pushDownstream();
                    // stop the upward-travelling context.
                    return true;
                }
            } else {
                this.setSelection(oldValue);
            }
        }
     }
}
    return Radio;
});