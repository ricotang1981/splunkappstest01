// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview, Module) {

class Pulldown extends Module {

    constructor(container, params) {
        super(container, params);
        this.name = this.getParam("name");
        this.allowsMultiple = (parseInt(this.getParam("size")) > 1);
        this.searchFields = this.getSearchFields();

        this.staticFields = this.getParam('staticOptions') || this.getParam('staticFieldsToDisplay') || this.getDefaultStaticFields();
        // we use this flag to keep track of whether we're still loading data.
        this.inFlight = this.searchFields.length > 0;
        this.hasClearedURLLoader = false;

        this.selectedValueToApply = false;

        this.select = $('select', this.container)
            .bind("change", this.onChange.bind(this));

        this.initialSelection = this.select.val();

        // local properties used if/when we display progress
        this.selectWidth  = 0;
        this.progressBar  = $(".progressTop", this.container);

        this.checkConfig();
    }

    requiresResults() {return true;}

    getSearchFields() {
        if (this.getParam("valueField")) {
            var obj = {};
            obj.value = this.getParam("valueField");
            if (this.getParam("labelField")) {
                obj.label = this.getParam("labelField");
            }
            return [obj];
        }
        else {
            return this.getParam('searchFieldsToDisplay') || [];
        }
    }

    /**
     * certain template params are encoded such that '+' signs are interpreted
     * as spaces.  This is to workaround a problem in splunk's view config
     * system whereby leading and trailing spaces get trimmed on module params
     */
    getParam(name) {
        var orig = this._getParam(name);
        if (name=="outerTemplate" || name=="separator") {
            if (!orig) return orig;
            orig = Sideview.replacePlusSigns(orig);
        }
        return orig;
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
        if (this.name=="search") alert(this.moduleType + " Error - you do not want to set Pulldown's 'name' param to a value of 'search' as this will disrupt underlying functionality in Splunk.");
    }

    /**
     * make sure the fields params are OK.
     */
    checkFieldsConfig() {
        var name = this.getParam("name") || "";
        try {
            if (this.getParam("staticFieldsToDisplay") && this.getParam("staticOptions")) {
                alert("ERROR - you can set the old 'staticFieldsToDisplay' param, OR the new 'staticOptions' param, but not both as you have done in the " + name + " Pulldown.");
            }
            if (this.getParam("searchFieldsToDisplay") && (this.getParam("valueField") || this.getParam("labelField"))) {
                alert("ERROR - Pulldown can be configured with valueField param (and optional labelField),   OR it can be configured with the old 'searchFieldsToDisplay' param, but you cannot set both the new keys like 'valueField' and the old key 'searchFieldsToDisplay' as you have done in the " + name + " Pulldown here.");
            }
            if (this.searchFields.length==0 && this.staticFields.length ==0) {
                alert("ERROR - " + name + "Pulldown MUST be configured with at least one static or dynamic value.");
            } else if (this.staticFields.length==1 && this.searchFields.length==0) {
                alert("ERROR - " + name + "Pulldown is configured statically but with only a single static option.");
            } else if (this.searchFields.length==0 && this.getParam("postProcess")) {
                alert("ERROR - " + name + "Pulldown is configured with a postProcess param but no search fields. One of these is a mistake.");
            }
        } catch(e) {
            alert("ERROR - unexpected exception during Pulldown.checkFieldsConfig in the " + name + " Pulldown. Look for typos in the valueField, labelField or staticOptions params (or the legacy searchFieldsToDisplay or staticFieldsToDisplay params).");
            console.error(e);
        }
    }

    /**
     * Certain params only take effect if size>1.  Make sure they're not set
     * otherwise.
     */
    checkMultipleSelectionConfig() {
        if (this.allowsMultiple) {
            var p = ["outerTemplate", "separator"];
            for (var i=0,len=p.length;i<p;i++) {
                if (this.getParam(p[i])) {
                    alert("ERROR - in the Pulldown module, the " + p[i] + " param is only applicable when size is set to 2 or greater.  Since size is currently set to " + this.getParam("size") + ", you should omit this parameter.")
                }
            }
            if (!this.getParam("outerTemplate") || ("" + this.getParam("outerTemplate")).length==0) {
                alert("ERROR - you do not want to set Pulldown's outerTemplate param to an empty string as this means the Pulldown will never output any value besides emptystring. ");
            }
        }
    }


    /**
     * if the module is configured dynamically then we need to access search
     * results.
     */
    requiresResults(c) {
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
     * pulled out as a template method partly so that it can be easily
     * overridden if necessary in custom config.
     */
    getDefaultStaticFields() {
        return [{label:"All", value:"*"}];
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
        if (val==null || val == "") {
            if ($("option:first", this.select).val()=="") {
                this.select[0].selectedIndex=0;
            }
        } else {
            this.select.val(val);
        }


// hard case:  if it's null value, AND
// 1 we have exactly one null valued option AND
// 2 it's the very first option AND
// 3 nothing is currently selected.
//  then we can select the null option.  if any of 1,2 or 3 fail, then do nothing.
// WHY IT DIDNT WORK:
// SVU Report view - set it to "average bytes" or something, and then hit the
// upstream submit -- average resets to 'count of events'.   the
// this.selectedValueToApply check is not sufficient to avoid cases where
// a recently cleared dynamic selection needs to be remembered when the new
// options are rendered.
/*
        var nullOptions = $('option[value=""]',this.select);
        if (val =="" || val==null) {
            if(!this.selectedValueToApply && this.select.val()==null && nullOptions.length==1 && $("option:first",this.select).val()=="" ) {
                nullOptions.attr("selected","selected");
            }
        }
        else this.select.val(val);
*/
    }

    resetToDefault() {
        this.setSelection(this.initialSelection);
    }

    resetUI() {}

    processDirectives(directives) {
        for (var i=0; i<directives.length; i++) {
            var d = directives[i];
            if (d.startsWith("disable=")) {
                var option = d.replace("disable=","");
                var selector = sprintf('option[value="%s"]',option);
                $(selector, this.select).attr("disabled","disabled");
            }
            else if (d.startsWith("enable=")) {
                var option = d.replace("enable=","");
                var selector = sprintf('option[value="%s"]',option);
                $(selector, this.select).removeAttr("disabled");
            }
            else if (d == "hide") {
                this.hide("someone upstream sent us a directive!")
            }
            else if (d == "show") {
                this.show("someone upstream sent us a directive!")
            }
            else {
                var message = sprintf("configuration error - %s module received a diretive that wasn't either enable/disable/show or hide", this.moduleId);
                Sideview.broadcastMessage("error", message);
            }
        }
    }

    setToContextValue(c) {
        var directive = c.get(this.name + ".directive");
        if (directive) {
            this.processDirectives(directive.split(";"));
        }
        var value = Sideview.getValueForFormElementSelection(this.name,c);
        if (!value && value!="") return;
        if (this.searchFields.length>0) {
            this.select.val(value);
            if (this.select.val() != value) {
                this.selectedValueToApply = value;
            }
        } else {
            this.setSelection(value);
        }
    }

    /**
     * If this returns true, then the Pulldown will be allowed to reload its
     * dynamic options onContextChange.   Pulled out as its own method so that
     * it can be easily overridden by customBehavior.
     */
    allowReload(context) {
        return this.hasResultsURLChanged();
    }

    reloadDynamicOptions(context) {
        // go get the fresh data.
        this.inFlight = true;

        var selectedOptions= $('option:selected', this.select);
        // if any valid dynamic values are selected, we preserve the selection
        if (selectedOptions.filter(".dynamic").length>0) {
            this.selectedValueToApply = this.select.val();
        }
        // if a valid static value was selected it's ok; it'll remain
        // selected in the DOM until renderResults and survive that too.

        // clear all the old dynamic options.
        this.clearDynamicOptions();

        // add in our 'Loading...' text.
        var loadingOption = $("<option>")
            .addClass("dynamic")
            .text(_("Loading..."))
            .attr("value","")
        if (!this.allowsMultiple) {
            loadingOption.attr("selected", "selected")
        }
        this.select.append(loadingOption);

        this.selectWidth = this.getSelectWidth();

        var search = context.getSplunkSearch();
        if (!search.isDispatched()) alert("Pulldown with name=" + this.name + " is not dispatched");
        if (search.isDone()) {
            this.getResults();
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
            this._previousResultURL = this.getResultURL({});
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

        if (this.allowsMultiple) {
            var values = this.select.val() || [];
            var separator = this.getParam("separator") || "";
            var outerTemplate = this.getParam("outerTemplate");

            return Sideview.multiTemplatize(context,this.name,values,template,separator,outerTemplate);

        }
        else {
            var value = this.select.val() || "";
            return Sideview.safeTemplatize(context, template, this.name, value);
        }
    }

    /**
     * called when a module from downstream requests new context data
     */
    getModifiedContext(context) {
        context = context || this.getContext();

        context.set(this.name + ".label", $('option:selected', this.select).text());
        context.set(this.name + ".element", Sideview.makeUnclonable(this.select));
        // we do not backslash escape rawValue, because we assume it is NOT
        // destined for searches.  rawValue is for QS args and for labels.
        context.set(this.name + ".rawValue", this.select.val());

        var value = this.getStringValue(context);

        //console.error("Pulldown (" + this.getParam("name") + ") getModifiedContext is returning " + this.name + " value of " + value);

        context.set(this.name + ".value", value);
        context.set(this.name, value);

        return context;
    }



    onPassiveChange() {
        var context = this.getContext();
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
     * called when the user changes the pulldown's selected value.
     */
    onChange(evt) {
        this.customOnChange(evt);

        if (this.isPageLoadComplete()) {
            // multiple selects are actually capable of actively selecting
            // 'nothing' so make sure to 'forget' the last known selection.

            if (this.allowsMultiple) {
                this.selectedValueToApply = false;
            }
            this.onPassiveChange();
            this.pushDownstream();
        }
        this.clearURLLoader();
    }

    // only here so we can see the classname in our traces.
    pushDownstream(pageIsLoading) {
        return this._pushDownstream(pageIsLoading);
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
        var offset = this.select.offset();
        this.progressBar.offset(offset);
    }
    onJobProgress(evt, job) {
        if (this.searchFields.length>0) {
            this.progressBar.show();
            this.renderProgress(job.getDoneProgress());
        }
    }

    /**
     * called when the currently running job completes.
     */
    onJobDone(evt, job) {
        if (this.searchFields.length>0) {
            this.inFlight = true;
            this.getResults();
        }
        $(".progressTop", this.container).hide();
    }

    /**
     * template method we expose that is to be called after rendering completes.
     * this greatly simplifies some custom wiring use cases.
     */
    onRendered() {

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

    clearDynamicOptions() {
        this.select.find("option[class=dynamic]").remove();
    }

    /**
     * We just use splunkWeb's proxy to splunkd, so the results will come back
     * in JSON format.  This method builds out <option> elements from that JSON.
     */
    buildOptionListFromResults(jsonResults) {
        if (!jsonResults) {
            console.warn("empty jsonResults returned in " + this.moduleType + ".renderResults ("+this.name+")");
            console.debug(jsonResults);
            return;
        }
        // always returns a 2 element dictionary with 'label' and 'value'.
        var fieldDict = this.getFields();

        var row, value, label;
        for (var i=0,len=jsonResults.length;i<len;i++) {
            row = jsonResults[i];
            value = row[fieldDict["value"]];
            label = row[fieldDict["label"]];
            if (!value && value!="") {
                console.error("ERROR - a Pulldown (" + this.moduleId + ") received a result row that had no value for the value field (" + fieldDict["value"] + ").");
                value="";
                label="(no value found)";
            }
            else if (!label && label!="") {
                console.warn("Pulldown received a result row that had no value for the label field (" + fieldDict["label"] + ").  Using the value field instead (" + fieldDict["value"] + ").");
                label = value;
            }
            // remnant from some perf testing.
            //output.push('<option class="dynamic" value="' + value + '">' + label + '</option>');
            this.select.append($("<option>")
                .addClass("dynamic")
                .text(label)
                .attr("value",value)
            );
        };
        this.selectWidth = this.getSelectWidth();
    }

    getMultipleSelectArgs() {
        var args = {}
        args.multiple = this.allowsMultiple;
        args.header = this.allowsMultiple;
        args.selectedText = this.getSelectedTextLabel;
        return args;
    }

    getSelectedTextLabel(checked,total,options) {
        if (checked==1) {
            return $(options[0]).attr("value");
        }
        else if (total==0) {

            return _("no options found");
        }
        else if (checked==total) {
            return sprintf(_("all %d selected"), total);

        }
        else {
            return sprintf(_("%d of %d selected"), checked,total);
        }
    }

    checkAll() {
        this.ignoringSelectionChanges = true;
        this.select.multiselect("checkAll");
        this.ignoringSelectionChanges = false;
    }

    /*
    show(visibilityReason) {
        var retVal = this._show(visibilityReason);
        if (Sideview.isIE() && !this.getParam("width")) {
            this.select.css("width", "auto");
            this.selectWidth = this.getSelectWidth();
        }
        return retVal;
    }
    */

    /**
     * called each time we render our pulldown data from the server.
     */
    renderResults(jsonResponse) {
        var context = this.getContext();
        // remember which value was selected before.

        // .val() gets a little too clever and evals to true,
        // so we check for this and flatten it to a string
        var fValue = this.select.val();
        if (fValue && fValue.toString()=="") fValue="";

        var value = this.selectedValueToApply
             || fValue
             || Sideview.getValueForFormElementSelection(this.name,context);


        // clear the old dynamic options again. Although in practice this just
        // clears out the 'Loading...' option because the others will already
        // have been cleared during getResults.
        this.clearDynamicOptions();

        var runSelectWidthPatchForIE = (Sideview.isIE() && !this.getParam("width"));
        if (runSelectWidthPatchForIE) {
            this.select.css("width", "auto");
        }
        this.buildOptionListFromResults(jsonResponse.results);
        this.setSelection(value);

        if (value) {

            if (this.select.val() == this.selectedValueToApply || this.select.val()==value) {
                this.clearURLLoader(context);
                this.selectedValueToApply = false;
            }
        }
        this.inFlight = false;
        if (runSelectWidthPatchForIE) {
            this.select.width(this.select.width()+10);
        }
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
            var oldValue = this.select.val();
            var newValue = context.get(this.name);
            this.select.val(newValue);
            if (this.select.val() == newValue) {
                context.remove(this.name);
                this.onPassiveChange();


                var search = context.getSplunkSearch();

                context.removeSplunkSearch();
                if (!search.hasIntentions() && context.isNull()) {
                    this.pushDownstream();
                    // stop the upward-travelling context.
                    return true;
                }
                context.setSplunkSearch(search);

            } else {
                this.select.val(oldValue);
            }
        }
     }
}
    return Pulldown;



});