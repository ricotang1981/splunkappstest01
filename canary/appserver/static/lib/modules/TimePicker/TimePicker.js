// Copyright (C) 2010-2020 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "api/SplunkSearch",
  "svmodule",
  "time_range",
  "jquery-ui",
  "jquery-timepicker"],
  function($, Sideview, SplunkSearch, Module, TimeRange) {

class TimePicker extends Module {

    constructor(container, params) {
        super(container, params);
        this.CURRENT_TIMERANGE_EARLIEST_PREF = "dispatch.timeRange.earliest";
        this.CURRENT_TIMERANGE_LATEST_PREF = "dispatch.timeRange.latest";

        this.pushWhenDone = false;
        this.preferencesDeferred = $.Deferred();

        this.itemsToLoad = [this.loadPreselectedTimes(), this.preferencesDeferred];

        $.when(...this.itemsToLoad)
            .done(function() {
                // TODO - pushWhenDone logic doesn't account for preferences race?
                // or maybe it's moot because pushWhenDone implies there was an onContextChange
                if (this.pushWhenDone) {
                    this.pushDownstream(this.wasPageStillLoadingOnOriginalPush);
                    this.wasPageStillLoadingOnOriginalPush = false;
                    this.pushWhenDone = false;
                }
            }.bind(this));

        $(document).bind("keyup", this.onKeyUp.bind(this))

        this.pushAfterRendering = false;
        this.wasPageStillLoadingOnOriginalPush = false;
    }

    onKeyUp(evt) {
        // and 27 was the number of the escape key
        // and the number of the escape key was 27
        if (evt.keyCode==27 && this.theNothing) {
            this.closeCustomTimeLayer(false);
        }
    }

    /***********************
    * preferences things
    ************************/
    getPreferenceKeyNames() {
        return [this.CURRENT_TIMERANGE_EARLIEST_PREF, this.CURRENT_TIMERANGE_LATEST_PREF];
    }

    loadPreferences(prefsDict) {
        var retVal = false;
        this._havePreferencesLoaded = 1;
        if (this._weDontCareAboutDefaultsAnyMore) return false;

        if (!prefsDict.hasOwnProperty(this.CURRENT_TIMERANGE_EARLIEST_PREF) &&
            !prefsDict.hasOwnProperty(this.CURRENT_TIMERANGE_LATEST_PREF)) {

            if (this._menusAreBuilt==1){
                this.setDefaultTimeRange();
            }
        }
        else {
            var earliest = prefsDict[this.CURRENT_TIMERANGE_EARLIEST_PREF] || "";
            var latest = prefsDict[this.CURRENT_TIMERANGE_LATEST_PREF] || "";
            this.setSelectedTimeRange(new TimeRange(earliest, latest));
            retVal = true;
        }
        return retVal;
    }

    onPreferencesLoaded() {
        this.preferencesDeferred.resolve();
    }


    /***********************
    * async loading things
    ************************/
    loadPreselectedTimes() {
        //output_mode=json&sort_key=order&sort_mode=num&search=disabled%3D0&count=-1
        var args = {
            "output_mode":"json",
            "sort_key":"order",
            "sort_mode":"num",
            "search":"disabled=0",
            "count":"-1"
        };
        var url = sprintf("/splunkd/__raw/servicesNS/%s/%s/configs/conf-times?%s", Sideview.getCurrentUser(), Sideview.getCurrentApp(),Sideview.dictToString(args));

        return $.get(Sideview.make_url(url),this.handleTimesConfResponse.bind(this));
    }

    handleTimesConfResponse(jsonResponse) {
        this.buildMenus(jsonResponse);
        this.initMenus();

        if (this.selectedRange) {
            this.setSelectedTimeRange(this.selectedRange);
        }
        else if (!this._weDontCareAboutDefaultsAnyMore && this._havePreferencesLoaded) {
            this.setDefaultTimeRange();
        }
    }

    getDeferredItems() {
        return this.itemsToLoad;
    }

    // TODO - this should be pulled up into the base module class....
    isReadyForContextPush() {
        for (var i=0;i<this.itemsToLoad.length; i++) {
            var item = this.itemsToLoad[i];
            if (item.state()!="resolved") {
                return this.DEFER;
            }
        }
        return this.CONTINUE;
    }

    pushDownstream(pageIsLoading) {
        var ready = this.isReadyForContextPush();
        if (ready) {
            return this._pushDownstream(pageIsLoading);
        }
        else {
            this.pushWhenDone = true;
            this.wasPageStillLoadingOnOriginalPush = pageIsLoading
        }
        return [];
    }

    setSelectedTimeRange(range, label) {
        this.selectedRange = range;
        var timeRangeLabel = $("ul.top > li.topLevel > a",this.container);
        if (!range || !range.toConciseString) {
            console.error("Assertion failed - what is this range you've given me cause it's not a range");
            console.error(range);
            console.error(label);
            console.trace();
        }
        if (label) {
            timeRangeLabel.text(label);
        }
        else {
            timeRangeLabel.text(this.selectedRange.toConciseString());
        }
    }

    buildSubMenus(jsonResponse) {
        var subMenus={};
        for (var i=0,len=jsonResponse.entry.length;i<len;i++) {
            var stanza=jsonResponse.entry[i];
            if (stanza.disabled) continue;
            if (stanza.content.sub_menu) {
                if (!subMenus.hasOwnProperty(stanza.content.sub_menu)) {
                    subMenus[stanza.content.sub_menu] = [];
                }
                subMenus[stanza.content.sub_menu].push(
                    $("<li>").append($("<a>")
                        .attr("href","#")
                        .attr("s:earliest_time", stanza.content.earliest_time)
                        .attr("s:latest_time",stanza.content.latest_time)
                        .text(stanza.content.label))
                );
            }
        }
        return subMenus;
    }

    /**
     *  This is only run once,  not exactly when the page starts but when
     * the call made in the constructor, to /services/configs/conf-times
     * comes back with json data..
     */
    buildMenus(jsonResponse) {
        var subMenus=this.buildSubMenus(jsonResponse);
        var ul = $("<ul>");

        for (var i=0,len=jsonResponse.entry.length;i<len;i++) {

            var stanza=jsonResponse.entry[i];
            if (stanza.content.disabled) continue;
            if (stanza.name=="settings") continue;
            if (!stanza.content.is_sub_menu && stanza.content.sub_menu) {
                continue;
            }
            var label = stanza.content.label;
            var customDict = {
                "earliest_time":stanza.content.earliest_time,
                "latest_time"  :stanza.content.latest_time
            }
            var sub = false;
            if (stanza.content.is_sub_menu && subMenus.hasOwnProperty(label)) {
                sub = $("<ul>").addClass("svMenu");
                for (var j=0,jLen=subMenus[label].length;j<jLen;j++) {
                    sub.append(subMenus[label][j]);
                }
            }
            Sideview.renderMenuItem(ul, "#", label, sub, customDict);
        }
        Sideview.renderMenuItem(ul, "#", "Custom Time...", null, {"custom":"1"});
        $("ul.top li",this.container).append(ul);
        this._menusAreBuilt = 1;
    }

    alignSubMenu(li) {
        console.error("this implementation has never been tested in this module");
        $("ul ul",this.container).css("left","auto");
        $(this).find("> ul")
            .css("display","block");
        var menu = $(li.find("> ul")[0]);
        var menuRight = menu.offset().left + menu.width();

        var delta = menu.offset().left - menu.position().left;

        if (menuRight > $(window).width()) {
            menu.css("left",$(window).width()-menu.width()-2 - delta );
        } else {
            menu.css("left","auto");
        }
    }

    getTimeRangeForAnchor(anchor) {
        return new TimeRange(anchor.attr("s:earliest_time"), anchor.attr("s:latest_time"));
    }

    getMenuItemByLabel(label){
        var loweredLabel = label.toLowerCase();
        var item = false;
        $("a",this.container).each(function(link) {
            if ($(this).text().toLowerCase() == loweredLabel) {
                item = $(this);
                return;
            }
        });
        return item;
    }
    /**
     * KNOWN ISSUE - Race condition exists between the menu load, and the page load.
     * the TimePicker module doesn't block the pageLoad push and prepopulation until
     * after the times have been loaded. as a result, nothing ever can prepopulate
     * definitively against the times.conf entries.  Instead all prepopulation falls
     * through to the "custom" use case.
     */
    getMenuItemByTimeRange(timeRange) {
        var match = false;
        $("a",this.container).each(function(i, a) {
            a = $(a);
            var r = this.getTimeRangeForAnchor(a);
            if (timeRange.equalToRange(r)) {
                match = a;
                return false;
            }
        }.bind(this));
        return match;
    }

    getRangeForMenuItem(li) {
        var range;
        var anchorItems = li.children('a');
        if (anchorItems.length>1) {
            alert(sprintf("assertion failed - this menu item had %s children", anchorItems.length));
        }
        anchorItems.each(function(i, a) {
            range = this.getTimeRangeForAnchor($(a));
        }.bind(this));
        return range;
    }

    initMenus() {
        var moduleReference = this;

        $(".svMenu > li",this.container).bind("click", function(evt){
            Sideview.openTopLevelMenu(moduleReference.container,this,evt)
        });

        $(".svMenu li", this.container).bind("mouseover", function(evt){
            var triggerLi = $(this);
            Sideview.handleMenuMouseOver(moduleReference.container, triggerLi, evt)
        });

        $(".svMenu ul li:not(.hasSubMenu)",this.container).bind("click", function(evt) {
            moduleReference.onMenuClick(this,evt);
        });

        Sideview.bindSharedMenuEvents(this.container);
    }

    setDefaultTimeRange() {
        this._setDefaultTimeRangeWasCalled = 1;
        var def = this.getParam("default");
        if (!def) return;
        var a = this.getMenuItemByLabel(def);
        if (a) {
            var range = this.getTimeRangeForAnchor(a);
            this.setSelectedTimeRange(range, def);
        }
    }

    onMenuClick(li,evt) {
        // the user may just be trying to copy and paste the timerange label.
        if (Sideview.getSelectedText()) return false;
        evt.stopPropagation();
        evt.preventDefault();

        var target = $(li);
        if (!target.is("li")) console.error("NOT sure what happened but TimePicker got a click not on an li element");
        var a = $(target.find("> a")[0]);

        if (a.attr("s:custom")=="1") {
            Sideview.closeAllMenus(this.container);
            this.openCustomTimeLayer();
            return;
        }
        else {
            var range = this.getTimeRangeForAnchor(a);
            this.setSelectedTimeRange(range,a.text());
            var prefs = {}
            prefs[this.CURRENT_TIMERANGE_EARLIEST_PREF] = range.getEarliestTimeTerms();
            prefs[this.CURRENT_TIMERANGE_LATEST_PREF] = range.getLatestTimeTerms();
            Sideview.commitNewPagePreferences(prefs);
        }
        this.updateURL();
        this.pushDownstream();
        Sideview.closeAllMenus(this.container);
    }

    initDateTimePicker(input) {
        var SHOW_TIMES = true;
        var cfg = {
            dateFormat:"mm/dd/yy",
            showTimepicker: SHOW_TIMES,
            timeFormat: (SHOW_TIMES) ? "HH:mm:ss" : "",
            onClose: function() {}
        }
        input.datetimepicker(cfg);
    }

    getAbsoluteRangeFromDatePickers(earliestTextField, latestTextField) {
        try {
            var earliestDate = earliestTextField.datepicker("getDate");
            var latestDate = latestTextField.datepicker("getDate");
        }
        catch(e) {
            alert(e);
        }
        var earliestArg = earliestDate ? earliestDate.valueOf() / 1000: null;
        var latestArg = latestDate ? latestDate.valueOf() / 1000: null
        var range = new TimeRange(earliestArg, latestArg);
        return range;
    }

    closeCustomTimeLayer(rangeToCommit) {
        if (this.theNothing) {
            this.theNothing.hide();
        }
        if (this.customTimeLayer) {
            this.customTimeLayer.hide();
        }
        if (rangeToCommit) {
            this.setSelectedTimeRange(rangeToCommit);
            this.updateURL();
            this.pushDownstream();
        }
    }

    openCustomTimeLayer() {
        if (!this.theNothing) {
            this.theNothing = $("<div>")
                .addClass("hereComesNothing")
                .click(this.closeCustomTimeLayer.bind(this))
                .prependTo($(document.body));
        }
        if (!this.customTimeLayer) {
            var earliestVal = "";
            var latestVal = "";
            if (this.selectedRange && this.selectedRange.isAbsolute()) {

                // TODO - trusting the browser is wrong.  actual tz information and dst behavior of meatbag and browser and datepicker code are all wrong, maybe in different ways. dont know dont care.
                // however we can ignore all those things.
                // by leveraging endpoints to do all actual conversions.
                // 1)  /splunkd/__raw/services/search/timeparser/tz  - olsen table of the splunkd default timezone.
                // 2)  /splunkd/__raw/servicesNS/millicent/-/search/timeparser/tz = olsen table of the GIVEN USERS PREFERRED TZ.
                // 3)  /splunkd/__raw/services/search/timeparser?output_mode=json&time=1565841600&time=1565929057&output_time_format=%25s.%25Q%7C%25Y-%25m-%25dT%25H%3A%25M%3A%25S
                //      -- please take the N epochtime args submitted and strftime them in the given users preferred timezone.
                // 4) but...  how do we go the other way.  This endpoint has a namespaced equivalent but it seems to not use the users tz.
                // /splunkd/__raw/services/search/timeparser?output_mode=json&time=2019-08-14T22%3A00%3A00.000&time=2019-08-15T23%3A27%3A24.000&output_time_format=%25s.%25Q%7C%25Y-%25m-%25dT%25H%3A%25M
                var earliestDate = new Date(parseInt(this.selectedRange.getEarliestTimeTerms())*1000);
                var latestDate = new Date(parseInt(this.selectedRange.getLatestTimeTerms())*1000);
                earliestVal = earliestDate.strftime("%m/%d/%Y %H:%M:%S");
                latestVal = latestDate.strftime("%m/%d/%Y %H:%M:%S");
            }

            var earliestTextField = $("<input>")
                .attr("type","text")
                .val(earliestVal)
            var latestTextField = $("<input>")
                .attr("type","text")
                .val(latestVal)

            this.initDateTimePicker(earliestTextField);
            this.initDateTimePicker(latestTextField);

            this.customTimeLayer = $("<div>")
                .addClass("customTimeLayer")
                .addClass("modalPopup")
                .append($("<h4>").text("Enter an absolute timerange by clicking below"))
                .append($("<div>").addClass("earliest")
                    .append($("<label>").text("earliest time"))
                    .append(earliestTextField)
                )
                .append($("<div>").addClass("latest")
                    .append($("<label>").text("latest time"))
                    .append(latestTextField)
                )
                .append($("<div>").addClass("buttonRow")

                    .append($("<button>").addClass("buttonPrimary").addClass("svButton").text("apply").click(function() {
                        var range = this.getAbsoluteRangeFromDatePickers(earliestTextField, latestTextField);
                        this.closeCustomTimeLayer(range)
                    }.bind(this)))
                    .append($("<button>").addClass("buttonSecondary").addClass("svButton").text("cancel").click(function() {
                        this.closeCustomTimeLayer(false)
                    }.bind(this)))
                 )
                .prependTo($(document.body));
        }
        this.theNothing.show();
        this.customTimeLayer.show();
    }

    getModifiedContext(context) {
        context = context || this.getContext();

        if (this.selectedRange) {
            context.set("shared.timeRange",this.selectedRange);
            Sideview.setStandardTimeRangeKeys(context);
        }
        return context;
    }

    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        if (this.setToContextValue(context)) {
            this._weDontCareAboutDefaultsAnyMore = 1;
        }
        this.clearURLLoader(context);
    }

    createListItemForCustomTimeRange(range) {
        var li = $("<li>")
            .addClass("custom")
            .append($("<a>")
                .attr("href","#")
                .attr("s:earliest_time", range.getEarliestTimeTerms())
                .attr("s:latest_time",range.getLatestTimeTerms())
                // Note - we don't have (custom) anymore. See comments on getMenuItemByTimeRange
                .text(range.toConciseString()));

        if ($("ul.top > li.topLevel > ul",this.container).length>0) {
            // take away any previous "custom" ones. there can be only one.
            $("ul.top > li.topLevel > ul li.custom", this.container).remove()
            $("ul.top > li.topLevel > ul",this.container).append(li);
        }
        return li;
    }

    setToContextValue(context) {
        //var range = context.get("shared.timeRange")
        var earliest = context.get("shared.timeRange.earliest");
        var latest   = context.get("shared.timeRange.latest");
        if (!earliest && !latest) return false;

        var range = new TimeRange(earliest, latest);
        // first we check for the explicit 'all time' timerange.
        // (this is a Sideview convention.
        if ((range.getEarliestTimeTerms()=="all" && range.getLatestTimeTerms()=="all")) {
             //console.log("WE SAW THE ALL ALL. My god, its full of wildcards.");
        }
        // then we check for the implicit all time range and ignore it.
        else if (range.isAllTime()) return false;

        var li = this.getMenuItemByTimeRange(range);
        if (!li && !range.isAbsolute()) {
            this.createListItemForCustomTimeRange(range);
        }
        this.setSelectedTimeRange(range);
        return true;
    }

    clearURLLoader(context) {
        context = context || this.getContext();
        // only do this once
        if (!this.hasClearedURLLoader && context.has("sideview.onSelectionSuccess")) {
            var callback = context.get("sideview.onSelectionSuccess");
            callback("shared.timeRange.earliest", this);
            callback("shared.timeRange.latest", this);
            this.hasClearedURLLoader = true;
            // see core patches.  Hopefully we don't need this.
            //this.initialSelection = this._activator.text();
        }
    }

    updateURL() {
        var context = this.getContext();
        if (context.has("sideview.onEditableStateChange")) {
            var callback = context.get("sideview.onEditableStateChange");
            callback("shared.timeRange", this.selectedRange, this);
        }
    }

};
    return TimePicker

});