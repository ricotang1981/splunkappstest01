// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.Pulldown= $.klass(Sideview.utils.getBaseClass(true), {

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
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

        this.setFloatingBehavior();
        this.checkConfig();
        
        Sideview.utils.applyCustomProperties(this);
        
        this.hitWithPrettyStick();
        
    },
    requiresResults: function() {return true;},

    getSearchFields: function() {
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
        if (this.name=="search") alert(this.moduleType + " Error - you do not want to set Pulldown's 'name' param to a value of 'search' as this will disrupt underlying functionality in Splunk.");
    },
    
    /**
     * make sure the fields params are OK.
     */
    checkFieldsConfig: function() {
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
    },

    /**
     * Certain params only take effect if size>1.  Make sure they're not set 
     * otherwise.
     */
    checkMultipleSelectionConfig: function() {
        if (this.allowsMultiple) {
            var p = ["outerTemplate", "separator"];
            for (var i=0,len=p.length;i<p;i++) {
                if (this.getParam(p[i])) {
                    alert("ERROR - in the Pulldown module, the " + p[i] + " param is only applicable when size is set to 2 or greater.  Since size is currently set to " + this.getParam("size") + ", you should omit this parameter.")
                }
            }
            if (!this.getParam("outerTemplate") || ("" + this.getParam("outerTemplate")).length==0) {
                alert("ERROR - you do not want to set Pulldown's outerTemplate param to an empty string as this means the Pulldown will never output any value besides emptystring. Most likely you should set it to $value$ instead ");
            }
        }
    },

    /**
     * sets floats and clears as determined by the config.
     */
    setFloatingBehavior: function() {
        // unfortunately a module's mako template cannot control its *own* 
        // container div.  So we are forced to float it here.
        if (this.getParam("float")) {
            $(this.container).css("margin-right", "10px");
            $(this.container).css("float", this.getParam("float"));
        }
        if (this.getParam("clear")) {
            $(this.container).css("clear", this.getParam("clear"));
        }
    },

    /**
     * if the module is configured dynamically then we have to trigger 
     * a new dispatched search. Note that we actually defer to 
     * DispatchingModule to calculate it.
     */
    requiresDispatch: function($super, search) {
        if (this.searchFields.length==0) return false;
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
     * pulled out as a template method partly so that it can be easily 
     * overridden if necessary in custom config.
     */
    getDefaultStaticFields: function() {
        return [{label:"All", value:"*"}];
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
        if (val==null || val == "") {
            if ($("option:first", this.select).val()=="") {
                $("option:first", this.select).attr("selected","selected");
            }
        } else {
            this.select.val(val);
        }
        if (this.getParam("mode")=="advanced") {
            this.select.trigger("chosen:resize");
            this.select.trigger("chosen:updated");
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
    },

    resetToDefault: function() {
        this.setSelection(this.initialSelection);
    },

    resetUI: function() {},
    
    setToContextValue: function(c) {
        var value = Sideview.utils.getValueForFormElementSelection(this.name,c);
        if (!value && value!="") return;
        if (this.searchFields.length>0) {
            this.select.val(value);
            if (this.select.val() != value) {
                this.selectedValueToApply = value;
            }
        } else {
            this.setSelection(value);
        }
    },

    /**
     * If this returns true, then the Pulldown will be allowed to reload its
     * dynamic options onContextChange.   Pulled out as its own method so that 
     * it can be easily overridden by customBehavior.
     */
    allowReload: function(context) {
        return (!this._previousResultURL || this._previousResultURL != this.getResultURL({})); 
    },

    reloadDynamicOptions: function(context) {
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
            $("label", this.container).text(Sideview.utils.replaceTokensFromContext(labelTemplate, context));
        }
    },

    /**
     * Given all the template, size, separator, outerTemplate params we might 
     * be dealing with, what is the final string value to send downstream.
     */
    getStringValue: function(context) {
        var template = this.getParam("template");
        
        if (this.allowsMultiple) {
            var values = this.select.val() || [];
            var separator = this.getParam("separator") || "";
            var outerTemplate = this.getParam("outerTemplate");
            
            return Sideview.utils.multiTemplatize(context,this.name,values,template,separator,outerTemplate);
            
        } 
        else {
            var value = this.select.val() || "";
            /*
            var selectedOptions= $('option:selected', this.select);
            // if all of the selected options are static, we run token replacement.
            if (selectedOptions.filter(":not(.dynamic)").length==selectedOptions.length) {
                value = Sideview.utils.replaceTokensFromContext(value, context);
            }
            */
            return Sideview.utils.safeTemplatize(context, template, this.name, value);
        }
    },

    /**
     * called when a module from downstream requests new context data
     */
    getModifiedContext: function(context) {
        var context = context || this.getContext();
        
        context.set(this.name + ".label", $('option:selected', this.select).text());
        context.set(this.name + ".element", Sideview.utils.makeUnclonable(this.select));
        // we do not backslash escape rawValue, because we assume it is NOT 
        // destined for searches.  rawValue is for QS args and for labels.
        context.set(this.name + ".rawValue", this.select.val());

        var value = this.getStringValue(context);
        context.set(this.name + ".value", value);
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
        if (! this.ignoringSelectionChanges && context.has("sideview.onEditableStateChange")) {
            var callback = context.get("sideview.onEditableStateChange");
            callback(this.name, this.select.val(), this);
        }
    },
    
    /**
     * empty template method to make CustomBehavior use cases easier.
     */
    customOnChange: function(evt) {},

    /**
     * called when the user changes the pulldown's selected value.
     */
    onChange: function(evt) {
        this.customOnChange(evt);

        if (this.isPageLoadComplete()) {
            // multiple selects are actually capable of actively selecting 
            // 'nothing' so make sure to 'forget' the last known selection.

            if (this.allowsMultiple) {
                this.selectedValueToApply = false;
            }
            this.onPassiveChange();
            this.pushContextToChildren();
        }
        this.clearURLLoader();
    },

    /*********************************
     * Methods about showing job progress
     *********************************/
    getSelectWidth: function() {
        var w = this.select.width();
        w += parseInt(this.select.css("padding-left"));
        w += parseInt(this.select.css("padding-right"));
        return w;
    },
    renderProgress: function(p) {
        if (this.selectWidth<=7) {
            this.selectWidth = this.getSelectWidth();
        }
        this.progressBar.width(p * this.selectWidth);
        var offset = this.select.offset();
        this.progressBar.offset(offset);
    },
    onJobProgress: function() {
        if (this.searchFields.length>0) {
            this.progressBar.show();
            var search = this.getContext().get("search");
            this.renderProgress(search.job.getDoneProgress());
        }
    },

    /**
     * called when the currently running job completes.
     */
    onJobDone: function() {
        if (this.searchFields.length>0) {
            this.getResults();
        }
        $(".progressTop", this.container).hide();
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

    clearDynamicOptions: function() {
        this.select.find("option[class=dynamic]").remove();
    },

    /**
     * We just use splunkWeb's proxy to splunkd, so the results will come back 
     * in JSON format.  This method builds out <option> elements from that JSON.
     */
    buildOptionListFromResults: function(jsonStr) {
        if (!jsonStr) {
            this.logger.warn("empty string returned in " + this.moduleType + ".renderResults ("+this.name+")");
            this.logger.debug(jsonStr);
            return;
        }
        // always returns a 2 element dictionary with 'label' and 'value'.
        var fieldDict = this.getFields();

        var results = Sideview.utils.getResultsFromJSON(jsonStr);
        var row, value, label;
        for (var i=0,len=results.length;i<len;i++) {
            row = results[i];
            value = row[fieldDict["value"]];
            label = row[fieldDict["label"]];
            if (!value && value!="") {
                this.logger.error("ERROR - a Pulldown (" + this.moduleId + ") received a result row that had no value for the value field (" + fieldDict["value"] + ").");
                value="";
                label="(no value found)";
            }
            else if (!label && label!="") {
                this.logger.warn("Pulldown received a result row that had no value for the label field (" + fieldDict["label"] + ").  Using the value field instead (" + fieldDict["value"] + ").");
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
    },
    
    getMultipleSelectArgs: function() {
        var args = {}
        args.multiple = this.allowsMultiple;
        args.header = this.allowsMultiple;
        args.selectedText = this.getSelectedTextLabel;
        return args;
    },

    getSelectedTextLabel: function(checked,total,options) {
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
    },

    hitWithPrettyStick: function() {
        if (this.getParam("mode")=="advanced") {
            this.select.chosen({disable_search_threshold:20});
        }
    },
    checkAll: function() {
        this.ignoringSelectionChanges = true;
        this.select.multiselect("checkAll");
        this.ignoringSelectionChanges = false;
    },

    show: function($super,visibilityReason) {
        var retVal = $super(visibilityReason);
        if ($.browser.msie && !this.getParam("width")) {
            this.select.css("width", "auto");
            this.selectWidth = this.getSelectWidth();
        }
        return retVal;
    },

    /** 
     * called each time we render our pulldown data from the server.
     */
    renderResults: function(jsonStr) {
        var context = this.getContext();
        // remember which value was selected before.

        // .val() gets a little too clever and evals to true, 
        // so we check for this and flatten it to a string
        var fValue = this.select.val();
        if (fValue && fValue.toString()=="") fValue="";

        var value = this.selectedValueToApply 
             || fValue
             || Sideview.utils.getValueForFormElementSelection(this.name,context);
        
        
        // clear the old dynamic options again. Although in practice this just
        // clears out the 'Loading...' option because the others will already 
        // have been cleared during getResults.
        this.clearDynamicOptions();

        var runSelectWidthPatchForIE = ($.browser.msie && !this.getParam("width"));
        if (runSelectWidthPatchForIE) {
            this.select.css("width", "auto");
        }
        this.buildOptionListFromResults(jsonStr);
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
            var oldValue = this.select.val();
            var newValue = context.get(this.name);
            this.select.val(newValue);
            if (this.select.val() == newValue) {
                context.remove(this.name);
                this.onPassiveChange();
                

                var search = context.get("search");
                
                context.remove("search");
                if (!search.hasIntentions() && Sideview.utils.contextIsNull(context)) {
                    this.pushContextToChildren();
                    // stop the upward-travelling context.
                    return true;
                }
                context.set("search",search);

            } else {
                this.select.val(oldValue);
            }
        }
     }
});


