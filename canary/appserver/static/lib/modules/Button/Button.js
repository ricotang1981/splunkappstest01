// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class Button extends Module {

    constructor(container, params) {
        super(container, params);
        this.DOWNSTREAM_VISIBILITY_MODE = "Button modules with allowAutoSubmit=false hide children onload moduleId=";
        this.allowSoftSubmit = this.getParam("allowSoftSubmit")=="True";

        this.isWedgedOpen = false;

        this.useMetaKey = /mac/.test(navigator.userAgent.toLowerCase())
        var selector = (this.getParam("label")) ? "button.buttonPrimary" : "input.searchButton";
        this._submitButton = $(selector, this.container);
        this._submitButton.click(this.onButtonClick.bind(this));
    }

    onButtonClick(evt) {
        this.modifierKeyHeld = this.isModifierKeyHeld(evt);
        if (this.customClickHandler()) {
            this.isWedgedOpen = true;
            this.pushDownstream();
            this.isWedgedOpen = false;
        }
        this.modifierKeyHeld = false;
    }


    customClickHandler() {return true}

    resetUI() {}

    isModifierKeyHeld(evt) {
        if (!evt) return false;
        return this.useMetaKey ? evt.metaKey : evt.ctrlKey;
    }

    getAutoSubmit() {
        var p = this.getParam("allowAutoSubmit");
        if (p.indexOf("$")!=-1) {
            p = Sideview.replaceTokensFromContext(p, this.getContext());
        }
        return p=="True";
    }

    isReadyForContextPush() {
        if (!this.isPageLoadComplete()) {
            // note we can't call getAutoSubmit and do $foo$ substitution cause we cant' get a context during page load.
            return (this.getParam("allowAutoSubmit")=="True") ? this.CONTINUE : this.CANCEL;
        }
        if (this.isWedgedOpen) return this.CONTINUE;
        return this.allowSoftSubmit ? this.CONTINUE : this.CANCEL;
    }

    onHierarchyApplied() {
        if (!this.getAutoSubmit()) {
            this.hideDescendants(this.DOWNSTREAM_VISIBILITY_MODE + this.moduleId);
        }
    }

    pushDownstream(pageIsLoading) {
        var isReady = this.isReadyForContextPush();
        if (isReady == this.CONTINUE) {
            this.showDescendants(this.DOWNSTREAM_VISIBILITY_MODE + this.moduleId);
        }
        else if (isReady==this.CANCEL) {
            if (!this.isPageLoadComplete()) {
                this.markPageLoadComplete();
                this.withEachDescendantInDispatchTier(function(downstreamModule) {
                    downstreamModule.markPageLoadComplete();
                });
            }
            return [];
        }
        return this._pushDownstream(pageIsLoading);
    }

    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        var label = this.getParam("label");
        if (label) {
            label = Sideview.replaceTokensFromContext(label, context);
            $("button", this.container).text(label);
        }
        Sideview.applyCustomCssClass(this,context);
    }

    getModifiedContext(context) {
        context = context || this.getContext();
        if (this.modifierKeyHeld) context.set("click.modifierKey", this.modifierKeyHeld);
        var button = $("button", this.container);
        context.set("click.selectedElement", Sideview.makeUnclonable(button));
        return context;
    }

    dispatchSuccess(runningSearch) {
        this.isWedgedOpen = true;
        var retVal = this._dispatchSuccess(runningSearch);
        this.isWedgedOpen = false;
        return retVal;
    }
}
    return Button;

});