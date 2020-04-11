// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.Table= $.klass(Sideview.utils.getBaseClass(true), {

    initialize: function($super, container) {
        $super(container);
        this.drilldownVisibilityKey = "under table drilldown - ";
        this.logger = Sideview.utils.getLogger();
        this.useMetaKey = /mac/.test(navigator.userAgent.toLowerCase());
        this.selectedRowIndex = -1;
        this.modifierKeyHeld  =false;
        this.allowSorting = Sideview.utils.normalizeBoolean(this.getParam("allowSorting"));

        this._previousPostProcess = false;
        this.hasAnyDefaultParams = false;
        for (key in this._params) {
            if (!this._params.hasOwnProperty(key)) continue;
            if (key.indexOf("default.")==0) this.hasAnyDefaultParams=true;
        }
        this.sparklineDefaults = {fillColor:null,highlightSpotColor:null,lineColor:'#008000',minSpotColor:null,maxSpotColor:null,spotColor:null,type:'line'};
        this.columnRenderingRules = this.getColumnRenderingRules();
        Sideview.utils.applyCustomProperties(this);
    },
    requiresResults: function() {return true;},

    validateColumnRenderingRule: function(name,value) {
        if (name.indexOf(".class") + 6 == name.length) {}
        else if (name.indexOf(".style") + 6 == name.length) {}
        else {
            this.displayInlineErrorMessage(_(sprintf("ERROR - Custom column rendering rule names must end in either .style or .class.  This rule param is named %s", name)));
            return false;
        }
        return true;
    },

    getColumnRenderingRules: function() {
        var columnRenderingRules = {};
        var name,value,fieldName,type;
        for (name in this._params) {
            if (this._params.hasOwnProperty(name) && name.indexOf("columns.")==0) {
                value = this._params[name];
                if (this.validateColumnRenderingRule(name,value)) {
                    type = name.substring(name.length-5);
                    fieldName = name.substring(8, name.length-6);
                    if (!columnRenderingRules.hasOwnProperty(fieldName)) {
                        columnRenderingRules[fieldName] = {};
                    }
                    if (columnRenderingRules[fieldName].hasOwnProperty(type)) {
                        this.displayInlineErrorMessage(_(sprintf("ERROR - Custom column rendering rule for %s has been been defined two or more times.", name)));
                    }
                    columnRenderingRules[fieldName][type] = value;
                }
            }
        }
        return columnRenderingRules;
    },

    /**
     * obscure framework method required for the module to respond correctly
     * if an upstream timeline module has a selected subrange.
     */
    requiresTransformedResults: function() {
        return true;
    },

    /**
     * turn on row drilldown.
     */
    enableDrilldown: function() {
        this.resultsContainer.addClass("drilldownEnabled");
        this.container.bind("mouseover", this.onMouseover.bind(this));
        this.container.bind("mouseout", this.onMouseout.bind(this));
        this.container.bind("click", this.onClick.bind(this));
        this.container.bind("mousedown", function(evt) {
            if (this.isModifierKeyHeld(evt)) evt.preventDefault();
        }.bind(this));
        this.container.bind("selectstart", function(evt) {
            if (this.isModifierKeyHeld(evt)) return false;
        }.bind(this));
    },

    /**
     * turn off row drilldown.
     */
    disableDrilldown: function() {
        this.resultsContainer.removeClass("drilldownEnabled");
        this.clearSelection();
        this.container.unbind("mouseover");
        this.container.unbind("mouseout");
        this.container.unbind("click");
    },

    /**
     * basically is this a ctrl-click.  Basically the clients of this method
     * will just pass this down in the selected keys, so that downstream
     * modules can do with it as they see fit.
     */
    isModifierKeyHeld: function(evt) {
        return this.useMetaKey ? evt.metaKey : evt.ctrlKey;
    },

    /**
     * framework method called by ModuleLoader during page load. This is how
     * drilldown is enabled automatically.
     */
    addChild: function($super,child) {
        if (!this.getChildInsertionField(child)) {
            this.enableDrilldown();
        }
        else {
            // remove the lame green headers that this creates in the
            // dashboard template.
            this.container.parents(".dashboardCell").find(".splHeader").each(function() {
                var headerText = $(this).find("h2").text();
                if ($.trim(headerText) == "" || headerText == child.getGroupName()) {
                    $(this).remove();
                }
            })
        }
        return $super(child);
    },

    /**
     * framework method. This is how drilldown gets disabled automatically.
     */
    removeChild : function($super, child) {
        var retVal = $super(child);

        var hasDrilldownChildren = false;
        for (var i=0,len=this._children.length;i<len;i++) {
            if (!this.getChildInsertionField(this._children[i])) {
                hasDrilldownChildren = true;
                break;
            }
        }
        if (!hasDrilldownChildren) {
            this.disableDrilldown();
        }
        return retVal;
    },

    /**
     * NOTE: does not implement anything around the isSwitcherLeaf property
     * that is used by the core Splunk *Switcher classes.  That logic is
     * not implemented by Sideview modules.
     */
    showDescendants: function(invisibilityMode) {
        var child;
        for (var i=0; i<this._children.length;i++) {
            child = this._children[i];
            var insertionField = this.getChildInsertionField(child);
            if (!insertionField) {
                child.show(invisibilityMode);
                child.showDescendants(invisibilityMode);
            }
        }
    },

    /**
     * This makes the overall determination as to whether we have or will have
     * well-defined default row values in advance of the user clicking a row.
     */
    allowDownstreamDefaults: function(context) {
        if (!context) {
            // if the module is in any earlier state, it is not safe to call getContext()
            if (this.getLoadState() >= Sideview.utils.moduleLoadStates.WAITING_FOR_CONTEXT) {
                context = this.getContext();
            } else {
                context = new Splunk.Context();
            }
        }
        var offset = context.get("results.offset") || 0;
        if (this.hasAnyDefaultParams) return true;
        // only allow the selectedIndex default to push on the first page.
        if (this.getParam("selectedIndex")>-1 && this.results && this.getParam("selectedIndex") < this.results.length) {
            if (offset==0) return true;
            else return false;
        }
        return false;
    },

    /**
     * notable use cases - going to page 2 when there's a selectedIndex param (should hide)
     */
    checkDownstreamModuleVisibility: function(context) {
        if (this.allowDownstreamDefaults(context)) {
            this.showDescendants(this.drilldownVisibilityKey + this.moduleId);
        } else {
            this.hideDescendants(this.drilldownVisibilityKey + this.moduleId);
        }
    },

    /**
     * Dear Reader: There is no reason to go into the attic.
     */
    hideHugoSimpson: function() {
        var child;
        for (var i=0; i<this._children.length;i++) {
            child = this._children[i];
            var insertionField = this.getChildInsertionField(child);
            if (insertionField) {
                if (child.container.attr("id").indexOf("_multiplexed") ==-1) {
                    child.hide(Sideview.utils.TEMPLATED_CHILDREN_VISIBILITY_REASON);
                    child.hideDescendants(Sideview.utils.TEMPLATED_CHILDREN_VISIBILITY_REASON);
                }
            }
        }
    },

    /**
     * hides all downstream modules.
     */
    hideDescendants: function(invisibilityMode) {
        var child;
        for (var i=0; i<this._children.length;i++) {
            child = this._children[i];
            var insertionField = this.getChildInsertionField(child);
            if (!insertionField) {
                child.hide(invisibilityMode);
                child.hideDescendants(invisibilityMode);
            }
        }
    },

    /**
     * the module hides all of its descendant modules until the user clicks
     * a row in the rendered table.
     */
    onLoadStatusChange: function($super,statusInt) {
        if (!this.isPageLoadComplete() && statusInt >= Sideview.utils.moduleLoadStates.WAITING_FOR_CONTEXT) {
            this.checkDownstreamModuleVisibility();
            this.hideHugoSimpson();
        }
        // important to only generate this once.
        // if you ever run it a second time, the group attribute logic will
        // grab one of the multiplexed children as the new root module to
        // clone from.
        if (statusInt >= Sideview.utils.moduleLoadStates.WAITING_FOR_CONTEXT && !this.templatedFields) {
            this.templatedFields = this.getTemplatedFields();
        }
        return $super(statusInt);
    },
    onHierarchyLoaded: function() {
        this.checkDownstreamModuleVisibility();
        this.hideHugoSimpson();
        if (!this.templatedFields) {
            this.templatedFields = this.getTemplatedFields();
        }
    },

    /**
     * given one of the children (ie directly-downstream modules),
     * if the child is an "embedded" module,  then this method returns the
     * fieldname under which this module gets embedded in the table.
     * otherwise returns false.
     */
    getChildInsertionField: function(child) {
        var groupName = child.getGroupName();
        var prefix = this.getParam("name");
        if (groupName && groupName.indexOf(prefix + ".fields")==0) {
            return groupName.replace(prefix + ".fields.","");
        }
        return false;
    },

    /**
     * run through all the child modules and get an array showing the fields
     * under which any embedded module config is to be embedded.
     */
    getTemplatedFields: function() {
        var templatedFields = {};
        for (var i=0,len=this._children.length;i<len;i++) {
            var child = this._children[i];
            var insertionField = this.getChildInsertionField(child);
            if (insertionField) {
                templatedFields[insertionField] = child;
            }
        }
        return templatedFields;
    },

    /**
     * framework method to clear all dynamically rendered content and reset
     * associated state.
     */
    resetUI: function(){
        this.fieldOrder = [];
        this.results = [];
        this.resultsContainer.addClass("resultsContainer").html("");
        this.selectedRowIndex = -1;
        this.modifierKeyHeld = false;

        this.checkDownstreamModuleVisibility();

        this.activeSortField = null;
        this.activeSortIsAscending = true;
    },

    /**
     * just to implement the row highlight.
     */
    onMouseover: function(evt) {
        var target = evt.target;
        var row = $($(target).parents().filter("tr")[0]);
        row.addClass("mouseoverHighlight");
    },

    /**
     * just to implement the row highlight.
     */
    onMouseout: function(evt) {
        var target = evt.target;
        var row = $($(target).parents().filter("tr")[0]);
        row.removeClass("mouseoverHighlight");
    },

    /**
     * returns true if the given elt is within the Table module's actual
     * table node.  otherwise returns false.
     */
    isWithinTable: function(elt) {
        var table = this.resultsContainer.find("> table");
        if (elt.is(table)) return true;
        while (elt.length>0 && elt.parent()) {
            elt = elt.parent();
            if (elt.is(table)) return true;
        }
        return false;
    },

    /**
     * Called whenever the module is clicked. Is responsible for all
     * drilldown clicks but NOT any column-header (sorting) clicks.
     */
    onClick: function(evt) {
        var usersCurrentlySelectedText = Sideview.utils.getSelectedText();
        if (usersCurrentlySelectedText) return false;
        var target = $(evt.target);
        if (target.is("a")) return true;
        if (target.is("input")) return true;
        if (target.is("button")) return true;
        if (target.is("th") || target.parent().is("th")) return true;

        if (!this.isWithinTable(target)) return true;

        this.clearSelection();

        var row = $(target.parents().filter("tr")[0]);
        // possibly redundant, but does no harm.
        this.showDescendants(this.drilldownVisibilityKey + this.moduleId);
        row.addClass("selected")

        this.selectedRowIndex = $(row).prevAll().length-1;
        this.modifierKeyHeld = this.isModifierKeyHeld(evt);
        this.pushContextToChildren();
    },

    clearSelection: function() {
        $(".selected", this.container).removeClass("selected");
    },

    /**
     * framework method.  The cancel return in here is how we prevent the
     * downstream module config from being pushed/dispatched before it gets
     * enabled and made visible.
     */
    isReadyForContextPush: function($super) {
        if (this.getParam("selectedIndex")>-1 && (this.selectedRowIndex==-1)) {
            // We have selectedIndex but we don't have the data yet.
            return Splunk.Module.DEFER;
        }
        if (this.allowDownstreamDefaults() && this.results.length==0) {
            // everybody has to defer.  default.* params might trigger an
            // overall row selection, in which case we'll need all values.
            return Splunk.Module.DEFER;
        } else if (!this.hasAnyDefaultParams && this.selectedRowIndex==-1) {
            return Splunk.Module.CANCEL;
        }
        return $super();
    },

    hasChanged: function(currentResultParams, param) {
        if (!this._previousResultParams) return true;
        if (currentResultParams.hasOwnProperty(param) == this._previousResultParams.hasOwnProperty(param)) {
            return (currentResultParams[param] != this._previousResultParams[param]);
        }
        return true;
    },

    /**
     * framework method that executes whenever the module receives new context
     * data from upstream.
     */
    onContextChange: function() {
        var context = this.getContext();
        Sideview.utils.applyCustomCssClass(this,context);

        var search = context.get("search");
        var job = search.job;


        var p = this.getResultParams();

        // has the search or postProcess changed
        if (this.hasChanged(p,"sid")
            || this._previousPostProcess!=search.getPostProcess()
            || this.hasChanged(p,"earliest_time")
            || this.hasChanged(p,"latest_time")) {
            this.resetUI();
        }
        // with these changes, only selectedRow becomes invalid. the rest of
        // what is reset in resetUI is fine.
        else if (this.hasChanged(p,"count") || this.hasChanged(p,"offset")) {
            this.selectedRowIndex = -1;
            this.modifierKeyHeld = false;
        }

        if (search.isJobDispatched() && (job.isDone() || (job.getResultCount() > 0) )) {
            this.getResults();
        }
    },

    /**
     * framework method that executes whenever the number of search results
     * changes, or for rtsearches, that executes every few seconds.
     */
    onJobProgress: function() {
        var context = this.getContext();
        var search  = context.get("search");
        var job = search.job;
        if (job.isPreviewable() && !job.isDone()) {
            this.getResults();
        }
        else {
            this.displayWaitingForResultsMessage();
        }
    },

    /**
     * framework method that executes when the current search results
     * are complete.
     */
    onJobDone: function() {
        this.getResults();
    },

    addKeysForFirstVisibleField: function(context, row, field) {
        var prefix = this.getParam("name");

        // part of a Sideview convention whereby time can actually be shown
        // as a "time" column and not "_time".
        if (field=="time" && this.fieldOrder.indexOf("_time")!=-1) firstVisibleField = "_time";
        else firstVisibleField=field;

        var escFirstVisibleField = Sideview.utils.escapeForSearchLanguage(firstVisibleField);
        context.set(prefix + ".name", escFirstVisibleField);
        context.set(prefix + ".rawName", firstVisibleField);
        var firstVisibleValue = row[firstVisibleField].join(",");
        var escFirstVisibleValue = Sideview.utils.escapeForSearchLanguage(firstVisibleValue);
        context.set(prefix + ".value", escFirstVisibleValue);
        context.set(prefix + ".rawValue", firstVisibleValue);

        if (firstVisibleField!="time" || !row.hasOwnProperty("_time")) {
            var searchTerm = firstVisibleField + "=" + Sideview.utils.doubleQuoteValue(escFirstVisibleValue);
            context.set(prefix + ".searchTerms", searchTerm);
        }
    },

    addKeysForField: function(context,row,field,visibleFieldIndex) {
        var prefix = this.getParam("name");
        var value = (row.hasOwnProperty(field)) ? row[field].join(",") : "";

        var escField = Sideview.utils.escapeForSearchLanguage(field);
        var escValue = Sideview.utils.escapeForSearchLanguage(value);
        var fieldBaseStr = prefix + ".fields.";
        context.set(fieldBaseStr + field, escValue);
        context.set(fieldBaseStr + field + ".rawValue", value);

        // note that if visibleFieldIndex is passed as -1, than all the below
        // is defeated and visibleFieldIndex never increments.
        if (visibleFieldIndex!=-1 && !this.hiddenFields.hasOwnProperty(field)) {
            // add keys specific to just the first-visible field
            if (visibleFieldIndex==0) {
                this.addKeysForFirstVisibleField(context, row, field);
            }
            var cellBaseStr = prefix + ".cell" + visibleFieldIndex + ".";
            context.set(cellBaseStr + "name", escField);
            context.set(cellBaseStr + "value", escValue);
            context.set(cellBaseStr + "rawValue", value);
            visibleFieldIndex++;
        }
        return visibleFieldIndex;
    },

    /**
     * NOTE: fieldOrder is optional. In cases where there are default values,
     * the push can pass on downstream before the Table even renders and thus
     * the "defaults" case does not assume it has any fieldOrder nor
     * hiddenFields arrays.
     */
    addKeysForRow: function(context,row,fieldOrder) {
        var prefix = this.getParam("name");

        var firstVisibleField = false;
        var visibleFieldIndex = 0;

        // no fieldOrder means we have no selection,  we have defaults, and
        // the table may not have even rendered yet.
        if (!fieldOrder) {
            fieldOrder = [];
            for (field in row) {
                if (row.hasOwnProperty(field)) {
                    fieldOrder.push(field);
                }
            }
            // setting this to -1 turns off all of the downstream $foo$
            // tokens, the setting thereof would require knowing the visible
            // field order.
            visibleFieldIndex = -1;
        }

        for (var i=0,len=fieldOrder.length;i<len;i++) {
            var field = fieldOrder[i];
            // visibleFieldIndex MAY be incremented once, or not.
            visibleFieldIndex = this.addKeysForField(context,row,field, visibleFieldIndex);
            // if it was incremented to 1, then that was our first visible field.
            if (!firstVisibleField && visibleFieldIndex==1) firstVisibleField = field;
        }

        this.addTimeRangeKeys(context, row);

        if (firstVisibleField) {
            var xField = firstVisibleField;
            if (xField=="time") xField=false;
            Sideview.utils.setDrilldownSearchTerms(context, this.getParam("name"), xField, row);
        }
    },

    getRowWithDefaultValues: function() {
        var row = {};
        if (this.hasAnyDefaultParams) {
            var context = this.getContext();
            for (key in this._params) {
                if (!this._params.hasOwnProperty(key)) continue;
                if (key.indexOf("default.")!=0) continue;
                // TODO - some treatment for array-valued defaults?

                value = Sideview.utils.replaceTokensFromContext(this.getParam(key), context);
                row[key.replace("default.","")] = [value];
            }
        }
        return row;
    },

    /**
     * framework method that gets called, and is essentially how this module
     * passes its selection state to downstream modules.
     *
     * The implementation is a bit long but it has resisted a couple
     * refactoring attempts in that when I try to "extract method", I've been
     * ending up with methods that look pretty arbitrary.
     */
    getModifiedContext: function() {
        var context = this.getContext();

        // no selected row.
        if (this.selectedRowIndex==-1) {
            // not entirely clear why a push has even been allowed but ours is
            // not to wonder why - that job fell to isReadyForContextPush.
            if (!this.hasAnyDefaultParams) return context;

            var row= this.getRowWithDefaultValues();
            // fieldOrder is NOT necessarily known so it's not passed.
            this.addKeysForRow(context,row);
        }
        // there is a selected row.
        else {
            var row = this.results[this.selectedRowIndex];
            // selected row means rows have been rendered, therefore we have
            // fully determined fieldOrder and hiddenFields arrays.
            this.addKeysForRow(context,row,this.fieldOrder);
            context.set("click.modifierKey",this.modifierKeyHeld);
            var tr = $("tr.selected", this.container);
            context.set("click.selectedElement", Sideview.utils.makeUnclonable(tr));

        }

        // reset paging keys so the next table drilldown can do it all again.
        context.set("results.offset", 0);
        context.remove("results.count");
        context.set("results.upstreamPagerCallback", null);
        // in case anyone still uses the old Paginator module.
        context.set("results.upstreamPaginator", null);

        return context;
    },

    /**
     * method extracted from getModifiedContext to add just the timeRange
     * keys to the modified context.
     */
    // TODO: what happens if poeple want to inherit timerange partially, and put $search.timeRange.earliest$ in as a value.....   pass it in as though it were a hidden field?
    addTimeRangeKeys: function(context, row) {

        var earliestTimeField = this.getParam("earliestTimeField");
        var latestTimeField = this.getParam("latestTimeField");
        var durationField = this.getParam("durationField");
        var weHaveEarliest = earliestTimeField && row.hasOwnProperty(earliestTimeField);
        var weHaveLatest   = latestTimeField && row.hasOwnProperty(latestTimeField);
        //var weHaveDuration = durationField && row.hasOwnProperty(durationField);

        if (weHaveEarliest || weHaveLatest) {
            var earliest = row[earliestTimeField];
            var latest = row[latestTimeField];
            var duration = row[durationField];
            var isNumeric = Sideview.utils.isNumeric;

            // handle one-tailed cases, where we DO have duration.
            if (!latest && earliest && duration && isNumeric(duration) && isNumeric(earliest)) {
                latest = parseInt(earliest,10) + parseInt(duration,10);
            }
            else if (!earliest && latest && duration && isNumeric(duration) && isNumeric(latest)) {
                earliest = parseInt(latest,10) - parseInt(duration,10);
            }
            // one-tailed cases where we DON'T have duration, will simply
            // result in one-tailed timeranges.
            range = new Splunk.TimeRange(earliest,latest);
            var search = context.get("search");
            search.setTimeRange(range);
            context.set("search",search);
        }
    },

    /**
     * this method deals with how to get either the local fields param or the
     * fields values that might be passed from upstream
     * (ie from a FieldPicker module)
     */
    getFields: function(context) {
        context = context || this.getContext();
        var localFieldStr = this.getParam("fields");
        localFieldStr = Sideview.utils.replaceTokensFromContext(localFieldStr, context);

        if (context.has("results.fields")) {
            if (localFieldStr) {
                this.logger.error("[AppDeveloperWarn] - Table module has a 'fields' param specified directly and there is also a value coming from upstream. The upstream value wins.");
            }
            var fields = context.get("results.fields") || [];
            // the module has a postprocess search to sneak in a nice
            // stringformatted "time" to replace the "_time" value.
            // and to then put "_time" in as a hidden field for the time
            // aspect of table drilldowns.
            if (fields.indexOf("_time")!=-1) {
                fields[fields.indexOf("_time")] = "time";
            }
            return fields;
        }
        return Sideview.utils.stringToList(localFieldStr);
    },

    /**
     * get the array of fields to treat as hidden fields. Note that $foo$
     * substitution is run in the "hiddenFields" param value.
     */
    getHiddenFields: function(context) {
        var paramStr = this.getParam("hiddenFields");
        paramStr = Sideview.utils.replaceTokensFromContext(paramStr, context);
        var fieldList = Sideview.utils.stringToList(paramStr);

        var hiddenFields = {};
        for (var i=0,len=fieldList.length;i<len;i++) {
            hiddenFields[fieldList[i]] = 1;
        }

        var fieldsToShowExplicitly = this.getFields();

        var hasExplicitFields = (fieldsToShowExplicitly.length!=0);
        for (var i=0,len=this.fieldOrder.length;i<len;i++) {
            var returnedField = this.fieldOrder[i];

            if (!hasExplicitFields) {
                if (returnedField.charAt(0) == "_") {
                    hiddenFields[returnedField] = 1;
                }
            }
            else {
                // it came back, but we're supposed to hide it, then don't show it.
                if (fieldsToShowExplicitly.indexOf(returnedField)==-1) {
                    hiddenFields[returnedField] = 1;
                }
                // it came back but it IS in the explicit Show list,
                // then even if it's in hiddenFields param, we take it OUT
                // of the hiddenFields list.
                else {
                    delete hiddenFields[returnedField];
                }
            }
        }
        return hiddenFields;
    },

    getSortField: function() {
        return this.activeSortField;
    },

    getSortDirection: function() {
        if (this.activeSortIsAscending) return "ascending";
        else return "descending";
    },

    getTimeFormatForStringTime: function() {
        var timeFormat = this.getParam("timeFormat");
        if (timeFormat) return timeFormat;
        var locale = Sideview.utils.getConfigValue('LOCALE');
        if (locale=="en-US") return "%m/%d/%y %H:%M:%S.%Q";
        return "%d/%m/%y %H:%M:%S.%Q"
    },

    getTimeFormatPostProcess: function() {
        var timeFormat = Sideview.utils.doubleQuoteValue(this.getTimeFormatForStringTime());
        return "| eval time=if(isnotnull(_time),strftime(_time," + timeFormat + "),time)";
    },

    /**
     * This module has the task of producing the final overall postProcess
     * search.  It will incorporate any explicit postprocess plus whatever
     * we need for sorting, and field ordering.
     */
    getPostProcess: function(context,search,offset,count) {
        var postProcess = [search.getPostProcess() || ""];

        var fields = this.getFields(context);
        if (fields.length>0) {
            var hiddenFields = this.getHiddenFields(context);
            for (field in hiddenFields) {
                if (hiddenFields.hasOwnProperty(field)) {
                    fields.push(field);
                }
            }
            postProcess.push("| fields " + fields.join(" "));
        }

        var sortField = this.getSortField();
        if (sortField) {
            var sortClause = ["| sort "];

            var minimumRequiredOffset = offset + count;

            if (Sideview.utils.isInteger(minimumRequiredOffset)) {
                sortClause.push(minimumRequiredOffset + " ");
            }
            if (this.getSortDirection()=="descending") {
                sortClause.push("- ");
            }
            sortClause.push(Sideview.utils.doubleQuoteValue(sortField));

            postProcess.push(sortClause.join(""));
        }
        var tfpp = this.getTimeFormatPostProcess();
        if (tfpp) {
            postProcess.push(tfpp)
        }
        return postProcess.join(" ");
    },

    /**
     * framework method. This is how we make the module talk to the old proxy
     * api (instead of trying to hit a Table.py endpoint).
     */
    getResultURL: function(params) {
        var context = this.getContext();
        var search  = context.get("search");
        var url = search.getUrl("results");
        url = url.replace("/results", "/results_preview");
        return url + "?" + Sideview.utils.dictToString(params);
    },

    /**
     * returns the current offset which with count comprises the current
     * pagination information
     */
    getOffset: function(context) {
        var offset = 0;
        if (context.has("results.offset")) {
            offset = context.get("results.offset");
        }
        return parseInt(offset,10);
    },

    /**
     * returns the current number of rows per page, which with offset
     * comprises the current pagination information
     */
    getCount: function(context) {
        var count;
        if (context.has("results.count")) {
            count = context.get("results.count");
        } else {
            count = this.getParam("count");
        }
        return parseInt(count,10);
    },

    /**
     * framework method.  This we use to specify all the querystring params
     * for our getResults call.
     */
    getResultParams: function() {
        var params = {};
        var context = this.getContext();
        var search  = context.get("search");
        var job = search.job;
        params.sid = job.getSearchId();
        if (job.isPreviewable()) params.show_preview = "1";

        var offset = this.getOffset(context);
        var count  = this.getCount(context);
        var postProcess = this.getPostProcess(context,search,offset,count);
        if (postProcess) {
            params.search = postProcess;
        }

        params["offset"] = offset;
        params["count"] = count;


        var range = search.getTimeRange();
        if (range.isSubRangeOfJob()) {
            params.earliest_time = range.getEarliestTimeTerms();
            params.latest_time = range.getLatestTimeTerms();
        }
        return params;
    },

    /**
     * sort handler explicitly attached to the th elements when they are
     * rendered.
     * possibly in the future this should be simplified to do this from the
     * generic onClick instead.
     */
    onSortClick: function(evt) {
        var th = $(evt.target);
        if (th.is("span")) th = th.parent();

        var newSortField = th.text();
        if (newSortField == "time" && this.hiddenFields.hasOwnProperty("_time")) {
            newSortField = "_time";
        }
        if (this.activeSortField == newSortField) {
            this.activeSortIsAscending = !this.activeSortIsAscending;
        }
        this.activeSortField = newSortField;
        this.selectedRowIndex = -1;
        this.modifierKeyHeld  = false;
        this.getResults();
    },

    /**
     * given the XML response, get the "fieldOrder" information
     * which will used to control column-order when rendering.
     */
    getFieldOrder: function(response) {
        var fieldOrder = [];
        response.find("fieldOrder field").each(function(i, field) {
            fieldOrder.push($(field).text());
        });
        // splice in time as the first field if it's there AND if the only
        // explicitOrdering we have does NOT list _time in any particular order.
        var explicitOrdering =this.getFields();
        if (fieldOrder.indexOf("time")!=-1 && (explicitOrdering && this.getFields().indexOf("time")==-1)) {
            var timeArr = fieldOrder.splice(fieldOrder.indexOf("time"),1);
            fieldOrder = timeArr.concat(fieldOrder);
        }
        return fieldOrder;
    },

    /**
     * from the XML response, render the column row into the given tr.
     */
    renderColumnRow: function(response, tr) {
        tr.addClass("columnRow");

        for (var i=0,len=this.fieldOrder.length;i<len;i++) {
            var fieldName = this.fieldOrder[i];
            if (!this.hiddenFields.hasOwnProperty(fieldName)) {
                var th = $("<th>");
                th.append($("<span>").addClass("sortLabel").text(fieldName));
                if (this.allowSorting) {
                    th.addClass("sortable");
                    th.click(this.onSortClick.bind(this))
                    if (fieldName == this.activeSortField) {
                        th.addClass("activeSort");
                        if (!this.activeSortIsAscending) {
                            th.addClass("descending");
                        }
                    }
                    th.append($("<span>").addClass("sortArrow"));
                }

                tr.append(th);
            }
        }
    },

    /**
     * if set, the "rowClass" param can be used to give the Table a dynamic
     * CSS className at runtime, where the className incorporates one or more
     * $foo$ values from the upstream context.
     */
    setElementClass: function(elt, context, classParam) {
        if (!classParam) return;
        var classes = Sideview.utils.replaceTokensFromContext(classParam, context).split(" ");
        for (var j=classes.length-1;j>=0;j--) {
            elt.addClass(classes[j]);
        }
    },

    /**
     * if set, the "rowStyle" param can be used to give the Table a dynamic
     * CSS style at runtime, where the style incorporates one or more
     * $foo$ values from the upstream context.
     */
    setElementStyle: function(elt,context,styleParam) {
        if (!styleParam) return;
        var style= Sideview.utils.replaceTokensFromContext(styleParam, context);
        if (style) {
            elt.attr("style",style);
        }
    },

    /**
     * renders the given row of data into the table.
     */
    renderRow: function(table,rowIndex, row, context) {
        var tr = $("<tr>");
        table.append(tr);
        var rowDict = {};
        var rowContext = context.clone();

        var prefix = this.getParam("name");

        $(row).find("field").each(function(j,field) {
            field = $(field);

            var value = [];
            field.find("value text").each(function(k,singleValue) {
                value.push($(singleValue).text());
            });
            rowDict[field.attr("k")] = value;
            rowContext.set(prefix + ".fields." + field.attr("k"), value);
        });
        this.setElementClass(tr,rowContext,this.getParam("rowClass"));
        this.setElementStyle(tr,rowContext,this.getParam("rowStyle"));

        this.results.push(rowDict);

        var td;
        for (var j=0,jLen=this.fieldOrder.length;j<jLen;j++ ) {
            field = this.fieldOrder[j];
            //console.error(" fields " + field + " is it a hidden field? " + this.hiddenFields.hasOwnProperty(field));
            if (!this.hiddenFields.hasOwnProperty(field)) {

                if (this.templatedFields.hasOwnProperty(field)) {
                    td = this.renderTemplatedCell(tr, field, this.templatedFields[field], rowDict, rowIndex);
                }
                else if ($.isArray(rowDict[field]) && rowDict[field][0] == "##__SPARKLINE__##") {
                    td = this.renderSparklineCell(tr,field,rowDict[field]);
                }
                else {
                    td = this.renderDataCell(tr, field, rowDict[field]);
                }
                if (this.columnRenderingRules.hasOwnProperty(field)) {
                    var rule = this.columnRenderingRules[field];
                    if (rule.hasOwnProperty("class")) {
                        this.setElementClass(td,rowContext,rule["class"]);
                    }
                    if (rule.hasOwnProperty("style")) {
                        this.setElementStyle(td,rowContext,rule["style"]);
                    }
                }
            }
        }
        var hasSelectedIndex=(this.getParam("selectedIndex")>-1);

        if (this.hasAnyDefaultParams && !hasSelectedIndex && this.doesRowMatchDefaultValues(rowDict)) {
            tr.addClass("selected")
            this.selectedRowIndex = rowIndex;
            this.modifierKeyHeld  = false;
        }
        return tr;
    },

    doesRowMatchDefaultValues: function(row) {
        var defaultRow = this.getRowWithDefaultValues();
        var rowLength = row.length;

        var soFarSoGood = false;
        for (key in defaultRow) {
            if (!defaultRow.hasOwnProperty(key)) continue;
            // remember that values in both dicts are array-valued always. hence this loop.
            for (var i=0,defaultRowValueLength=defaultRow[key].length;i<defaultRowValueLength;i++) {
                if (!row.hasOwnProperty(key) || rowLength<defaultRowValueLength || row[key][i] != defaultRow[key][i]) return false;
                else soFarSoGood = true;
            }
        }
        return soFarSoGood;
    },

    /**
     * called when the given field is "templated" or in the language of the
     * Sideview docs, when the given field contains "embedded modules".
     * the specified module config is cloned and inserted into the tablecell.
     */
    renderTemplatedCell: function(tr, field, branchRoot, rowDict, rowIndex) {
        var prefix = this.getParam("name");
        var td = $("<td>");
        tr.append(td);
        var puck = $("<div>").appendTo(td);

        var retVal = Sideview.utils.cloneBranch(branchRoot,  this, rowIndex, puck);
        var clone = retVal[0];
        Sideview.utils.injectValuesIntoContext(clone, prefix + ".fields.", rowDict);

        clone.resetUI();

        clone.setLoadState(Sideview.utils.moduleLoadStates.HAS_CONTEXT);
        clone.onContextChange();
        clone.pushContextToChildren();
        return td;
    },

    /**
     *
     */
    renderSparklineCell: function(tr, field, value) {
        var td = $("<td>");
        tr.append(td);
        td.sparkline(value.slice(1),this.sparklineDefaults);
        return td;
    },

    /**
     * Called when the given cell in the table is to be rendered as a simple
     * data cell,  ie not as a "templated" cell.
     */
    renderDataCell: function(tr, field, value) {
        var td = $("<td>");
        if ($.isArray(value)) {
            for (var i=0,len=value.length;i<len;i++) {
                td.append(document.createTextNode(value[i]));
                if (i<len-1) {
                    td.append("<br>");
                }
            }
            tr.append(td);
        }
        else {
            tr.append(td
                .text(value || " ")
            )
        }
        return td;
    },


    /**
     * framework method called when the module needs to re-render it's data.
     */
    getResults: function($super) {
        var context = this.getContext();
        this._previousPostProcess = context.get("search").getPostProcess();
        return $super();
    },
    /**
     * framework method called when the XML response comes back from our
     * getResults() request.  This will render the entire table including
     * column headers, everytime.
     */
    renderResults: function(xmlStr) {
        this.resultsContainer.html("");
        this.results = [];
        this.fieldOrder = [];
        this.hiddenFields = {};
        var context = this.getContext();
        var selectedIndex = this.getParam("selectedIndex");

        if (xmlStr) {
            var response = $(xmlStr);


            var table = $("<table>").addClass("splTable");
            var tr = $("<tr>");

            // following two lines are order dependent.  The hiddenFields
            // logic needs to know the full list of returned fields
            // in this.fieldOrder.
            this.fieldOrder = this.getFieldOrder(response);
            this.hiddenFields = this.getHiddenFields(context);

            this.renderColumnRow(response, tr);
            this.resultsContainer.append(table);
            table.append(tr);

            var moduleReference = this;
            var results = response.find("result")


            results.each(function(i,row) {
                var tr = moduleReference.renderRow(table,i,row,context);
                if (moduleReference.getOffset(context)==0 && selectedIndex>-1 && i==selectedIndex) {
                    tr.addClass("selected");
                    moduleReference.selectedRowIndex = i;
                    moduleReference.modifierKeyHeld = false;
                }
            });
            moduleReference.checkDownstreamModuleVisibility(context);
            if (results.length==0) {
                var job = context.get("search").job;
                if (job && job.isDone()) {
                    this.displayNoResultsMessage();
                } else {
                    this.displayWaitingForResultsMessage();
                }
            }
        }

        this.onResultsRendered();
        if (this.hasAnyDefaultParams || this.selectedRowIndex>-1) {
            this.pushContextToChildren();
        }
    },

    /**
     * only called by module framework code.
     */
    getResultsErrorHandler: function($super, xhr, textStatus, errorThrown) {
        if (errorThrown=="Not Found") {
            var context = this.getContext();
            var search  = context.get("search");
            if (search.getPostProcess()) {
                this.displayPostProcessErrorMessage(search);
            }
        }
        return $super(xhr, textStatus, errorThrown);
    },

    /**
     * Empty template function to make customization easier.
     * (added in 2.3)
     */
    onResultsRendered: function() {},




    /**
     * I may be going to hell for all this dom construction, but it's
     * pleasantly dumb and reliable.
     */
    displayNoResultsMessage: function() {
        this.resultsContainer.html("");
        var message = $("<p>")
            .addClass("status")
            .addClass("emptyResults")
            .append(_('No results found. '))

        var context = this.getContext();
        var search  = context.get("search");
        if (search.isJobDispatched()) {
            var sid = search.job.getSearchId();
            var detailsLink = $('<a href="#">')
                .text(_("Show details"))

            message.append(detailsLink);

            var details = $("<p>")
                .addClass("details")
                .addClass("hidden")
                .append($("<b>").text(_("search:")))
                .append($("<span>").text(search.toString()))

            var postProcess = search.getPostProcess();
            if (postProcess) {
                details
                    .append($("<br>"))
                    .append($("<b>").text(_("postprocess search:")))
                    .append($("<span>").text(postProcess))
            }
            var inspectLink = $('<a href="#">')
                .text(_("Inspect ..."))
                .click(function(evt) {
                    Sideview.utils.launchJobInspector(sid);
                    evt.preventDefault();
                    return false;
                })
            details
                .append($("<br>"))
                .append(inspectLink);
            message.append(details);
            detailsLink.click(function(evt)  {
                var detailsDiv = $($(this).parents("div")[0]).find("p.details");
                if (detailsDiv.hasClass("hidden")) {
                    detailsDiv.removeClass("hidden");
                    $(this).text(_("Hide details"));
                } else {
                    detailsDiv.addClass("hidden");
                    $(this).text(_("Show details"));
                }
                evt.preventDefault();
                return false;
            });
        }
        this.resultsContainer.append(message);
    },

    /**
     * Give the user something while they're waiting.
     */
    displayWaitingForResultsMessage: function() {
        this.resultsContainer.html(
            '<p class="status">'
            + _('Waiting for search to complete...')
            + '</p>'
        );
    },

    /**
     * Splunk has had pretty poor behavior from the search API around
     * postprocess error states, for many years. We try to help the user
     * and/or the developer a bit here.
     */
    displayPostProcessErrorMessage: function(search) {
        if (search.job) {
            var sid = search.job.getSearchId();
            this.resultsContainer.html("");
            var message = $('<p class="status">');
            message.text(_('Splunkd returned a 404 error unexpectedly. Since there is a postprocess search here, this 404 is most likely caused by a syntax error in the postprocess search.'));
            this.resultsContainer.append(message);
            this.resultsContainer.append($("<span>").text("to troubleshoot, "));
            var link = $("<a>")
                .attr("href","search?sid=" + sid)
                .attr("target","_blank")
                .text("click here to try viewing the results without the postprocess search.");
            this.resultsContainer.append(link);
        }
        else {
            alert("unexpected error - error handler thrown but we don't even have a sid for this job");
        }
    }
});
