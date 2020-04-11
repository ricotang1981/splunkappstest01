// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.Switcher= $.klass(Sideview.utils.getBaseClass(true), {

// can we do the group=" " somehow from Switcher.conf ?

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        this.switcheryVisibilityKey = "told to hide myself by a Switcher module - ";
        Sideview.utils.applyCustomProperties(this);
    },

    resetUI: function() {},
    
    requiresResults: function() {
        return (this.getParam("requiresDispatch") == "True");
    },

    requiresDispatch: function($super, search) {
        return (this.requiresResults()  && $super(search));
    },

    convertToMap: function(arr) {
        var dict = {};
        for (var i=arr.length-1;i>-1;i--) {
            if (arr[i]) dict[arr[i]] = 1;
        }
        return dict;
    },

    areAllModuleGroupNamesSelected: function(selectedGroupNames,moduleGroupNamesStr) {
        if (!moduleGroupNamesStr || moduleGroupNamesStr==" ") return true;
        var selectedGroupNameDict = this.convertToMap(selectedGroupNames);
        var moduleGroupNames = moduleGroupNamesStr.split(",");
        var moduleGroupName;
        for (var i=moduleGroupNames.length-1;i>-1;i--) {
            moduleGroupName = moduleGroupNames[i];
            if (!selectedGroupNameDict.hasOwnProperty(moduleGroupName)) {
                return false;
            }
            if (i==0) return true;
        }
        return false;
    },
    
    getSelectedGroupNames: function() {
        var context = this.getContext();
        var s = Sideview.utils.replaceTokensFromContext(this.getParam("selectedGroup"),context);
        return s.split(",");
    },

    /**
     * the module hides all of its descendant modules until a context comes down from above.
     */
    onLoadStatusChange: function($super,statusInt) {
        if (!this.isPageLoadComplete() && statusInt >= Sideview.utils.moduleLoadStates.WAITING_FOR_CONTEXT) {
            var visibilityId = this.switcheryVisibilityKey + this.moduleId;
            this.withEachChild(function(module) {
                if (module.getGroupName()) {
                    module.hide(visibilityId);
                    module.hideDescendants(visibilityId);
                }
            });
        }
        return $super(statusInt);
    },
    

    onContextChange: function() {
        var selectedGroupNames = this.getSelectedGroupNames();
        var visibilityId = this.switcheryVisibilityKey + this.moduleId;
        this.withEachChild(function(module) {
            if (this.areAllModuleGroupNamesSelected(selectedGroupNames, module.getGroupName())) {
                module.show(visibilityId);
                module.showDescendants(visibilityId);
            } 
            else {
                module.hide(visibilityId);
                module.hideDescendants(visibilityId);
            }
        }.bind(this));
        if (Splunk && Splunk.hasOwnProperty("ViewConfig")
            && Splunk.ViewConfig.hasOwnProperty("view") 
            && Splunk.ViewConfig.view.hasOwnProperty("template") 
            && Splunk.ViewConfig.view.template == "dashboard.html") {
            setTimeout(function() {$(document).trigger("resize");},0);
        }
        //Sideview.utils.balanceLabelWidths(this.container.parentNode);
    },
    
    getActiveChildren: function() {
        var activeChildren = [];
        var selectedGroupNames = this.getSelectedGroupNames();
        var child;
        for (var i=this._children.length-1;i>-1;i--) {
            child = this._children[i];
            if (this.areAllModuleGroupNamesSelected(selectedGroupNames, child.getGroupName())) {
                activeChildren.push(child);
            } 
        }
        return activeChildren;
    },

    pushContextToChildren: function(explicitContext) {
        var context = explicitContext || this.getModifiedContext();
        var search  = context.get("search");  

        var activeChildren = this.getActiveChildren();
        var child;
        for (var i=activeChildren.length-1;i>-1;i--) {
            child = activeChildren[i];
            child.baseContext = context;
            child.setLoadState(Sideview.utils.moduleLoadStates.HAS_CONTEXT);
            child.onContextChange();
            child.pushContextToChildren();
            if (!child.isPageLoadComplete()) {
                child.markPageLoadComplete();
            }
        }
    }

    
});
