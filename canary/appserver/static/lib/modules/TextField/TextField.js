// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class TextField extends Module {


    constructor(container, params) {
        super(container, params);
        this.ENTER_OR_SUBMIT_KEY_CODE = 13
        this.INVARIANT_KEYS = {
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
        };

        this.name = this.getParam("name");

        this.checkConfig();
        this.pushDownstreamOnEnter = this.getParam("pushDownstreamOnEnterKey")=="True"? true: false;

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

    }

    checkConfig() {
        if (this.name=="search") {
            Sideview.broadcastMessage("error", " Greetings Intrepid Canary Developer - you do not want to set the name param of the " + this.moduleId + " module to 'search' as this will disrupt how searches and search results are passed downstream.");
        }

        var rowsInt = parseInt(this.getParam("rows"),10);
        if (rowsInt!=this.getParam("rows")) {
            alert("VIEW IS MISCONFIGURED - TextField module has a rows param but the value must be an integer. here it is set to \"" + this.getParam("rows") + "\"");
        }
        else if (rowsInt<1) {
            alert("VIEW IS MISCONFIGURED - TextField module has a rows param but the value must be greater than 0. here it is set to \"" + this.getParam("rows") + "\"");
        }
    }

    resetToDefault() {
        this.input.val(this.getParam("default"));
    }

    resetUI() {}

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
        this.input.val(value);
    }

    /**
     * called when a module from upstream changes the context data
     */
    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        Sideview.applyCustomCssClass(this,context);
        if (context.has(this.name)) {
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
     * called when a module from downstream requests new context data
     */
    getModifiedContext(context) {
        context = context || this.getContext();
        var template = this.getParam("template");
        var rawValue = this.input.val() || "";

        context.set(this.name + ".element", Sideview.makeUnclonable(this.input));
        // we do not backslash escape rawValue, because we assume it is NOT
        // destined for searches.  rawValue is for QS args and for labels.
        context.set(this.name + ".rawValue", rawValue);

        var templatizedValue = Sideview.safeTemplatize(context, template, this.name, rawValue);

        context.set(this.name + ".value", templatizedValue);
        context.set(this.name, templatizedValue);
        return context;
    }

    /**
     * These 3 are designed to be implemented using a customBehavior.
     */
    validate() {return true;}
    onValidationPass() {}
    onValidationFail() {}

    isReadyForContextPush() {
        try {
            if (this.validate()) {
                this.onValidationPass();
                return this.CONTINUE;
            }
            else {
                console.error(this.moduleType + " custom validation fails");
                return this.CANCEL;
            }
        }
        catch(e) {
            console.error(e);
        }
        console.warn(this.moduleType + " validation failure. Blocking a downstream push");
        this.onValidationFail();
        return this.CANCEL;
    }

    onPassiveChange() {
        var context = this.getContext();
        if (context.has("sideview.onEditableStateChange")) {
            var currentValue = this.input.val();
            if (this.lastEdit==null || currentValue!=this.lastEdit) {
                var callback = context.get("sideview.onEditableStateChange");
                callback(this.name, currentValue, this);
                this.lastEdit = currentValue;
            }
        }
    }

    onBlur(evt) {
        this.onPassiveChange();
    }

    onPaste(evt) {
        // if it's ctrl-V the onKeyUp will have taken care of it.
        // this is to take care of right-click and 'Edit' menu pastes.
        if(!evt.keyCode) {
            setTimeout(function() {
                this.onPassiveChange();
                this.pseudoPush();
            }.bind(this), 0);
        }
    }

    onKeyDown(evt) {
        // detect enter key and return key (both keycode 13)
        if (this.pushDownstreamOnEnter && (evt.keyCode == this.ENTER_OR_SUBMIT_KEY_CODE && !evt.shiftKey)) {
            evt.preventDefault();
            this.onPassiveChange();
            this.pushDownstream();
            return false;
        }
    }

    onKeyUp(evt) {
        if (!this.INVARIANT_KEYS.hasOwnProperty(evt.keyCode)) {
            this.pseudoPush();
        }
    }

    /**
many cases have been improved with pseudoPush, but a core Catch 22 remains.
Say you have TextField A, Search, Pulldown, TextField B,
Button. The user changes a value in TextField A, then
focuses into TextField B and hits return.
the pseudoPush will catch it and A's change is incorporated. All is well.

Now say you have TextField A, TextField B, another module C that
creates a third key out of those two, and a Button.
Change in A, then focus away and click the button.
in SVU there was this other layer of "staleness" hackery that would have
caught it.  In canary this is an error state.  The key that C creates
never has an opportunity get updated.

*/

    pseudoPush() {
        var modCon = this.getModifiedContext();
        var key = this.name;
        var value = modCon.get(key);
        var rawKey = this.name + ".rawValue";
        var rawValue = modCon.get(rawKey);
        this.withEachDescendant(function (module) {
            // propagate down until we get to a module that actually sets the same name
            // it's a little weird that we step over all the dispatched searches but, it's a feature
            // a more paranoid fix would be to actually call child.getContext(), pass it to
            // child.getModifiedContext(), and then see if the modifiedContext has the value in the
            // same key and call it a win.  but... there are many other paranoias like
            // like 'does it squirrel away the old value somewhere such that we should all
            // onContextChange quietly?'
            if (module.getParam("name") == key) return false;
            if (module.baseContext) {
                // do we make an onPassiveContextChange ?   so ValueSetters that INCORPORATE these
                // keys can quietly go and call their own onContextChange or something?
                module.baseContext.set(key,value);
                module.baseContext.set(rawKey,rawValue);
            }
        });
    }

    /**
     * called when a module receives new context data from downstream.
     * This is rare, and only happens in configurations where custom behavior
     * logic is sending values upstream during interactions, for TextField
     * and Pulldown instances to 'catch'.
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
}
    return TextField;



});