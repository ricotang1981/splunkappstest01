// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

if (typeof(Sideview)!="undefined") {
    var jqueryVersion = $.fn.jquery;
    var splunkVersion = Sideview.utils.getConfigValue("VERSION_LABEL");
    if (Sideview.utils.compareVersions(splunkVersion,"6") == -1) {
        $.fn.extend({
            delegate: function( selector, types, data, fn ) {
                return this.live( types, data, fn, selector );
            }
        });
    }
}


Splunk.Module.CheckboxPulldown= $.klass(Sideview.utils.getBaseClass(true), {

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        this.name = this.getParam("name");
        this.searchFields = this.getSearchFields();
        
        this.staticFields = this.getParam("staticOptions") || [];
        this.nullTemplate = this.getParam("nullTemplate");
        // we use this flag to keep track of whether we're still loading data.
        this.inFlight = this.searchFields.length > 0;
        this.hasClearedURLLoader = false;

        
        this.select = $('select', this.container)
            .bind("change", this.onChange.bind(this));
        
        // local properties used if/when we display progress
        this.selectWidth  = 0;
        this.progressBar  = $(".progressTop", this.container);

        this.setFloatingBehavior();
        this.checkConfig();
        
        Sideview.utils.applyCustomProperties(this);
        
        this.optionsAreSelectedByDefault = Sideview.utils.normalizeBoolean(this.getParam("selectedByDefault"));
        this.hitWithPrettyStick();
        
        if (this.optionsAreSelectedByDefault) {
            this.unselectedValues = {}
        } else {
            this.selectedValues = {}
        }
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
        return []
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
        if (this.name=="search") alert(this.moduleType + " Error - you do not want to set CheckboxPulldown's 'name' param to a value of 'search' as this will disrupt underlying functionality in Splunk.");
    },
    
    /**
     * make sure the fields params are OK.
     */
    checkFieldsConfig: function() {
        try {
            if (this.searchFields.length==0 && this.staticFields.length ==0) {
                alert("ERROR - CheckboxPulldown MUST be configured with at least one static option or with a valueField param to pull dynamic results.");
            } else if (this.staticFields.length==1 && this.searchFields.length==0) {
                alert("ERROR - CheckboxPulldown is configured statically but with only a single static option.");
            } else if (this.getParam("hideOnEmpty")=="True" && this.staticFields.length>0) {
                alert("ERROR - hideOnEmpty is set to true, but there are static options listed meaning the hideOnEmpty behavior will never apply");
            }
            else if (this.searchFields.length==0 && this.getParam("postProcess")) {
                alert("ERROR - CheckboxPulldown is configured with a postProcess param but no search fields. One of these is a mistake.");
            }
        } catch(e) {
            alert("ERROR - unexpected exception during CheckboxPulldown.checkFieldsConfig. Look for typos in the valueField, labelField or staticOptions params .");
            console.error(e);
        }
    },

    checkMultipleSelectionConfig: function() {
        if (!this.getParam("outerTemplate") || ("" + this.getParam("outerTemplate")).length==0) {
            alert("ERROR - you do not want to set CheckboxPulldown's outerTemplate param to an empty string as this means the CheckboxPulldown will never output any value besides emptystring. ");
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
        var fields = [];
        if (this.searchFields.length>0) {
            var c = this.getContext().clone();
            c.set("name", this.getParam("name"));
            
            var value = Sideview.utils.replaceTokensFromContext(this.searchFields[0].value, c);
            var label = Sideview.utils.replaceTokensFromContext(this.searchFields[0].label, c);
            fields.push(value);
            if (label && fields.indexOf(label)==-1) {
                fields.push(label);
            }
        }
        if (Sideview.utils.mightNeedStatusBuckets(search)) {
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
        this.select.val(val);
        this.select.multiselect('refresh');

        if (val=="*") {
            this.checkAll();
        }
    },

    getUnselectedOptions: function() {
        var opts = {}
        $("option:not(:selected)",this.select).each(function() {
            opts[$(this).attr("value")] = 1;
        });
        return opts;
    },

    getSelectedOptions: function() {
        var opts = {};
        $("option:selected",this.select).each(function() {
            opts[$(this).attr("value")] = 1;
        });
        return opts;
    },

    getUnselectedOptionsArray: function() {
        var dict = this.getUnselectedOptions();
        var arr = [];
        for (key in dict) {
            if (dict.hasOwnProperty(key)) {
                arr.push(key);
            }
        }
        return arr;
    },

    getSelectedOptionsArray: function() {
        return $.extend([], this.select.val());
    },

    rememberSelectionStates: function() {
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
            $.extend(this.selectedValues,this.getSelectedOptions())
            var unselectedOptionsArray = this.getUnselectedOptionsArray();
            for (var i=0;i<unselectedOptionsArray.length;i++) {
                var value = unselectedOptionsArray[i];
                if (this.selectedValues.hasOwnProperty(value)) {
                    delete this.selectedValues[value];
                }
            }
        }
    },
    // Q1 - do we need an analogous behavior if optionsAreSelectedByDefault==false?
    // Q2 - why isn't this called within setSelection itself. 
    forgetSomeUnselectedOptions: function(opts) {
        if (this.optionsAreSelectedByDefault) {
            var val;
            for (var i=0,len=opts.length;i<len;i++) {
                val = opts[i];
                if (this.unselectedValues.hasOwnProperty(val)) {
                    delete this.unselectedValues[val];
                }
            }
        }
    },

    //resetToDefault: function() {},

    resetUI: function() {},
    
    setToContextValue: function(c) {
        var value = Sideview.utils.getValueForFormElementSelection(this.name,c);
        if (!value && value!="") return;
        this.forgetSomeUnselectedOptions(value);
        this.setSelection(value);
    },

    /**
     * If this returns true, then the CheckboxPulldown will be allowed to reload its
     * dynamic options onContextChange.   Pulled out as its own method so that 
     * it can be easily overridden by customBehavior.
     */
    allowReload: function(context) {
        return (!this._previousResultURL || this._previousResultURL != this.getResultURL({})); 
    },

    reloadDynamicOptions: function(context) {
        
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
        var values = this.select.val() || [];
        var templatizedValues = [];
        var templatizedValue;
        for (var i=0,len=values.length;i<len;i++) {
            if (!values[i] || values[i] == "") {
                if (this.nullTemplate) {
                    templatizedValue = Sideview.utils.safeTemplatize(context, this.nullTemplate, this.name, "*");
                }
                else {
                    continue;
                }
            }
            else {
                templatizedValue = Sideview.utils.safeTemplatize(context, template, this.name, values[i]);
            }
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
        $('option:selected', this.select).each(function() {
            labels.push($(this).text());
        });
        return labels.join(", ")
    },

    /**
     * called when a module from downstream requests new context data
     */
    getModifiedContext: function(context) {
        var context = context || this.getContext();
        
        context.set(this.name + ".label", this.getLabels());
        context.set(this.name + ".element", Sideview.utils.makeUnclonable(this.select));
        

        var rawValue=this.select.val();
        var value = this.getStringValue(context);

        var selectAllOptimization = this.getParam("selectAllOptimization", "False");
        
        

        if (selectAllOptimization!="False") {
            var selectedOptions = this.select.val() || [];
            var allOptions = this.select.children('option') || [];
            if (allOptions.length>0 && selectedOptions.length == allOptions.length) {
                if (selectAllOptimization=="omit") {
                    // we have to explicitly null it out because URLLoader 
                    // may be supplying another copy upstream..
                    value="";
                    rawValue="";
                }
                else if (selectAllOptimization=="*") {
                    value = Sideview.utils.safeTemplatize(context, this.getParam("template"), this.name, "*");
                    rawValue="*"
                }
            }
        }
        context.set(this.name + ".value", value);
        context.set(this.name, value);
        // NOTE we do not backslash escape rawValue, because we assume it is NOT 
        // destined for searches.  rawValue is for QS args and for labels.
        context.set(this.name + ".rawValue", rawValue);

        return context;
    },
    
    /**
     * called when we have to send new context data to downstream modules.
     */
    pushContextToChildren: function($super, explicitContext) {
        var val = this.select.val() || [];
        this._lastValue=val.join("-x-");
        /* see notes in Checkbox.js */
        this.withEachDescendant(function(module) {
            module.dispatchAlreadyInProgress = false;
        });
        return $super(explicitContext);
    },

    
    
    onPassiveChange: function() {
        var context = this.getContext();
        this.rememberSelectionStates();
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
     * called when the user changes the CheckboxPulldown's selected value.
     */
    onChange: function(evt) {
        this.customOnChange(evt);

        if (this.isPageLoadComplete()) {
            this.onPassiveChange();
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
        var offset = $("button.ui-multiselect",this.container).offset();
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
                if (label && !this.nullTemplate) {
                    label="(ERROR - null-valued option found, but required nullTemplate param is missing.)";
                } else {
                    this.logger.error("ERROR - a CheckboxPulldown (" + this.moduleId + ") received a result row that had no value for the value field (" + fieldDict["value"] + ").");
                    value="";
                    label="(no value found)";
                }
            }
            else if (!label && label!="") {
                this.logger.warn("CheckboxPulldown received a result row that had no value for the label field (" + fieldDict["label"] + ").  Using the value field instead (" + fieldDict["value"] + ").");
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
    },
    
    getMultipleSelectArgs: function() {
        var args = {}
        args.multiple = true;
        args.header = true;
        args.minWidth = 210;
        args.selectedText = this.getSelectedTextLabel;
        args.close = function() {
            var val = this.select.val() || [];
            val = val.join("-x-");

            if (this._lastValue==null || val!=this._lastValue) {
                this.pushContextToChildren();
            }
        }.bind(this);
        return args;
    },

    getSelectedTextLabel: function(checked,total,options) {
        if (checked==1) {
            try {
                return $(options[0]).parent().children('span').eq(0).text();
            }
            catch(e) {
                console.warn("Failed to get the label of the one currently selected option in CheckboxPulldown.")
            }
        }
        if (total==0) {
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
        this.select.multiselect(this.getMultipleSelectArgs());
        if (this.optionsAreSelectedByDefault) {
            // purely static CheckboxPulldowns with no 
            // <param name="selected">True</param> should select all by default
            var s = this.select.val() || []
            if (this.searchFields.length==0 && s.length==0) {
                this.checkAll();
            }
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
     * called each time we render our CheckboxPulldown data from the server.
     */
    renderResults: function(jsonStr) {
        var context = this.getContext();
        // remember which value was selected before.

        // clear the old dynamic options again. In practice this just clears 
        // out the 'Loading...' option because the others are already gone.
        this.clearDynamicOptions();

        var runSelectWidthPatchForIE = ($.browser.msie && !this.getParam("width"));
        if (runSelectWidthPatchForIE) {
            this.select.css("width", "auto");
        }
        this.buildOptionListFromResults(jsonStr);

        var value = Sideview.utils.getValueForFormElementSelection(this.name,context);
        
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
     * and CheckboxPulldown instances to 'catch'. 
     */
    applyContext: function(context) {
        if (!this.isPageLoadComplete()) {
            this.logger.error(this.moduleType + " is not designed to work with the oldschool Search resurrection system.");
        }
        if (this.isPageLoadComplete() && context.has(this.name)) {
            this.setToContextValue(context);

            var newValue = context.get(this.name);
            if (this.select.val() == newValue) {
                context.remove(this.name);
                this.onPassiveChange();
                
                if (Sideview.utils.contextIsNull(context)) {
                    this.pushContextToChildren();
                    // stop the upward-travelling context.
                    return true;
                }
                
            } else {
                this.select.val(oldValue);
            }
        }
     }
});


/*
 * This is licensed from Eric Hynds via the MIT license. 
 * This code has also been modified by Sideview. 

 /* jshint forin:true, noarg:true, noempty:true, eqeqeq:true, boss:true, undef:true, curly:true, browser:true, jquery:true */
/*
 * jQuery MultiSelect UI Widget 2.0.1
 * Copyright (c) 2012 Eric Hynds
 *
 * Depends:
 *   - jQuery 1.4.2+
 *   - jQuery UI 1.11 widget factory
 *
 * Optional:
 *   - jQuery UI effects
 *   - jQuery UI position utility
 *
 * Dual licensed under the MIT and GPL licenses:
 *   http://www.opensource.org/licenses/mit-license.php
 *   http://www.gnu.org/licenses/gpl.html
 *
 */
(function($, undefined) {
  // Counter used to prevent collisions
  var multiselectID = 0;
  var $doc = $(document);

  $.widget("ech.multiselect", {

    // default options
    options: {
      header: true,
      height: 350,
      minWidth: 300,
      minHeight: 300,
      classes: '',
      checkAllText: 'Check all',
      uncheckAllText: 'Uncheck all',
      noneSelectedText: 'Select options',
      showCheckAll: true,
      showUncheckAll: true,
      selectedText: '# selected',
      selectedList: 0,
      closeIcon: 'ui-icon-circle-close',
      show: null,
      hide: null,
      autoOpen: false,
      multiple: true,
      position: {},
      appendTo: null,
      menuWidth:null,
      selectedListSeparator: ', ',
      disableInputsOnToggle: true,
      groupColumns: false
    },

    // This method determines which element to append the menu to
    // Uses the element provided in the options first, then looks for ui-front / dialog
    // Otherwise appends to the body
    _getAppendEl: function() {
      var element = this.options.appendTo;
      if(element) {
        element = element.jquery || element.nodeType ? $(element) : document.find(element).eq(0);
      }
      if(!element || !element[0]) {
        element = this.element.closest(".ui-front, dialog");
      }
      if(!element.length) {
        element = document.body;
      }
      return element;
    },

    // Performs the initial creation of the widget
    _create: function() {
      var el = this.element;
      var o = this.options;

      this.speed = $.fx.speeds._default; // default speed for effects
      this._isOpen = false; // assume no
      this.inputIdCounter = 0; // Incremented for each input item (option)

      // create a unique namespace for events that the widget
      // factory cannot unbind automatically. Use eventNamespace if on
      // jQuery UI 1.9+, and otherwise fallback to a custom string.
      this._namespaceID = this.eventNamespace || ('multiselect' + multiselectID);
      // bump unique ID after assigning it to the widget instance
      this.multiselectID = multiselectID++;

      // The button that opens the widget menu
      var button = (this.button = $('<button type="button"><span class="ui-icon ui-icon-triangle-1-s"></span></button>'))
        .addClass('ui-multiselect ui-widget ui-state-default ui-corner-all ' + o.classes)
        .attr({ 'title':el.attr('title'), 'tabIndex':el.attr('tabIndex'), 'id': el.attr('id') ? el.attr('id')  + '_ms' : null })
        .prop('aria-haspopup', true)
        .insertAfter(el);

      this.buttonlabel = $('<span />')
        .html(o.noneSelectedText)
        .appendTo(button);

      // This is the menu that will hold all the options
      this.menu = $('<div />')
        .addClass('ui-multiselect-menu ui-widget ui-widget-content ui-corner-all ' + o.classes)
        .appendTo(this._getAppendEl());

      // Menu header to hold controls for the menu
      this.header = $('<div />')
        .addClass('ui-widget-header ui-corner-all ui-multiselect-header ui-helper-clearfix')
        .appendTo(this.menu);

      // Header controls, will contain the check all/uncheck all buttons
      // Depending on how the options are set, this may be empty or simply plain text
      this.headerLinkContainer = $('<ul />')
        .addClass('ui-helper-reset')
        .html(function() {
          if(o.header === true) {
            var header_lis = '';
            if(o.showCheckAll) {
              header_lis = '<li><a class="ui-multiselect-all" href="#"><span class="ui-icon ui-icon-check"></span><span>' + o.checkAllText + '</span></a></li>';
            }
            if(o.showUncheckAll) {
              header_lis += '<li><a class="ui-multiselect-none" href="#"><span class="ui-icon ui-icon-closethick"></span><span>' + o.uncheckAllText + '</span></a></li>';
            }
            return header_lis;
          } else if(typeof o.header === "string") {
            return '<li>' + o.header + '</li>';
          } else {
            return '';
          }
        })
        .append('<li class="ui-multiselect-close"><a href="#" class="ui-multiselect-close"><span class="ui-icon '+o.closeIcon+'"></span></a></li>')
        .appendTo(this.header);

      // Holds the actual check boxes for inputs
      var checkboxContainer = (this.checkboxContainer = $('<ul />'))
        .addClass('ui-multiselect-checkboxes ui-helper-reset')
        .appendTo(this.menu);

      this._bindEvents();

      // build menu
      this.refresh(true);

      // If this is a single select widget, add the appropriate class
      if(!o.multiple) {
        this.menu.addClass('ui-multiselect-single');
      }
      el.hide();
    },

    // https://api.jqueryui.com/jquery.widget/#method-_init
    _init: function() {
      if(this.options.header === false) {
        this.header.hide();
      }
      if(!this.options.multiple) {
        this.headerLinkContainer.find('.ui-multiselect-all, .ui-multiselect-none').hide();
      } else {
        this.headerLinkContainer.find('.ui-multiselect-all, .ui-multiselect-none').show();
      }
      if(this.options.autoOpen) {
        this.open();
      }
      if(this.element.is(':disabled')) {
        this.disable();
      }
    },

    /*
    * Builds an option item for the menu
    * <li>
    *   <label>
    *     <input /> checkbox or radio depending on single/multiple select
    *     <span /> option text
    *   </label>
    * </li>
    */
    _makeOption: function(option) {
      var title = option.title ? option.title : null;
      var value = option.value;
      var id = this.element.attr('id') || this.multiselectID; // unique ID for the label & option tags
      var inputID = 'ui-multiselect-' + this.multiselectID + '-' + (option.id || id + '-option-' + this.inputIdCounter++);
      var isDisabled = option.disabled;
      var isSelected = option.selected;
      var labelClasses = [ 'ui-corner-all' ];
      var liClasses = [];
      var o = this.options;

      if(isDisabled) {
        liClasses.push('ui-multiselect-disabled');
        labelClasses.push('ui-state-disabled');
      }
      if(option.className) {
        liClasses.push(option.className);
      }
      if(isSelected && !o.multiple) {
        labelClasses.push('ui-state-active');
      }

      var $item = $("<li/>").addClass(liClasses.join(' '));
      var $label = $("<label/>").attr({
        "for": inputID,
        "title": title
      }).addClass(labelClasses.join(' ')).appendTo($item);
      var $input = $("<input/>").attr({
        "name": "multiselect_" + id,
        "type": o.multiple ? "checkbox" : "radio",
        "value": value,
        "title": title,
        "id": inputID,
        "checked": isSelected ? "checked" : null,
        "aria-selected": isSelected ? "true" : null,
        "disabled": isDisabled ? "disabled" : null,
        "aria-disabled": isDisabled ? "true" : null
      }).data($(option).data()).appendTo($label);

      var $span = $("<span/>").text($(option).text());
      if($input.data("image-src")) {
        $span.prepend($("<img/>").attr({"src": $input.data("image-src")}));
      }
      $span.appendTo($label);

      return $item;
    },
    // Builds a menu item for each option in the underlying select
    // Option groups are built here as well
    _buildOptionList: function(element, $appendTo) {
      var self = this;
      element.children().each(function() {
        var $this = $(this);
        if(this.tagName === 'OPTGROUP') {
          var $optionGroup = $("<ul/>").addClass('ui-multiselect-optgroup ' + this.className).appendTo($appendTo);
          if(self.options.groupColumns) {
            $optionGroup.addClass("ui-multiselect-columns");
          }
          $("<a/>").text(this.getAttribute('label')).appendTo($optionGroup);
          self._buildOptionList($this, $optionGroup);
        } else {
          var $listItem = self._makeOption(this).appendTo($appendTo);
        }
      });

    },

    // Refreshes the widget to pick up changes to the underlying select
    // Rebuilds the menu, sets button width
    refresh: function(init) {
      var self = this;
      var el = this.element;
      var o = this.options;
      var menu = this.menu;
      var checkboxContainer = this.checkboxContainer;
      var $dropdown = $("<ul/>").addClass('ui-multiselect-checkboxes ui-helper-reset');
      this.inputIdCounter = 0;


      // update header link container visibility if needed
      if (this.options.header) {
        if(!this.options.multiple) {
          this.headerLinkContainer.find('.ui-multiselect-all, .ui-multiselect-none').hide();
        } else {
          this.headerLinkContainer.find('.ui-multiselect-all, .ui-multiselect-none').show();
        }
      }

      this._buildOptionList(el, $dropdown);

      this.menu.find(".ui-multiselect-checkboxes").remove();
      this.menu.append($dropdown);

      // cache some moar useful elements
      this.labels = menu.find('label');
      this.inputs = this.labels.children('input');

      this._setButtonWidth();

      this.update(true);

      // broadcast refresh event; useful for widgets
      if(!init) {
        this._trigger('refresh');
      }
    },

    // updates the button text. call refresh() to rebuild
    update: function(isDefault) {
      var o = this.options;
      var $inputs = this.inputs;
      var $checked = $inputs.filter(':checked');
      var numChecked = $checked.length;
      var value;

      if(numChecked === 0) {
        value = o.noneSelectedText;
      } else {
        if($.isFunction(o.selectedText)) {
          value = o.selectedText.call(this, numChecked, $inputs.length, $checked.get());
        } else if(/\d/.test(o.selectedList) && o.selectedList > 0 && numChecked <= o.selectedList) {
          value = $checked.map(function() { return $(this).next().text(); }).get().join(o.selectedListSeparator);
        } else {
          value = o.selectedText.replace('#', numChecked).replace('#', $inputs.length);
        }
      }

      this._setButtonValue(value);
      if(isDefault) {
        this.button[0].defaultValue = value;
      }

    },

    // this exists as a separate method so that the developer
    // can easily override it, usually to allow injecting HTML if they really want it
    _setButtonValue: function(value) {
      this.buttonlabel.text(value);
    },

    _bindButtonEvents: function() {
      var self = this;
      var button = this.button;
      function clickHandler() {
        self[ self._isOpen ? 'close' : 'open' ]();
        return false;
      }

      // webkit doesn't like it when you click on the span :(
      button
        .find('span')
        .bind('click.multiselect', clickHandler);

      // button events
      button.bind({
        click: clickHandler,
        keypress: function(e) {
          switch(e.which) {
            case 27: // esc
            case 38: // up
            case 37: // left
              self.close();
              break;
            case 39: // right
            case 40: // down
              self.open();
              break;
          }
        },
        mouseenter: function() {
          if(!button.hasClass('ui-state-disabled')) {
            $(this).addClass('ui-state-hover');
          }
        },
        mouseleave: function() {
          $(this).removeClass('ui-state-hover');
        },
        focus: function() {
          if(!button.hasClass('ui-state-disabled')) {
            $(this).addClass('ui-state-focus');
          }
        },
        blur: function() {
          $(this).removeClass('ui-state-focus');
        }
      });
    },

    _bindMenuEvents: function() {
      var self = this;
      // optgroup label toggle support
      this.menu.on('click.multiselect', '.ui-multiselect-optgroup a', function(e) {
        e.preventDefault();

        var $this = $(this);
        var $inputs = $this.parent().find('input:visible:not(:disabled)');
        var nodes = $inputs.get();
        var label = $this.text();

        // trigger event and bail if the return is false
        if(self._trigger('beforeoptgrouptoggle', e, { inputs:nodes, label:label }) === false) {
          return;
        }

        // toggle inputs
        self._toggleChecked(
          $inputs.filter(':checked').length !== $inputs.length,
          $inputs
        );

        self._trigger('optgrouptoggle', e, {
          inputs: nodes,
          label: label,
          checked: nodes.length ? nodes[0].checked : null
        });
      })
      .on('mouseenter.multiselect', 'label', function() {
        if(!$(this).hasClass('ui-state-disabled')) {
          self.labels.removeClass('ui-state-hover');
          $(this).addClass('ui-state-hover').find('input').focus();
        }
      })
      .on('keydown.multiselect', 'label', function(e) {
        if(e.which === 82) {
          return; //"r" key, often used for reload.
        }
        if(e.which > 111 && e.which < 124) {
          return; //Keyboard function keys.
        }
        e.preventDefault();
        switch(e.which) {
          case 9: // tab
            if(e.shiftKey) {
              self.menu.find(".ui-state-hover").removeClass("ui-state-hover");
              self.header.find("li").last().find("a").focus();
            } else {
              self.close();
            }
            break;
          case 27: // esc
            self.close();
            break;
          case 38: // up
          case 40: // down
          case 37: // left
          case 39: // right
            self._traverse(e.which, this);
            break;
          case 13: // enter
          case 32: //space
            $(this).find('input')[0].click();
            break;
          case 65: // a
            if(e.altKey) {
              self.checkAll();
            }
            break;
          case 85: // u
            if(e.altKey) {
              self.uncheckAll();
            }
            break;
        }
      })
      .on('click.multiselect', 'input[type="checkbox"], input[type="radio"]', function(e) {
        var $this = $(this);
        var val = this.value;
        var optionText = $this.parent().find("span").text();
        var checked = this.checked;
        var tags = self.element.find('option');

        // bail if this input is disabled or the event is cancelled
        if(this.disabled || self._trigger('click', e, { value: val, text: optionText, checked: checked }) === false) {
          e.preventDefault();
          return;
        }

        // make sure the input has focus. otherwise, the esc key
        // won't close the menu after clicking an item.
        $this.focus();

        // toggle aria state
        $this.prop('aria-selected', checked);

        // change state on the original option tags
        tags.each(function() {
          if(this.value === val) {
            this.selected = checked;
          } else if(!self.options.multiple) {
            this.selected = false;
          }
        });

        // some additional single select-specific logic
        if(!self.options.multiple) {
          self.labels.removeClass('ui-state-active');
          $this.closest('label').toggleClass('ui-state-active', checked);

          // close menu
          self.close();
        }

        // fire change on the select box
        self.element.trigger("change");

        // setTimeout is to fix multiselect issue #14 and #47. caused by jQuery issue #3827
        // http://bugs.jquery.com/ticket/3827
        setTimeout($.proxy(self.update, self), 10);
      });
    },

    _bindHeaderEvents: function() {
      var self = this;
      // header links
      this.header.on('click.multiselect', 'a', function(e) {
        var $this = $(this);
        if($this.hasClass('ui-multiselect-close')) {
          self.close();
        } else if($this.hasClass("ui-multiselect-all")) {
          self.checkAll();
        } else if($this.hasClass("ui-multiselect-none")) {
          self.uncheckAll();
        }
        e.preventDefault();
      }).on('keydown.multiselect', 'a', function(e) {
        switch(e.which) {
          case 27: // esc
            self.close();
            break;
          case 9: // tab
            var $target = $(e.target);
            if((e.shiftKey && !$target.parent().prev().length && !self.header.find(".ui-multiselect-filter").length) || (!$target.parent().next().length && !self.labels.length && !e.shiftKey)) {
              self.close();
              e.preventDefault();
            }
            break;
        }
      });
    },

    _bindEvents: function() {
      var self = this;

      this._bindButtonEvents();
      this._bindMenuEvents();
      this._bindHeaderEvents();

      // close each widget when clicking on any other element/anywhere else on the page
      $doc.bind('mousedown.' + self._namespaceID, function(event) {
        var target = event.target;

        if(self._isOpen &&
            target !== self.button[0] &&
            target !== self.menu[0] &&
            !$.contains(self.menu[0], target) &&
            !$.contains(self.button[0], target)
          ) {
          self.close();
        }
      });

      // deal with form resets.  the problem here is that buttons aren't
      // restored to their defaultValue prop on form reset, and the reset
      // handler fires before the form is actually reset.  delaying it a bit
      // gives the form inputs time to clear.
      $(this.element[0].form).bind('reset.' + this._namespaceID, function() {
        setTimeout($.proxy(self.refresh, self), 10);
      });
    },

    // Determines the minimum width for the button and menu
    // Can be a number, a digit string, or a percentage
    _getMinWidth: function() {
      var minVal = this.options.minWidth;
      var width = 0;
      switch (typeof minVal) {
        case 'number':
          width = minVal;
          break;
        case 'string':
          var lastChar = minVal[ minVal.length -1 ];
          width = minVal.match(/\d+/);
          if(lastChar === '%') {
            width = this.element.parent().outerWidth() * (width/100);
          } else {
            width = parseInt(minVal, 10);
          }
          break;
      }
      return width;
    },
    // set button width
    _setButtonWidth: function() {
      var width = this.element.outerWidth();
      var minVal = this._getMinWidth();

      if(width < minVal) {
        width = minVal;
      }
      // set widths
      this.button.outerWidth(width);
    },

    // set menu width
    _setMenuWidth: function() {
      var m = this.menu;
      var width = (this.button.outerWidth() <= 0) ? this._getMinWidth() : this.button.outerWidth();
      m.outerWidth(this.options.menuWidth || width);
    },

    // Sets the height of the menu
    // Will set a scroll bar if the menu height exceeds that of the height in options
    _setMenuHeight: function() {
      var headerHeight = this.menu.children(".ui-multiselect-header:visible").outerHeight(true);
      var ulHeight = 0;
      this.menu.find(".ui-multiselect-checkboxes li, .ui-multiselect-checkboxes a").each(function(idx, li) {
        ulHeight += $(li).outerHeight(true);
      });
      if(ulHeight > this.options.height) {
        this.menu.children(".ui-multiselect-checkboxes").css("overflow", "auto");
        ulHeight = this.options.height;
      } else {
        this.menu.children(".ui-multiselect-checkboxes").css("overflow", "hidden");
      }

      this.menu.children(".ui-multiselect-checkboxes").height(ulHeight);
      this.menu.height(ulHeight + headerHeight);
    },

    // Resizes the menu, called every time the menu is opened
    _resizeMenu: function() {
      this._setMenuWidth();
      this._setMenuHeight();
    },

    // move up or down within the menu
    _traverse: function(which, start) {
      var $start = $(start);
      var moveToLast = which === 38 || which === 37;

      // select the first li that isn't an optgroup label / disabled
      var $next = $start.parent()[moveToLast ? 'prevAll' : 'nextAll']('li:not(.ui-multiselect-disabled, .ui-multiselect-optgroup):visible').first();
      // we might have to jump to the next/previous option group
      if(!$next.length) {
        $next = $start.parents(".ui-multiselect-optgroup")[moveToLast ? "prev" : "next" ]();
      }

      // if at the first/last element
      if(!$next.length) {
        var $container = this.menu.find('ul').last();

        // move to the first/last
        this.menu.find('label:visible')[ moveToLast ? 'last' : 'first' ]().trigger('mouseover');

        // set scroll position
        $container.scrollTop(moveToLast ? $container.height() : 0);

      } else {
        $next.find('label:visible')[ moveToLast ? "last" : "first" ]().trigger('mouseover');
      }
    },

    // This is an internal function to toggle the checked property and
    // other related attributes of a checkbox.
    //
    // The context of this function should be a checkbox; do not proxy it.
    _toggleState: function(prop, flag) {
      return function() {
        if(!this.disabled) {
          this[ prop ] = flag;
        }

        if(flag) {
          this.setAttribute('aria-selected', true);
        } else {
          this.removeAttribute('aria-selected');
        }
      };
    },

    // Toggles checked state on either an option group or all inputs
    _toggleChecked: function(flag, group) {
      var $inputs = (group && group.length) ?  group : this.inputs;
      var self = this;

      // toggle state on inputs
      $inputs.each(this._toggleState('checked', flag));

      // give the first input focus
      $inputs.eq(0).focus();

      // update button text
      this.update();

      // gather an array of the values that actually changed
      var values = {};
      $inputs.each(function() {
        values[this.value] = true;
      });

      // toggle state on original option tags
      this.element
        .find('option')
        .each(function() {
          if(!this.disabled && values[this.value]) {
            self._toggleState('selected', flag).call(this);
          }
        });

      // trigger the change event on the select
      if($inputs.length) {
        this.element.trigger("change");
      }
    },

    // Toggle disable state on the widget and underlying select
    _toggleDisabled: function(flag) {
      this.button.prop({ 'disabled':flag, 'aria-disabled':flag })[ flag ? 'addClass' : 'removeClass' ]('ui-state-disabled');

      if(this.options.disableInputsOnToggle) {
        var checkboxes = this.menu.find(".ui-multiselect-checkboxes").get(0);
        var matchedInputs = [];
        var key = "ech-multiselect-disabled";
        var i = 0;
        if(flag) {
          // remember which elements this widget disabled (not pre-disabled)
          // elements, so that they can be restored if the widget is re-enabled.
          matchedInputs = checkboxes.querySelectorAll("input:enabled");
          for(i = 0; i < matchedInputs.length; i++) {
            matchedInputs[i].setAttribute(key, true);
            matchedInputs[i].setAttribute("disabled", "disabled");
            matchedInputs[i].setAttribute("aria-disabled", "disabled");
            matchedInputs[i].parentNode.className = matchedInputs[i].parentNode.className + " ui-state-disabled";
          }
        } else {
          matchedInputs = checkboxes.querySelectorAll("input:disabled");
          for(i = 0; i < matchedInputs.length; i++) {
            if(matchedInputs[i].hasAttribute(key)) {
              matchedInputs[i].removeAttribute(key);
              matchedInputs[i].removeAttribute("disabled");
              matchedInputs[i].removeAttribute("aria-disabled");
              matchedInputs[i].parentNode.className = matchedInputs[i].parentNode.className.replace(" ui-state-disabled", "");
            }
          }
        }
      }

      this.element.prop({
        'disabled':flag,
        'aria-disabled':flag
      });
    },

    // open the menu
    open: function(e) {
      var self = this;
      var button = this.button;
      var menu = this.menu;
      var speed = this.speed;
      var o = this.options;
      var args = [];

      // bail if the multiselectopen event returns false, this widget is disabled, or is already open
      if(this._trigger('beforeopen') === false || button.hasClass('ui-state-disabled') || this._isOpen) {
        return;
      }

      var $container = menu.find('.ui-multiselect-checkboxes');
      var effect = o.show;

      // figure out opening effects/speeds
      if($.isArray(o.show)) {
        effect = o.show[0];
        speed = o.show[1] || self.speed;
      }

      // if there's an effect, assume jQuery UI is in use
      // build the arguments to pass to show()
      if(effect) {
        args = [ effect, speed ];
      }

      // set the scroll of the checkbox container
      $container.scrollTop(0);

      // show the menu, maybe with a speed/effect combo
      $.fn.show.apply(menu, args);

      this._resizeMenu();
      // positon
      this.position();


      // select the first not disabled option or the filter input if available
      var filter = this.header.find(".ui-multiselect-filter");
      if(filter.length) {
        filter.first().find('input').trigger('focus');
      } else if(this.labels.length){
        this.labels.filter(':not(.ui-state-disabled)').eq(0).trigger('mouseover').trigger('mouseenter').find('input').trigger('focus');
      } else {
        this.header.find('a').first().trigger('focus');
      }


      button.addClass('ui-state-active');
      this._isOpen = true;
      this._trigger('open');
    },

    // close the menu
    close: function() {
      if(this._trigger('beforeclose') === false) {
        return;
      }

      var o = this.options;
      var effect = o.hide;
      var speed = this.speed;
      var args = [];

      // figure out opening effects/speeds
      if($.isArray(o.hide)) {
        effect = o.hide[0];
        speed = o.hide[1] || this.speed;
      }

      if(effect) {
        args = [ effect, speed ];
      }

      $.fn.hide.apply(this.menu, args);
      this.button.removeClass('ui-state-active').trigger('blur').trigger('mouseleave');
      this._isOpen = false;
      this._trigger('close');
      this.button.trigger('focus');
    },

    enable: function() {
      this._toggleDisabled(false);
    },

    disable: function() {
      this._toggleDisabled(true);
    },

    checkAll: function(e) {
      this._toggleChecked(true);
      this._trigger('checkAll');
    },

    uncheckAll: function() {
      this._toggleChecked(false);
      this._trigger('uncheckAll');
    },

    getChecked: function() {
      return this.menu.find('input').filter(':checked');
    },

    getUnchecked: function() {
      return this.menu.find('input').not(':checked');
    },

    destroy: function() {
      // remove classes + data
      $.Widget.prototype.destroy.call(this);

      // unbind events
      $doc.unbind(this._namespaceID);
      $(this.element[0].form).unbind(this._namespaceID);

      this.button.remove();
      this.menu.remove();
      this.element.show();

      return this;
    },

    isOpen: function() {
      return this._isOpen;
    },

    widget: function() {
      return this.menu;
    },

    getButton: function() {
      return this.button;
    },

    getMenu: function() {
      return this.menu;
    },

    getLabels: function() {
      return this.labels;
    },

    /*
    * Adds an option to the widget and underlying select
    * attributes: Attributes hash to add to the option
    * text: text of the option
    * groupLabel: Option Group to add the option to
    */
    addOption: function(attributes, text, groupLabel) {
      var $option = $("<option/>").attr(attributes).text(text);
      var optionNode = $option.get(0);
      if(groupLabel) {
        this.element.children("OPTGROUP").filter(function() {
          return $(this).prop("label") === groupLabel;
        }).append($option);
        this.menu.find(".ui-multiselect-optgroup").filter(function() {
          return $(this).find("a").text() === groupLabel;
        }).append(this._makeOption(optionNode));
      } else {
        this.element.append($option);
        this.menu.find(".ui-multiselect-checkboxes").append(this._makeOption(optionNode));
      }
      //update cached elements
      this.labels = this.menu.find('label');
      this.inputs = this.labels.children('input');
    },

    removeOption: function(value) {
      if(!value) {
        return;
      }
      this.element.find("option[value=" + value + "]").remove();
      this.labels.find("input[value=" + value + "]").parents("li").remove();

      //update cached elements
      this.labels = this.menu.find('label');
      this.inputs = this.labels.children('input');
    },

    position: function() {
        //console.error(this.button);
      var pos = {
        my: "top",
        at: "bottom",
        of: this.button
      };
      if(!$.isEmptyObject(this.options.position)) {
        pos.my = this.options.position.my || pos.my;
        pos.at = this.options.position.at || pos.at;
        pos.of = this.options.position.of || pos.of;
      }
      // Sideview Edits - position stuff is great.  Except it fails 
      // with floats.  And we have floats yay.
      if(false && $.ui && $.ui.position) {
        this.menu.position(pos);
      } 
      // Note that we also have to turn off position:relative on viewHeader
      // for this to work.
      else {
        pos = this.button.position();
        pos.top += this.button.outerHeight(false);
        this.menu.offset(pos);
      }
    },

    // react to option changes after initialization
    _setOption: function(key, value) {
      var menu = this.menu;

      switch(key) {
        case 'header':
          if(typeof value === 'boolean') {
            this.header[value ? 'show' : 'hide']();
          } else if(typeof value === 'string') {
            this.headerLinkContainer.children("li:not(:last-child)").remove();
            this.headerLinkContainer.prepend("<li>" + value + "</li>");
          }
          break;
        case 'checkAllText':
          menu.find('a.ui-multiselect-all span').eq(-1).text(value);
          break;
        case 'uncheckAllText':
          menu.find('a.ui-multiselect-none span').eq(-1).text(value);
          break;
        case 'height':
          this.options[key] = value;
          this._setMenuHeight();
          break;
        case 'minWidth':
        case 'menuWidth':
          this.options[key] = value;
          this._setButtonWidth();
          this._setMenuWidth();
          break;
        case 'selectedText':
        case 'selectedList':
        case 'noneSelectedText':
          this.options[key] = value; // these all needs to update immediately for the update() call
          this.update();
          break;
        case 'classes':
          menu.add(this.button).removeClass(this.options.classes).addClass(value);
          break;
        case 'multiple':
          menu.toggleClass('ui-multiselect-single', !value);
          this.options.multiple = value;
          this.element[0].multiple = value;
          this.uncheckAll();
          this.refresh();
          break;
        case 'position':
          this.position();
          break;
        case 'selectedListSeparator':
          this.options[key] = value;
          this.update(true);
          break;
      }

      $.Widget.prototype._setOption.apply(this, arguments);
    }
  });

})(jQuery);

