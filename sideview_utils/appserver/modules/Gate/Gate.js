// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.Gate= $.klass(Splunk.Module, {

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();

        this.id = this.getParam("id");
        this.to = this.getParam("to");
        this.requiredKeys = Sideview.utils.stringToList(this.getParam("requiredKeys"));
        this.DOWNSTREAM_VISIBILITY_MODE = "GateModuleInteractionValidity_";
        this.checkConfig();
        this._gateChildren = [];
        Sideview.utils.applyCustomProperties(this);
    },

    checkConfig: function() {
        if (!Sideview.utils.hasOwnProperty("gateIds")) {
            Sideview.utils.gateIds = {};
        }
        if (this.id) {
            if (this.to) {
                alert("Gate module misconfiguration. A Gate cannot have both a 'to' and an 'id' attribute.  (id='" + this.id + "' to='" + this.to + "')");
            }
            if (Sideview.utils.gateIds.hasOwnProperty(this.id)) {
                alert("Gate module misconfiguration. Two Gate modules in the same view cannot have the same id attribute (id = '" + this.id + "')");
            }
            Sideview.utils.gateIds[this.id] = this;
        }
    },
    
    /**
     * Config checking that can only be done after the hierarchy is complete.
     */
    onLoadStatusChange: function($super,statusInt) {
        if (this._alreadyChecked) return;
        if (statusInt >= Sideview.utils.moduleLoadStates.WAITING_FOR_CONTEXT) {
            if (this._children.length>0 && this.to) {
                alert("Gate module misconfiguration. A Gate module cannot have both a 'to' param, and also downstream modules (to='" + this.to + "').");
            }
            if (this._children.length==0 && this.id) {
                alert("Gate module misconfiguration. If a Gate module has an 'id' param then it must also have at least one downstream module (id = '" + this.id + "').");
            }
            if (this.to) {
                if (Sideview.utils.gateIds.hasOwnProperty(this.to)) {
                    var gateChild = Sideview.utils.gateIds[this.to];
                    this.addGatedChild(gateChild);
                } else {
                    alert("Gate module has a 'to' param specifying a Gate id that does not exist on this page.  (to='" + this.to + "').");
                }
            }
            this.hideDescendants(this.DOWNSTREAM_VISIBILITY_MODE + this.moduleId);
            this._alreadyChecked = true;
        }
    },

    addGatedChild: function(child) {
        this._gateChildren.push(child);
    },
    

    /**
     * framework method.  The cancel return in here is how we prevent the 
     * push from propagating to the downstream modules.
     */
    isReadyForContextPush: function($super) {
        if (this.requiredKeys.length>0) {
            var context = this.getContext();
            for (var i=0;i<this.requiredKeys.length;i++) {
                if (!context.get(this.requiredKeys[i])) {
                    return Splunk.Module.CANCEL;
                }
            }
        }
        return $super();
    },

    pushContextToChildren: function($super,explicitContext) {
        var retVal = $super(explicitContext);
        if (this._gateChildren.length>0) {
            var realChildren = this._children;
        
        
            //fly my pretties!
            this._children = this._gateChildren;
            $super(explicitContext);

            this._children = realChildren;
        }
        return retVal;
    },
    
    /**
     * framework method.  Show the downstream modules we have kept hidden 
     */
    onContextChange: function() {
        if ((this.requiredKeys.length>0) && (this.isReadyForContextPush()==Splunk.Module.CANCEL)) {
            this.hideDescendants(this.DOWNSTREAM_VISIBILITY_MODE + this.moduleId);
            return;
        } 
        this.showDescendants(this.DOWNSTREAM_VISIBILITY_MODE + this.moduleId);
    },
    
    /**
     * You have to ignore the "to" side or else modules with N drilldown 
     * parents will get shown by 1 and hidden by the other N-1.
     */
    hideDescendants: function($super, visibilityReason) {
        if (this.to) {
            this.logger.warn("Gate module with a 'to' param (" + this.moduleId + ") is ignoring a call to hideDescendants");
            return;
        }
        return $super(visibilityReason);
    },

    resetUI: function() {
        // spare ourselves the unnecessary warns.
        if (!this.to) this.hideDescendants(this.DOWNSTREAM_VISIBILITY_MODE + this.moduleId);
    }

});
