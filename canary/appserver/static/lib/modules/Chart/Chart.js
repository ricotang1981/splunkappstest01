// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule",
  "time_range",
  "moment",
  "chartjs",
  "google_palette/palette"],
  function($, Sideview, Module, TimeRange, moment, Chartjs, palette) {


class Chart extends Module {
    constructor(container, params) {
        // this is here because the multiplexer treads lightly.
        // Chart begins life with an empty container, so for non-multiplexed-charts this should do
        // nothing.
        container.html("");
        super(container, params);
        this.useHTMLLegend = false;
        this.chartTypes = {column:"bar",bar:"horizontalBar", area:"line", line:"line"};
        this.tickMarkThresholds = [
            {seconds:2592000,unit:"month"},
            {seconds:86400,unit:"day"},
            {seconds:3600,unit:"hour"},
            {seconds:60,unit:"minute"},
            {seconds:1,unit:"second"},
            {seconds:0.01,unit:"millisecond"}
        ];
        this.drilldownVisibilityKey = "under chart drilldown - ";

        //Chart.defaults.global.legend = "bottom";
        //Chart.defaults.global.hover.mode = "single";
        var height = this.getParam("height");
        this.container.attr("style","position:relative; width:100%;height:" + height + ";");

        this.container.append($("<div>").addClass("progressIndicator"));
        if (this.useHTMLLegend) {
            this.container.append($("<div>").addClass("htmlLegend"));
        }
        this.container.append(
            $("<canvas>")
            .attr("id",this.moduleId + "_canvas")
        );

        if (this.getParam("enableResize")=="True") {
            this.setupResizability();
        }
        this.name = this.getParam("name");
        this._baseChartingDict = this.getBaseChartingDict();
        setTimeout(this.generateColorSchemeCodeNamedDuckfez(),0)
    }

    generateColorSchemeCodeNamedDuckfez() {
        var blue = "648fff";
        var purple = "785ef0";
        var pink = "dc267f";
        var orange = "fe6100";
        var yellow = "ffb000";
        var green = "34bc6e";
        palette.register(palette.Scheme.fromPalettes("duckfez", "qualitative", [
            [yellow],
            [orange, blue],
            [yellow, pink, blue],
            [yellow, pink, blue, green],
            [yellow, pink, purple, blue, green],
            [yellow, orange, pink, purple, blue, green]
        ], 6, 6));
    }

    generateColorSchemeOnTheFly(paletteName, seriesColors) {
        // Google Palette is weird.
        var lolwut = [];
        var length = seriesColors.length;
        for (var i=0; i<length; i++) {
            var newEntry = [];
            for (var j=0; j<=i; j++) {
                newEntry[j] = seriesColors[j];
            }
            lolwut[i] = newEntry;
        }
        palette.register(palette.Scheme.fromPalettes(paletteName, "qualitative", lolwut, length, length));
    }

    getBaseChartingDict() {
        var dict = {};
        for (var name in this._params) {
            if (name.indexOf("charting.")===0 && this._params.hasOwnProperty(name)) {
                var value = this._params[name];
                name = name.replace("charting.","");
                dict[name] = value;
            }
        }
        return dict;
    }

    getChartingDict(context) {
        if (!context) context = this.getContext();
        var contextDict = context.getAll("charting");
        // merge the two dicts, with priority given to the context dict.
        var dict = $.extend(this._baseChartingDict, contextDict);
        for (var key in dict) {
            if (dict.hasOwnProperty(key)) {
                if (typeof dict[key] == "string") {
                    dict[key] = Sideview.replaceTokensFromContext(dict[key], context);
                }
            }
        }
        return dict;
    }

    setupResizability() {
        this.resizeBar = $("<div>")
            .attr("id",this.moduleId + "_resizeBar")
            .attr("style","height:10px;background-color:#ccc;cursor: grab;");
        this.container.after(this.resizeBar);

        this.resizing = false;
        this.resizeBar.mousedown(this.onResizeStart.bind(this));
        $(document).mouseup(this.onResizeEnd.bind(this));
        $(document).mousemove(function(evt) {
            if (this.resizing) {
                this.resize(evt);
            }
        }.bind(this));
    }

    _changeVisibility() {
        if (this.isVisible()) {
            this.container.show();
            if (this.resizeBar) {
                this.resizeBar.show();
            }
        }
        else {
            this.container.hide();
            if (this.resizeBar) {
                this.resizeBar.hide();
            }
        }
    }

    onResizeStart(evt) {
        this.resizing = true;
        this.resize_initialContainerHeight = this.container.height();
        this.resize_initialPageY = evt.pageY;
    }

    onResizeEnd(evt) {
        this.resizing = false;
    }

    resize(evt) {
        if (this.resizing) {
            var delta = evt.pageY - this.resize_initialPageY;
            var newHeight = this.resize_initialContainerHeight + delta;
            newHeight = Math.max(newHeight,100);
            this.container.height(newHeight);
        }
    }

    requiresResults() {return true;}

    /**
     * framework method that executes whenever the module receives new context
     * data from upstream.
     */
    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        var search = context.getSplunkSearch();

        var p = this.getSplunkResultParams(context,search);

        Sideview.applyCustomCssClass(this,context);

        if (this.hasResultsURLChanged()) {
            this.resetUI();
        }
        if (search.canGetResults()) {
            this.getResults();
        }
        else {
            this.displayWaitingForResultsMessage(search);
        }
    }

    /**
     * framework method that executes whenever the number of search results
     * changes, or for rtsearches, that executes every few seconds.
     */
    onJobProgress(evt, job) {
        if (job.isDone()) return;
        if (job.canGetResults()) {
            this.getResults();
        }
        else {
            var search = this.getContext().getSplunkSearch();
            this.displayWaitingForResultsMessage(search);
        }
    }

    /**
     * framework method that executes when the current search results
     * are complete.
     */
    onJobDone(evt, job) {
        this.getResults();
    }

    getResultURL(params) {
        var context = this.getContext();
        var search  = context.getSplunkSearch();
        var sid     = search.getSearchId();

        if (!sid) {
            throw("ERROR - getResultURL called on a Chart module that has no search id");
        }
        var url = Sideview.make_url("/splunkd/__raw/search/jobs/", sid, "/results_preview");
        return url + "?" + Sideview.dictToString(params);
    }

    /**
     * framework method.  This we use to specify all the querystring params
     * for our getResults call.
     */
    getSplunkResultParams(context,search) {
        var params = {};
        switch (search.getAPI()) {
            case "splunk":
                if (search.canGetResults()) params.show_preview = "1";

                var postProcess = search.getPostProcess() || ""
                if (postProcess) {
                    params.search = postProcess;
                }
                params.output_mode = "json_cols";
                params.count="10000",
                params.time_format = "%s.%Q";
                break;

            default:
                console.warn(this.moduleType + " has no specific getSplunkResultParams implementation for " + search.getAPI());
        }
        return params;
    }

    displayWaitingForResultsMessage(search) {
        var doneProgress = search.getDoneProgress();
        var progressPercent = (Math.round(doneProgress * 10000) / 100);
        if (this.lastRenderedChart) {
            console.warn("Still unclear why this happens sometimes - Chart got a call to displayWaitingForResultsMessage but somehow the lastRenderedChart was still there, even though resetUI should have just been called.");
            console.trace();
            this.lastRenderedChart.destroy();
        }
        var message = "Queued...";
        if (doneProgress != 0) {
            message = sprintf("Loading (%s%)", progressPercent);
        }
        // too lazy to mess with padding/margin and then worry about hiding the div later.
        // aka "html go <br> <br>"
        $(".progressIndicator",this.container).html("<br><br>" + message);
    }

    getChartType(d) {
        var t = d["chart"] || "column";
        if (this.chartTypes.hasOwnProperty(t)) {
            return this.chartTypes[t];
        }
        console.error("UNSUPPORTED CHART TYPE " + t);
        return t;
    }

    //TODO -    Worry about %d/%m people....
    // var locale = Sideview.getConfigValue('LOCALE');

    getTickMarkUnit(type, bucketDuration, numberOfBuckets) {
        if (type=="secondary") {
            if (bucketDuration==1) {
                return "second";
            } else {
                bucketDuration=bucketDuration*8;
            }
        }
        var seconds, unit;
        // they start at month and go down.
        for (var i=0;i<this.tickMarkThresholds.length; i++) {
            seconds = this.tickMarkThresholds[i].seconds;
            if (bucketDuration>seconds) {
                return unit;
            }
            else {
                unit = this.tickMarkThresholds[i].unit;
            }
        }
        console.error("we *probably* shouldn't ever see this but I'm not 100% sure - possibly in millisecond use cases this is good");
        return unit;
    }

    hexToRgb(hex){
        var c;
        if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
            c= hex.substring(1).split("");
            if(c.length== 3){
                c= [c[0], c[0], c[1], c[1], c[2], c[2]];
            }
            c= "0x"+c.join("");
            return [(c>>16)&255, (c>>8)&255, c&255];
        }
        throw new Error("Bad Hex " + hex);
    }

    getColor(pal,i,totalCount,label) {
        /*
        if (i%2==1) {
            i = totalCount-i-1;
        }
        */
        if (i>pal.length-1) {
            console.log(sprintf("Assertion Failed - there are only %s colors in this palette! i=%s", pal.length, i));
            return [0,0,0];
        }
        var rgb = this.hexToRgb("#" + pal[i]);
        return rgb;
    }

    getColorStr(rgb,opacity) {
        return "rgba(" + rgb.join(",") + "," + opacity + ")";
    }

    getPalette(columnCount, explicitPaletteStr) {
        var name = false;
        if (explicitPaletteStr) {
            var seriesColors = explicitPaletteStr.split(",");
            if (seriesColors.length == 1) {
                console.error("Chart module given a 'seriesColors' value that has only one color.");
            }
            else {
                for (var i=0; i<seriesColors.length; i++) {
                    seriesColors[i] = seriesColors[i].replace("#","");
                }
                name = "custom";
                this.generateColorSchemeOnTheFly(name, seriesColors)
            }
        }
        if (!name) {
            if (columnCount<=6) name = "duckfez";
            else if (columnCount<=12) name = "tol";
            else name = "tol-rainbow";
        }
        var pal = palette(name, columnCount);
        if (!pal) {
            console.error(sprintf("Assertion Failed - for %s columns, our palette %s didnt work", columnCount, name));
        }
        return pal;
    }

    formatData(jsonResponse, chartingDict) {
        var fields = jsonResponse.fields;

        var rowLabels=[];
        var rowLabels =jsonResponse.columns[0];
        if (fields[0]=="_time" && jsonResponse.columns.length>0) {
            for (var i=0,len=rowLabels.length;i<len;i++) {
                rowLabels[i] = parseInt(rowLabels[i],10) * 1000
            }
        }

        var data = {
            labels: rowLabels,
            datasets: [],

            // don't mind me.  I'm not in your spec but... YOU NEED ME!!!!!!
            // .... I was...I was a bit on edge just now, but if I were a
            // mason I'd sit at the back and not get in anyone's way.
            xField : fields[0]
        }
        var trueColIndex = 0;
        var trueColCount = 0;
        for (var i=0,len=fields.length;i<len;i++) {
            if (fields[i]=="_time") continue;
            if (fields[i]=="_span") continue;
            if (fields[i]=="_spandays") continue;
            trueColCount++
        }
        var pal = this.getPalette(trueColCount, chartingDict["seriesColors"]);

        this.lastRenderedSpans = [];

        for (var i=0,len=jsonResponse.columns.length;i<len;i++) {

            if (fields[i]=="_time") continue;
            if (fields[i]=="_spandays") continue;
            if (fields[i]=="_span") {
                this.lastRenderedSpans = jsonResponse.columns[i].slice(0);
                continue;
            }
            if (i==0) {
                //console.log("well... this looks like a straight stats count by foo, and the counts are the dataset and not the foo's. ");
                continue;
            }

            var dataset = {
                label: fields[i],
                data: jsonResponse.columns[i].slice(0),
            }
            var rgb = this.getColor(pal,trueColIndex,trueColCount,fields[i]);
            dataset.backgroundColor=this.getColorStr(rgb,0.90);
            var chartType = chartingDict["chart"];
            if (chartType=="line") {
                dataset.borderColor=this.getColorStr(rgb,0.90);
                dataset.fill = false;
                var markerSize = chartingDict["chart.markerSize"];
                var showMarkers = chartingDict["chart.showMarkers"] || "";
                if (showMarkers.toLowerCase()=="false") markerSize = 1;
                else markerSize = 2
                dataset.pointRadius = markerSize;
            }
            else {
                dataset.borderWidth=0;
            }
            if (chartType=="line" || chartType=="area") {
                if (chartingDict["chart.nullValueMode"] == "connect") {
                    dataset.spanGaps = true;
                }
            }
            dataset.hoverBackgroundColor=this.getColorStr(rgb,1);
            data.datasets.push(dataset);
            trueColIndex++
        }
        return data;
    }

    getYAxisValueRange(jsonResponse) {
        var columns = jsonResponse["columns"] || [];
        var fields = jsonResponse["fields"];
        var maxValue = 0;
        var minValue = 0;
        for (var i=0;i<columns.length;i++) {
            // we pretend underscore fields are not a thing. no in-band signaling thank you. lalala.
            if (fields[i].charAt(0) == "_") continue;
            for (var j=0;j<columns[i].length;j++) {
                maxValue = Math.max(maxValue,columns[i][j]);
                minValue = Math.min(minValue,columns[i][j]);
            }
        }
        return [maxValue, minValue];
    }

    roundUpToOnesTwosFives(value) {
        var strValue = value.toString().split("");

        var alreadyPerfect = true;
        for (var i=1; i<strValue.length; i++) {
            if (strValue[i] != "0") {
                alreadyPerfect = false;
                break;
            }
        }
        if (alreadyPerfect && ["1","2","5"].indexOf(strValue[0])!=-1) {
            return value;
        }
        for (var i=1; i<strValue.length; i++) {
            strValue[i] = "0"
        }
        if (strValue[0] >= 5) {
            strValue[0] = "0";
            return parseInt("1"+strValue.join(""), 10);
        }
        if (strValue[0] >= 2) {
            strValue[0] = "4";
            return parseInt(strValue.join(""), 10);
        }
        if (strValue[0] >= 1) {
            strValue[0] = "2";
            return parseInt(strValue.join(""), 10);
        }
        return value;
    }

    getYAxisOptions(jsonResponse, c) {
        var d = this.getChartingDict(c);


        var options = {
            display: true,
            stacked: false,
        }

        var ticksOptions = {
            maxRotation:0
        };

        if (d["chart"]!="line" && d["chart.stackMode"]=="stacked"
            && jsonResponse.fields.length>2) {
            options.stacked = true;
        }

        var range = this.getYAxisValueRange(jsonResponse);
        var maxYValue = range[0];
        var minYValue = range[1];


        if (d["axisY.scale"] == "log") {
            options["type"] = "logarithmic"

            // give the y-axis a bit of breathing room on top.
            ticksOptions["max"] = this.roundUpToOnesTwosFives(3 *  maxYValue);

            ticksOptions["autoSkip"] = true;
            ticksOptions["min"] = 0;
            ticksOptions["callback"] = function (value, index, values) {
                if (["1","2","5"].indexOf(value.toString().charAt(0))!=-1) {
                    return value;
                }
            }
        }
        else {
            if (d.hasOwnProperty("axisY.minimumNumber")) {
                var minimum = parseInt(d["axisY.minimumNumber"], 10)
                if (minimum < minYValue) {
                    ticksOptions["min"] = minimum;
                }
            }
            if (d.hasOwnProperty("axisY.maximumNumber")) {
                var maximum = parseInt(d["axisY.maximumNumber"], 10);
                if (maximum > maxYValue) {
                    ticksOptions["max"] = maximum;
                }
            }
        }
        options["ticks"] = ticksOptions;

        if (c.get("sideview.yField")) {
            options.scaleLabel = {
                display: true,
                labelString: c.get("sideview.yField")
            }
        }
        return [options];
    }

    getXAxisOptions(jsonResponse, c) {
        var d = this.getChartingDict(c);
        if (d["axisLabelsX.axisVisibility"] == "hide") {
            return [{
                ticks:{display:false}
            }]
        }
        var primaryAxis = {
            stacked: (d["chart"]!="line" && d["chart.stackMode"]=="stacked")?true:false,
            display: true
        };
        var xField = c.get("sideview.xField");
        if (xField && xField!="_time") {
            primaryAxis.scaleLabel = {
                display: true,
                labelString: c.get("sideview.xField")
            }
        }

        var secondaryAxis = null;
        var axisType = "categorical";
        if (jsonResponse.hasOwnProperty("fields") && jsonResponse.fields.indexOf("_time")!=-1 && jsonResponse.fields.indexOf("_span")!=-1) {
            axisType="time";
        }
        if (axisType=="time") {
            var bucketDuration  = jsonResponse.columns[jsonResponse.fields.indexOf("_span")][0];
            var numberOfBuckets = jsonResponse.columns[0].length;

            var primaryUnits = this.getTickMarkUnit("primary",bucketDuration, numberOfBuckets);
            $.extend(primaryAxis, {
                ticks: {
                    beginAtZero:true,
                    maxRotation:0

                },
                type:"time",
                time:{
                    unit:primaryUnits,
                    displayFormats: {
                        hour: "HHA"
                    }
                }
            });

            var secondaryUnits = this.getTickMarkUnit("secondary",bucketDuration);
            if (secondaryUnits && primaryUnits!=secondaryUnits ) {
                secondaryAxis = {
                    type:"time",
                    ticks: {
                        maxRotation:0
                    },
                    time:{
                        unit:secondaryUnits
                    }
                };
            }
        }
        var xAxisOptions = [];
        xAxisOptions.push(primaryAxis);
        if (secondaryAxis) {
            xAxisOptions.push(secondaryAxis);
        }
        return xAxisOptions;
    }

    getTooltipOptions(xAxisOptions) {
        var tooltips = {
            "intersect" : true,
            "mode": "nearest",
            "position": "nearest"
        };
        if (xAxisOptions.length>0 && xAxisOptions[0].type =="time") {
            tooltips.callbacks =  {
                title: function(tooltipItems, data) {
                    var title = "";
                    var labels = data.labels;
                    var labelCount = labels ? labels.length : 0;

                    if (tooltipItems.length > 0) {
                        var item = tooltipItems[0];

                        if (item.xLabel) {
                            title = moment(item.xLabel).toString();

                        } else if (labelCount > 0 && item.index < labelCount) {
                            title = labels[item.index];
                        }
                    }
                    return title;
                }
            }
        }
        return tooltips;
    }

    getLegendOptions(numberOfColumns, chartingOptions) {
        var legendOptions = {};

        // if (this.useHTMLLegend) {
        if (numberOfColumns > 100) {
            // turn off the default chartjs legend
            legendOptions["display"] = false;
        }
        else {
            if (numberOfColumns > 51) {
                legendOptions["labels"] = {
                    "boxWidth":30,
                    "fontSize":10
                };
            }
            legendOptions["position"] = chartingOptions["legend.placement"] || "right";
        }
        legendOptions["onHover"] = function(event, legendItem) {
            var ci = this.chart;
            this.hoverIndex = legendItem.datasetIndex;
            ci.data.datasets[this.hoverIndex].pointRadius = 5;
            ci.update();
        }
        legendOptions["onLeave"] = function(event, legendItem) {
            var options = this.options || {};
            if (this.hoverIndex>-1) {
                var ci = this.chart;
                ci.data.datasets[this.hoverIndex].pointRadius = 2;
                ci.update();
                this.hoverIndex = -1;
            }
        }
        return legendOptions;
    }

    renderResults(jsonResponse) {
        var c = this.getContext();
        var numberOfColumns = jsonResponse.columns.length;

        if (numberOfColumns == 1) {
            throw "unimplemented -- Chart module received " + jsonResponse.columns.length + " columns in renderResults";
        }

        this.lastJsonResponse = $.extend({}, jsonResponse);

        var d = this.getChartingDict(c);
        var formattedData = this.formatData(jsonResponse, d);

        // TODO - make this take the formatted data as well, rather than raw json response.
        var xAxisOptions = this.getXAxisOptions(jsonResponse,c);


        var yAxisOptions = this.getYAxisOptions(jsonResponse,c);
        var legendOptions = this.getLegendOptions(numberOfColumns, d);

        $(".progressIndicator",this.container).html("");

        var canvas = $("canvas",this.container);

        if (this.lastRenderedChart) {
            // required or else the old one lingers as a ghost, reappearing if anyone mouses over
            // certain elements of the new chart.
            this.lastRenderedChart.destroy();
        }
        this.lastRenderedChart = new Chartjs(canvas, {
            type: this.getChartType(d),
            data: formattedData,

            backgroundColor: "rgb(100, 100, 150, 0.1)",
            options: {
                responsive:true,
                elements: {
                    line:{
                        tension: 0.15
                    }
                },
                duration:0,
                maintainAspectRatio: false,

                tooltips: this.getTooltipOptions(xAxisOptions),

                legend: legendOptions,
                scales: {
                    xAxes: xAxisOptions,
                    yAxes: yAxisOptions
                },
                onClick: this.onClick.bind(this),
                legendCallback: this.buildLegend.bind(this)
            }
        });
        if (this.useHTMLLegend) {
            var legendHTML = this.lastRenderedChart.generateLegend();
            $(".htmlLegend", this.container).html(legendHTML);
        }
        this.hideDownstreamModules();
    }

    getValueMapSnapshot(datasets, elementIndex) {
        var valueMap = {};
        for (var i=0,len=datasets.length;i<len;i++) {
            var point = datasets[i];
            var value = datasets[i].data[elementIndex];
            valueMap[point.label] = value;
        }
        return valueMap;
    }

    getSplitByField(context) {
        var splitByField = context.get("sideview.splitByField");
        if (!splitByField) {
            var s = context.getSplunkSearch();
            splitByField = Sideview.inferSplitByField(s.toString(), s.getPostProcess());
        }
        return splitByField;
    }

    buildLegend(chart) {
        var text = [];
        text.push('<ul class="' + chart.id + '-legend">');
        for (var i = 0; i < chart.data.datasets.length; i++) {
            text.push('<li><span style="background-color:' +
                       chart.data.datasets[i].backgroundColor +
                       '"></span>');
            if (chart.data.datasets[i].label) {
                text.push(chart.data.datasets[i].label);
            }
            text.push('</li>');
        }
        text.push('</ul>');
        return text.join('');
    }

    onClick(evt, elt) {
        if (elt.length==0) return;
        var chart = elt[0];
        var context = this.getContext();

        var selected = {};

        var datasets=this.lastRenderedChart.data.datasets
        var element = this.lastRenderedChart.getElementAtEvent(evt)[0];

        var datasetIndex = element._datasetIndex;
        var label = datasets[datasetIndex].label;
        var value = datasets[datasetIndex].data[element._index];

        selected.xValue       = this.lastRenderedChart.data.labels[element._index];

        selected.splitByValue = label

        selected.xField = context.get("sideview.xField");
        if (!selected.xField) {
            selected.xField = this.lastRenderedChart.data.xField;
        }
        this.lastKnownValueMap = this.getValueMapSnapshot(datasets, element._index) ;

        if (selected.xField=="_time") {
            var span = this.lastRenderedSpans[element._index];
            var startTime = parseInt(selected.xValue,10)/1000;
            var endTime = startTime + parseInt(span,10);
            selected.timeRange = new TimeRange(startTime,endTime);
        }

        var splitByField = this.getSplitByField(context);

        if (splitByField) {
            selected.splitByField = splitByField;
        }
        this._selected = selected;

        this.showDescendants(this.drilldownVisibilityKey + this.moduleId);

        this.pushDownstream();
    }

    onLegendClick(e, legendItem) {
        //var index = legendItem.datasetIndex;
        //var ci = this.lastRenderedChart.chart;
        //var meta = ci.getDatasetMeta(index);

        var context = this.getContext();
        var selected = {}
        var splitByField = this.getSplitByField(context);
        if (!splitByField) {
            console.error("probably fine, but we couldn't find a split by field so we did not allow the user to click the legend item for " + legendItem.text);
            return;
        }
        selected.splitByField = splitByField;
        selected.splitByValue = legendItem.text;

        this._selected = selected;
        this.showDescendants(this.drilldownVisibilityKey + this.moduleId);
        this.pushDownstream();
    }

    getDrilldownTimeRange(context) {
        if (this._selected.timeRange) {
            return this._selected.timeRange;
        }
        // if we have a relative or alltime timerange, replace it for the
        // job's absolute timerange equivalent.
        else {
            var inheritedRange = context.get("shared.timeRange") || new TimeRange();
            if (!inheritedRange.isAbsolute() && !inheritedRange.isAllTime()) {
                var job = this.getContext().getSplunkSearch().job;
                return job.getTimeRange();
            }
        }
        return false;
    }

    getModifiedContext(context) {
        context = context || this.getContext();



        if (this._selected) {
            for (var key in this._selected) {
                context.set(this.name + "." + key, this._selected[key]);
            }

            var search = context.getSplunkSearch();

            var drilldownRange = this.getDrilldownTimeRange(context);
            if (drilldownRange) {
                context.set("shared.timeRange",drilldownRange);
            }
            context.setSplunkSearch(search);

            if (this._selected.splitByField) {
                context.set(this.name + ".splitByField",this._selected.splitByField);

                //context.set(this.name + ".name2",this._selected.splitByField);
            }
            if (this._selected.splitByValue) {
                context.set(this.name + ".splitByValue",this._selected.splitByValue);
            }
            Sideview.setDrilldownSearchTerms(context, this.name, this._selected.xField, this.lastKnownValueMap);
            Sideview.setStandardTimeRangeKeys(context);
        }
        // Note/TODO - we are not setting click.selectedElement to anything yet.
        return context;
    }

    isReadyForContextPush() {
        if (!this._selected) {
            return this.CANCEL;
        }
        return this.CONTINUE;
    }

    resetUI() {
        if (this.lastRenderedChart) {
            this.lastRenderedChart.destroy();
            this.lastRenderedChart = null;
        }
        this.hideDownstreamModules();
    }

    onHierarchyApplied() {
        this.hideDownstreamModules();
    }

    hideDownstreamModules() {
        this.hideDescendants(this.drilldownVisibilityKey + this.moduleId);
    }

};

    return Chart
});