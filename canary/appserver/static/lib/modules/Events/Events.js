// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule",
  "time_range"],
  function($, Sideview,Module, TimeRange) {

class Events extends Module {

    constructor(container, params) {
        super(container, params);
        this.numberOfLayers = 5;
        this.numberOfEventsPerLayer = 10;
        this.requestThresholdInPixels = 100;
        this.inFlight = false;
        this.bottomLayerIndex = 0;
        this.topLayerIndex    = 0;
        this.bottomEventIndex = -1;
        this.topEventIndex = -1;
        this.hitBottom = false;
        this.layers = [];
        this.valuesToCheck = {};
        this.workflowActionsXHR = false;
        this.menuContainer = $(".workflowActionsMenu", this.container);
        this.menuLoadingHTML  = this.menuContainer.html();
        this.keysThatRequireReflow = ["results.displayRowNumbers", "results.segmentation","results.maxLines","results.fields"];

        this.outerTimerangeDiffersAt = -1;

        this.SEGMENT_TAG_NAME = "em";
        if (Sideview.compareVersions(Sideview.getConfigValue("VERSION_LABEL"),"5.0") > -1) {
            this.SEGMENT_TAG_NAME = "span";
        }

        // build our ring of layers.
        this.initLayers();

        // event handling.
        this.bindEventListeners();

        this.setupStandardResizeBehavior();

        this.getXSLT();
    }

    getXSLT() {
        this.xslt_loader = $.get(
            "../../../../../static/app/canary/lib/xsl/event_results.xsl",
            function(xslDoc) {
                this.xsltProcessor = new XSLTProcessor();
                this.xsltProcessor.importStylesheet(xslDoc);
            }.bind(this)
        );
    }

    requiresResults() {return true;}

    /********************************
     * EXTENDED SETUP STUFF
     *******************************/
    bindEventListeners() {
        this.container.scroll(this.checkSeams.bind(this));
        if (this.getParam("allowTermClicks")=="True") {
            this.container.mouseover(this.onMouseover.bind(this));
            this.container.mouseout(this.onMouseout.bind(this));
            this.container.click(function(evt) {
                var target  =  $(evt.target);
                if (target.hasClass("actions")) {
                    this.getMenuItems(target);
                    return false;
                }
                else if (target.is("span") && target.parent().hasClass("actions")) {
                    this.getMenuItems(target.parent());
                    return false;
                }
                // they changed to "span" in 5.0.  KINDA.   They left all the field=value
                // elements as EM tags.  Thanks.
                else if (target.get(0).tagName==this.SEGMENT_TAG_NAME.toUpperCase() ||
                    (target.hasClass("v") && target.get(0).tagName=="EM")) {
                    if (this.getSelectionRangeText()=="") {
                        return this.runInternalSearch(evt,target);
                    }
                }
                else if (target.is("a")) return true;
                return false;
            }.bind(this));
        } else {
            this.container.addClass("termClickingDisabled");
            this.container.click(function(evt) {
                var target  =  $(evt.target);
                if (target.hasClass("actions")) {
                    this.getMenuItems(target);
                    return false;
                }
                else if (target.is("span") && target.parent().hasClass("actions")) {
                    this.getMenuItems(target.parent());
                    return false;
                }
                else if (target.hasClass("showinline")) {
                    this.onShowHideAllLines(target);
                    return false;
                }
                else if (target.is("a")) return true;
            }.bind(this));
        }
        $(document).click(this.onDocumentClick.bind(this));
    }

    setupStandardResizeBehavior() {
        if (this.getParam("resizeMode")=="auto") {
            $(document.body).css("overflow","hidden");
            if (this.getParam("height") && this.getParam("height").length>0) alert("error: events module configured in resizeMode auto, but also with fixed height=" + this.getParam("height"));
            $(window).resize(this.realign.bind(this));
            this.realign();
        }
        else if (this.getParam("resizeMode")=="fixed") {
            if (this.getParam("height")) {
                this.container.css("height", this.getParam("height"));
            } else {
                alert("error: events module configured with resizeMode fixed but no height param is given.");
            }
        }
        else if (this.getParam("resizeMode")=="custom") {
            if (!this.getParam("customBehavior")) {
                console.error("warning: events module configured in resizeMode custom, but no customBehavior param is set");
            }
        }
    }

    /**
     * patch so that getParam("fields") returns an array, and always the
     * "right" array too.
     */
    getParam(key, fallbackValue) {
        var superValue = this._getParam(key,fallbackValue);
        if (key=="fields") {
            try {
                var tokenized     = Sideview.replaceTokensFromContext(superValue || "", this.getContext())
                var loadFields    = Sideview.stringToList(tokenized);
                var runtimeFields = this.getContext().get("results.fields") || [];
                if (loadFields.length > 0 && runtimeFields.length > 0) {
                    console.warn("Overspecification of 'fields' in the Events module.  The local 'fields' param will be ignored because the value is also set from upstream.");
                }
                else if (runtimeFields.length > 0) return runtimeFields;
                else if (loadFields.length > 0) return loadFields;
                return [];
            }
            catch(e) {
                console.error("unexpected error reconciling loadtime fields and runtime fields config.")
                console.error(e);
                return Sideview.stringToList(superValue);
            }
        }
        return superValue;
    }


    /**
     * gotta implement resetUI to avoid console noise.
     */
    resetUI() {}

    /**
     * tell the framework about the fields we need, and that we'll need events
     */
    onBeforeJobDispatched(search) {
        search.setMinimumStatusBuckets(1);
        var fields = this.getParam("fields");
        if (fields.length>0) search.setRequiredFields(fields);
    }

    contextRequiresNewEvents(context) {
        var requiresNewEvents = false;
        var plainKeys = this.keysThatRequireReflow;
        var search = context.getSplunkSearch();
        if (!this.valuesToCheck.hasOwnProperty("sid")  ||
            search.job.getSearchId() != this.valuesToCheck["sid"]) {
            requiresNewEvents = true;
        }
        for (var i=0;!requiresNewEvents && i<plainKeys.length;i++) {
            var k = plainKeys[i];
            if (this.valuesToCheck.hasOwnProperty(k) &&
                this.valuesToCheck[k] != context.get(k)) {
                requiresNewEvents = true;
            }
        }
        var p = search.getPostProcess() || "";
        if (this.valuesToCheck.hasOwnProperty("postProcess") && p!=this.valuesToCheck["postProcess"]) {
            requiresNewEvents = true;
        }

        // update all the recent values before returning.
        this.valuesToCheck["postProcess"] = p;
        this.valuesToCheck["sid"] = search.job.getSearchId();
        for (var i=0;i<plainKeys.length;i++) {
            this.valuesToCheck[plainKeys[i]] = context.get(plainKeys[i]);
        }
        return requiresNewEvents;
    }

    /**
     * standard method that runs when we receive new context data from
     * upstream. Often this means a new job as well but not necessarily.
     */
    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        Sideview.applyCustomCssClass(this,context);

        var search = context.getSplunkSearch();

        this.outerTimerangeDiffersAt = -1;

        if (!search || !search.isDispatched()){
            console.error("Assertion failed - Events module has been given an undispatched search.");
        }
        if (context.has("results.softWrap")){
            if (context.get("results.softWrap")) this.container.addClass("softWrap");
            else this.container.removeClass("softWrap");
        }
        if (this.contextRequiresNewEvents(context)) {
            this.resetLayers();
            if (search.isDone() || (search.job.getEventAvailableCount() > 0)) {
                this.getResults("down");
            }
        }
        this.realign();
    }

    /**
     * standard method that runs when a running job gets new events
     */
    onJobProgress() {
        if (this.bottomEventIndex==-1) {
            this.getResults("down");
        }
        else {
            // make sure the "bottom" didn't get any deeper on us.
            if (this.hitBottom) {
                var search  = this.getContext().getSplunkSearch();
                if (search.job.getEventAvailableCount() > this.bottomEventIndex) {
                    this.hitBottom=false;
                }
            }
            this.checkSeams();
        }
    }

    // JobMinotaur will actually only fire done at the very end.. there will be no progress.
    onJobDone() {
        return this.onJobProgress();
    }


    /********************************
     * SPLUNK MODULE FRAMEWORK - HTTP HANDLING FOR EVENTS
     *******************************/
    getResults(upOrDown) {
        this.inFlight = upOrDown;
        return this._getResults()
    }

    getResultURL(params) {
        var context = this.getContext();
        var search  = context.getSplunkSearch();
        return search.getUrl("events", params);
    }

    getSplunkResultParams(context,search){
        var params = {};

        params["output_mode"] = "xml";
        params["time_format"] = "%s";

        params["segmentation"] = context.get("results.segmentation");

        var drn = context.get("results.displayRowNumbers");
        params["display_row_numbers"] = (drn && drn.toLowerCase()=="true") ? 1:0;

        // very weird. but we duplicate what EventsViewer does here just in case it's not a mistake.
        params["min_lines"] = 10;
        if (context.get("results.maxLines")) {
            params["max_lines"] = context.get("results.maxLines");
        }
        params["max_lines_constraint"] = 500;
        // TODO - pass enable_event_actions and enable_field_actions flags

        params["count"] = this.numberOfEventsPerLayer;
        if (this.inFlight=="up") {
            if (this.topEventIndex - this.numberOfEventsPerLayer<0) {
                console.error("getSplunkResultParams, on an 'up' request, calculated a negative offset.");
            }
            params["offset"] = Math.max(this.topEventIndex - this.numberOfEventsPerLayer,0);
        } else if (this.inFlight=="down") {
            params["offset"] = Math.max(this.bottomEventIndex,0);
        } else {
            params["offset"] = 0;
            console.warn('inFlight flag is ' + this.inFlight + ', during getSplunkResultParams call');
        }
        //console.log("getSplunkResultParams - current frame is " + this.topEventIndex + "," + this.bottomEventIndex + " and params.offset=" + params.offset);

        // TODO - invert offset for realtime and events and no explicit sort field.

        // the endpoint expects this when appropriate. Lets hope it does something.
        if (Sideview.isIE()) params["replace_newlines"] = 1;

        var postProcess = search.getPostProcess();
        if (postProcess) params["post_process"] = postProcess;
        //var fields = this.getParam("fields");
        //if (fields.length > 0) params["field_list"] = fields;
        return params;
    }

    copyResultsIntoLayer(newLayer, xmlResults) {
        var htmlFragment = this.xsltProcessor.transformToFragment(xmlResults, document);
        this.insertTimeHeaders(htmlFragment)
        newLayer.html(htmlFragment);

        return;
    }


    renderResults(xmlResults) {
        $.when(this.xslt_loader)
            .done(function() {
                this.renderResultsForReal(xmlResults);
            }.bind(this)
        );
    }

    renderUp(xmlResults) {
        // old top
        var previousTopLayer = this.getTopmostLayer();

        // new top
        this.topLayerIndex = (this.topLayerIndex + (this.numberOfLayers-1)) % this.numberOfLayers;
        var newLayer = this.getTopmostLayer();

        // bookkeeping on bottom side if the two sides of the ring now touch.
        if (this.topLayerIndex == this.bottomLayerIndex) {
            var aboutToObliterateCount = $("li.item", newLayer).length;
            this.bottomEventIndex = Math.max(this.bottomEventIndex,0) - aboutToObliterateCount;
            this.bottomLayerIndex = (this.bottomLayerIndex + (this.numberOfLayers-1)) % this.numberOfLayers;
            this.hitBottom = false;
        }

        // copy it in.
        this.copyResultsIntoLayer(newLayer, xmlResults);

        //position it.
        newLayer.css("top", previousTopLayer.get(0).offsetTop - newLayer.get(0).offsetHeight);

        // bookkeeping on top side.
        var newlyRenderedCount = $("li.item", newLayer).length;
        this.topEventIndex = Math.max(this.topEventIndex,0) - newlyRenderedCount;
        this.inFlight = false;
        // check whether we're still showing an open range.
        this.checkSeams();
        return newLayer;
    }


    renderDown(xmlResults) {
        // old bottom
        var previousBottomLayer = this.getBottommostLayer();

        // new bottom
        this.bottomLayerIndex = (this.bottomLayerIndex+1) % this.numberOfLayers;
        var newLayer = this.getBottommostLayer();

        if (!newLayer) {
            console.error('eek. we have no bottom most layer');
        }

        // bookkeeping on top side if the two sides of the ring now touch.
        if (this.bottomLayerIndex == this.topLayerIndex) {
            var aboutToObliterateCount = $("li.item", newLayer).length;
            this.topEventIndex = Math.max(this.topEventIndex,0) + aboutToObliterateCount;
            this.topLayerIndex = (this.topLayerIndex+1) % this.numberOfLayers;
        }

        // copy it in.
        this.copyResultsIntoLayer(newLayer, xmlResults);


        //position it.
        newLayer.css("top", previousBottomLayer.get(0).offsetTop + previousBottomLayer.get(0).offsetHeight);

        // bookkeeping on bottom side.
        var newlyRenderedCount = $("li.event", newLayer).length;
        this.bottomEventIndex = Math.max(this.bottomEventIndex,0) + newlyRenderedCount;
        this.inFlight = false;
        // check whether we're still showing an open range.
        if (newlyRenderedCount == this.numberOfEventsPerLayer) {
            this.checkSeams();
        } else {
            this.hitBottom = true;
        }
        return newLayer;

    }
    renderResultsForReal(xmlResults){
        var newLayerIndex;

        // TODO
        var isEmptyResponse = false;
        if (isEmptyResponse) {
            this.inFlight = false;
            return;
        }

        //this.insertTimeHeaders(xmlResults);

        var newLayer = false;
        if (this.inFlight=="up") {
            newLayer = this.renderUp(xmlResults);
        }
        else if (this.inFlight=="down") {
            newLayer = this.renderDown(xmlResults);
        }
        else console.error("renderResults called but inFlight flag is null");
        this.checkAlignmentWithOrigin();

        if (newLayer) {
            $("a.fm",newLayer).addClass("actions");
        }
    }






    onShowHideAllLines(link) {
        var eventContainer = link.parents().filter("li.item");
        link.html("");
        link.before($("<b>").html(_("Loading lines...")));
        $.ajax({
            type: "GET",
            dataType: "html",
            url: link.attr("href"),
            error: function(jqXHR, textStatus, errorThrown) {
                console.error("error loading " + link.attr("href"));
                console.error(errorThrown);
            }.bind(this),
            complete: function(jqXHR, textStatus) {
                if (jqXHR.status==200) {
                    eventContainer.html(jqXHR.responseText);
                    this.realign();
                } else {
                    eventContainer.html(_("Unexpected error loading lines - ") + "status=" + jqXHR.status + " textStatus=" + textStatus);
                }
            }.bind(this)
        });
        return false;
    }

    /************************
     * METHODS HAVING TO DO WITH TIME HEADERS
     ***********************/
    /**
     * given the HTML node of an event, return an absolute TimeRange whose
     * latestTime is the given timestamp;
     */
    getTimerangeFromEvent(liElement) {
        var epochTime = liElement.find("div.timestamp").attr("epochtime");
        var range = new TimeRange(null,epochTime);
        return range;
    }

    /**
     * get the real absolute timerange of the JOB.  Note that even if the
     * timerange is relative, like "-24h", this will be an absolute timerange.
     * however the job timeRange is not populated until the first progress
     * event, so some care is taken here and by the client code.
     */
    getAbsoluteTimerangeForSearch(search) {
        var job = search.job;
        if (job) {
            var range = job.getTimeRange();
            if (range.isAbsolute()) {
                return range;
            }
        }
        return false;
    }

    /**
     * get our local job's timerange, and calculate the highest level
     * ie (second/minute/hour/day/month/year)
     * at which the earliestTime differs from the endTime.
     * if the job timerange is not yet populated,
     */
    getOuterTimerangeDifferingLevel() {
        // works as a lazy cache.  The actual absolute timerange wont exist
        // as a property on the job object until the first job progress
        // event comes back.
        if (this.outerTimerangeDiffersAt!=-1) {
            return this.outerTimerangeDiffersAt;
        }

        var search = this.getContext().getSplunkSearch();
        var range = this.getAbsoluteTimerangeForSearch(search);
        if (range) {
            this.outerTimerangeDiffersAt = this.getDifferingLevel(range, true);
        }
        return this.outerTimerangeDiffersAt;
    }

    getDifferingLevel(range, treatAsOuter) {
        var differingLevel
        if (this.timeRangeFormatter) {
            var earliestTime = range.getEarliestTimeTerms();
            var latestTime   = range.getLatestTimeTerms();
            if (earliestTime && !latestTime) latestTime= new Date();
            differingLevel = this.timeRangeFormatter.get_differing_level(earliestTime,latestTime);
            if (treatAsOuter) {
                var methodDict = this.timeRangeFormatter.DATE_METHODS[differingLevel];
                // for the outer timerange we're a little more demanding.
                // we take the differingLevel,  and we check that if +2 units of that
                // level actually move the earliest time AFTER the latest time,
                // then we dont use the differing level but rather the level one
                // level in.
                // example 1:  in the relative range "last 24 hours",  the
                // differingLevel would be "day".   But we *want* it to be hours.
                // example 2:   in the range "4pm on July 30th", differing level
                //  would be "hour"
                // but we want it to be minute.
                // example 3: "4pm through 5PM",  it would be hour but we'd want it
                // to still be minute.

                earliestTime[methodDict["setter"]](earliestTime[methodDict["getter"]]()+2) > latestTime
                if (earliestTime>latestTime) {
                    return differingLevel+1;
                }
            }
        }
        else {
            differingLevel = range.unitsRedundantBelow();
            //differingLevel = "second"
        }
        return differingLevel;
    }

    /**
     * given the two consecutive events, and the differing level of our
     * current search (already stored as local property),  do these two events
     * need a header in between them.
     */
    eventBoundaryNeedsHeader(olderEvent, newerEvent) {
        if (newerEvent.length>0) {

            var newerRange = this.getTimerangeFromEvent(newerEvent);
            var olderRange = this.getTimerangeFromEvent(olderEvent);

            var intervalRange = new TimeRange(olderRange.getLatestTimeTerms().valueOf()/1000, newerRange.getLatestTimeTerms().valueOf()/1000);

            var level = this.getDifferingLevel(intervalRange);

            if (level <= this.getOuterTimerangeDifferingLevel()) {
                return intervalRange;
            }
        }
        return false;
    }

    /**
     * if you understand what I mean by 'level', this is straightforward.
     * if you dont, read the comments on other methods more.
     */
    getFormatStrForLevel(level) {
        /*  it's tempting to use the get_summary method from BaseTimeRangeFormatter
         * however that leads to the familiar class of bugs where the
         * 'flattening' is done in the local timezone, rather than in splunkd's
         * timezone.
         */
        switch (level) {
            case 5 :
                return "%I:%M:%S %p";
            case 4 :
                return "%I:%M %p";
            // Note this one never actually gets used.
            case 3 :
                return "%I %p %A %B %d";
            case 2 :
                return "%A %B %d";
            case 1 :
                return "%B %Y";
            case 0 :
                return "%Y";
        }
        return "%B %d";
    }

    /**
     * insert a time header after the given element.
     */
    insertTimeHeader(eventElement, range, level) {
        var headerText;
        if (level!=3) {
            var formatStr = this.getFormatStrForLevel(level);
            headerText = new Date(range.getEarliestTimeTerms()*1000).strftime(formatStr);
        } else {
            var earliest = new Date(range.getEarliestTimeTerms()*1000);
            var latest   = new Date(earliest);
            latest.setHours(latest.getHours()+1);
            headerText = [earliest.strftime("%I %p - ")];
            headerText.push(latest.strftime("%I %p "));
            // use the earliest of the two for the rest of it.
            headerText.push(earliest.strftime("%A %B %d"));
            headerText = headerText.join("");
        }
        var timeHeader = $("<li>").addClass("timeRangeHeader").append(
            $("<h2>").text(headerText));
        timeHeader.insertAfter(eventElement);
    }

    /**
     * walks through the N events in the given fragment, as well as the 1
     * consecutive event that was pre-existing, and adds time headers between
     * consecutive events as it deems appropriate.
     */
    insertTimeHeaders(htmlFragment) {
        var level = this.getOuterTimerangeDifferingLevel();
        console.error("this code hasn't  been quite fully ported and... it's a bit confused level=" + level);
        return;
        if (this.inFlight=="down") {
            var bottomMost = this.getBottommostLayer();

            var newerEvent  = bottomMost.find("ol li.event:last");


            $(htmlFragment).find("ol li.event").each(function(i, olderEvent) {
                olderEvent = $(olderEvent);
                var intervalRange = this.eventBoundaryNeedsHeader(olderEvent, newerEvent);
                console.error(olderEvent, newerEvent)
                console.error(intervalRange);
                if (intervalRange) {
                    this.insertTimeHeader(newerEvent, intervalRange, level);
                }
                newerEvent = olderEvent;
            }.bind(this));
        }
        else if (this.inFlight=="up") {
            var topMost = this.getTopmostLayer();

            var moduleReference = this;
            var olderEvent  = topMost.find("ol li.item:first");

            htmlFragment.find("ol li.item").reverse().each(function(i, newerEvent) {
                newerEvent = $(newerEvent);
                var intervalRange = moduleReference.eventBoundaryNeedsHeader(olderEvent, newerEvent);
                if (intervalRange) {
                    moduleReference.insertTimeHeader(newerEvent, intervalRange, level);
                }
                olderEvent = newerEvent;
            });
        }
    }

    /********************************
     * LAYER MANAGEMENT METHODS
     *******************************/
    getBottommostLayer () {
        return this.layers[this.bottomLayerIndex];
    }

    getTopmostLayer () {
        return this.layers[this.topLayerIndex];
    }

    getLowestEventInLayer(layer) {
        return $("em.pos:first", layer).text()
    }

    getOnscreenLayerIndex() {
        var topOfViewport = this.container.scrollTop();
        var i = this.topLayerIndex;
        do {
            var bottomEdge = this.layers[i].get(0).offsetTop + this.layers[i].get(0).offsetHeight;
            if (bottomEdge >= topOfViewport) return i
            i = (i+1)% this.numberOfLayers;
        }
        while (i!=this.bottomLayerIndex);
        return i;
    }

    /**
     * builds our ring of layers.
     */
    initLayers() {

        for (var i=0;i<this.numberOfLayers;i++) {
            var layer = $('<div class="eventLayer">');
            this.layers.push(layer);
            this.container.append(layer);
        }
        this.resetLayers();
    }

    resetLayers() {
        $(".eventLayer",this.container).html("").css("top", 0);
        this.bottomLayerIndex = 0;
        this.topLayerIndex    = 0;
        this.bottomEventIndex = -1;
        this.topEventIndex = -1;
        this.hitBottom = false;
    }

    checkSeams() {
        if (!this.isVisible()) {
            return;
        }
        if (this.inFlight) {
            return;
        }
        var context = this.getContext();
        var search  = context.getSplunkSearch();
        if (!search || !search.isDispatched()) return false;

        var bottomLayer = this.getBottommostLayer();
        var topLayer    = this.getTopmostLayer();

        var topOfViewport = this.container.scrollTop();
        var topOfTopmost = topLayer.get(0).offsetTop;

        var bottomOfViewport = topOfViewport + this.container.get(0).offsetHeight;
        var bottomOfBottommost = bottomLayer.get(0).offsetTop + bottomLayer.get(0).offsetHeight;




        if (topOfViewport>=0 && this.topEventIndex>0 && topOfTopmost+this.requestThresholdInPixels > topOfViewport) {
            this.getResults("up");
        }
        else if (!this.hitBottom && bottomOfBottommost-this.requestThresholdInPixels < bottomOfViewport) {
            this.getResults("down");
        }
    }

    realign() {
        var onscreenLayerIndex = this.getOnscreenLayerIndex();

        this.realignAroundLayer(onscreenLayerIndex);

        if (this.getParam("resizeMode")=="auto") {
            var autoResizeLevel = this.getParam("autoResizeLevel");
            if (parseInt(autoResizeLevel,10)>-1) {
                var elementToAlignWith = this.container;
                for (var i=0;i<autoResizeLevel;i++) {
                    elementToAlignWith = elementToAlignWith.parent();
                }
                var bottomOfFooter = elementToAlignWith.position().top + elementToAlignWith.outerHeight(true);
                var bottomOfViewPort = $(document).scrollTop() + $(window).height() - parseInt(this.getParam("extraMargin"),10);
                var currentContainerHeight = this.container.height();
                this.container.height(currentContainerHeight + bottomOfViewPort - bottomOfFooter);
            }
        }
        this.checkSeams();
    }

    shiftAllLayers(delta) {
        for (var i=0;i<this.numberOfLayers;i++) {
            this.layers[i].css("top", this.layers[i].get(0).offsetTop + delta);
        }
        this.container.scrollTop(Math.max(this.container.scrollTop() + delta,0))
    }

    checkAlignmentWithOrigin() {
        var topLayer = this.getTopmostLayer();
        var topOfTopmost = topLayer.get(0).offsetTop;

        if (this.topEventIndex==0) {
            if (topOfTopmost==0) return;
            else {
                return this.shiftAllLayers(-topOfTopmost);
            }
        } else if (topOfTopmost<=Math.max(this.topEventIndex,0) * 25) {
            var delta = Math.max(this.topEventIndex,0) * 25 - topOfTopmost;
            return this.shiftAllLayers(delta);
        }
    }

    realignAroundLayer(layerIndex) {
        var fixedLayerIndex = this.getOnscreenLayerIndex();
        var fixedLayer = this.layers[fixedLayerIndex];
        if (this.topLayerIndex==-1 || this.bottomLayerIndex==-1) {
            return;
        }
        //this.printState();

        var top = fixedLayer.get(0).offsetTop;

        for (var i=(fixedLayerIndex+this.numberOfLayers-1)%this.numberOfLayers;(i+1)%this.numberOfLayers!=this.topLayerIndex; i=(i+this.numberOfLayers-1) % this.numberOfLayers) {
            top = top - this.layers[i].get(0).offsetHeight;
            this.layers[i].css("top", top);
        }
        var top = fixedLayer.get(0).offsetTop + fixedLayer.get(0).offsetHeight;
        for (var i=(fixedLayerIndex+1)%this.numberOfLayers; i!=(this.bottomLayerIndex+1)%this.numberOfLayers; i=(i+1) % this.numberOfLayers) {
            this.layers[i].css("top", top);
            top += this.layers[i].get(0).offsetHeight;
        }
        this.checkAlignmentWithOrigin()
    }

    /********************************
     * TERM HIGHLIGHTING/CLICKING
     *******************************/

    getTermToHighlight(sg) {
        var parent = sg.parent();
        // if the segment is the last segment in the parent segment, walk up to the parent.
        if (parent.hasClass("t") && $(this.SEGMENT_TAG_NAME+".t",parent).last().get(0) == sg.get(0)) {
            sg = parent;
        }
        // this will now have walked up to the correct segment, even in the
        // 'full' case.
        return $(sg);
    }

    /**
     * because of the needs of 'full' segmentation, within the pre tag we
     * cant do it with just an em:hover rule.
     */
    needsExplicitMouseover(target) {
        return (target.get(0).tagName==this.SEGMENT_TAG_NAME.toUpperCase() && target.parents().filter("pre.event").length>0);
    }

    onMouseover(evt) {
        if (!this.needsExplicitMouseover($(evt.target))) return;
        var sg = this.getTermToHighlight($(evt.target));
        sg.addClass("mouseoverHighlight");
    }

    onMouseout(evt) {
        if (!this.needsExplicitMouseover($(evt.target))) return;
        var sg = this.getTermToHighlight($(evt.target));
        sg.removeClass("mouseoverHighlight");
    }

    getLegacyIntention (evt,value,key) {
        var intentionName = (evt.altKey)? "negateterm" : "addterm";
        var intention = {
            name: intentionName,
            arg:{}
        };
        //value = Sideview.escapeForSearchLanguage(value);
        if (key) intention.arg[key] = value;
        else intention.arg = value;
        return intention;
    }

    getSelectionRangeText() {
        if (window.getSelection) {
            return window.getSelection().toString();
        }
        else if (document.selection && document.selection.createRange) {
            return document.selection.createRange().text;
        }
        return "";
    }

    /********************************
     * WORKFLOW ACTION MENUS
     *******************************/
    showMenu(menuLink) {
        var top = menuLink.offset().top + menuLink.get(0).offsetHeight + this.container.scrollTop();
        var left = menuLink.offset().left;
        top -= this.container.offset().top;
        left -= this.container.offset().left;
        this.menuContainer.css("top", top);
        this.menuContainer.css("left", left);
        this.menuContainer.html(this.menuLoadingHTML);
        this.menuContainer.show();
    }

    hideMenu() {
        this.menuContainer.hide();
        this.menuContainer.css("left", -2000);
    }

    getMenuItems(menuLink) {
        var context = this.getContext();
        var search = context.getSplunkSearch();
        var sid = search.job.getSearchId();

        var rowOffset = menuLink.parents().filter("li.item").attr("s:offset");

        var uri = sprintf(
            "/api/field/actions/%(app)s/%(sid)s/%(offset)s",
            {
                app: encodeURIComponent(Sideview.getCurrentApp()),
                sid: encodeURIComponent(sid),
                offset: rowOffset
            }
        );
        uri  = Sideview.make_url(uri);
        var args = {
            "maxLines": context.get("results.maxLines"),
            "view": Sideview.getCurrentView()
        }
        var timeRange = context.get("shared.timeRange") || new TimeRange();
        var jobRange = job.getTimeRange();
        // used to use isSubRangeOfJob
        if (!jobRange.equalToRange(range) && jobRange.containsRange(range)) {
            args["latest_time"] = timeRange.getLatestTimeTerms();
            args["earliest_time"] = timeRange.getEarliestTimeTerms();
        }

        var fieldName = menuLink.parent().find("em.k").text();
        var fieldValue = menuLink.parent().find("em.v").text();
        if (fieldName) args["field_name"] = fieldName;
        if (fieldValue) args["field_value"] = fieldValue;

        this.showMenu(menuLink);

        if (this.workflowActionsXHR) {
            try {
                this.workflowActionsXHR.abort();
                console.info("XHR aborted.");
            }
            catch(e){
                console.warn("XHR abort failed");
            }
            this.workflowActionsXHR = null;
        }
        this.workflowActionsXHR = $.ajax({
            type: "GET",
            dataType: "text",
            url: uri + "?" + Sideview.dictToString(args),
            error: function(jqXHR){
                if (jqXHR.statusText != "abort") {
                    console.error("field actions menu XHR error - " + jqXHR.statusText);
                }
            }.bind(this),
            complete: function(jqXHR, textStatus){
                this.renderMenu(jqXHR,menuLink);
            }.bind(this)
        });
    }

    addCustomMenuItems(menuLink, items) {
        var fieldName = menuLink.parent().find("em.k").text();
        var fieldValue = menuLink.parent().find("em.v").text();
        var tagPopupLabel = sprintf(_("Tag %s=%s"), fieldName,fieldValue);
        if (menuLink.hasClass("fm")) {
            var tagItem = {
                type : "callback",
                label: tagPopupLabel,
                callback: function() {
                    var callback = function(){this.resetLayers();this.onContextChange(this.getContext())}.bind(this);
                    foo = new Sideview.EditTagPopup(this.container, fieldName, fieldValue, callback);
                    return false;
                }.bind(this)
            };
            items.push(tagItem);

        }
    }

    renderMenu(response, menuLink)  {
        try {
            var envelope = JSON.parse(response.responseText);
        } catch(e) {
            console.warn("field actions menu XHR parse failed. Possibly just from an abort().");
            return;
        }
        if (response.status==200 && envelope.success) {
            this.menuContainer.html("");
            var ul = $("<ul>");
            var items = envelope.data;

            this.addCustomMenuItems(menuLink, items);

            for (var i=0,len=items.length;i<len;i++) {
                var itemDict = items[i];
                var itemElement;
                if (itemDict["type"]=="search") {
                    itemDict["link.target"] = itemDict["search.target"];
                    var app  = itemDict["search.app"]  || Sideview.getCurrentApp();
                    var view = itemDict["search.view"] || Sideview.getCurrentView();
                    var url = Sideview.make_url("/app",app,view);
                    var args = {
                        "q" : Sideview.addInitialCommandIfAbsent(itemDict["search.search_string"])
                    };

                    var preserveTimeRange = itemDict["search.preserve_timerange"] || "false";
                    if (preserveTimeRange.toLowerCase()=="false") {
                        var context = this.getContext();
                        var range = context.get("shared.timeRange") || new TimeRange();
                        args["earliest"] = range.getEarliestTimeTerms();
                        args["latest"] = range.getLatestTimeTerms();
                    } else {
                        args["earliest"] = itemDict["search.earliest"];
                        args["latest"] = itemDict["search.latest"];
                    }
                    itemDict["link.uri"] = url + "?" + Sideview.dictToString(args);

                    // the circle is complete.
                    itemDict["type"] = "link";
                }
                if (itemDict["type"]=="link") {
                    itemElement = $("<a>")
                        .attr("href", itemDict["link.uri"])
                        .attr("target", itemDict["link.target"])
                        .text(itemDict["label"])
                }
                else if (itemDict["type"]=="callback") {
                    itemElement = $("<a>")
                        .attr("href", "#")
                        .text(itemDict["label"])
                        .click(itemDict["callback"]);
                }
                else {
                    console.warn("unsupported type " + itemDict["type"]);
                    continue;
                }
                ul.append($("<li>").append(itemElement));
            }
            this.menuContainer.append(ul);
        }
        this.workflowActionsXHR = null;
    }

    runInternalSearch(evt,sg) {
        var upwardContext = new Splunk.Context();
        var upwardSearch  = new Splunk.Search("*");
        sg = this.getTermToHighlight(sg);
        if (sg.hasClass("time")) {
            var e =  parseInt(sg.attr("s:epoch"),10);
            context.set("shared.timeRange",new TimeRange(e,  e+1));
        }
        else {
            var key = sg.parent().find("em.k").text();
            if (sg.hasClass("tg")) key = "tag::" + key;
            var intention = this.getLegacyIntention(evt, sg.text(),key);
            upwardSearch.addIntention(intention);
        }
        upwardContext.setSplunkSearch(upwardSearch);
        this.passContextToParent(upwardContext);
    }

    onDocumentClick(evt) {
        var target  =  $(evt.target);
        if (!target.hasClass("actions") ||
            target.parents().filter("div.Events").get(0) != this.container.get(0)) {
            this.hideMenu();
        }
    }

    /********************************
     * DEBUGGING
     *******************************/
    printState() {
        var positions = [];
        for (var i=0;i<this.numberOfLayers;i++) {
            var top = this.layers[i].get(0).offsetTop;
            var bottom = top + this.layers[i].get(0).offsetHeight;
            var entry = "layer #" + i + " at: (" + top + " - " + bottom + ")"

            entry += " with events (" + $("em.pos:first", this.layers[i]).text() + " - " + $("em.pos:last", this.layers[i]).text() + ")";
            positions.push(entry);
        }
        console.log("current state - all positions\n" + positions.join("\n"));
    }

}
    return Events;

});