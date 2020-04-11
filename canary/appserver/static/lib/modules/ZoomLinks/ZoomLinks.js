// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule",
  "context",
  "api/SplunkSearch",
  "time_range"],
  function($, Sideview, Module, Context, SplunkSearch, TimeRange) {

class ZoomLinks extends Module {

    constructor(container, params) {
        super(container, params);
        $("a.zoomIn",     this.container).click(this.zoomIn.bind(this));
        $("a.zoomOut",    this.container).click(this.zoomOut.bind(this));
        $("a.slideLeft",  this.container).click(this.slideLeft.bind(this));
        $("a.slideRight", this.container).click(this.slideRight.bind(this));
        this.zoomedInStack = [];
        this.zoomedOutStack = [];
        this.visibilityMode = "dontShowLinksUntilWeHaveJobInfo";

        this.hide(this.visibilityMode);
        $("a", this.container).show();
    }

    requiresResults() {return true;}

    resetUI() {
        this.hide(this.visibilityMode);
    }

    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        Sideview.applyCustomCssClass(this,context);

        this.selectedSubrange = false;

        var search  = context.getSplunkSearch();
        var range = context.get("shared.timeRange") || new TimeRange();
        if ((search.isDone() || range.isRealTime()) && context.get("sideview.xField")=="_time") {
            this.show(this.visibilityMode);
        } else {
            this.hide(this.visibilityMode);
        }
    }

    getModifiedContext(context) {
        context = context || this.getContext();
        context.set("onTimelineSubsetSelected", this.onTimelineSubsetSelection.bind(this));
        return context;
    }

    onTimelineSubsetSelection(range) {
        this.selectedSubrange = range;
        $("a.zoomIn span", this.container).text(_("Zoom to selected time"));
    }

    onJobProgress() {
        var context = this.getContext();
        this.show(this.visibilityMode);


    }

    /**
     * Get the timerange of the running job.  This timerange will always be an
     * absolute timerange, IF it is defined.  If the Jobber has not received
     * the first response from splunkd, this will be an 'all time' timerange.
     * It is the caller's responsibility to account for this.
     */
    getJobTimeRange() {
        var s = this.getContext().getSplunkSearch()
        var j = s.job;
        return j.getTimeRange();
    }

    /**
     * If there is a selected timeRange in the flashChart, then we return that
     * if we do not
     */
    getFlashChartSelectedTimeRange() {
        var range = false;
        var r = this;
        this.withEachChild(function(module) {
            /*
            if (module.moduleType == "FlashChart") {
                if (!module._selection) return true;
                if (typeof(module._selection)=="undefined") return true;
                if (module._selection.hasOwnProperty("timeRange")) {
                    range = module._selection.timeRange;
                    return true;
                }
            } else
            */
            if (module.moduleType == "Timeline") {
                if (!module.selection) return true;
                range = module.selection;
                return true;
            }
        });
        return range;
    }

    passTimeRangeToParent(range) {
        var context = new Context();
        context.set("shared.timeRange",range);
        this.passContextToParent(context);
    }

    zoomIn() {
        var range;
        var context = this.getContext();
        var search = context.getSplunkSearch();
        var range = this.selectedSubrange;
        if (!range) {
            var currentRange = Sideview.getAbsoluteTimeRange(search);
            var flashChartSelectedRange = this.getFlashChartSelectedTimeRange();
            if (flashChartSelectedRange) {
                this.zoomedOutStack = [];
                this.zoomedInStack.push(context.get("shared.timeRange"));
                range = flashChartSelectedRange;
            }
            else if (this.zoomedOutStack.length>0) {
                range = this.zoomedOutStack.pop();
            }
            else {
                if (range && !range.getAbsoluteLatestTime()) {
                    var now = new Date();
                    range._absoluteArgs["latest"] = now;
                }
                range = currentRange.zoomIn();
            }
        }
        this.passTimeRangeToParent(range);
        return false;
    }

    zoomOut() {
        var range;
        var context = this.getContext();
        var search  = context.getSplunkSearch();

        if (this.zoomedInStack.length>0) {
            range = this.zoomedInStack.pop();
        } else {
            this.zoomedOutStack.push(context.get("shared.timeRange"));
            var currentRange = Sideview.getAbsoluteTimeRange(search);
            range = currentRange.zoomOut()
        }
        this.passTimeRangeToParent(range);
        return false;
    }

    getRangeFromEpochTime(earliest,latest) {
        var e = new Date();
        e.setTime(earliest*1000)
        var l = new Date();
        l.setTime(latest*1000);
        return new TimeRange(e, l);
    }

    roundTimeRange(range, tightness) {
        var e = range.getAbsoluteEarliestTime();
        var l = range.getAbsoluteLatestTime();
        console.error("This needs to be reimplemented.  This used to use the BaseTimeRangeFormatter class from AXML but that is gone now");
        /*
        var largeLevel = this.theRoundMaker.get_differing_level(e,l);
        var smallLevel = this.theRoundMaker.get_highest_non_minimal_level(e,l);

        var largeDict = this.theRoundMaker.DATE_METHODS[largeLevel];
        var smallDict  = this.theRoundMaker.DATE_METHODS[smallLevel];

        // smallLevel is always less than largeLevel because they walk from opposite sides.
        // go one levels down from differingLevel, flatten it to the min/max,  then do the same all the way down.
        if (largeLevel < smallLevel) {
            for (var i=largeLevel+tightness; i<this.theRoundMaker.DATE_METHODS.length; i++) {
                var dict = this.theRoundMaker.DATE_METHODS[i];
                e[dict["setter"]](dict["minValue"])
                l[dict["setter"]](dict["minValue"])
            }
            var largerDict = this.theRoundMaker.DATE_METHODS[largeLevel+tightness-1];
            l[largerDict["setter"]](l[largerDict["getter"]]()+1);
        }
        range = new TimeRange(e, l);
        */
        return range;
    }

    slide(which) {
        var search = this.getContext().getSplunkSearch();
        var currentRange = Sideview.getAbsoluteTimeRange(search);

        this.zoomedInStack = [];
        this.zoomedOutStack = [];

        if (currentRange) {
            var duration = currentRange.getDuration()/1000;
            var earliest = currentRange.getAbsoluteEarliestTime().valueOf()/1000;
            var latest   = currentRange.getAbsoluteLatestTime().valueOf()/1000;

            if (which=="left") {
                latest  = earliest;
                earliest = earliest - duration;
            } else if (which=="right") {
                earliest = latest;
                latest = latest+duration;
            }
            var range = this.getRangeFromEpochTime(earliest, latest);
            range = this.roundTimeRange(range,1);
            this.passTimeRangeToParent(range);
        }
        return false;
    }

    slideLeft() {
        return this.slide("left");
    }

    slideRight() {
        return this.slide("right");
    }
}
    return ZoomLinks
});