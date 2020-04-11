// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.Button = $.klass(Splunk.Module, {
    
    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        this.allowSoftSubmit = Splunk.util.normalizeBoolean(this.getParam("allowSoftSubmit"));
        this.open = this.allowSoftSubmit;
        this.useMetaKey = /mac/.test(navigator.userAgent.toLowerCase())
        var selector = (this.getParam("label")) ? "button.splButton-primary" : "input.searchButton";
        this._submitButton = $(selector, this.container);
        this._submitButton.click(function(evt) {
            this.modifierKeyHeld = this.isModifierKeyHeld(evt);
            if (this.customClickHandler()) {
                this.open = true;
                this.pushContextToChildren();
                this.open = this.allowSoftSubmit;
            }
            this.modifierKeyHeld = false;
        }.bind(this));
        Sideview.utils.applyCustomProperties(this);

    },

    customClickHandler: function() {return true},

    resetUI: function() {},

    isModifierKeyHeld: function(evt) {
        return this.useMetaKey ? evt.metaKey : evt.ctrlKey;
    },

    getAutoSubmit: function() {
        var p = this.getParam("allowAutoSubmit");
        if (p.indexOf("$")!=-1) {
            p = Sideview.utils.replaceTokensFromContext(p, this.getContext());
        }
        return Splunk.util.normalizeBoolean(p);
    },

    isReadyForContextPush: function() {
        // if we're still loading the page then we return the autoSubmit value.
        if (!this.isPageLoadComplete()) {
            return this.getAutoSubmit() ? Splunk.Module.CONTINUE : Splunk.Module.CANCEL;
        } 
        // odd case, but autoRun pushes are *after* pageload, and setting the 
        // open flag right in the constructor would require access to the 
        // context...   Fortunately we can hardwire it.
        else if (Splunk.util.normalizeBoolean(this.getParam("autoRun"))) {
            return Splunk.Module.CONTINUE;
        }
        return this.open ? Splunk.Module.CONTINUE : Splunk.Module.CANCEL;
    },

    pushContextToChildren: function($super, explicitContext) {
        var retVal = $super(explicitContext);
        var isReady = this.isReadyForContextPush();
        if (isReady == Splunk.Module.CONTINUE) {
            this.showDescendants(this.DOWNSTREAM_VISIBILITY_MODE + this.moduleId);
        } 
        else if (isReady==Splunk.Module.CANCEL) {
            this.withEachDescendant(function(downstreamModule) {
                downstreamModule.markPageLoadComplete();
            });
        }
        return retVal;
    },

    onContextChange: function() {
        var label = this.getParam("label");
        var context = this.getContext();
        if (label) {
            label = Sideview.utils.replaceTokensFromContext(label, context);
            $("button", this.container).text(label);
        }
        Sideview.utils.applyCustomCssClass(this,context);
    },

    getModifiedContext: function() {
        var context = this.getContext();
        if (this.modifierKeyHeld) context.set("click.modifierKey", this.modifierKeyHeld);
        var button = $("button", this.container);
        context.set("click.selectedElement",Sideview.utils.makeUnclonable(button));
        return context;
    },

    _fireDispatchSuccessHandler: function($super,runningSearch) {
        this.open = true;
        var retVal = $super(runningSearch);
        this.open = this.allowSoftSubmit;
        return retVal;
    }
});
