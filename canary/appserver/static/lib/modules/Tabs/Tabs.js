// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.

define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class Tabs extends Module {

    constructor(container, params) {
        super(container, params);
        this.name = this.getParam("name");
        this.searchFields = this.getSearchFields();
        this.staticFields = this.getStaticFields();
        // we use this flag to keep track of whether we're still loading data.
        this.inFlight = this.searchFields.length > 0;
        this.hasClearedURLLoader = false;
        this.selectedValueToApply = false;
        this.ul = $('ul', this.container)
            .bind("click", this.onClick.bind(this));
        this.initialSelection = $('ul li.selected', this.container);
        this.checkConfig();
        this.checkForSpecialAlignment();
    }

    checkForSpecialAlignment() {
        var parent = this.container.parent();
        var grandparent = parent.parent();
        var isInDashboardPanel = grandparent.hasClass("flexItem");

        var isFirstChildOfPanel = (parent.children(".Module:first")[0].getAttribute("id")==this.moduleId);
        if (isInDashboardPanel && isFirstChildOfPanel) {
            this.container.addClass("firstModuleInDashboardPanel");
            grandparent.addClass("firstChildIsTabsModule");
        }
    }

    requiresResults() {
        return (this.searchFields.length>0);
    }

    getStaticFields() {
        return this.getParam('staticTabs') || [];
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
        if (this.name=="search") alert(this.moduleType + " Error - you do not want to set a Tabs module's 'name' param to a value of 'search' as this will disrupt underlying functionality in Splunk.");
    }

    /**
     * make sure the fields params are OK.
     */
    checkFieldsConfig() {
        try {
            if (this.searchFields.length==0 && this.staticFields.length ==0) {
                alert("ERROR - Tabs MUST be configured with at least one static or dynamic value.");
            } else if (this.staticFields.length==1 && this.searchFields.length==0) {
                alert("ERROR - Tabs is configured statically but with only a single static option.");
            } else if (this.searchFields.length==0 && this.getParam("postProcess")) {
                alert("ERROR - Tabs is configured with a postProcess param but no search fields. One of these is a mistake.");
            }
        } catch(e) {
            alert("ERROR - unexpected exception during Tabs.checkFieldsConfig. Look for typos in the valueField, labelField or staticTabs params.");
            console.error(e);
        }
    }

    /**
     * if the module is configured dynamically then we have to trigger
     * a new dispatched search.
     */
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
        var newTab= $('li', this.ul).filter(function(i) {
            return ($(this).attr("s:value") == val);
        });

        if (newTab.length>0) {
            $("li.selected", this.ul).removeClass("selected");
            newTab.addClass("selected");
        }
    }

    getSelection(context) {
        context = context || this.getContext();
        var selected = $("li.selected",this.ul);
        var value    = selected.attr("s:value") || "";
        if (!selected.hasClass("dynamic")) {
            return Sideview.replaceTokensFromContext(value, context);
        }
        return value;
    }

    resetToDefault() {
        this.setSelection(this.initialSelection);
    }

    resetUI() {}

    setToContextValue(context) {
        var value = context.get(this.name + ".rawValue") || context.get(this.name);
        if (!value && value!="") return;
        this.setSelection(value);
        if (this.searchFields.length>0 && this.getSelection(context) != value) {
            this.selectedValueToApply = value;
        }
    }

    reloadDynamicTabs(context) {
        var selectedTab = $('li.selected', this.ul);
        // if a valid dynamic value is selected, we preserve the selection
        var makeLoadingTabSelected = $("li",this.ul).length - $("li.dynamic",this.ul).length==0;
        if (selectedTab.attr("s:value") && selectedTab.hasClass("dynamic")) {
            makeLoadingTabSelected = true;
            this.selectedValueToApply = selectedTab.attr("s:value");
        }
        // if a valid static value was selected it's ok; it'll remain
        // selected in the DOM until renderResults and survive that too.

        // clear all the old dynamic tabs.
        this.ul.find("li.dynamic").remove();

        // add in our 'Loading...' text.
        var loadingLi = $("<li>")
            .addClass("dynamic")
            .attr("s:value","")
            .append($("<a>")
                .text(_("Loading..."))
            );
        if (makeLoadingTabSelected) {
            loadingLi.addClass("selected");
        }
        this.ul.append(loadingLi);

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
        // handles purely dynamic config as well as the mixed case.
        if (this.searchFields.length>0) {
            this.reloadDynamicTabs(context);
        }
        // purely static configuration.
        else {
            this.setToContextValue(context);
            this.clearURLLoader(context);
        }
        Sideview.applyCustomCssClass(this,context);
    }


    /**
     * Given all the template, size, separator, outerTemplate params we might
     * be dealing with, what is the final string value to send downstream.
     */
    getStringValue(context) {
        var template = this.getParam("template");

        var value = this.getSelection();
        // input from the user always gets backslash-escaped
        // when we assume it's destined for searches

        return Sideview.safeTemplatize(context, template, this.name, value);
    }

    /**
     * called when a module from downstream requests new context data
     */
    getModifiedContext(context) {
        context = context || this.getContext();

        context.set(this.name + ".label", $('li.selected', this.ul).text());
        context.set(this.name + ".element", Sideview.makeUnclonable(this.ul));
        // we do not backslash escape rawValue, because we assume it is NOT
        // destined for searches.  rawValue is for QS args and for labels.
        context.set(this.name + ".rawValue", this.getSelection());

        var value = this.getStringValue(context);
        context.set(this.name + ".value", value);
        context.set(this.name, value);

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
            callback(this.name, this.getSelection(context), this);
        }
    }

    /**
     * called when the user clicks a tab.
     */
    onClick(evt) {
        var newTab = $(evt.target)
        if (newTab.parent().is('li')) newTab = newTab.parent();
        if (!newTab.is("li")) return false;

        $("li.selected",this.ul).removeClass("selected");
        newTab.addClass("selected");
        if (this.isPageLoadComplete()) {
            this.onPassiveChange();
            this.pushDownstream();
        }
        this.clearURLLoader();
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
    onRendered() {

    }

    /**
     * Goes and gets new results that we'll turn into our tab <li> values.
     */
    getResults() {
        this.inFlight = true;
        return this._getResults()
    }

    getSplunkResultParams(context, search) {
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

    /**
     * We just use splunkWeb's proxy to splunkd, so the results will come back
     * in XML format.  This method builds out <li> elements from that XML.
     */
    buildDynamicTabsFromResults(results, valueToBeSelected) {

        // always returns a 2 element dictionary with 'label' and 'value'.
        var fieldDict = this.getFields();

        var row, value, label, li;
        for (var i=0,len=results.length;i<len;i++) {
            row = results[i];
            value = row[fieldDict["value"]];
            label = row[fieldDict["label"]];

            if (!valueToBeSelected && i==0) {
                valueToBeSelected = value;
            }

            if (!value && value!="") {
                console.error("ERROR - a Tabs module (" + this.moduleId + ") received a result row that had no value for the value field (" + fieldDict["value"] + ").");
                value="";
                label="(no value found)";
            }
            else if (!label && label!="") {
                console.warn("Tabs module received a result row that had no value for the label field (" + fieldDict["label"] + ").  Using the value field instead (" + fieldDict["value"] + ").");
                label = value;
            }
            li = $("<li>")
                .addClass("dynamic")
                .attr("s:value",value)
                .append($("<a>")
                    .text(label)
                )
            if (valueToBeSelected && (value==valueToBeSelected)) {
                this.clearURLLoader(this.getContext());
                this.selectedValueToApply = false;
                li.addClass("selected");
            }
            this.ul.append(li);
        };
    }

    /**
     * called each time we render new dynamic tabs using data from the server.
     */
    renderResults(jsonResponse) {
        var context = this.getContext();

        // remember which value was selected before.
        var valueToBeSelected = this.selectedValueToApply
            || this.getSelection(context)
            || context.get(this.name);


        // clear the old dynamic tabs again. Although in practice this just
        // clears out the 'Loading...' option because the others will already
        // have been cleared during getResults.
        this.ul.find("li.dynamic").remove();

        this.buildDynamicTabsFromResults(jsonResponse.results, valueToBeSelected);

        this.inFlight = false;
        this.onRendered();

        this.ul.append($("<li>").addClass("clearer").addClass("dynamic"));
    }

    /**
     * called when a module receives new context data from downstream.
     * This is rare, and only happens in configurations where custom behavior
     * logic is sending values upstream during interactions, for module
     * instances to 'catch'.
     */
     applyContext(context) {
        var context = this.getContext();
        if (this.isPageLoadComplete() && context.has(this.name)) {
            var oldValue = this.getSelection(context);
            var newValue = context.get(this.name);
            this.setSelection(newValue);
            if (this.getSelection(context) == newValue) {
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
    return Tabs

});