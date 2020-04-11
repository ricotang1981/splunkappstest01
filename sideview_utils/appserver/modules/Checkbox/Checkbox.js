// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.Checkbox= $.klass(Splunk.Module, {

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        this.name = this.getParam("name");
        
        this.hasClearedURLLoader = false;

        this.input = $('input', this.container)
        if ($.browser.msie) {
            this.input.bind("click", this.onChange.bind(this));
        } else {
            this.input.bind("change", this.onChange.bind(this));
        }
        
        this.setFloatingBehavior();
        
        this.checkConfig();
        
        this.changeEventsAreReal = true;
        Sideview.utils.applyCustomProperties(this);
    },

    resetToDefault: function() {
        var value = Sideview.utils.normalizeBoolean(this.getParam("checked"));
        this.changeEventsAreReal = false;
        if (value) {
            this.input.attr('checked', "checked");
        } else {
            this.input.removeAttr('checked')
        }
        this.changeEventsAreReal = true;
    },

    resetUI: function() {},
    

    /**
     * overall function to check for configuration errors.
     */
    checkConfig: function() {
        if (!this.getParam("onValue") && !this.getParam("offValue")) {
            this.displayInlineErrorMessage("Configuration error. The Checkbox module is configured with null values in both the onValue and offValue params");
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

    setToContextValue: function(context) {
        var value = Sideview.utils.getValueForFormElementSelection(this.name,context);
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
    },

    /**
     * called when a module from upstream changes the context data
     */
    onContextChange: function() {
        var context = this.getContext();
        Sideview.utils.applyCustomCssClass(this,context);
        this.setToContextValue(context);
        this.clearURLLoader(context);
        
        // if the label param contains $foo$ tokens we rewrite the label accordingly
        if (this.getParam("label") && this.getParam("label").indexOf("$")!=-1) {
            var labelTemplate = this.getParam("label") || "";
            $("label", this.container).text(Sideview.utils.replaceTokensFromContext(labelTemplate, context));
        }
    },

    /**
     * called when a module from downstream requests new context data
     */
    getModifiedContext: function(context) {
        var context = context || this.getContext();

        context.set(this.name + ".label", $('option:selected', this.input).text());
        context.set(this.name + ".element", Sideview.utils.makeUnclonable(this.input));
        
        var value = (this.input.is(':checked'))? this.getParam("onValue")||"" : this.getParam("offValue")||"";
        
        value = Sideview.utils.replaceTokensFromContext(value, context);
        
        context.set(this.name + ".value", value);
        context.set(this.name + ".rawValue", value);
        context.set(this.name, value);
        return context;
    },

    onPassiveChange: function() {
        var context = this.getContext();
        if (context.has("sideview.onEditableStateChange")) {
            var callback = context.get("sideview.onEditableStateChange");
            // dont pass booleans because compareObjects will fail.
            var stringValue = (this.input.is(':checked')) ? this.getParam("onValue") : this.getParam("offValue");
            callback(this.name, stringValue, this);
        }
    },

    /**
     * called when the user changes the pulldown's selected value.
     */
    onChange: function(evt) {
        if (!this.changeEventsAreReal) return;
        if (this.isPageLoadComplete()) {
            this.onPassiveChange();
            this.pushContextToChildren();
        }
        this.clearURLLoader();
    },

    pushContextToChildren: function($super, explicitContext) {
        /*
        To whomever it may concern: 
        There is a bug in AbstractModule._fireDispatch. 
        ( Filed with splunk as case # 56814 )
        Look at what it is doing with dispatchAlreadyInProgress. 
        Although this means well, if the user dispatches search A, and then 
        before the POST from A returns, they click a checkbox or change a 
        pulldown option, the resulting push to kickoff search B will die. 
        This is much easier to notice in the Checkbox because you can click 
        it so much faster than you can change a Pulldown or TextField.
        The intention of the code was to prevent *redundant* searches from 
        getting dispatched before the POST returns.  However a) it doesnt 
        check for redundancy, and b) at least with sideview modules I cannot
        find any cases where there are any storms of redundant pushes. 
        Therefore the check seems like it might be useless.

        Proceeding under the assumption that it is,  I reset the flag below.
        */
        this.withEachDescendant(function(module) {
            module.dispatchAlreadyInProgress = false;
        });
        return $super(explicitContext);
    },

    /**
     * called when a module receives new context data from downstream. 
     * This is rare, and only happens in configurations where custom behavior
     * logic is sending values upstream during interactions, for module 
     * instances to 'catch'. 
     */
    applyContext: function(context) {
        if (!this.isPageLoadComplete()) {
            this.logger.error(this.moduleType + " is not designed to work with the oldschool Search resurrection system.");
        }

        if (this.isPageLoadComplete() && context.has(this.name)) {
            this.setToContextValue(context);

            this.onPassiveChange();

            context.remove(this.name);
            if (Sideview.utils.contextIsNull(context)) {
                this.pushContextToChildren();
                // stop the upward-travelling context.
                return true;
            }
         }
     }

});
