// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.TextField= $.klass(Splunk.Module, {

    invariantKeys: {
        9:  "TAB",
        13: "ENTER",
        27: "ESCAPE",
        40: "DOWN_ARROW",
        16: "SHIFT",
        17: "CTRL",
        18: "ALT",

        33: "PGUP",
        34: "PGDN",
        35: "END",
        36: "HOME",
        37: "LEFT_ARROW",
        38: "UP_ARROW",
        39: "RIGHT_ARROW"
    },

    initialize: function($super, container) {
        $super(container);
        
        this.logger = Sideview.utils.getLogger();
        this.name = this.getParam("name");
        if (this.name=="search") alert(this.moduleType + " Error - you do not want to set the name param to 'search' as this will disrupt how searches and search results are passed downstream.");

        if (this.getParam("float")) {
            $(container).css("margin-right", "10px");
            $(container).css("float", this.getParam("float"));
        }
        this.checkConfig();
        if (this.getParam("rows")=="1") {
            this.input = $('input', this.container)
        } 
        else {
            this.input = $('textarea', this.container);
        }
        this.input
            // chrome does really weird thing when you use the back button.
            // nonsensical values appear from nowhere. Null them out.
            .val(this.getParam("default"))
            .bind("keydown",  this.onKeyDown.bind(this))
            .bind("keyup", this.onKeyUp.bind(this))
            .bind("blur",  this.onBlur.bind(this))
            .bind('paste', this.onPaste.bind(this));
        
        Sideview.utils.applyCustomProperties(this);
    },

    checkConfig: function() {
        var rowsInt = parseInt(this.getParam("rows"),10);
        if (rowsInt!=this.getParam("rows")) {
            alert("VIEW IS MISCONFIGURED - TextField module has a rows param but the value must be an integer. here it is set to \"" + this.getParam("rows") + "\"");
        }
        else if (rowsInt<1) {
            alert("VIEW IS MISCONFIGURED - TextField module has a rows param but the value must be greater than 0. here it is set to \"" + this.getParam("rows") + "\"");
        }
    },

    resetToDefault: function() {
        this.input.val(this.getParam("default"));
    },

    resetUI: function() {},

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
        this.input.val(value);
    },

    /**
     * called when a module from upstream changes the context data
     */
    onContextChange: function() {
        var context = this.getContext();
        Sideview.utils.applyCustomCssClass(this,context);
        if (context.has(this.name)) {
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
     * called when a module from downstream requests new context data
     */
    getModifiedContext: function() {
        var context = this.getContext();
        var template = this.getParam("template");
        var rawValue = this.input.val() || "";

        context.set(this.name + ".element", Sideview.utils.makeUnclonable(this.input));
        // we do not backslash escape rawValue, because we assume it is NOT 
        // destined for searches.  rawValue is for QS args and for labels.
        context.set(this.name + ".rawValue", rawValue);
        
        var templatizedValue = Sideview.utils.safeTemplatize(context, template, this.name, rawValue);

        context.set(this.name + ".value", templatizedValue);
        context.set(this.name, templatizedValue);
        return context;
    },

    /**
     * These are designed to be implemented using a customBehavior.
     */
    validate: function() {return true;},
    onValidationPass: function() {},
    onValidationFail: function() {},

    isReadyForContextPush: function($super) {
        if (!$super()) return false;
        var validation = this.validate();
        if (validation) {
            this.onValidationPass();
            return $super();
        }
        else {
            this.onValidationFail();
            return Splunk.Module.CANCEL;
        }
    },

    onPassiveChange: function() {
        var context = this.getContext();
        if (context.has("sideview.onEditableStateChange")) {
            var currentValue = this.input.val();
            if (this.lastEdit==null || currentValue!=this.lastEdit) {
                var callback = context.get("sideview.onEditableStateChange");
                callback(this.name, currentValue, this);
                this.lastEdit = currentValue;
            }
        }
    },

    onBlur: function(evt) {
        this.onPassiveChange();
    },

    onPaste: function(evt) {
        // if it's ctrl-V the onKeyUp will have taken care of it. 
        // this is to take care of right-click and 'Edit' menu pastes.
        if(!evt.keyCode) {
            setTimeout(function() {
                this.onPassiveChange();
                this.pseudoPush();
            }.bind(this), 0);
        }
    },

    onKeyDown: function(evt) {
        // detect enter key
        if (this.getParam("rows")==1 && evt.keyCode == 13) {
            evt.preventDefault();
            this.onPassiveChange();
            this.pushContextToChildren();
            return false;
        }
    },

    onKeyUp: function(evt) {
        if (!this.invariantKeys.hasOwnProperty(evt.keyCode)) {
            this.pseudoPush();
        } 
    },

    pseudoPush: function() {
        // Note that setChildContextFreshness does basically nothing when you 
        // have a dispatched search.  Nate was right. There's a catch-22 here.
        // see comments at the end of the file. 
        this.setChildContextFreshness(false);
        var modCon = this.getModifiedContext();
        var elementKey = this.name + ".element";
        var element = modCon.get(elementKey);
        var key = this.name;
        var value = modCon.get(key);
        var rawKey = this.name + ".rawValue";
        var rawValue = modCon.get(rawKey);
        this.withEachDescendant(function (module) {
            if (module.baseContext) {
                var modElt = module.baseContext.get(elementKey)
                if (modElt && modElt.attr && modElt.attr("id") == element.attr("id")) {
                    module.baseContext.set(key,value);
                    module.baseContext.set(rawKey,rawValue);
                } else return false;
            }
        });
    },

    pushContextToChildren: function($super, explicitContext) {
        /* see notes in Checkbox.js */
        this.withEachDescendant(function(module) {
            module.dispatchAlreadyInProgress = false;
        });
        return $super(explicitContext);
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

// many cases have been improved with pseudoPush, but a core Catch 22 remains. 
//
// Say you have TextField A, Search, Pulldown, TextField B, 
// Button. The user changes a value in TextField A, then 
// focuses into TextField B and hits return. 
// the pseudoPush will catch it and A's change is incorporated. All is well. 
//
// Now say you have TextField A, TextField B, a customBehavior C that 
// creates a third key out of those two, and a Button. 
// Change in A, then focus away and click the button. 
// the staleness flag will make the customBehavior logic rerun. All is well. 
//
// Now say you have TextField A, TextField B, Search, Pulldown, 
// CustomBehavior C, Button  (phew). 
// and lets say the Pulldown has already been populated by autoRun.
// user types into TextField A, then clicks Button. 
// the pseudoPush will have pushed the A value all the way down. 
// but the staleness check that looks up from the button wont be able to 
// get past the dispatched search that the Pulldown is using. 
// end result is that A's change is not incorporated.
// 
// WORKAROUND --  There's a lame fix, and that's to always keep 
// CustomBehaviors pushed down so that they are themselves below the button
// or more generally below the problematic pushes.
// in some cases you have to actually duplicate the CustomBehavior
// module to constantly regenerate the second-order keys to clobber
// the stale second-order keys.


