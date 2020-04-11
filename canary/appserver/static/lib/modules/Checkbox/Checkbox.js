// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class Checkbox extends Module {

    constructor(container, params) {
        super(container, params);
        this.name = this.getParam("name");

        this.hasClearedURLLoader = false;

        this.input = $('input', this.container)
        if (Sideview.isIE()) {
            this.input.bind("click", this.onChange.bind(this));
        } else {
            this.input.bind("change", this.onChange.bind(this));
        }

        this.checkConfig();

        this.changeEventsAreReal = true;
    }

    resetToDefault() {
        var value = (this.getParam("checked")=="True");
        this.changeEventsAreReal = false;
        if (value) {
            this.input.attr('checked', "checked");
        } else {
            this.input.removeAttr('checked')
        }
        this.changeEventsAreReal = true;
    }

    resetUI() {}


    /**
     * overall function to check for configuration errors.
     */
    checkConfig() {
        if (!this.getParam("onValue") && !this.getParam("offValue")) {
            this.displayInlineErrorMessage("Configuration error. The Checkbox module is configured with null values in both the onValue and offValue params");
        }
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

    setToContextValue(context) {
        var value = Sideview.getValueForFormElementSelection(this.name,context);
        // serialized contexts may have the key there, with a null value.
        // If the Checkbox has only onValue,  this is itself enough to warrant
        // UNCHECKING the checkbox,  even if it has "checked" set to True.
        // Upstream context values always trump local config,  and in this case
        // the null-valued upstream value is to be considered a true value.
        var hasValue = context.has(this.name + ".rawValue")
            || context.has(this.name);
        if (hasValue) {
            this.changeEventsAreReal = false;
            if (value==this.getParam("onValue")) {
                this.input.attr('checked', "checked");
            }
            else if (value==this.getParam("offValue")){
                this.input.removeAttr('checked');
            }
            // easy case to overlook. See testcases.
            // hasValue doesn't mean it's not emptystring-valued.
            else if (!value && !this.getParam("onValue")) {
                this.input.attr('checked', "checked");
            }
            // versions of Checkbox prior to 2.3 had different behavior
            // where true/false were the values serialized into URLs.
            // Even though the old behavior overall is now considered buggy,
            // we maintain the backward compatibility to True/False here.
            else if (value=="true") {
                this.input.attr('checked', "checked");
            }
            else if (value=="false") {
                this.input.removeAttr('checked');
            }
            else {
                this.input.removeAttr('checked');
            }
            // ok, turning the world back on...
            this.changeEventsAreReal = true;
        }
    }

    /**
     * called when a module from upstream changes the context data
     */
    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        Sideview.applyCustomCssClass(this,context);
        this.setToContextValue(context);
        this.clearURLLoader(context);

        // if the label param contains $foo$ tokens we rewrite the label accordingly
        if (this.getParam("label") && this.getParam("label").indexOf("$")!=-1) {
            var labelTemplate = this.getParam("label") || "";
            $("label", this.container).text(Sideview.replaceTokensFromContext(labelTemplate, context));
        }
    }

    /**
     * called when a module from downstream requests new context data
     */
    getModifiedContext(context) {
        context = context || this.getContext();

        context.set(this.name + ".label", $('option:selected', this.input).text());
        context.set(this.name + ".element", Sideview.makeUnclonable(this.input));

        var value = (this.input.is(':checked'))? this.getParam("onValue")||"" : this.getParam("offValue")||"";

        value = Sideview.replaceTokensFromContext(value, context);

        context.set(this.name + ".value", value);
        context.set(this.name + ".rawValue", value);
        context.set(this.name, value);
        return context;
    }

    onPassiveChange() {
        var context = this.getContext();
        if (context.has("sideview.onEditableStateChange")) {
            var callback = context.get("sideview.onEditableStateChange");
            // dont pass booleans because compareObjects will fail.
            var stringValue = (this.input.is(':checked')) ? this.getParam("onValue") : this.getParam("offValue");
            callback(this.name, stringValue, this);
        }
    }

    /**
     * called when the user changes the pulldown's selected value.
     */
    onChange(evt) {
        if (!this.changeEventsAreReal) return;
        if (this.isPageLoadComplete()) {
            this.onPassiveChange();
            this.pushDownstream();
        }
        this.clearURLLoader();
    }


    /**
     * called when a module receives new context data from downstream.
     * This is rare, and only happens in configurations where custom behavior
     * logic is sending values upstream during interactions, for module
     * instances to 'catch'.
     */
    applyContext(context) {
        if (this.isPageLoadComplete() && context.has(this.name)) {
            this.setToContextValue(context);

            this.onPassiveChange();

            context.remove(this.name);
            if (context.isNull()) {
                this.pushDownstream();
                // stop the upward-travelling context.
                return true;
            }
         }
     }

};
    return Checkbox;

});