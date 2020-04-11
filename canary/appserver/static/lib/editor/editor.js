/* Copyright (C) 2010-2020 Sideview LLC.  All Rights Reserved. */

define(
  [
    "jquery",
    "context",
    "time_range",
    "sideview"
  ],
  function($, Context, TimeRange, Sideview) {







class Editor {

    constructor() {
        this.primarySelectedNode = false;
        this.activeModuleSelector = false;
        this.mode = "edit";
        this.currentApp = Sideview.getCurrentApp();
        this.currentView = Sideview.getCurrentView();
        this.instrumentedModule = false;
        this.SIDEVIEW_MODULES = {"ArrayValueSetter":1,"AutoRefresh":1,"Button":1,"CanvasChart":1,"Chart":1,"Checkbox":1,"Checkboxes":1,"CheckboxPulldown":1,"CustomBehavior":1,"CustomRESTForSavedSearch":1,"DateTime":1,"Events":1,"Filters":1,"Gate":1,"HTML":1,"JobSpinner":1,"LeftNavAppBar":1,"Link":1,"Multiplexer":1,"NavBar":1,"Pager":1,"Pattern":1,"PostProcess":1,"Pulldown":1,"Radio":1,"Redirector":1,"Report":1,"ResultsValueSetter":1,"SankeyChart":1,"SavedSearch":1,"Search":1,"SearchControls":1,"ShowHide":1,"SideviewUtils":1,"Switcher":1,"Table":1,"Tabs":1,"TextField":1,"Timeline":1,"TreeMap":1,"URLLoader":1,"ValueSetter":1,"ZoomLinks":1};


    }

    getViewWindow() {
        var w = window.top.frames["view"];
        if (w.contentWindow) return w.contentWindow;
        return w;
    }
    getEditWindow() {
        var w = window.top.frames["editWindow"];
        if (w.contentWindow) return w.contentWindow;
        return w;
    }
    getSchematicWindow() {
        var w = window.top.frames["schematic"];
        if (w.contentWindow) return w.contentWindow;
        return w;
    }
    getControlWindow() {
        var w = window.top.frames["controls"];
        if (w.contentWindow) return w.contentWindow;
        return w;
    }
    getDescriptionWindow() {
        var w = window.top.frames["description"];
        if (w.contentWindow) return w.contentWindow;
        return w;
    }

    // blechhh.  it's neat we can do this now but it's not any prettier than apply()
    make_url() {
        var bound_method = Sideview.make_url.bind(Sideview)
        return bound_method(...arguments);
    }

    onViewWindowLoaded() {
        var viewWindow = this.getViewWindow();
        viewWindow.$("body").addClass("editMode");

        var editor = this;
        viewWindow.$("div.Module").click(function() {
            var moduleId = $(this).attr("id");
            if (this.mode == "debug") {
                var module = Sideview.getModule(moduleId);
                editor.debugAt(module);
            }
            editor.selectModule(moduleId);
        });
    }

    setAppViewAndMode(app, view, mode) {

        var pageUri = document.location.pathname.split("/");
        // are we somewhere where we know where we are?
        if (pageUri.length == 9) {
            // ok good. lets get the app, view and mode.

            if (app!=pageUri[6] || view!=pageUri[7] || mode!=pageUri[8]) {
                var topLevelUri = sprintf("/splunkd/__raw/sv_editor/%s/%s/%s", app, view, mode)
                topLevelUri = Sideview.make_url(topLevelUri);
                console.log(pageUri)
                console.log(app + ", " + view + ", " + mode)
                // nope. it's way too annoying and jarring to reload the whole thing.
                //document.location = topLevelUri;
            }
        }
        else {
            console.error("that is super bizarre.... the Editor's url was not what we expected.")
            console.error(pageUri);
            console.error(document.location.pathname);
        }

        this.mode = mode;

        if (app!=this.currentApp || view!=this.currentView) {
            var viewWindow = this.getViewWindow();

            viewWindow.document.location = Sideview.make_url("/splunkd/__raw/sv_view/" + app + "/" + view);

            var schematicWindow = this.getSchematicWindow();
            var sURL = sprintf("/splunkd/__raw/sv_view/%s/%s/spacetree", app, view);
            schematicWindow.document.location = Sideview.make_url(sURL);

            this.currentApp  = app;
            this.currentView = view;

            viewWindow = null;
            schematicWindow = null;
        }
        switch(mode) {
            case "edit":
                this.displayModuleSelectionForm(app,view,"edit");
                break;
            case "add" :
                this.displayModuleClassForm(app,view);
                break;
            case "delete" :
                this.displayModuleSelectionForm(app,view,"delete");
                break;
            case "reattach" :
                this.displayModuleReattachForm(app,view);
                break;
            case "debug" :
                this.displayModuleSelectionForm(app,view,"debug");
                break;
        }

    }

    displayViewEditForm() {
        var url = sprintf("/splunkd/__raw/sv_view/%s/%s/edit", this.currentApp, this.currentView);
        this.getEditWindow().document.location = Sideview.make_url(url)
    }

    displayNewViewForm(app) {
        var url = sprintf("/splunkd/__raw/sv_view/%s/_new/create", app);
        this.getEditWindow().document.location = Sideview.make_url(url)
    }

    displayModuleSelectionForm(app, view, action, message) {
        var url = ["/splunkd/__raw/sv_module/" + action + "?app=" + app];
        url.push("view=" + view);
        if (message) {
            url.push("successMessage=" + message);
        }
        this.getEditWindow().document.location = Sideview.make_url(url.join("&"));
    }

    displayModuleReattachForm(app,view,message) {
        var url = ["/splunkd/__raw/sv_module/reattach_existing?app=" + app];
        url.push("view=" + view);
        if (message) {
            url.push("successMessage=" + message);
        }
        this.getEditWindow().document.location = Sideview.make_url(url.join("&"));
    }

    displayModuleClassForm(app,view,message) {
        var url = ["/splunkd/__raw/sv_module/add?app=" + app];
        url.push("view=" + view);
        if (message) {
            url.push("successMessage=" + message);
        }
        this.getEditWindow().document.location = Sideview.make_url(url.join("&"));
    }

    selectView() {
        if (this.activeModuleSelector
                && this.activeModuleSelector[0]) {

            this.activeModuleSelector[0].val("(the view itself)");
            this.activeModuleSelector[1].val("view");
            switch (this.mode) {
                case "edit" :
                    this.displayViewEditForm();
                    //this.enableSubmitButton()
                    break;
            }
        }
        else if (this.mode=="edit") {
            this.displayViewEditForm();
        }
    }

    enableSubmitButton() {
        var editWindow = this.getEditWindow();
        editWindow.$("input[type='submit']").removeAttr("disabled");
        editWindow = null;
    }

    SideviewUtilsModuleExists() {
        var viewWindow = this.getViewWindow();
        return (viewWindow.$(".SideviewUtils").length>0)
    }

    selectPattern(patternId) {
        alert(sprintf("pattern editing is not implemented yet (patternId=%s)", patternId));
    }

    selectModule(moduleId) {

        var viewWindow = this.getViewWindow();


        var container = $("#" + moduleId, viewWindow.document);
        if (container.length==0) {
            alert("should not be possible but there's no module with this id " + moduleId)
        }
        viewWindow.$(".selectedModuleForEditing").removeClass("selectedModuleForEditing");
        container.addClass("selectedModuleForEditing");

        var moduleClass=moduleId.split("_")[0];

        this.getSchematicWindow().passiveSelectModule(moduleId);

        // direct edit mode, where the click goes immediately to the edit form....
        if (this.mode=="edit") {
            var url = ["/splunkd/__raw/sv_module/edit?app="  + this.currentApp];
            url.push("view=" + this.currentView);
            url.push("moduleId=" + moduleId);
            url.push("moduleClass=" + moduleClass);
            var editWindow = this.getEditWindow();
            editWindow.document.location = Sideview.make_url(url.join("&"));
        }
        else if (this.mode == "debug") {
            var module = viewWindow.Sideview.getModule(moduleId);
            this.debugAtModule(module);
        }
        if (this.activeModuleSelector
            && this.activeModuleSelector[0]
            && this.activeModuleSelector[0].is(":visible")) {
            this.activeModuleSelector[0].val(moduleId);
            this.activeModuleSelector[1].val(moduleClass);
        }

        var title, text;
        switch (this.mode) {
            case "edit" :
                title = "You've now selected a module to edit (" + moduleId + ")";
                text = "If it's the module you wanted to edit, great. If not, keep navigating around in the schematic window by dragging and clicking. More modules may become visible up as you interact with the schematic.";
                break;

            case "delete":
                title = "You've now selected a module to potentially delete";
                text = "If it's the module you wanted, great. If not, keep navigating around in the schematic window by dragging and clicking. More modules may become visible up as you interact with the schematic. Nothing will be deleted until you click the green button.  <br><br>BE CAREFUL DELETING MODULES AND REMEMBER THAT IF THERE ARE OTHER MODULES DOWNSTREAM THOSE WILL BE OBLITERATED AS WELL. ";
                this.enableSubmitButton()
                break;

            case "add":
                title = "You've now selected a module to be the parent of your new module";
                text = "If it's the module you wanted to choose, great. If not, keep navigating around in the schematic window by dragging and clicking. More modules may become visible up as you interact with the schematic.";
                break;

            case "reattach":
                title = "You've now selected a module to remove and reattach elsewhere";
                text = "When you remove and reattach modules, any other modules that exist downstream will be carried along in the process.  Most commonly you'll use this mode to 'stitch in' a new module into the hierarchy.  In other words you'll use the 'Add' mode to add a new module somewhere, and then you'll 'reattach' one of that new module's siblings to be the new module's child.";
                break;

            case "ebug":
                title = "You've now selected a module to debug";
                text = "In Runtime Debug mode, you'll see a breakdown of any searches, timeranges and other data (if any) that this module provides for downstream modules.  You'll also see a breakdown of all the searches, timeranges and other data that this module <b>inherits</b> from other modules upstream.   <br><br>This mode is extremely useful for debugging complex form searches and inline drilldown views.<br><br>Note that you can interact with the view panel and you will see the debug panel update in real time.";
                break;
            }
        this.displayHelp(title, text);
        viewWindow = null;
        container = null;
        module = null;
    }

    reloadSchematic(app, view,selectedNode) {
        var uri = sprintf("/splunkd/__raw/sv_view/%s/%s/spacetree", app, view);
        if (selectedNode && selectedNode!="_top") {
            uri += "?selectedNode=" + selectedNode;
        }
        var editor = window.parent.getEditor();
        var schematicWindow = editor.getSchematicWindow();
        schematicWindow.document.location = uri;
    }

    displayHelp(title, text) {
        var w = this.getDescriptionWindow()
        if (!title || !text) {

            console.trace();
            console.error(sprintf("displayHelp called by title=%s and text=%s", title, text))
        }
        if (w && w.document && w.document.location ) {

            if (w.document.location.href.indexOf("description")!=-1) {
                w.$(".title").text(title);
                w.$(".text").html(text);
            } else {
                var descUrl = "/splunkd/__raw/sv_view/canary/editor_description?title=" + title + "&text=" + text;
                w.document.location = Sideview.make_url(descUrl);
            }
        }
    }

    setInstrumentedModule(module) {
        var previousModule = this.instrumentedModule;

        if (previousModule) {
            previousModule.pushContextToChildren = previousModule._pushContextToChildren;
            previousModule.onContextChange = previousModule._onContextChange;
            previousModule._pushContextToChildren = null;
            previousModule._onContextChange = null;
        }

        module._pushContextToChildren = module.pushContextToChildren;
        module._onContextChange = module.onContextChange;

        module.pushContextToChildren = function(explicitContext) {
            this.debugAtModule(this);
            this._pushContextToChildren(explicitContext);
        }.bind(module);

        module.onContextChange = function(context) {
            this.debugAtModule(this);
            this._onContextChange(context);
        }.bind(module);
        this.instrumentedModule = module;
    }

    getSearchKeysAsContext(context) {
        var cleanContext = new Context();

        var search = context.getSplunkSearch();
        if (search) {
            cleanContext.set("search string", search.toString());
        }

        var range = context.get("shared.timeRange") || new TimeRange();
        var earliest = range.getEarliestTimeTerms() || " ";
        var latest = range.getLatestTimeTerms() || " ";
        var timeRangeStr = [];
        if ((earliest && earliest!=0) && latest) {
            timeRangeStr.push(sprintf("(%s,%s) ", earliest, latest));
        }
        timeRangeStr.push(range.toConciseString());

        cleanContext.set("timerange", timeRangeStr.join(" "));

        if (search) {
            var postProcess = search.getPostProcess();
            if (postProcess) {
                cleanContext.set("postprocess", postProcess);
            }
            if (search.job && search.job.getSearchId()) {
                cleanContext.set("search id", search.job.getSearchId());
            }
        }
        return cleanContext;
    }

    clobberSearchKeys(context) {
        var unwantedKeys = ["search", "shared.timerange", "search.timeRange.earliest","search.timeRange.latest","search.timeRange.label"];
        for (var i=0;i<unwantedKeys.length;i++) {
            context.remove(unwantedKeys[i]);
        }
    }


    getContextKeys(context) {
        var keys = [];
        for (var key in context._root) {
            if (context.has(key)) {
                keys.push(key);
            }
        }
        return keys;
    }

    contextValuesAreEqual(val1, val2) {
        if (!val1 && !val2) return true;
        else if (!val1 || !val2) return false;

        if (val1 == val2) return true;
        if (val1.toString && val2.toString && val1.toString()==val2.toString())  return true;
        return false;

    }

    diffContext(context, modifiedContext) {
        var keys = this.getContextKeys(context);
        var modifiedKeys = this.getContextKeys(modifiedContext);


        for (var i=modifiedKeys.length-1;i>=0;i--) {
            var key = modifiedKeys[i];
            if (keys.indexOf(key)!=-1
                && (this.contextValuesAreEqual(context.get(key), modifiedContext.get(key)))) {
                modifiedKeys.splice(i,1);
            }
        }
        keys = keys.sort();
        modifiedKeys = modifiedKeys.sort();

        return modifiedKeys;
    }

    renderContextKeys(editorTable, context, renderOnlyTheseKeys) {
        var keys = renderOnlyTheseKeys || this.getContextKeys(context);
        var i, len, tr;
        for (i=keys.length-1;i>=0;i--) {
            var isFunction = (typeof context.get(keys[i]) === "function");
            var nullValued = !context.get(keys[i]);

            if (isFunction || nullValued) {
                keys.splice(i,1);
            }
        }
        for (i=0,len=keys.length;i<len;i++) {
            var value = context.get(keys[i]);

            tr = $("<tr>");
            tr.append($("<td>").text(keys[i]));
            tr.append($("<td>").addClass("values").text(value.toString()));
            editorTable.append(tr);
        }
        if (keys.length==0) {
            tr = $("<tr>");
            tr.append($('<td colspan="3">').text("(none)"));
            editorTable.append(tr);
        }
    }

    addNewHeaderRow(editorTable, headerStr) {
        editorTable.append($('<tr class="spacer">').append($('<td colspan="3">').append(" ")));

        var header = $("<h4>").text(headerStr);
        editorTable.append(
            $('<tr class="header">').append(
                $('<td colspan="3">').append(header)));
    }

    debugAtModule(module) {
        var editWindow = this.getEditWindow();
        var outerWrapper = editWindow.$("div.outerWrapper");
        outerWrapper.html('');

        this.setInstrumentedModule(module);

        var context = module.getContext();
        var modifiedContext = module.getModifiedContext(context.clone());
        outerWrapper.append(
            $("<h2>").text("Debug Module : " + module.moduleId)
        );

        var editorTable = $('<table cellspacing="0">').addClass("viewerTable");

        var searchKeysAsContext = this.getSearchKeysAsContext(context);

        // 1 ---------------------------------
        this.addNewHeaderRow(editorTable, "Search values added/modified for downstream modules");

        var modifiedSearchKeysAsContext = this.getSearchKeysAsContext(modifiedContext);
        var modifiedSearchKeysList = this.diffContext(searchKeysAsContext, modifiedSearchKeysAsContext);
        this.renderContextKeys(editorTable, modifiedSearchKeysAsContext, modifiedSearchKeysList);


        // 2 ---------------------------------

        this.addNewHeaderRow(editorTable, "Normal keys added/modified for downstream modules")


        var clobberedNormal = context.clone();
        var clobberedModified = modifiedContext.clone();
        this.clobberSearchKeys(clobberedNormal);
        this.clobberSearchKeys(clobberedModified);

        var modifiedKeys = this.diffContext(clobberedNormal, clobberedModified);
        this.renderContextKeys(editorTable, clobberedModified, modifiedKeys);


        editorTable.append($('<tr class="spacer">').append($('<td colspan="3">').append(" ")));
        editorTable.append($('<tr class="spacer">').append($('<td colspan="3">').append(" ")));
         // 3 ---------------------------------
        this.addNewHeaderRow(editorTable, "Search values inherited from upstream");

        this.renderContextKeys(editorTable, searchKeysAsContext);

        // 4 ---------------------------------
        this.addNewHeaderRow(editorTable, "Normal keys inherited from upstream")

        this.renderContextKeys(editorTable, clobberedNormal);

        outerWrapper.append(editorTable);
    }

    updateControlWindow(app, view) {
        var controlWindow = this.getControlWindow();
        var baseHref = controlWindow.location.href;
        if (baseHref.indexOf("?")!=-1) {
            baseHref = baseHref.substring(0,baseHref.indexOf("?"))
        }
        controlWindow.location.href = baseHref + "?app=" + app + "&view=" + view;
        controlWindow = null;
    }



    setActiveModuleSelector(idInput, classInput) {
        this.activeModuleSelector = [idInput, classInput];
    }


    isSideviewModule(name) {
        return this.SIDEVIEW_MODULES.hasOwnProperty(name);
    }

    success(app, view) {
        switch (this.mode) {
        case "edit" :
            this.displayModuleSelectionForm(app, view, "edit", "modified settings submitted successfully");
            break;
        case "add":
            this.displayModuleClassForm(app, view, "add","new module added successfully");
            break;
        }
    }

    fail(message) {
        var editWindow = this.getEditWindow();
        editWindow.$("div.fail").remove();
        editWindow.$("<div>")
            .addClass("fail")
            .text(message)
            .prependTo(editWindow.document.body)
        $(editWindow).scrollTop(0)

    }

}

    if (window.editor) {
        console.error("what the - there's already an editor here...");
    }
    var editor = new Editor();

    window.editor = editor;
    return editor
});
