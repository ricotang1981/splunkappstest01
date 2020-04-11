

// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.
Splunk.Module.ValueSetter = $.klass(Splunk.Module, {

    initialize: function($super, container) {
        $super(container);
        this.childEnforcement = Splunk.Module.ALWAYS_REQUIRE;
        this.logger = Sideview.utils.getLogger();
        this.mode = this.getParam("requiredKeysMode") || this.getParam("mode");

        this.requiredKeys  = this.getArrayParam("requiredKeys");
        this.urlEncodeKeys  = this.getArrayParam("urlEncodeKeys");
        this.backslashKeys  = this.getArrayParam("backslashEscapeKeys");

        this.parseDynamicValues();
        this.checkConfig();
        this.allowClobber = Sideview.utils.normalizeBoolean(this.getParam("allowClobber"));
        this.modifyingContext = true;

        Sideview.utils.applyCustomProperties(this);
    },

    /**
     * Check for configuration errors. 
     * In healthy cases this adds basically nothing to initialization time. 
     * measure it for yourself if you don't believe.
     */
    checkConfig: function() {
        if (this.mode=="OR" && this.requiredKeys.length==0) {
            this.displayInlineErrorMessage('ERROR - ValueSetter is configured with requiredKeysMode "OR" but has no requiredKeys set');
        }
        if (this.argStarValues.length==0) {
            // Be careful to check for this._params.hasOwnProperty, not getParam. 
            // The value itself will eval to false in clobbering use cases.
            if (this.conditionalValues.length==0 && !this._params.hasOwnProperty("value")) {
                this.displayInlineErrorMessage('ERROR - ValueSetter is configured with neither a "value" param, nor an "if.*" param. See docs');
            }
            if (this.conditionalValues.length>0 && this._params.hasOwnProperty("value")) {
                this.displayInlineErrorMessage('ERROR - ValueSetter configured with one or more "if.*" params, and also a "value" param. This is not supported. See docs.');
            }
        }
        else {
            if (this.conditionalValues.length>0) {
                this.displayInlineErrorMessage('ERROR - ValueSetter cannot have "arg.*" params and also conditional "if.*" params. Conditional logic can only be used when using the "name" param.');
            }
            if (this.getParam("name") || (this._params.hasOwnProperty("value"))) {
                this.displayInlineErrorMessage('ERROR - ValueSetter cannot have both "arg.*" params and also the simple "name" and "value" params.". ');
            }
        }

        if (this.conditionalValues.length>1) {
            for (var i=0,len=this.conditionalValues.length;i<len;i++) {
                if (!this.conditionalValues[i].hasOwnProperty("priority")) {
                   this.displayInlineErrorMessage('ERROR - ValueSetter has more than one if.* params, but the priority flags are not set.  Append [priority=N] to each if.* param name. eg priority=1 will supercede priority=2');
                }
            }
        }
    },

    resetUI: function() {},

    getParam: function($super, name) {
        if (name=="delim" || name=="outerTemplate") {
            var orig = $super(name);
            if (!orig) return orig;
            return Sideview.utils.replacePlusSigns(orig);
        }
        return $super(name);
    },
    
    /** 
     * certain ValueSetter params can be set as comma-separated strings. 
     * given a param name, this function returns the array value.
     */
    getArrayParam: function(name) {
        var value = this.getParam(name);
        if (!value) return [];
        var arr = value.toString().split(",");
        for (var i=0,len=arr.length; i<len; i++) {
            arr[i] =  $.trim(arr[i]);
        }
        return arr;
    },
    
    /**
     * given a paramName matching the conditional argument format,
     * returns a dictionary with expressionKey, expressionValue, value, and 
     * optional "priority" flag.
     *
     */
    getExpressionDict: function(paramName) {
        var expression = paramName.replace("if.","");
        expression = expression.replace("==","=");
        var priority=false;
        var squareBracketIndex = expression.indexOf("[");
        
        // look for priority flag, and remove it from expression if found.
        if (squareBracketIndex!=-1) {
            priority = expression.substring(squareBracketIndex+1);
            expression = expression.substring(0,squareBracketIndex);
            if (priority.indexOf("]")!=-1) {
                priority = priority.substring(0,priority.indexOf("]"));
                priority= Sideview.utils.stringToDict(priority);
                if (priority.hasOwnProperty("priority")) {
                    priority = priority.priority;
                } else {
                    this.displayInlineErrorMessage('ERROR: ValueSetter configured with malformed priority syntax - ' + paramName);
                }
            } else {
                this.displayInlineErrorMessage('ERROR: ValueSetter configured with malformed priority syntax - ' + paramName);
            }
        }
        var pair = expression.split("=");
        if (expression.indexOf(" OR ")!=-1 ||
            expression.indexOf(" AND ")!=-1 ||
            pair.length!=2) {
            this.displayInlineErrorMessage('ERROR: ValueSetter configured with unsupported boolean syntax. Only simple foo=$bar$ syntax is supported. See docs.');
            return false;
        }
        var dict = {
            "expressionKey":pair[0],
            "expressionValue":pair[1],
            "value":this._params[paramName]
        };
        if (priority) {
            dict.priority = priority;
        }
        return dict
    },

    /**
     * used to sort multiple "if.*" params into priority order.
     */
    priorityComparator: function(a,b) {
        if (a.priority < b.priority) return -1;
        if (a.priority > b.priority) return 1;
        return 0;
    },
    
    /**
     * single pass function to process both "if.*" and "arg.*" params during 
     * initialization
     */
    parseDynamicValues: function() {
        var conditionalValues= [];
        var argStarValues = [];
        var name,value;
        for (name in this._params) {
            if (this._params.hasOwnProperty(name) && name.indexOf("if.")==0) {
                var dict = this.getExpressionDict(name);
                if (dict) {
                    conditionalValues.push(dict);
                }
            }
            else if (name.indexOf("arg.")==0 && this._params.hasOwnProperty(name)) {
                value = this._params[name];
                name = name.replace("arg.","");
                argStarValues.push({"name":name,"value":value});
            }
        }
        conditionalValues.sort(this.priorityComparator);
        this.conditionalValues = conditionalValues;
        this.argStarValues     = argStarValues;
    },

    displayInlineErrorMessage: function($super,message) {
        this.container.css("height","auto");
        return $super(message);
    },

    allRequiredKeysPresent: function(context) {
        var matches = 0;
        for (var i=0,len=this.requiredKeys.length; i<len; i++) {
            if (context.has(this.requiredKeys[i]) && context.get(this.requiredKeys[i])!="") {
                matches++;
            }
        }
        if ((this.mode=="OR" && matches==0) || (this.mode=="AND" && matches<this.requiredKeys.length)) {
            return false;
        }
        return true;
    },

    onContextChange: function() {
        var context = this.getContext();
        var name = Sideview.utils.replaceTokensFromContext(this.getParam("name"), context);
        
        // optimization - if we're configured NOT to allow clobbering, and we 
        // are in single-value mode, and we have a value from above.
        if (!this.allowClobber && this.argStarValues.length==0 && context.has(name) && context.get(name)!="") {
            this.modifyingContext = false;
            this.setChildContextFreshness(false);
        } else {
            this.modifyingContext = true;
        }
    },
    
    /**
     * responsible for getting the single output value,  when we are NOT 
     * in arg.* mode.  Also runs conditionals and default params.
     */
    getSingleValue: function(encodedContext) {
        var dict,name,value
        if (this.conditionalValues.length>0) {
            for (var i=0,len=this.conditionalValues.length;i<len;i++) {
                var dict = this.conditionalValues[i];
                expressionKey = Sideview.utils.replaceTokensFromContext(dict["expressionKey"],encodedContext);
                expressionValue = Sideview.utils.replaceTokensFromContext(dict["expressionValue"],encodedContext);
                if (expressionValue=="*" && expressionKey || expressionKey == expressionValue) {
                    return Sideview.utils.replaceTokensFromContext(dict["value"],encodedContext);
                }
            }
            if (this.getParam("default")) {
                return Sideview.utils.replaceTokensFromContext(this.getParam("default"),encodedContext);
            }
        }
        else {
            return Sideview.utils.replaceTokensFromContext(this.getParam("value"), encodedContext);
        }
    },

    getEncodedAndAugmentedContext: function(context) {
        var search = context.get("search");
        // encoding and special keys are only applied to a cloned copy of 
        // the context that we use to calculate the value, because we don't 
        // want to pass any of these modified keys downstream.
        var encodedContext = context.clone();
        
        if (typeof(search=="object")) {
            Sideview.utils.setStandardTimeRangeKeys(encodedContext,false,search);
            Sideview.utils.setStandardJobKeys(encodedContext,false,search);
        }
        Sideview.utils.withEachContextValue(encodedContext, this.urlEncodeKeys, function(value) {
            return encodeURIComponent(value)
        });
        Sideview.utils.withEachContextValue(encodedContext, this.backslashKeys, function(value) {
            return Sideview.utils.escapeForSearchLanguage(value);
        });
        return encodedContext;
    },

    getDelim: function() {
        var delim = this.getParam("delim");
        if (delim) {
            // solution to the annoying problem where whitespace in params will 
            // be thrown away, which means you can't have carriage return 
            // as your delim.   We look for a literal "\n" here. 
            delim = delim.replace(/\\n/g,"\n");
        }
        return delim;
    },

    /** 
     * responsible for all logic about what keys and values we're actually 
     * writing to getModifiedContext, as well as what encodings and 
     * escapings and $foo$-substitution keys and values might have.
     * returns a list of 2-element lists,  [name,value]
     */
    getFinalContextKeys: function(context) {
        var encodedContext = this.getEncodedAndAugmentedContext(context);
        
        var kvPairs = [];
        var delim = this.getDelim();
        
        if (this.argStarValues.length>0) {
            var name,value;
            for (var i=0,len=this.argStarValues.length;i<len;i++) {
                // Note that for name, we draw from the unencoded Context. 
                name  =Sideview.utils.replaceTokensFromContext(this.argStarValues[i].name,context);
                if (!this.allowClobber && context.has(name) && context.get(name)!="") {
                    continue;
                }
                value =Sideview.utils.replaceTokensFromContext(this.argStarValues[i].value,encodedContext);
                if (delim) {
                    value = value.split(delim);
                }
                kvPairs.push([name,value]);
            }
        } else {
            // Note that for name, we draw from the unencoded Context.
            var name  = Sideview.utils.replaceTokensFromContext(this.getParam("name"), context);
            var value = this.getSingleValue(encodedContext);
            if (delim) {
                value = value.split(delim);
            }
            if (name && name!="") {
                kvPairs.push([name,value]);
            }
        }
        return kvPairs;
    },

    /**
     * Modifies the context so as to add in one or more string-valued keys.
     * For every $foo$ token found in these key names or key values , if 
     * there is a matching value in the context as set by all modules 
     * upstream, those dynamic values will be substituted into the string(s).
     */
    getModifiedContext: function(context) {
        context = context || this.getContext();
        if (!this.modifyingContext) return context;

        if (!this.allRequiredKeysPresent(context)) return context;
        
        var kvPairs = this.getFinalContextKeys(context);
        for (var i=0,len=kvPairs.length;i<len;i++) {
            context.set(kvPairs[i][0],kvPairs[i][1]);
        }
        return context;
    }
});
