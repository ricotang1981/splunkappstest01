// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.Timeline = $.klass(Sideview.utils.getBaseClass(true), {
    
    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        this.timeDicts = [
            {"d":1, "f":"%S", "l":_("second"), "setter": "setSeconds", "getter": "getSeconds"},
            {"d":60, "f":"%M", "l":_("minute"), "setter": "setMinutes", "getter": "getMinutes"},
            {"d":3600, "f":"%H", "l":_("hour"), "setter": "setHours", "getter": "getHours"},
            {"d":86400, "f":"%d", "l":_("day"), "setter": "setDate", "getter": "getDate"},
            //{"d":86400, "f":"%d", "l":_("week")},
            {"d":2592000, "f":"%m", "l":_("month"), "setter": "setMonth", "getter": "getMonth"},
            {"d":31536000, "f":"%Y", "l":_("year"), "setter": "setFullYear", "getter": "getFullYear"}
        ];
        this.timeZone = Splunk.Globals["timeZone"];
        this.selectionColorMax = this.getRGB(this.getParam("selectionColorMax"));
        this.selectionColorMin= this.getRGB(this.getParam("selectionColorMin"));
        this.defaultColorMax = this.getRGB(this.getParam("defaultColorMax"));
        this.defaultColorMin = this.getRGB(this.getParam("defaultColorMin"));

        this.container.mousedown(this.onMouseDown.bind(this));
        this.container.mouseup(this.onMouseUp.bind(this));
        this.container.mouseover(this.onMouseOver.bind(this));
        $(document).mouseup(this.onDocumentMouseUp.bind(this));
        //$(document).click(this.onDocumentClick.bind(this));
        //this.container.bind("onKeyUp", this.onKeyUp.bind(this));
        this.container.bind("selectstart", function(){return false;});
        //this.keys = {UP: 38,DOWN: 40,LEFT: 37,RIGHT: 39,TAB: 9};

        
        Sideview.utils.applyCustomProperties(this);
    },
    requiresResults: function() {return true;},
    
    getRGB: function(hexString) {
        return [
            parseInt(hexString.substring(1,3),16), 
            parseInt(hexString.substring(3,5),16), 
            parseInt(hexString.substring(5,7),16)
        ];

    },

    resetUI: function() {},

    onBeforeJobDispatched: function(search) {
        search.setMinimumStatusBuckets(this.getParam("minimumStatusBuckets"));
    },

    onContextChange: function() {
        var context = this.getContext();
        Sideview.utils.applyCustomCssClass(this,context);
        this.selectedTimeRange = false;
        this.subsetSelectionCallback = context.get("onTimelineSubsetSelected");
        this.getResults();
    },

    getTimeRange: function(cell) {
        return new Splunk.TimeRange(cell.attr("s:earliest"),cell.attr("s:latest"), cell.attr("s:etz"), cell.attr("s:ltz"));
    },

    onJobProgress: function() {
        this.getResults();
    },

    onMouseDown: function(evt) {
        var td = $(evt.target);
        if (td[0].tagName=="SPAN") td=td.parent();

        evt.preventDefault();
        if (!evt.shiftKey) {
            this.mouseDownRange = this.getTimeRange(td);
        }
        return false;
    },

    onMouseOver: function(evt) {
        if (!this.mouseDownRange) return false;
        var selectedTimeRange = this.getSelectedTimeRange(evt);
        this.highlightCells(selectedTimeRange);
    },

    onMouseUp: function(evt) { 
        if (!this.mouseDownRange) return false;
        evt.stopPropagation();
        var selectedTimeRange = this.getSelectedTimeRange(evt);
        this.mouseDownRange = false;
        if (typeof(this.subsetSelectionCallback)=="function") {
            this.subsetSelectionCallback(selectedTimeRange);
        }
        this.highlightCells(selectedTimeRange);
        this.selectedTimeRange = selectedTimeRange;
        this.pushContextToChildren();
        return false;
    },
    onDocumentMouseUp: function(evt) {
        if (this.mouseDownRange) {
            this.mouseDownRange = false;
            if (this.selectedTimeRange) {
                this.highlightCells(this.selectedTimeRange);
            } else {
                this.highlightCells(new Splunk.TimeRange());
            }
        }
    },



    

    
    /** 
     * coming soon
     
    onKeyUp: function(evt) {
        switch (evt.keyCode) {
            case this.keys['DOWN']:
            case this.keys['UP']:
            case this.keys['LEFT']:
            case this.keys['RIGHT']:
        }
    },
    */
    
    getSelectedTimeRange: function(evt) {
        var td = $(evt.target);
        if (td[0].tagName=="SPAN") td=td.parent();

        evt.preventDefault();
        var clickRange = this.getTimeRange(td);
        if (clickRange.isAllTime()) return false;

        var earliestRange=clickRange;
        var latestRange = clickRange;
        // rightward drag
        if (clickRange.getAbsoluteEarliestTime() >= this.mouseDownRange.getAbsoluteLatestTime()) {
            earliestRange = this.mouseDownRange;
        }
        // leftward drag.
        else if (this.mouseDownRange.getAbsoluteEarliestTime() >= clickRange.getAbsoluteLatestTime()) {
            latestRange   = this.mouseDownRange.clone();
        }
        //this.logger.debug("onMouseUp clickRange " + clickRange.toConciseString());
        //this.logger.debug("onMouseUp this.mouseDownRange " + this.mouseDownRange.toConciseString());
        
        var selectedTimeRange = new Splunk.TimeRange(
            earliestRange.getAbsoluteEarliestTime(),
            latestRange.getAbsoluteLatestTime(), 
            earliestRange.earliestServerOffsetThen, 
            latestRange.latestServerOffsetThen
        );
        selectedTimeRange.setAsSubRangeOfJob(true);
        
        return selectedTimeRange;
    },


    highlightCells: function(selectedTimeRange) {
        var mainRowCells = $("tr:last td", this.container);
        var range;
        var first,last,lastUnhighlighted = null;
        mainRowCells.each(function(i,cell) {
            cell = $(cell);
            range = this.getTimeRange(cell);
            if (selectedTimeRange && selectedTimeRange.containsRange(range)) {
                cell.css("backgroundColor", this.getScaledBgColor(cell.attr("s:bgScalar"),true));
                cell.css("borderTop","1px solid " + this.getParam("selectionColorMax"));
                cell.css("borderBottom","1px solid " + this.getParam("selectionColorMax"));
                if (!first) {
                    first = cell;
                }
                last = cell;
            } else {
                cell.css("backgroundColor", this.getScaledBgColor(cell.attr("s:bgScalar"),false));
                cell.css("border","1px solid #fff");
                cell.css("borderSpacing","1px");
                if (!first) {
                    lastUnhighlighted = cell;
                }
            }
            
            
        }.bind(this));
        if (lastUnhighlighted) {
            lastUnhighlighted.css("borderRight","1px solid " + this.getParam("selectionColorMax"));
        }
        first.css("borderLeft","1px solid " + this.getParam("selectionColorMax"));
        last.css("borderRight","1px solid " + this.getParam("selectionColorMax"));
                
    },

    /*
    onDocumentClick: function(evt) {
        var elt = $(evt.target);
        this.focused = (Sideview.utils.getModuleFromDOMElement(elt) == this);
    },
    */
    /*
    onClick: function(evt) {
        var elt = $(evt.target);
        var range = this.getTimeRange(elt);
        range.setAsSubRangeOfJob(true);
        this.selectedTimeRange = range;
        this.pushContextToChildren();
    },  
    */

    getModifiedContext: function() {
        var context = this.getContext();
        if (this.selectedTimeRange) {
            var search = context.get("search");
            search.abandonJob();
            search.setTimeRange(this.selectedTimeRange);
            context.set("search",search);
        }
        return context;
    },

    getResultURL: function(params) {
        var context = this.getContext();
        var search  = context.get("search");
        url = search.getUrl("timeline");
        params = {};
        // useless string is useless.
        params["output_time_format"]="x";
        return url + Sideview.utils.dictToString(params);
    },

    getTimeDictIndex: function(duration) {
        duration = parseInt(duration,10);
        var formatIndex = 0;
        while (formatIndex<this.timeDicts.length && duration > 1.1*this.timeDicts[formatIndex].d) {
            formatIndex++;
        }
        return formatIndex;
    },

    getTimeDict: function(duration) {
        var timeDictIndex = this.getTimeDictIndex(duration);
        return this.timeDicts[timeDictIndex];
    },
    
    getBucketsAsJson: function(xmlStr) {
        var buckets = [];
        var c, t, maxCount=0;
        var that = this;
        $(xmlStr).find("bucket").each(function(i, bucket) {
            c = parseInt(bucket.getAttribute("c"),10);
            t = bucket.getAttribute("t")
            if (c > maxCount) maxCount=c;
            buckets.push({
                "a":   parseInt(bucket.getAttribute("a"),10),
                "c":   c,
                "d":   parseInt(bucket.getAttribute("d"),10),
                "etz": parseInt(bucket.getAttribute("etz"),10),
                "ltz": parseInt(bucket.getAttribute("ltz"),10),
                "t":   t,
                "date":that.makeDate(1000 * parseFloat(t))
            });
        });
        var timeDict = (buckets.length>0) ? this.getTimeDict(buckets[0].d) : {};
        var range;
        for (var i=0,len=buckets.length;i<len;i++) {
            bucket = buckets[i];
            bucket.bgScalar = bucket.c/maxCount;
            bucket.bg = this.getScaledBgColor(bucket.bgScalar,true);
            bucket.label = bucket.date.strftime(timeDict.f);
            bucket.earliest = bucket.t;
            bucket.latest = parseFloat(bucket.t) + bucket.d;
            //range = new Splunk.TimeRange(bucket.t, parseFloat(bucket.t) + bucket.d);
        }
        return buckets;
    },

    makeDate: function(epochMS) {
        var date = new Date();
        date.setTime(epochMS);
        var offsetAtServer = this.timeZone.getOffset(epochMS/1000) /60;
        var delta          = Splunk.util.getTimezoneOffsetDelta(offsetAtServer, date);
        date.setTime(epochMS - delta);
        return date;
    },

    getMaxCount:function(buckets) {
        var maxCount = 0;
        for (var i=0,len=buckets.length;i<len;i++) {
            if (buckets[i].c > maxCount) maxCount=buckets[i].c;
        }
        return maxCount;
    },

    /**
     * unitInterval is a float between 0 and 1.
     */
    getScaledBgColor: function(unitInterval, isSelected) {
        var maxColor = (isSelected) ? this.selectionColorMax : this.defaultColorMax;
        var minColor  = (isSelected) ? this.selectionColorMin : this.defaultColorMin;
        return ["#",
            (Math.round(minColor[0]-(minColor[0]-maxColor[0])*unitInterval)).toString(16),
            (Math.round(minColor[1]-(minColor[1]-maxColor[1])*unitInterval)).toString(16),
            (Math.round(minColor[2]-(minColor[2]-maxColor[2])*unitInterval)).toString(16)
        ].join("");
    },
    
    writeHeader: function(tr,row) {
        var label = this.timeDicts[row[0].index].l;
        tr.append($("<th>").text(label));
    },

    writeCell:function(tr, cell) {
        var td = $("<td>")
            .text(cell.label)
        if (cell.colspan) {
            td.attr("colspan",cell.colspan);
        }
        if (cell.bg) {
            td.css("backgroundColor", cell.bg);
        }
        if (cell.earliest && cell.latest) {
            td.attr("s:earliest", cell.earliest);
            td.attr("s:latest", cell.latest);
            td.attr("s:etz", cell.etz);
            td.attr("s:ltz", cell.ltz);
            td.attr("s:bgScalar", cell.bgScalar);
        }
        
        tr.append(td);
    },


    normalizePadding: function() {
        var canary = $("span.first", this.container);
        if (canary.length==0) {
            // looks like we're gonna need another canary
            canary = $("<span>").addClass("first")
            firstCell = $("tr:last td:first", this.container);
            canary.text(firstCell.text());
            firstCell.text("").append(canary);
        }
        
        padding = Math.max(Math.ceil((canary.parent().width() - canary.width())/2),10);
        $("tr.unHighlighted td").css("paddingLeft",padding);
    },

    getRowData: function(buckets) {
        rows = [];
        var mainRowIndex = this.getTimeDictIndex(buckets[0].d);
        
        rows[0] = buckets;

        var previousLabels = [];
        
        var earliest = buckets[0].earliest;
        var colspans = [];
        var earliestTimes = [];
        for (var i=0;i<6;i++) {
            earliestTimes[i] = earliest;
            colspans[i] = 0;
        }

        for (var i=0,len=buckets.length;i<len;i++) {
            var bucket = buckets[i];
            bucket.index = mainRowIndex;
            for (var j=0,jLen=this.timeDicts.length;mainRowIndex+j+1<jLen;j++) {
                if (!rows[j+1]) rows[j+1] = [];

                var timeDict = this.timeDicts[mainRowIndex+j+1];
                //this.logger.debug(i + "th bucket. fetched the " + timeDict.l + " dict (#" + (mainRowIndex+j+1) + ") for the next row");
                
                var label = bucket.date.strftime(timeDict.f);
                if (!previousLabels[j] || previousLabels[j] == label) {
                    colspans[j]++;
                } 
                else {
                    // colspan of current cell is now known. 
                    var latestTime = parseFloat(bucket.t);
                    //this.logger.debug("writing a " + timeDict.l + " cell with colspan " + colspans[j] + " and value " + previousLabels[j] + ", and earliest/latest=" + earliestTimes[j] + "/" + latestTime);
                    
                    rows[j+1].push({
                        "colspan": colspans[j],
                        "label": previousLabels[j],
                        "index": mainRowIndex+j+1,
                        "earliest": earliestTimes[j],
                        "latest": latestTime
                    });
                    colspans[j]=1;
                    earliestTimes[j] = latestTime;
                }
                previousLabels[j] = label;
            }
        }

        // once more into the breach dear friends
        for (var j=0,jLen=this.timeDicts.length;mainRowIndex+j+1<jLen;j++) {
            var timeDict = this.timeDicts[mainRowIndex+j+1];
            var lastBucket = buckets[buckets.length-1];
            if (colspans[j]>0) {
                //this.logger.debug("end of row. write a " + timeDict.l + " row with colspan " + colspans[j] + " and value " + previousLabels[j]);
                rows[j+1].push({
                    "colspan": colspans[j],
                    "label": previousLabels[j],
                    "index": mainRowIndex+j+1,
                    "earliest": earliestTimes[j],
                    "latest": parseFloat(lastBucket.t) + lastBucket.d
                });
            }
        }
        return rows;
    },

    getMinValueForSetter: function(setter) {
        return (setter=="setDate")?1:0;
    },

    makeAggregateRow: function(tr, fullWidthCell) {
        var range = new Splunk.TimeRange(fullWidthCell.earliest,fullWidthCell.latest);
        var earliest = range.getAbsoluteEarliestTime();
        var latest = range.getAbsoluteLatestTime();

        for (var i=0;i<fullWidthCell.index;i++) {
            var timeDict = this.timeDicts[i];
            var minValue = this.getMinValueForSetter(timeDict["setter"]);
            earliest[timeDict["setter"]](minValue);
            var currentLatest = latest[timeDict["getter"]]();
            if (currentLatest!=minValue && i+1<this.timeDicts.length) {
                latest[timeDict["setter"]](minValue);
                var nextDict = this.timeDicts[i+1];
                var currentLatestNext = latest[nextDict["getter"]]();
                latest[nextDict["setter"]](currentLatestNext+1);
            }
        }

        var offsetAtEarliest = this.timeZone.getOffset(earliest/1000) /60;
        var earliestDelta          = Splunk.util.getTimezoneOffsetDelta(offsetAtEarliest, earliest);
        var offsetAtLatest = this.timeZone.getOffset(latest/1000) /60;
        var latestDelta          = Splunk.util.getTimezoneOffsetDelta(offsetAtLatest, latest);

        earliest.setTime(earliest.valueOf() + earliestDelta);
        latest.setTime(latest.valueOf() + latestDelta);
        range = new Splunk.TimeRange(earliest,latest);

        
        
        var label = range.toConciseString();
        label = label.replace("during ","");
        label = label.replace("at ","");
        fullWidthCell.label = label;
        this.writeCell(tr, fullWidthCell);
    },

    renderRows: function(buckets) {
        var table = $("<table>");
        var rows = this.getRowData(buckets);
        
        for (var i=0;i<rows.length; i++) {
            var row = rows[i];
            var tr = $("<tr>");

            this.writeHeader(tr,row);
            if (i>0) tr.addClass("unHighlighted");
            if (row.length>1) {
                for (var j=0;j<row.length;j++) {
                    this.writeCell(tr, row[j]);
                }
                table.prepend(tr);
            } else {
                this.makeAggregateRow(tr, row[0])
                table.prepend(tr);
                break;
            }
        }

        this.container.html("");
        this.container.append(table);
    },

    renderResults: function(xmlStr) {
        if (!xmlStr) {
            this.logger.error("empty string returned in " + this.moduleType + ".renderResults");
        }

        var buckets = this.getBucketsAsJson(xmlStr);
        if (buckets.length==0) {
            var context = this.getContext();
            var search  = context.get("search");
            if (search.job.isDone()) {
                this.container.html(_("No timeline information exists in these search results."));
            }
            else {
                this.container.html(_("Loading..."));
            }
            return;
        }
        
        this.renderRows(buckets);
        if (this.selectedTimeRange) this.highlightCells();
        this.normalizePadding();
    }
});
