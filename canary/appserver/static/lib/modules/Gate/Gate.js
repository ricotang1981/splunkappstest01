// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class Gate extends Module {

    constructor(container, params) {
        super(container, params);
        this.id = this.getParam("id");
        this.to = this.getParam("to");
        this.requiredKeys = Sideview.stringToList(this.getParam("requiredKeys"));
        this.DOWNSTREAM_VISIBILITY_MODE = "GateModuleInteractionValidity_";
        this.checkConfig();
        this._gateChildren = [];
    }

    checkConfig() {
        if (!Sideview.hasOwnProperty("gateIds")) {
            Sideview.gateIds = {};
        }
        if (this.id) {
            if (this.to) {
                alert("Gate module misconfiguration. A Gate cannot have both a 'to' and an 'id' attribute.  (id='" + this.id + "' to='" + this.to + "')");
            }
            if (Sideview.gateIds.hasOwnProperty(this.id)) {
                alert("Gate module misconfiguration. Two Gate modules in the same view cannot have the same id attribute (id = '" + this.id + "')");
            }
            Sideview.gateIds[this.id] = this;
        }
    }

    /**
     * Config checking that can only be done after the hierarchy is complete.
     */

    onHierarchyApplied(statusInt) {
        if (this._children.length>0 && this.to) {
            alert("Gate module misconfiguration. A Gate module cannot have both a 'to' param, and also downstream modules (to='" + this.to + "').");
        }
        if (this._children.length==0 && this.id) {
            alert("Gate module misconfiguration. If a Gate module has an 'id' param then it must also have at least one downstream module (id = '" + this.id + "').");
        }
        if (this.to) {
            if (Sideview.gateIds.hasOwnProperty(this.to)) {
                var gateChild = Sideview.gateIds[this.to];
                this.addGatedChild(gateChild);
            } else {
                alert("Gate module has a 'to' param specifying a Gate id that does not exist on this page.  (to='" + this.to + "').");
            }
        }
        this.hideDescendants(this.DOWNSTREAM_VISIBILITY_MODE + this.moduleId);
    }

    addGatedChild(child) {
        this._gateChildren.push(child);
    }


    /**
     * framework method.  The cancel return in here is how we prevent the
     * push from propagating to the downstream modules.
     */
    isReadyForContextPush() {
        if (this.requiredKeys.length>0) {
            var context = this.getContext();
            for (var i=0;i<this.requiredKeys.length;i++) {
                if (!context.get(this.requiredKeys[i])) {
                    return this.CANCEL;
                }
            }
        }
        return this.CONTINUE;
    }

    pushDownstream(pageIsLoading) {

        var deferreds = [];
        if (this._gateChildren.length>0) {
            var realChildren = this._children;

            //fly my pretties!
            this._children = this._gateChildren;
            $.merge(deferreds, this._pushDownstream(pageIsLoading));

            this._children = realChildren;
        }
        deferreds.push(this._pushDownstream(pageIsLoading));
        return deferreds;
    }

    /**
     * framework method.  Show the downstream modules we have kept hidden
     */
    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        if ((this.requiredKeys.length>0) && (this.isReadyForContextPush()==this.CANCEL)) {
            this.hideDescendants(this.DOWNSTREAM_VISIBILITY_MODE + this.moduleId);
            return;
        }
        this.showDescendants(this.DOWNSTREAM_VISIBILITY_MODE + this.moduleId);
    }

    /**
     * You have to ignore the "to" side or else modules with N drilldown
     * parents will get shown by 1 and hidden by the other N-1.
     */
    hideDescendants(reason) {
        if (this.to) {
            console.warn("Gate module with a 'to' param (" + this.moduleId + ") is ignoring a call to hideDescendants");
            return;
        }
        for (var i=0,len=this._children.length;i<len;i++) {
            this._children[i].hide(reason);
            this._children[i].hideDescendants(reason);
        }
    }

    resetUI() {
        // spare ourselves the unnecessary warns.
        if (!this.to) this.hideDescendants(this.DOWNSTREAM_VISIBILITY_MODE + this.moduleId);
    }

}
    return Gate;

});