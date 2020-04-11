// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.ZoomLinks= $.klass(Sideview.utils.getBaseClass(true), {

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        $("a.zoomIn",     this.container).click(this.zoomIn.bind(this));
        $("a.zoomOut",    this.container).click(this.zoomOut.bind(this));
        $("a.slideLeft",  this.container).click(this.slideLeft.bind(this));
        $("a.slideRight", this.container).click(this.slideRight.bind(this));
        this.zoomedInStack = [];
        this.zoomedOutStack = [];
        this.visibilityMode = "dontShowLinksUntilWeHaveJobInfo";
        // we use its get_summary_data method to tell us how to round 
        // ranges nicely.
        this.theRoundMaker = new BaseTimeRangeFormatter();

        this.hide(this.visibilityMode);
        $("a", this.container).show();

        Sideview.utils.applyCustomProperties(this);
    },
    requiresResults: function() {return true;},

    resetUI: function() {
        this.hide(this.visibilityMode);
    },

    onContextChange: function() {
        var context = this.getContext();
        Sideview.utils.applyCustomCssClass(this,context);

        this.selectedSubrange = false;
        
        var search  = context.get("search");
        if ((search.job.isDone() || search.getTimeRange().isRealTime()) && context.get("sideview.xField")=="_time") {
            this.show(this.visibilityMode);
        } else {
            this.hide(this.visibilityMode);
        }
    },
    
    getModifiedContext: function(context) {
        context = context || this.getContext();
        context.set("onTimelineSubsetSelected", this.onTimelineSubsetSelection.bind(this));
        return context;
    },
    
    onTimelineSubsetSelection: function(range) {
        this.selectedSubrange = range;
        $("a.zoomIn span", this.container).text(_("Zoom to selected time"));
    },

    onJobProgress: function() {
        var context = this.getContext();
        this.show(this.visibilityMode);
        

    },

    /**
     * Get the timerange of the running job.  This timerange will always be an
     * absolute timerange, IF it is defined.  If the Jobber has not received
     * the first response from splunkd, this will be an 'all time' timerange.
     * It is the caller's responsibility to account for this.
     */
    getJobTimeRange: function() {
        var s = this.getContext().get("search")
        var j = s.job;
        return j.getTimeRange();
    },

    /**
     * If there is a selected timeRange in the flashChart, then we return that
     * if we do not
     */
    getFlashChartSelectedTimeRange: function() {
        var range = false;
        var r = this;
        this.withEachChild(function(module) {
            if (module.moduleType == "Splunk.Module.FlashChart") {
                if (!module._selection) return true;
                if (typeof(module._selection)=="undefined") return true;
                if (module._selection.hasOwnProperty("timeRange")) {
                    range = module._selection.timeRange;
                    return true;
                }
            } else if (module.moduleType == "Splunk.Module.Timeline") {
                if (!module.selection) return true;
                range = module.selection;
                return true;
            }
        });
        return range;
    },

    passTimeRangeToParent: function(range) {
        var context = new Splunk.Context();
        var search  = new Splunk.Search();
        search.setTimeRange(range);
        context.set("search", search);
        this.passContextToParent(context);
    },

    

    zoomIn: function() {
        var range;
        var search = this.getContext().get("search");
        var range = this.selectedSubrange;
        if (!range) {
            var currentRange = Sideview.utils.getAbsoluteTimeRange(search);
            var flashChartSelectedRange = this.getFlashChartSelectedTimeRange();
            if (flashChartSelectedRange) {
                this.zoomedOutStack = [];
                this.zoomedInStack.push(search.getTimeRange());
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
    },
    
    zoomOut: function() {
        Sideview.utils.patchToFixJSChartingClobbering(this.moduleType);
        var range;
        var search = this.getContext().get("search");

        if (this.zoomedInStack.length>0) {
            range = this.zoomedInStack.pop();
        } else {
            this.zoomedOutStack.push(search.getTimeRange());
            var currentRange = Sideview.utils.getAbsoluteTimeRange(search);
            range = currentRange.zoomOut()
        }

        this.passTimeRangeToParent(range);
        return false;
    },


    getRangeFromEpochTime: function(earliest,latest) {
        var e = new Date();
        e.setTime(earliest*1000)
        var l = new Date();
        l.setTime(latest*1000);
        return new Splunk.TimeRange(e, l);
    },

    roundTimeRange: function(range, tightness) {
        var e = range.getAbsoluteEarliestTime();
        var l = range.getAbsoluteLatestTime();

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
        range = new Splunk.TimeRange(e, l);
        return range;
    },

    slide: function(which) {
        var search = this.getContext().get("search");
        var currentRange = Sideview.utils.getAbsoluteTimeRange(search);
        
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
    },

    slideLeft: function() {
        return this.slide("left");
    },

    slideRight: function() {
        return this.slide("right");
    }
});