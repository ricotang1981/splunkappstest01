// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule",
  "jquery-multiselect"],
  function($, Sideview,Module, multiselect) {



class CheckboxPulldown extends Module {

    constructor(container, params) {
        super(container, params);
        this.name = this.getParam("name");
        this.searchFields = this.getSearchFields();

        this.staticFields = this.getParam("staticOptions") || [];
        this.nullTemplate = this.getParam("nullTemplate");
        // we use this flag to keep track of whether we're still loading data.
        this.inFlight = this.searchFields.length > 0;
        this.hasClearedURLLoader = false;

        this.selectAllOptimization = this.getParam("selectAllOptimization", "False");


        this.select = $('select', this.container)
            .bind("change", this.onChange.bind(this));

        // local properties used if/when we display progress
        this.selectWidth  = 0;
        this.progressBar  = $(".progressTop", this.container);

        this.checkConfig();

        this.optionsAreSelectedByDefault = (this.getParam("selectedByDefault") == "True");
        this.hitWithPrettyStick();

        if (this.optionsAreSelectedByDefault) {
            this.unselectedValues = {};
        } else {
            this.selectedValues = {};
        }
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
     * certain template params are encoded such that '+' signs are interpreted
     * as spaces.  This is to workaround a problem in splunk's view config
     * system whereby leading and trailing spaces get trimmed on module params
     */
    getParam(name) {
        if (name=="outerTemplate" || name=="separator") {
            var orig = this._getParam(name);
            if (!orig) {
                return orig;
            }
            return Sideview.replacePlusSigns(orig);
        }
        return this._getParam(name);
    }

    /**
     * overall function to check for configuration errors.
     */
    checkConfig() {
        this.checkNameConfig();
        this.checkFieldsConfig();
        this.checkMultipleSelectionConfig();
    }

    /**
     * make sure the 'name' param is OK.
     */
    checkNameConfig() {
        if (this.name=="search") {
            alert(this.moduleType + " Error - you do not want to set CheckboxPulldown's 'name' param to a value of 'search' as this will disrupt underlying functionality in Splunk.");
        }
    }

    /**
     * make sure the fields params are OK.
     */
    checkFieldsConfig() {
        try {
            if (this.searchFields.length===0 && this.staticFields.length===0) {
                alert("ERROR - CheckboxPulldown MUST be configured with at least one static option or with a valueField param to pull dynamic results.");
            } else if (this.staticFields.length==1 && this.searchFields.length===0) {
                alert("ERROR - CheckboxPulldown is configured statically but with only a single static option.");
            } else if (this.getParam("hideOnEmpty")=="True" && this.staticFields.length>0) {
                alert("ERROR - hideOnEmpty is set to true, but there are static options listed meaning the hideOnEmpty behavior will never apply");
            } else if (this.searchFields.length===0 && this.getParam("postProcess")) {
                alert("ERROR - CheckboxPulldown is configured with a postProcess param but no search fields. One of these is a mistake.");
            }
        } catch(e) {
            alert("ERROR - unexpected exception during CheckboxPulldown.checkFieldsConfig. Look for typos in the valueField, labelField or staticOptions params .");
            console.error(e);
        }
    }

    checkMultipleSelectionConfig() {
        if (!this.getParam("outerTemplate") || ("" + this.getParam("outerTemplate")).length===0) {
            alert("ERROR - you do not want to set CheckboxPulldown's outerTemplate param to an empty string as this means the CheckboxPulldown will never output any value besides emptystring. ");
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
        var fields = [];
        if (this.searchFields.length>0) {
            var c = this.getContext();
            c.set("name", this.getParam("name"));

            var value = Sideview.replaceTokensFromContext(this.searchFields[0].value, c);
            var label = Sideview.replaceTokensFromContext(this.searchFields[0].label, c);
            fields.push(value);
            if (label && fields.indexOf(label)==-1) {
                fields.push(label);
            }
        }
        if (Sideview.mightNeedStatusBuckets(search)) {
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
        if (val=="*") {
            this.checkAll();
        }
        else {
            this.select.val(val);
            this.select.multiselect('refresh');
        }
    }

    getUnselectedOptions() {
        var opts = {};
        $("option:not(:selected)",this.select).each(function() {
            opts[$(this).attr("value")] = 1;
        });
        return opts;
    }

    getSelectedOptions() {
        var opts = {};
        $("option:selected",this.select).each(function() {
            opts[$(this).attr("value")] = 1;
        });
        return opts;
    }

    getUnselectedOptionsArray() {
        var dict = this.getUnselectedOptions();
        var arr = [];
        for (var key in dict) {
            if (dict.hasOwnProperty(key)) {
                arr.push(key);
            }
        }
        return arr;
    }

    getSelectedOptionsArray() {
        return $.extend([], this.select.val());
    }

    rememberSelectionStates() {
        if (this.optionsAreSelectedByDefault) {
            //we remember which ones the user has deselected here.
            // and we respect that if these options ever come back later.
            $.extend(this.unselectedValues,this.getUnselectedOptions());

            var selectedOptionsArray = this.getSelectedOptionsArray();

            for (var i=0;i<selectedOptionsArray.length;i++) {
                var value = selectedOptionsArray[i];
                if (this.unselectedValues.hasOwnProperty(value)) {
                    delete this.unselectedValues[value];
                }
            }
        } else {
            // remember which ones the user has selected
            $.extend(this.selectedValues,this.getSelectedOptions());
            var unselectedOptionsArray = this.getUnselectedOptionsArray();
            for (var i=0;i<unselectedOptionsArray.length;i++) {
                var value = unselectedOptionsArray[i];
                if (this.selectedValues.hasOwnProperty(value)) {
                    delete this.selectedValues[value];
                }
            }
        }
    }

    // Q1 - do we need an analogous behavior if optionsAreSelectedByDefault==false?
    // Q2 - why isn't this called within setSelection itself.
    forgetSomeUnselectedOptions(opts) {
        if (this.optionsAreSelectedByDefault) {
            var val;
            for (var i=0,len=opts.length;i<len;i++) {
                val = opts[i];
                if (this.unselectedValues.hasOwnProperty(val)) {
                    delete this.unselectedValues[val];
                }
            }
        }
    }

    resetUI() {}

    wasAnythingMarkedSelectedOnPageLoad() {
        var oneOrMoreStaticFieldsWerePreselected = false;
        for (var i=0;i<this.staticFields.length;i++) {
            var field = this.staticFields[i];
            if (field.selected=="True") {
                return true;
            }
        }
        return false;
    }

    setToContextValue(c) {
        var value = Sideview.getValueForFormElementSelection(this.name,c);
        if (this.selectAllOptimization=="omit" && (!value || value.length==0) && !this.wasAnythingMarkedSelectedOnPageLoad()) {
            value = "*";
        }
        if (!value && value!="") return;
        this.forgetSomeUnselectedOptions(value);
        this.setSelection(value);
    }

    /**
     * If this returns true, then the CheckboxPulldown will be allowed to reload its
     * dynamic options onContextChange.   Pulled out as its own method so that
     * it can be easily overridden by customBehavior.
     */
    allowReload(context) {
        return this.hasResultsURLChanged();
    }

    reloadDynamicOptions(context) {
        this.rememberSelectionStates();

        // clear all the old dynamic options.
        this.clearDynamicOptions();

        // add in our 'Loading...' text.
        var loadingOption = $("<option>")
            .addClass("dynamic")
            .text(_("Loading..."))
            .attr("value","")

        this.select.append(loadingOption);

        this.selectWidth = this.getSelectWidth();

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
            this.reloadDynamicOptions(context);
            this._previousResultURL = this.getResultURL({}, context);
        }
        // purely static configuration, or dynamic config that doesn't need
        // to be reloaded.
        else {
            this.setToContextValue(context);
            this.clearURLLoader(context);
        }
        // if the label param contains $foo$ tokens we rewrite the label accordingly
        if (this.getParam("label") && this.getParam("label").indexOf("$")!=-1) {
            context.set("name", this.getParam("name"));
            var labelTemplate = this.getParam("label");
            $("label", this.container).text(Sideview.replaceTokensFromContext(labelTemplate, context));
        }
    }

    /**
     * Given all the template, size, separator, outerTemplate params we might
     * be dealing with, what is the final string value to send downstream.
     */
    getStringValue(context) {
        var template = this.getParam("template");
        var values = this.select.val() || [];
        var templatizedValues = [];
        var templatizedValue;
        for (var i=0,len=values.length;i<len;i++) {
            if (!values[i] || values[i] == "") {
                if (this.nullTemplate) {
                    templatizedValue = Sideview.safeTemplatize(context, this.nullTemplate, this.name, "*");
                }
                else {
                    continue;
                }
            }
            else {
                templatizedValue = Sideview.safeTemplatize(context, template, this.name, values[i]);
            }
            templatizedValues.push(templatizedValue);
        }
        var separator = this.getParam("separator") || "";
        var gluedValue = templatizedValues.join(separator);
        var outerTemplate = this.getParam("outerTemplate");
        // we do not escape slashes in the outer template. It's not input
        // from the user. And to the extent that other $foo$ tokens will
        // be in here, they will have been backslashed upstream.
        return Sideview.templatize(context, outerTemplate, this.name, gluedValue);

    }

    getLabels() {
        var labels = []
        $('option:selected', this.select).each(function() {
            labels.push($(this).text());
        });
        return labels.join(", ")
    }

    /**
     * called when a module from downstream requests new context data
     */
    getModifiedContext(context) {
        context = context || this.getContext();

        context.set(this.name + ".label", this.getLabels());
        context.set(this.name + ".element", Sideview.makeUnclonable(this.select));

        var selectedOptions = this.select.val() || [];
        context.set(this.name + ".selectedCount", selectedOptions.length);

        var rawValue=this.select.val();
        var value = this.getStringValue(context);

        if (this.selectAllOptimization!="False") {

            var allOptions = this.select.children('option') || [];
            if (allOptions.length>0 && selectedOptions.length == allOptions.length) {
                if (this.selectAllOptimization=="omit") {
                    // we have to explicitly null it out because URLLoader
                    // may be supplying another copy upstream..
                    value = "";
                    rawValue = "";
                }
                else if (this.selectAllOptimization=="*") {
                    value = Sideview.safeTemplatize(context, this.getParam("template"), this.name, "*");
                    rawValue = "";
                }
            }
        }
        context.set(this.name + ".value", value);
        context.set(this.name, value);
        // NOTE we do not backslash escape rawValue, because we assume it is NOT
        // destined for searches.  rawValue is for QS args and for labels.
        context.set(this.name + ".rawValue", rawValue);

        return context;
    }

    /**
     * called when we have to send new context data to downstream modules.
     */
    pushDownstream(pageIsLoading) {
        var val = this.select.val() || [];
        this._lastValue=val.join("-x-");
        /* see notes in Checkbox.js */
        this.withEachDescendant(function(module) {
            module.dispatchAlreadyInProgress = false;
        });
        return this._pushDownstream(pageIsLoading);
    }

    onPassiveChange() {
        var context = this.getContext();
        this.rememberSelectionStates();
        if (! this.ignoringSelectionChanges && context.has("sideview.onEditableStateChange")) {
            var callback = context.get("sideview.onEditableStateChange");
            callback(this.name, this.select.val(), this);
        }
    }

    /**
     * empty template method to make CustomBehavior use cases easier.
     */
    customOnChange(evt) {}

    /**
     * called when the user changes the CheckboxPulldown's selected value.
     */
    onChange(evt) {
        this.customOnChange(evt);

        if (this.isPageLoadComplete()) {
            this.onPassiveChange();
        }
        this.clearURLLoader();
    }

    /*********************************
     * Methods about showing job progress
     *********************************/
    getSelectWidth() {
        var w = this.select.width();
        w += parseInt(this.select.css("padding-left"));
        w += parseInt(this.select.css("padding-right"));
        return w;
    }

    renderProgress(p) {
        if (this.selectWidth<=7) {
            this.selectWidth = this.getSelectWidth();
        }
        this.progressBar.width(p * this.selectWidth);
        var offset = $("button.ui-multiselect",this.container).offset();
        this.progressBar.offset(offset);
    }

    onJobProgress() {
        if (this.searchFields.length>0) {
            this.progressBar.show();
            var search = this.getContext().getSplunkSearch();
            this.renderProgress(search.getDoneProgress());
        }
    }

    /**
     * called when the currently running job completes.
     */
    onJobDone() {
        if (this.searchFields.length>0) {
            this.getResults();
        }
        $(".progressTop", this.container).hide();
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
        var params = {
            count: this.getParam("count"),
            output_mode: "json"
        };
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
        return params;
    }

    clearDynamicOptions() {
        this.select.find("option[class=dynamic]").remove();
    }

    /**
     * We just use splunkWeb's proxy to splunkd, so the results will come back
     * in JSON format.  This method builds out <option> elements from that JSON.
     */
    buildOptionListFromResults(jsonResults) {
        // always returns a 2 element dictionary with 'label' and 'value'.
        var fieldDict = this.getFields();
        var row, value, label;
        for (var i=0,len=jsonResults.length;i<len;i++) {
            row = jsonResults[i];
            value = row[fieldDict["value"]];
            label = row[fieldDict["label"]];
            if (!value && value!="") {
                if (label && !this.nullTemplate) {
                    label="(ERROR - null-valued option found, but required nullTemplate param is missing.)";
                } else {
                    console.error("ERROR - a CheckboxPulldown (" + this.moduleId + ") received a result row that had no value for the value field (" + fieldDict["value"] + ").");
                    value="";
                    label="(no value found)";
                }
            }
            else if (!label && label!="") {
                //console.debug("CheckboxPulldown received a result row that had no value for the label field (" + fieldDict["label"] + ").  Using the value field instead (" + fieldDict["value"] + ").");
                label = value;
            }
            var opt = $("<option>")
                .addClass("dynamic")
                .text(label)
                .attr("value",value);

            if (this.optionsAreSelectedByDefault) {
                if (!this.unselectedValues.hasOwnProperty(value)) {
                    opt.attr("selected","selected");
                }
            }
            else {
                if (this.selectedValues.hasOwnProperty(value)) {
                    opt.attr("selected","selected");
                }
            }
            this.select.append(opt);
        };
        this.selectWidth = this.getSelectWidth();
    }

    getMultipleSelectArgs() {
        var args = {}
        args.multiple = true;
        args.header = ['checkAll', 'uncheckAll'];

        // TODO TODO - it is no longer clear whether the following TODO still applies, as we just
        // jumped many many major releases into the future for jquery.multiselect.
        // TODO - we have modified jquery.multiselect.js to ONLY apply this minWidth to the menu and not the button. next we want to pass the actual width of the widest menu ITEM as the minWidth.
        args.minWidth = 350;
        args.menuHeight = "450px"
        args.selectedText = this.getSelectedTextLabel;
        args.close = function() {
            var val = this.select.val() || [];
            val = val.join("-x-");
            if (!this._lastValue || val!=this._lastValue) {
                this.pushDownstream();
            }
        }.bind(this);
        return args;
    }

    getSelectedTextLabel(checked,total,options) {
        if (checked==1) {
            var label = $(options[0]["labels"][0]);
            return label.text();
        }
        else if (total==0) {
            return _("no options found");
        }
        //else if (checked==total && total==2) {
        //    return _("both selected");
        //}
        else if (checked==total) {
            return sprintf(_("all %d selected"), total);
        }
        else {
            return sprintf(_("%d of %d selected"), checked,total);
        }
    }

    hitWithPrettyStick() {
        this.select.multiselect(this.getMultipleSelectArgs());
        if (this.optionsAreSelectedByDefault) {
            // purely static CheckboxPulldowns with no
            // <param name="selected">True</param> should select all by default
            var s = this.select.val() || []
            if (this.searchFields.length==0 && s.length==0) {
                this.checkAll();
            }
        }
    }

    checkAll() {
        this.ignoringSelectionChanges = true;
        this.select.multiselect("checkAll");
        this.ignoringSelectionChanges = false;
    }

    /**
     * called each time we render our CheckboxPulldown data from the server.
     */
    renderResults(jsonResponse) {
        var context = this.getContext();

        // clear the old dynamic options again. In practice this just clears
        // out the 'Loading...' option because the others are already gone.
        this.clearDynamicOptions();

        var runSelectWidthPatchForIE = (Sideview.isIE() && !this.getParam("width"));
        if (runSelectWidthPatchForIE) {
            this.select.css("width", "auto");
        }
        this.buildOptionListFromResults(jsonResponse.results);

        var value = Sideview.getValueForFormElementSelection(this.name,context);

        if (value) {
            this.forgetSomeUnselectedOptions(value)
            this.clearURLLoader(context);
            this.setSelection(value);
        } else {
            this.select.multiselect('refresh');
        }

        this.inFlight = false;
        if (runSelectWidthPatchForIE) {
            this.select.width(this.select.width()+10);
        }
        this.onRendered();
        if (this.getParam("hideOnEmpty")=="True") {
            if ($("option", this.container).length==0) {
                this.hide("hideOnEmpty");
            }
            else {
                this.show("hideOnEmpty");
            }
        }
    }

    /**
     * called when a module receives new context data from downstream.
     * This is rare, and only happens in configurations where custom behavior
     * logic is sending values upstream during interactions, for TextField
     * and CheckboxPulldown instances to 'catch'.
     */
    applyContext(context) {
        if (this.isPageLoadComplete() && context.has(this.name)) {
            this.setToContextValue(context);
            var newValue = context.get(this.name);
            this.select.val(newValue);
            if (this.select.val() == newValue) {
                context.remove(this.name);
                this.onPassiveChange();

                if (Sideview.contextIsNull(context)) {
                    this.pushDownstream();
                    // stop the upward-travelling context.
                    return true;
                }
            } else {
                this.select.val(oldValue);
            }
        }
     }
};
    return CheckboxPulldown;
});