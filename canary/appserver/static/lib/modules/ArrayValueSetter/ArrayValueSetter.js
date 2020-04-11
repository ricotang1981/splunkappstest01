// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class ArrayValueSetter extends Module {

    constructor(container, params) {
        super(container, params);
        this.arrayName = this.getParam("array");
        this.nullTemplate = this.getParam("nullTemplate");
        if (this.checkConfig()) {
            this.arrayName = this.arrayName.substring(1,this.arrayName.length-1);
        }
        else {
            this.arrayName="";
        }
    }

    resetUI() {}

    /**
     * Check for common misconfigurations that should be treated as FATAL.
     */
    checkConfig() {
        if (!this.arrayName) {
            alert("ERROR - ArrayValueSetter is configured with no array param");
            return false;
        }
        else if (this.arrayName.charAt(0)!="$" || this.arrayName.charAt(this.arrayName.length-1)!="$") {
            alert("MISCONFIGURED VIEW - ArrayValueSetter's array param must be a single $foo$ token, so the value must begin and end with $ characters. Here it is configured with " + this.arrayName);
            return false;
        }
        return true;
    }

    /**
     * This is a workaround for a shortcoming in Splunk's core systems.
     * See comments on Pulldown.getParam().
     */
    getParam(name) {
        if (name=="delim" || name=="outerTemplate") {
            var orig = this._getParam(name);
            if (!orig) return orig;
            return Sideview.replacePlusSigns(orig);
        }
        return this._getParam(name);
    }

    /**
     * Finds the array value, washes each value in the array through the
     * template param.
     * NOTE that the array values will get backslash-escaped, but that the
     * final templated string will NOT.
     */
    getTemplatedValues(context) {
        var values = context.get(this.arrayName);
        // we're not gonna get very far if there's no array....
        if (!$.isArray(values)) return false;

        var template = this.getParam("template");
        var templatedValues = [];
        var trimWhitespaceFromValues =  (this.getParam("trimWhitespaceFromValues") =="True");
        var value,templatizedValue,template;
        for (var i=0,len=values.length;i<len;i++) {
            value = values[i];
            if (value==null || value=="") {
                if (this.nullTemplate) {
                    template = this.nullTemplate;
                    // a little odd.  but safeTemplatize bails out if you give it nulls or emptystring
                    value="*";
                }
            }
            else {
                template = this.getParam("template");
                if (trimWhitespaceFromValues) {
                    value = $.trim(value);
                }
            }

            // the array values will always get backslash-escaped
            // because we assume it's destined for the Splunk search language

            templatizedValue = Sideview.safeTemplatize(context, template, this.name, value);
            templatedValues.push(templatizedValue);
        }
        return templatedValues;
    }

    /**
     * given the array of templated values, we join them with the separator.
     */
    joinWithSeparators(templatedValues) {
        var separator = Sideview.replacePlusSigns(this.getParam("separator"));
        var joined = templatedValues.join(separator);
        return joined;
    }

    /**
     * Putting it all together.  Take array from upstream,  output a formatted
     * string key for downstream.
     */
    getModifiedContext(context) {
        context = context || this.getContext();
        var name = Sideview.replaceTokensFromContext(this.getParam("name"), context);
        var templatedValues = this.getTemplatedValues(context);

        // with $foo$ replacement name can be empty.
        // if so, or if there is no array, we do nothing.
        if (!name || !templatedValues) return context;

        var joined = this.joinWithSeparators(templatedValues);
        var output = Sideview.templatize(context, this.getParam("outerTemplate"), name, joined);
        context.set(name,output);
        return context;
    }
}
    return ArrayValueSetter;

});