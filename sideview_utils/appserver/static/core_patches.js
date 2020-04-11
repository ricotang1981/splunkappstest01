/* Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved. */





$(document).bind("javascriptClassesLoaded", function() {


/**
 * Patch the Context class to give us a 'remove' method.
 */
Splunk.Context = $.klass(Splunk.Context, {
    _root : {},
    remove: function(key) {
        if (this.has(key)) {
            this.set(key,null);
            delete(this._root[key]);
        }
    }
});

/**
 * Patch the TimeRange class to support an explicit arg of 'all' for all_time
 */
if (Splunk.TimeRange) {
    // annoying static properties have to be preserved.
    var UTCRegex = Splunk.TimeRange.UTCRegex;
    var CORRECT_OFFSET_ON_DISPLAY = Splunk.TimeRange.CORRECT_OFFSET_ON_DISPLAY;
    var relativeArgsToString = Splunk.TimeRange.relativeArgsToString;
    Splunk.TimeRange = $.klass(Splunk.TimeRange, {
        toConciseString: function($super) {
            if (this._constructorArgs[0]=="all" && (this._constructorArgs[1]=="all" || this._constructorArgs[1]=="now")) {
                return _("over all time");
            }
            return $super();
        }
    });
    Splunk.TimeRange.UTCRegex = UTCRegex
    Splunk.TimeRange.CORRECT_OFFSET_ON_DISPLAY = CORRECT_OFFSET_ON_DISPLAY;
    Splunk.TimeRange.relativeArgsToString = relativeArgsToString;
}

/**
 * patch the Search class so that at the last second it doesnt actually send
 * 'all' as the 'all time' values for earliest/latest.  Instead send nothing.
 */
if (Splunk.Search && !Splunk.Search.hasOwnProperty("hammerDontHurtEm")) {
    var resurrectFromSearchId = Splunk.Search.resurrectFromSearchId;
    var resurrect = Splunk.Search.resurrect

    Splunk.Search = $.klass(Splunk.Search, {
        getJob: function() {return this.job},
        /**
         * 'private' method added by SVU, only called by our
         *  _startTransformedSearch method
         */
        _getDispatchArgs: function(searchStr) {
            var range = this.getTimeRange();
            // just sneaking in to remove our all/all because splunkd wont
            // know what we're talking about.
            if (range._constructorArgs[0]=="all" || range._constructorArgs[1]=="all") {
                for (var i=0;i<2;i++) {
                    if (range._constructorArgs[i]=="all") range._constructorArgs[i] = false;
                }
                // so, so, evil.
                range = range.clone();
            }

            var args = {
                "adhoc_search_level" : this._searchModeLevel,
                "auto_cancel"        : Sideview.utils.getAutoCancelInterval(),
                "auto_finalize_ec"   : this.getMaxEvents(),
                "earliest_time"      : range.getEarliestTimeTerms(),
                "latest_time"        : range.getLatestTimeTerms(),
                "label"              : this.getSavedSearchName(),
                "max_count"          : this.getMaxCount(),
                "max_time"           : this.getMaxTime(),
                "preview"            : this.getPreview(),
                "search"             : searchStr,
                "status_buckets"     : this.getMinimumStatusBuckets(),
                "namespace"          : Sideview.utils.getCurrentApp(),
                "ui_dispatch_app"    : Sideview.utils.getCurrentApp(),
                "ui_dispatch_view"   : Sideview.utils.getCurrentDisplayView(),
                "wait": 0
            };
            if (range.getAbsoluteEarliestTime() || range.getAbsoluteLatestTime()) {
                args["timeFormat"] = Sideview.utils.getConfigValue('DISPATCH_TIME_FORMAT');
            }

            var nonNullArgs = ["adhoc_search_level","auto_finalize_ec","label","max_count","max_time","preview"];
            for (var i=0,len=nonNullArgs.length;i<len;i++) {
                if (!args[nonNullArgs[i]]) {
                    delete args[nonNullArgs[i]];
                }
            }
            var fields = this.getRequiredFieldList();
            if (fields.length > 0) {
                args["required_field_list"] = fields.join(",");
            }
            if (this.getDistributedServerList().length>0) {
                args["remote_server_list"] = this.getDistributedServerList().join(",");
            }
            return args;
        },


        /**
         * framework method. We override the base implementation in order to
         * 1. remove Sideview's all/all convention from the timerange args.
         * 2. add and send the _preview flag, and thus implement the Search
         *    module's "preview" param.
         */
        _startTransformedSearch: function(searchStr, onSuccess, onFailure, group) {
            var args = this._getDispatchArgs(searchStr)

            this.logger.info('_startTransformedSearch - ' + searchStr + ' \n(earliest:' + args["earliest_time"] + "  latest:" + args["latest_time"] + ")");

            var statusMonitor = false;
            if (Splunk.Globals.hasOwnProperty("PageStatus")) {
                statusMonitor = Splunk.Globals["PageStatus"].register("Search - new job being dispatched.");
            }

            $.post(
                Sideview.utils.make_url("api/search/jobs"),
                args,
                function(data) {
                    if (!data) {
                        console.error("that's odd.  callback from jobs endpoint had no data argument at all");
                        if (onFailure) onFailure(this);
                    }
                    else if (data["success"] && data["data"]) {
                        if (!this.job) {
                            this.job = new Splunk.Job(this.toString());
                        }
                        this.job.setSearchId(data["data"]);
                        this.job.setAsAutoCancellable(true);
                        onSuccess(this);
                        if (!this.job.getCreateTime()) {
                            var ct = new Date().getTime()/1000;
                            this.job.setCreateTime(ct);
                        }
                        $(document).trigger("jobDispatched", [this.job, group]);
                        if (statusMonitor) statusMonitor.loadComplete();
                    }
                    else if (!data["success"]) {
                        this.logger.error("Search - dispatch failed: ", data);
                        if (data.hasOwnProperty("messages")) {
                            var messages = data["messages"];
                            for (var i=0,len=messages.length; i<len; i++) {
                                var msg = messages[i];
                                var className = (msg["type"]=="FATAL") ? "splunk.services" : "splunk.search.job";

                                Sideview.utils.broadcastMessage(msg["type"].toLowerCase(), className, msg["message"]);
                            }
                        } else {
                            Sideview.utils.broadcastMessage("fatal", "splunk.search.job",
                                _("Splunkd failed to dispatch a search but no messages came back on the response.")
                            );
                        }
                        if (onFailure) onFailure(this);
                    }
                    else {
                        Sideview.utils.broadcastMessage("fatal", "splunk.search.job", _("Received a successful response from a dispatch POST but no sid:"));
                        this.logger.error("Received a successful response from a dispatch POST but no sid. ", data);
                        if (onFailure) onFailure(this);
                    }
                }.bind(this),
                "json"
            );
        },

        setPreview: function(preview) {
            if (!{"true":1,"false":1,"auto":1}.hasOwnProperty(preview)) {
                this.logger.error("Someone tried to set an illegal value for the preview arg - " + preview);
                return;
            }
            this._preview = preview;
        },

        getPreview: function() {
            return this._preview || false;
        },



        /**
         * SearchMode.js is poorly implemented.  It works only using
         * onBeforeJobDispatched rather than getModifiedContext.
         * The result creates very nasty bugs with timeline interaction and
         * the module does horrible things if you ever use it in a dashboard.
         * Some of these problems are fixable by patching clone like this...
         * but the module is just wrong. It makes no sense for this kind of
         * module to be below the dispatch point. It should be above the
         * dispatch point, it should be a non-dispatching module, it should
         * simply implement getModifiedContext like a normal module that
         * affects searches at dispatch time.
         * If its author is in the room with you at the moment, please look
         * over the top of your glasses at them sternly.
         */
        clone:function($super) {
            var clone = $super();
            if (this._searchModeLevel) clone._searchModeLevel = this._searchModeLevel;
            if (this._preview) clone._preview = this._preview;
            return clone;
        },

        /**
         * IE is lame. Unless you redeclare toString it somehow wraps the object here
         * with some internal toString implementation.
         */
        toString: function() {
            return this._fullSearchWithIntentions || this._baseSearch;
        },
        /**
         * conventions have weakened around abandonJob such that it's come to
         * be used as a general 'reset' method.
         * in a perfect world it should have had something like maybe an
         * assertion that there was in fact a job...
         * but be that as it may, these days it is called in interesting
         * places - notably after the onBeforeJobDispatched calls so
         * resetting statusBuckets and requiredFieldList is not safe.
         */
        abandonJob: function($super) {
            this.setPostProcess(false);

            if (this.isJobDispatched()) {
                return $super();
            }
            else {
                this.job = null;
                if (this._fullSearchWithIntentions && this._intentions.length == 0) {
                    this._baseSearch = this._fullSearchWithIntentions;
                }
                this._selectedEventCount = -1;
                this._selectedEventAvailableCount = -1;
            }
        }

    });
    Splunk.Search.resurrectFromSearchId = resurrectFromSearchId;
    Splunk.Search.resurrect = resurrect;
}

if (Splunk.DashboardManager) {
    Splunk.DashboardManager = $.klass(Splunk.DashboardManager, {

        initialize: function() {
            $(document).bind('jobResurrected',   this.onJobExists.bind(this));
            $(document).bind('jobDispatched',    this.onJobExists.bind(this));
            $(document).bind('jobProgress',      this.onJobProgress.bind(this));
            $(document).bind('jobDone',          this.onJobDone.bind(this));
            $(window).bind  ('resize',             this.handlePanelResize.bind(this));
            $(document).bind('allModulesLoaded', this.handlePanelResize.bind(this));
            $(document).bind('ChartManualResize', this.handlePanelResize.bind(this));
            if (this.insertPageBreakers) {
                $(document).bind('PrintStart', this.insertPageBreakers.bind(this));
            }
            if (this.removePageBreakers) {
                $(document).bind('PrintEnd', this.removePageBreakers.bind(this));
            }
            // setup the headers to auto-truncate long titles
            this.titleHeaders = $('.layoutCell .splHeader h2');
            this.handlePanelResize();

            this.searchIdToGroupNames = {};
            this.panelRowsSelector = 'div.layoutRow[class*="panel_row"]';

            var splunkVersion = Sideview.utils.getConfigValue("VERSION_LABEL");
            if (Sideview.utils.compareVersions(splunkVersion,"8") > 0) {
                var canaryCompatibleApps = ["cisco_cdr","shoretel","sideview_utils", "SA_cisco_cdr_axl", "cisco_uccx", "coronavirus_sideview", "covid19_sideview", "observeit", "canary", "control_minder", "shotgun_reporting", "sideview_admin_tools"];
                if (canaryCompatibleApps.indexOf(Sideview.utils.getCurrentApp()) != -1) {
                    // we just got here slightly earlier than their redirect
                    var methodReference = Splunk.util.redirect_to;
                    Splunk.util.redirect_to = function(someOtherURL) {
                        var url = Splunk.util.make_url("/splunkd/__raw/services/apps/local/canary?output_mode=json");
                        function canaryIsInstalled() {
                            document.location=Splunk.util.make_url(sprintf(
                                "/splunkd/__raw/services/sv_view/%s/%s",
                                Sideview.utils.getCurrentApp(),
                                Sideview.utils.getCurrentView()
                            ));
                        }
                        function canaryIsNotInstalled() {
                            alert("The advanced XML systems have indeed been disabled in Splunk 8.0 and you're about to be redirected to a page confirming this.\n\nHowever if you install the 'Canary' app from Sideview, this app will just work in the Canary UI instead of the old Advanced XML UI. \n\nTake a look at the Canary app from sideviewapps.com/apps/canary\n\nIf you have any problems or questions contact Sideview Support (support@sideviewapps.com)");
                            return methodReference(someOtherURL)
                        }
                        $.get(url,canaryIsInstalled)
                            .fail(canaryIsNotInstalled);
                    }
                }
            }
        },

        onJobDone: function() {
            if (!this.editMode) setTimeout(this.equalizeHeights, 500);
        },

        equalizeHeights: function() {
            $(".equalHeightRow").each(function() {
                var panels = $(this).find(".layoutCellInner");
                if (panels.length==1) return;
                var minHeightCss = {'min-height': 0}

                panels.css(minHeightCss);
                if ($.browser.msie && $.browser.version == 6) {
                    panels.css({'height': 0});
                }

                var max = 0;
                panels.each(function(i) {
                    max = Math.max(max,$(this).height());
                });

                if ($.browser.msie && $.browser.version == 6) {
                    panels.css({'height': max});
                }
                minHeightCss["min-height"] = max;
                panels.css(minHeightCss);
            });
        },

        handlePanelResize: function() {
            this.rerenderTitleHeaders();
            this.equalizeHeights();
        },

        rerenderTitleHeaders: function() {
            this.titleHeaders.each(function() {
                if ($(this).attr('title')) {
                    var charWidth = parseInt(Math.pow($(this).parent().width() / 12 - 15, 1.15), 10);
                }
            });
        }
    });
}

if (Splunk.Module.Message) {
    Splunk.Module.Message = $.klass(Splunk.Module.Message, {
        initialize: function($super, container){
            $super(container);

            // Splunk UI team secretly switched our messaging bus with Folger's crystals.
            // It took a while to notice!
            // specifically,  as of 6.3 if not before, advanced XML views import
            // splunk-components.js,  which itself contains a different definition of
            // Splunk.Messenger.Bus and Splunk.Messenger.System, as well as the static method
            // Splunk.Messenger.System.getInstance.
            // the implementation is probably decent but it doesn't matter.  Splunk-components
            // gets require'd into the picture too late. End result is that the advanced xml
            // message SUBSCRIBERS have all subscribed to the old dead bus,  whereas the
            // clobbering/shadowing ensures that all messages are broadcast on the new
            // splunk-components bus where there no subscribers.
            // this attempts to adapt the old interface to the new.
            this.messenger.receive("*", null, this.unshift.bind(this), undefined, true);
        }
    });
}


/**
 * patching SearchBar so that it can follow new Sideview conventions.
 */
if (Splunk.Module.SearchBar) {
    Splunk.Module.SearchBar = $.klass(Splunk.Module.SearchBar, {
        getModifiedContext: function($super) {
            var modCon = $super();
            var value = this._getUserEnteredSearch();
            value = Sideview.utils.removeInitialCommand(value);
            // note - it looks like we're not following our own convention here.
            // However the way I see it, is that Splunk's SearchBar always assumes
            // that the user has themselves escaped everything already.
            // therefore value and rawValue are the same.
            modCon.set("searchBar.rawValue", value);
            modCon.set("searchBar.value", value);
            modCon.set("searchBar", value);
            return modCon;
        },
        setToContextValue: function(context) {
            var value = context.get("searchBar") || context.get("searchBar.value") || context.get("q");
            if (!value) {
                var search  = context.get("search");
                if (search.hasIntentions()) {
                    var errorMessage = "Sideview is neither designed nor tested to work with Splunk's intentions system. An intention was detected upstream from " + this.moduleType + ". UI Behavior may be unexpected.";
                    try {console.error(errorMessage);}
                    catch(e) {this.logger.error(errorMessage);}
                    search.absorbIntentions(function(newQ) {
                        this.setInputField(Sideview.utils.removeInitialCommand(newQ));
                    }.bind(this));
                } else {
                    value = search.toString();
                    if (value=="*") value="";
                    if (!value) return;
                }
            }
            if (value=="*") value="";
            this.setInputField(value);
            if (this.resize) this.resize._resizeSearchBar();
        },
        onContextChange: function() {
            this.setToContextValue(this.getContext());
        },
        updateURL: function() {
            var context = this.getContext();
            if (context.has("sideview.onEditableStateChange")) {
                var callback = context.get("sideview.onEditableStateChange");
                var searchStr = this._getUserEnteredSearch();
                searchStr = Sideview.utils.removeInitialCommand(searchStr);
                callback("searchBar", searchStr, this);
            }
        },
        _onFormSubmit: function($super) {
            this.updateURL();
            return $super();
        },
        applyContext: function(context) {
            var search = context.get("search");

            // legacy resurrection logic.
            if (!this.isPageLoadComplete()) {
                search.clone().absorbIntentions(function(newQ) {
                    this.setInputField(Sideview.utils.removeInitialCommand(newQ));
                    this.setChildContextFreshness(false);
                }.bind(this));
                search.clearIntentions();
                context.set("search", search);
            }

            else if (search._intentions.length == 1) {
                var name = search._intentions[0]["name"];
                if (name != "addterm" && name != "negateterm") return false;
                if (name=="addterm") {
                    search._intentions[0]["name"] = "toggleterm";
                }
                var thisSearchStr = $.trim(this._getUserEnteredSearch()) || "*";
                search.setBaseSearch(thisSearchStr);
                context.set("search", search);
                search.clone().absorbIntentions(function(str) {
                    this.setInputField(Sideview.utils.removeInitialCommand(str));
                    this.updateURL();
                    this.pushContextToChildren();

                }.bind(this));
                return true;
            }
            return false;
        }
    });
}

/**
 * patching TimeRangePicker so it will output the same generic tokens the
 * sideview modules output for timeranges.
 * Also very substantial changes were required to bring TRP into line with
 * prepopulation conventions in Sideview.
 */
if (Splunk.Module.TimeRangePicker) {
    Splunk.Module.TimeRangePicker = $.klass(Splunk.Module.TimeRangePicker, {
        // sneaking in and fixing Splunk's bug for them. Removing the
        // "default times.conf label" entry from menu.
        initialize: function($super, container) {
            // specifically we just remove it from the param dict before the
            // base constructor is even called.
            var moduleId = $(container).attr('id');
            if (Splunk.Module.loadParams.hasOwnProperty(moduleId)) {
                var paramDict = Splunk.Module.loadParams[moduleId];
                var menuDict = paramDict.timeRangeJson;
                for (var len=menuDict.length,i=len-1;i>0;i--) {
                    if (menuDict[i].label == "default times.conf label") {
                        menuDict.splice(i);
                        break;
                    }
                }

            }
            return $super(container);
        },


        _fireAbsolute: function($super,fromDate, toDate) {
            Sideview.utils.patchToFixJSChartingClobbering(this.moduleType);
            return $super(fromDate,toDate);
        },
        getModifiedContext: function($super) {
            var modCon = $super();
            Sideview.utils.setStandardTimeRangeKeys(modCon);
            return modCon;
        },
        clearURLLoader: function(context) {
            context = context || this.getContext();
            // only do this once
            if (!this.hasClearedURLLoader && context.has("sideview.onSelectionSuccess")) {
                var callback = context.get("sideview.onSelectionSuccess");
                callback("search.timeRange.earliest", this);
                callback("search.timeRange.latest", this);
                this.hasClearedURLLoader = true;
                // this module is a mess; default and selected params are both
                // unreliable.
                this.initialSelection = this._activator.text();
            }
        },

        onContextChange: function() {
            var context = this.getContext();
            this.setToContextValue(context);
            this.clearURLLoader(context);
        },

        setToContextValue: function(context) {
            var earliest = context.get("search.timeRange.earliest");
            var latest   = context.get("search.timeRange.latest");
            var range    = new Splunk.TimeRange(earliest,latest);

            // first we check for the explicit 'all time' timerange.
            // (this is a Sideview convention.
            if ((range.getEarliestTimeTerms()=="all" && range.getLatestTimeTerms()=="all")) {
                range = new Splunk.TimeRange();
            }
            // then we check for the regular 'all time' timerange, which we
            // tend to call the "implicit all time" range.
            else if (range.isAllTime()) return;

            var earliest = range.getEarliestTimeTerms() || null;
            var latest   = range.getLatestTimeTerms()   || null;
            // walk through all our existing options and if there's a match, select it.
            var moduleInstance = this;
            var foundAMatch = false;
            var self = this;
            this._menu.getMenu().find('.timeRangePreset a').each(function(){
                var thisEarliest = $(this).attr(self.EARLIEST_TIME_ATTR) || null;
                var thisLatest   = $(this).attr(self.LATEST_TIME_ATTR)   || null;
                var thisRange = new Splunk.TimeRange(thisEarliest, thisLatest);
                if (range.equalToRange(thisRange)) {
                    moduleInstance._activator.text($(this).text())
                    moduleInstance._datePickerMode = false;
                    moduleInstance._selectedRange = range;
                    foundAMatch = true;
                    // this return is within an each(), so it's more like a break.
                    return true;
                }
            });
            if (foundAMatch) {
                return;
            }
            else {
                // create a new OPTION element, insert it, and select it
                this._insertNewMenuItem(range);
                return;
            }
        },

        updateURL: function() {
            // TRP is a bit of a mess; its property is only set *during* GMC.
            var context = this.getModifiedContext();
            if (context.has("sideview.onEditableStateChange")) {
                var callback = context.get("sideview.onEditableStateChange");
                callback("search.timeRange", this._selectedRange, this);
            }
        },
        _onMenuClick: function($super,evt) {
            var retVal = $super(evt);
            this.updateURL();
            return retVal;
        },
        renderResults: function($super,xmlDoc) {
            var retVal = $super(xmlDoc);
            if (this._selectedRange) this.updateURL();
            return retVal;
        },

        /* relies on the assumption that _applyCustomDateTime is only ever
           called in _applyCustomDateTime */
        _applyCustomDateTime: function($super) {
            var retVal = $super();
            if (retVal && this._selectedRange) this.updateURL();
            return retVal;
        },
        resetToDefault: function() {
            var selected = this.initialSelection;
            if (!selected) {
                this._activator.text(this.ALL_TIME_LABEL);
                return false;
            }
            var m = this;
            this._menu.getMenu().find(".timeRangePreset a").each(function() {
                var thisText = m._getRawLabel($(this).text()).toLowerCase();
                if (thisText == selected.toLowerCase()) {
                    m._setSelectedRangeToPreset($(this));
                    m._activator.text($(this).text());
                    return false;
                }
            });
        },
        /**
         * Splunk 7.2.5 introduced a regression that crippled TimeRangePicker's
         * "relative', "realtime" and "advanced" modes within "Custom Time".
         * It appears the intention was to sanitize user inputs,  by wrapping
         * two variables in a new global function introduced - Splunk.util.escapeSelector
         * The other module this was added to in 7.2.5 was EntitySelectLister.
         * In EntitySelectLister the diff is arguably sanitizing user input, since
         * it's conceivable that usernames might have characters that could damage
         * the jquery selector there and bend it into unintended consequences.
         * Here however the developer just flat out made a mistake.
         * a) This is not user input. It is a string that can only have one of 4
         * vlaues matching the 4 tabs within "custom time" mode.
         * b) "escaping" the selector cripples the functionality in all cases.
         * any minimal testing or code review would have and should have caught
         * this mistake before it shipped.
         */
        _setupCustomDateTime: function($super) {
            var splunkVersion = Sideview.utils.getConfigValue("VERSION_LABEL");
            if (Sideview.utils.compareVersions(splunkVersion,"7.2.5") >= 0) {
                // not quite sure how far back IE support goes these days but
                // let's not be the ones to find out.
                try {
                    console.warn("applying hotfix to TRP regression introduced by Splunk in 7.2.5");
                } catch(e) {}

                $super();
                var context = this;
                // the event handler that Splunk's code will have created, will be broken so remove it.
                $('.rangeType input[type="radio"]', this._customDateTimePopup).off("click");
                // and we add one that works.  Basically just putting it back as it was in 7.2.4.2
                $('.rangeType input[type="radio"]', this._customDateTimePopup).click(function(){
                    var justSelected = '.' + $(this).val();
                    $('.visibleDateTimePanel', context._customDateTimePopup)
                        .removeClass('visibleDateTimePanel')
                        .fadeOut('fast', function(){
                            $('.dateTimePanel', context._customDateTimePopup).css('display','none');
                            // this is the line they mistakenly wrapped justSelected in a call to
                            // Splunk.util.escapeSelector()
                            $(justSelected, context._customDateTimePopup).fadeIn('fast').addClass('visibleDateTimePanel');
                        });
                });
            }
            else {
                return $super();
            }
        }
    });
}

/**
 * Patch FlashChart, because it calls getContext onConnect, which generally
 * happens before the page has finished loading.  These getContext calls
 * cascade back upstream and cause horrible race conditions and stale cache
 * bugs.  The framework over the years has been given all kinds of
 * stale-cache-detection by Nate and myself, and then by myself again at the
 * Sideview layer.  (See URLLoader, see pseudoPush in TextField, etc.)
 * Yet by the numbers the biggest source of these bugs, is the dang calls to
 * getContext that happen within onConnect.
 * see inline comments for more detail.
 */
if (Splunk.Module.FlashChart) {
    Splunk.Module.FlashChart = $.klass(Splunk.Module.FlashChart, {
        onChartClicked: function($super,event) {
            this.lastKnownData   = event.data;
            this.lastKnownFields = event.fields;
            return $super(event);
        },
        onLegendClicked: function($super,event) {
            var arr = Splunk.Legend._targetMap["swfObject_" + this.moduleId].labels;
            var map = {};
            for (var i=0,len=arr.length;i<len;i++) {
                map[arr[i]] = "1";
            }

            this.lastKnownData = map;
            this.lastKnownFields = [];
            return $super(event);
        },
        onContextChange: function($super) {
            this.lastKnownData   = false;
            this.lastKnownFields = false;
            return $super();
        },
        getModifiedContext: function($super) {
            var modCon = $super();
            if (!this.lastKnownFields || !this.lastKnownData) {
                return modCon;
            }
            var xField;

            if (this.lastKnownFields.length>0 && this.lastKnownFields[0] !="_time" && modCon.get(this.drilldownPrefix + ".value")) {
                xField = this.lastKnownFields[0];
            }
            Sideview.utils.setDrilldownSearchTerms(modCon, this.drilldownPrefix, xField, this.lastKnownData);
            Sideview.utils.escapeLegacyKeyValues(modCon,this.drilldownPrefix);
            return modCon;
        },
        onConnect: function() {
            Splunk.Legend.register(this.bridge.id());
            Splunk.Legend.addEventListener("setLabels", this.legend_onSetLabels);
            Splunk.Legend.addEventListener("labelIndexMapChanged", this.legend_onLabelIndexMapChanged);
            this.bridge.addEventListener('chartClicked', this.onChartClicked.bind(this));
            this.bridge.addEventListener('legendClicked', this.onLegendClicked.bind(this));

            this._isBridgeConnected = true;
            this.setPresentation();

            /**
             * onConnect should not call onContextChange if the page is loading.
             * 1) if we're connecting when the page is loaded and we have fresh
             *    context data, but onContextChange has never been called yet,
             *    then everything will be fine; the call to onContextChange
             *    will be made by the framework when the push gets here.
             * 2) if we're connecting when the contexts are fresh, but our
             *    onContextChange was called earlier when swf was asleep,
             *    then all is well - isPageLoadComplete() will
             *    return true, and this will indeed trigger onContextChange.
             * 3) if the SWF has connected before the
             *    framework has pushed correct context data, then an
             *    onContextChange call here would ONLY DO HARM.
             */
            if (this.isPageLoadComplete()) this.onContextChange();

            this.bridge.addEventListener('updated', this.onDataUpdated.bind(this));
            this.bridge.addEventListener("openAsImage", this.onOpenAsImage.bind(this));
            this.setBridgeProperty("enableOpenAsImage", !jQuery.browser.msie);//ie does not support uri data scheme.
            this.setBridgeProperty("timeZone", Sideview.utils.getConfigValue('SERVER_ZONEINFO'));
            /**
             * this is a mess, in that I'm not sure why we need to call occ
             * above, then tweak some listeners and properties, then call another
             * explicit update().   However at the least, it is NOT safe to do so
             * if the page is still loading. (see above.)
             */
            if (this.isPageLoadComplete()) this.update();

            this.swfLoadMonitor.loadComplete();
            if (this._enableDrilldown) {
                this.setBridgeProperty("enableChartClick", true);
                this.setBridgeProperty("enableLegendClick", true);
            }
        },
        _changeVisibility: function(invisibilityMode) {
            var visible = true;
            for (var mode in this._invisibilityModes) {
                if (this._invisibilityModes.hasOwnProperty(mode)) {
                    visible = false;
                }
            }
            if(visible){
                this.container.show();
                this.connectBridge(true);
            }else{
                this.bridge.close();
                this.container.hide();
            }
        },


        resolveStaticURL: function($super,propertyName, propertyValue) {
            if (propertyValue && propertyValue.hasOwnProperty("substring")) {
                return $super(propertyName, propertyValue);
            } else {
                return "" + propertyValue;
            }
        }

    });
}

if (Splunk.Module.FlashTimeline) {
    Splunk.Module.FlashTimeline = $.klass(Splunk.Module.FlashTimeline, {
        onSelectionChanged: function($super,event) {

            if (isNaN(event.selectionMinimum) || isNaN(event.selectionMaximum) || (event.selectionMinimum === event.selectionMaximum)) {
                return $super(event);
            }

            var context = this.getContext();
            var callback = context.get("onTimelineSubsetSelected");

            var selectedBuckets = this._timeline ? this._timeline.getSelectedBuckets() : null;
            if (selectedBuckets && callback && typeof(callback)=="function") {
                var range = this.getSelectionRange(selectedBuckets);
                if (range && !range.isAllTime()) {
                    callback(range);
                }
            }

            return $super(event);
        }
    })
}

if (Splunk.Module.JSChart) {
    // we have to preserve refs to static properties and methods.
    var staticFoo = {};
    staticFoo.chartByIdMap    = Splunk.Module.JSChart.chartByIdMap;
    staticFoo.getChartById    = Splunk.Module.JSChart.getChartById;
    staticFoo.setChartById    = Splunk.Module.JSChart.setChartById;
    staticFoo.RenderThrottler = Splunk.Module.JSChart.RenderThrottler

    Splunk.Module.JSChart = $.klass(Splunk.Module.JSChart , {
        initialize: function($super,container) {
            $(".JSChartContainer", container).html("");
            var retVal = $super(container);
            this.resultsAreStale = true;
            this.redrawNeeded = true;
            this.resetUI();
            return retVal;
        },

        clearClickData: function() {
            this.lastKnownData   = false;
            this.lastKnownFields = [];
            this.lastKnownSelectedElement = false;
        },

        extractClickData: function(evt) {
            if (evt.hasOwnProperty("rowContext")) {
                var fields = [];
                var values = {};
                var field;
                for (f in evt.rowContext) {
                    if (evt.rowContext.hasOwnProperty(f)) {
                        field = f.replace("row.","")
                        fields.push(field);
                        values[field] = evt.rowContext[f];
                    }
                }
                this.lastKnownFields = fields;
                this.lastKnownValues = values;
            }
            else {
                this.lastKnownFields = evt.fields;
            }
            this.lastKnownData = this.legendFieldList;
        },

        setSelectionData: function(evt) {
            this.lastKnownSelectedElement = this.container;
        },

        onChartClicked: function($super,evt) {

            this.extractClickData(evt);
            this.setSelectionData(evt)

            var pctc = this.pushContextToChildren;
            this.pushContextToChildren = function() {}
            var retVal = $super(evt);

            if(evt.name === '_time' && evt._span) {
                var duration = parseFloat(evt._span),
                    sT = parseInt(evt.value, 10),
                    eT = sT + duration;
                var r = new Splunk.TimeRange(sT, eT);
                r.setAsSubRangeOfJob(true);
                this._selection.timeRange = r;
            }
            this.pushContextToChildren = pctc;
            this.pushContextToChildren();

        },

        onLegendClicked: function($super,evt) {
            this.lastKnownFields = [];
            this.lastKnownData = this.legendFieldList;
            this.setSelectionData(evt)
            return $super(evt);
        },

        onContextChange: function() {
            this.clearClickData();

            this._selection = null;
            $('.messageContainer', this.container).hide().html('');
            this.hideDescendants(this.DRILLDOWN_VISIBILITY_KEY + "_" + this.moduleId);

            var context = this.getContext();
            var search = context.get("search");
            var sid = context.get('charting.data.jobID') || search.job.getSearchId();

            this.extractPropertiesFromContext(context, search, sid);

            if (this.sid != sid) {
                if(this.sid != 0) {
                    this.destroyChart();
                    this.response = false;
                }
                this.sid = sid;
            }
            this.getResults();
        },

        // tone down onJobProgress which make some redundant requests
        onJobProgress: function($super) {
            var context = this.getContext();
            var search  = context.get("search");
            if (!search.job.isDone()) {
                return $super();
            }
        },

        getModifiedContext: function($super) {
            var modCon = $super();
            if (!this.lastKnownFields || !this.lastKnownData) return modCon;
            var xField;
            if (this.lastKnownFields.length>0 && this.lastKnownFields[0] !="_time" && modCon.get(this.drilldownPrefix + ".value")) {
                xField = this.lastKnownFields[0];
            }
            if (this.lastKnownSelectedElement) {
                modCon.set("click.selectedElement",Sideview.utils.makeUnclonable(this.lastKnownSelectedElement));
            } else {
                modCon.set("click.selectedElement",false);
            }

            Sideview.utils.setDrilldownSearchTerms(modCon, this.drilldownPrefix, xField, this.lastKnownData);
            Sideview.utils.escapeLegacyKeyValues(modCon,this.drilldownPrefix);
            return modCon;
        },

        // Another patch for buggy behavior.  Base implementation doesn't
        // check for presence of substring() method.  So when an object is
        // passed,  you'll get an exception that hangs the page.
        resolveStaticURL: function($super, propertyName, propertyValue) {
            if (propertyValue && !propertyValue.substring) return;
            return $super(propertyName, propertyValue);
        },

        // yet more patchery.   JSChart.getChartReadyData only checks for
        // !response.  It doesn't check whether the dict exists, but is
        // incomplete.
        // That said, this isn't really fix the root cause.
        // the root cause is that JSChart is a mess.   It uses a "this.response"
        // property which is a code smell problem by itself.  But during draw()
        // the property is only written if response exists AND it has a columns
        // property.   If it exists but has no columns property, it falls into
        // some code that nonetheless assumes that the columns property exists.
        // This is just a patch to prevent that JS exception.  If I can get a
        // reproducible case to give me more certainty around the root cause
        // and around what the purpose of sliceResultsBySeriesLength is, I'll
        // try and put in a more comprehensive fix.
        getChartReadyData: function($super, response, fieldInfo, properties) {
            if (!response) response = {};
            if (!response.hasOwnProperty("columns")) response["columns"] = [];
            if (!response.hasOwnProperty("fields")) response["fields"] = [];
            return $super(response, fieldInfo, properties);
        }
    });
    for (foo in staticFoo) {
        if (staticFoo.hasOwnProperty(foo)) {
            Splunk.Module.JSChart[foo] = staticFoo[foo];
        }
    }
}

if (Splunk.Module.JobProgressIndicator) {
    Splunk.Module.JobProgressIndicator = $.klass(Splunk.Module.JobProgressIndicator, {
        initialize: function($super,container) {
            var retVal = $super(container);
            this._invisibilityReason = "Without a running job there is no progress";
            this.hide(this._invisibilityReason);
            return retVal;
        },

        onJobProgress: function() {
            var context = this.getContext();
            var search  = context.get("search");
            if (search.job.isRealTimeSearch()) {
                this.hide(this._invisibilityReason);
                return;
            }
            this.statusText.text(_("Loading..."));
            this.show(this._invisibilityReason);
            this.displayProgress(search.job.getDoneProgress());
        },
        onJobDone: function() {
           this.hide(this._invisibilityReason);
        }
    });
}

/**
 * Patch the SimpleResultsTable module to provide ALL of the values in the
 * given row when it supplies drilldown information to downstream modules.
 * Also patching to escape backslashes in cell values and column names.
 */
if (Splunk.Module.SimpleResultsTable) {
    Splunk.Module.SimpleResultsTable = $.klass(Splunk.Module.SimpleResultsTable, {
        getSelectionState: function($super, evt) {
            var selection = $super(evt);
            var context = this.getContext();

            // if the user clicks the first column, the name2,value2 keys are
            // nothing but trouble for downstream logic. lose em.
            // CORRECTION - ConvertToDrilldownSearch gets VERY UNHAPPY if
            // these otherwise redundant keys are not there.
            //if (selection.name==selection.name2) {
            //    delete selection["name2"];
            //    delete selection["value2"];
            //}
            var legacyKeys = ["name","value","name2","value2"];
            var key, rawKey;
            for (var i=0,len=legacyKeys.length;i<len;i++) {
                key = legacyKeys[i];
                rawKey = "raw" + key.charAt(0).toUpperCase() + key.slice(1);
                if (selection.hasOwnProperty(key)) {
                    selection[rawKey] = selection[key];
                    selection[key] = Sideview.utils.escapeForSearchLanguage(selection[key]);
                }
            }
            var el = $(evt.target);

            var tdNodes = $(el.parents("tr")[0]).find("td:not('.pos')");
            var moduleReference = this;

            var displayRowNumbers = context.get("results.displayRowNumbers");
            if (displayRowNumbers=="on") displayRowNumbers=true;
            var compensator = (Sideview.utils.normalizeBoolean(displayRowNumbers))?1:0;

            var name,value,escapedName,escapedValue;
            tdNodes.each(function(i) {
                name  = moduleReference.getColumnName(i+compensator,el);
                value = $(this).text();
                escapedName  = Sideview.utils.escapeForSearchLanguage(name);
                escapedValue = Sideview.utils.escapeForSearchLanguage(value);
                selection["cell" + i + ".name"]  = escapedName;
                selection["cell" + i + ".value"] = escapedValue;
                selection["cell" + i + ".rawValue"] = value;
                selection["fields." + name] = escapedValue;
                selection["fields." + name + ".rawValue"] = value;
                if (name=="_time" && $(this).attr("starttime")) {
                    selection["fields." + name + ".epochTime"] = $(this).attr("starttime");
                }
            });

            return selection;
        },
        // patches a bug whereby ctrl-click only pops up new windows
        // in ViewRedirector and Redirector when drilldownPrefix happens to
        // be 'click'.
        getModifiedContext : function($super) {
            var modCon = $super();
            if (this._selection) {
                var compensator = (Sideview.utils.normalizeBoolean(modCon.get("results.displayRowNumbers")))?1:0;
                modCon.set("click.modifierKey", this._selection.modifierKey);
                var tdNodes = $(this._selection.element.parents("tr")[0]).find("td:not('.pos')");
                var moduleReference = this;
                var valueMap = {};
                tdNodes.each(function(i) {
                    var name  = moduleReference.getColumnName(i+compensator,moduleReference._selection.element);
                    valueMap[name] = $(this).text();
                });
                var xField = modCon.get(this.drilldownPrefix + ".name");
                if (xField=="_time") xField=false;
                Sideview.utils.setDrilldownSearchTerms(modCon, this.drilldownPrefix, xField, valueMap);
                //NOT needed, because for SRT we take care of this in getSelectionState.
                //Sideview.utils.escapeLegacyKeyValues(modCon,this.drilldownPrefix);
            }
            modCon.set("results.upstreamPagerCallback", null);
            modCon.remove("results.count");
            return modCon;
        },
        renderResults: function($super, htmlFragment) {
            var retVal = $super(htmlFragment);
            $('td[field="OTHER"]',this.container).addClass("d");
            $('td[field="NULL"]',this.container).addClass("d");
            return retVal;
        },
        onLoadStatusChange: function($super, statusInt) {
            $super(statusInt);
            if (!this.isPageLoadComplete()) {
                this.hideDescendants(this.DRILLDOWN_VISIBILITY_KEY + "_" + this.moduleId);
            }
        }
    });
}
});

