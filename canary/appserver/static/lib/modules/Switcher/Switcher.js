// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.

define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class Switcher extends Module {

    constructor(container, params) {
        super(container, params);
        this._activeChildIdsDuringLastPush = [];
        this.visibilityReason = "told to hide myself by a Switcher module - " + this.moduleId;
    }

    requiresResults() {
        return (this.getParam("requiresDispatch") == "True");
    }

    convertToMap(arr) {
        var dict = {};
        for (var i=arr.length-1;i>-1;i--) {
            if (arr[i]) dict[arr[i]] = 1;
        }
        return dict;
    }

    areAllModuleGroupNamesSelected(selectedGroupNames, moduleGroupNamesStr) {
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
    }

    getSelectedGroupNames() {
        var context = this.getContext();
        if (context.getSplunkSearch()) {
            Sideview.setStandardJobKeys(context);
        }
        var s = Sideview.replaceTokensFromContext(this.getParam("selectedGroup"),context);
        return s.split(",");
    }

    onHierarchyApplied() {
        var reason = this.visibilityReason;
        this.withEachChild(function(module) {
            if (module.getGroupName()) {
                module.hide(reason);
                module.hideDescendants(reason);
            }
        });
    }

    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        var selectedGroupNames = this.getSelectedGroupNames();
        var reason = this.visibilityReason;
        this.withEachChild(function(module) {
            if (this.areAllModuleGroupNamesSelected(selectedGroupNames, module.getGroupName())) {
                module.show(reason);
                module.showDescendants(reason);
            }
            else {
                module.hide(reason);
                module.hideDescendants(reason);
            }
        }.bind(this));
        if (Splunk && Splunk.hasOwnProperty("ViewConfig")
            && Splunk.ViewConfig.hasOwnProperty("view")
            && Splunk.ViewConfig.view.hasOwnProperty("template")
            && Splunk.ViewConfig.view.template == "dashboard.html") {
            setTimeout(function() {$(document).trigger("resize");},0);
        }
    }

    checkForJobKeyInvolvement() {
        var context = this.getContext();
        var selectedGroup = this.getParam("selectedGroup");
        var s1 = Sideview.replaceTokensFromContext(selectedGroup,context);
        Sideview.setStandardJobKeys(context);
        var s2 = Sideview.replaceTokensFromContext(selectedGroup,context);
        if (s1 != s2) {
            this.onContextChange(context);

            var activeChildren = this.getActiveChildren();
            var activeChildIds = this.getModuleIds(activeChildren);
            if (this._activeChildIdsDuringLastPush != activeChildIds) {
                console.log("the selectedGroup references a job key and our selected modules have changed unexpectedly so we are calling pushDownstream")
                this.pushDownstream();
            }
        }
    }

    onJobProgress() {
        this.checkForJobKeyInvolvement();
    }

    onJobDone() {
        this.checkForJobKeyInvolvement();
    }

    getActiveChildren() {
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
    }

    getModuleIds(children) {
        var ids = []
        for (var i=0;i<children.length;i++) {
            ids.push(children[i].moduleId);
        }
        return ids;
    }

    pushDownstream() {
        var activeChildren = this.getActiveChildren();
        var allChildren = this._children;
        this._children = activeChildren;
        var deferreds = this._pushDownstream();
        this._children = allChildren;
        this._activeChildIdsDuringLastPush = this.getModuleIds(activeChildren);
        return deferreds;
    }

}
    return Switcher;
});