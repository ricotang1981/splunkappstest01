// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.
Splunk.Module.Report = $.klass(Splunk.Module, {

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        this.childEnforcement = Splunk.Module.ALWAYS_REQUIRE;
        
        Sideview.utils.applyCustomProperties(this);
    },

    getReportStr: function(internalContext) {
        var r = [];
        
        var internalContext = internalContext || this.getContext();
        var stat   = Sideview.utils.replaceTokensFromContext(this.getParam("stat"), internalContext);
        var xField = Sideview.utils.replaceTokensFromContext(this.getParam("xField"), internalContext);
        
        var yField = Sideview.utils.replaceTokensFromContext(this.getParam("yField"), internalContext);
        var zField = Sideview.utils.replaceTokensFromContext(this.getParam("zField"), internalContext);

        var xFieldBins = parseInt(Sideview.utils.replaceTokensFromContext(this.getParam("xFieldBins"), internalContext),10);
        var zFieldBins = parseInt(Sideview.utils.replaceTokensFromContext(this.getParam("zFieldBins"), internalContext),10);
        
        internalContext.set("stat", stat);
        internalContext.set("xField", xField);
        internalContext.set("yField", yField);
        internalContext.set("zField", zField);

        if (xField!="_time" && xFieldBins>=0) {
            r.push("mvexpand $xField$ | bin $xField$ bins=$xFieldBins$ |");
        }
        if (zField && zFieldBins>=0) {
            r.push("mvexpand $zField$ | bin $zField$ bins=$zFieldBins$ |");
        }
        
        if (xField.split(",").length>1) {
            r.push("stats");
            if (stat && yField) r.push("$stat$($yField$)");
            else r.push("count");
            r.push("by " + xField.split(",").join(" "));
        }
        else {
            if (xField=="_time") {
                r.push("timechart");
                if (xFieldBins>=0) {
                    r.push("bins=$xFieldBins$");
                }
            }
            else r.push("chart");
            if (stat && yField) r.push("$stat$($yField$)");
            else r.push("count");
            if (xField!="_time") r.push("over $xField$");
            if (zField) {
                r.push("by $zField$");
                if (zFieldBins>=0) {
                    r.push("limit=$zFieldBins$");
                }
            }
            if (xField!="_time" && xFieldBins>=0) {
                r.push("| makecontinuous $xField$");
            }
            
        }
        
        
        return Sideview.utils.replaceTokensFromContext(r.join(" "), internalContext);
    },

    getModifiedContext: function(context) {
        var reportStr = this.getReportStr();
        if (!context) context = this.getContext();
        var xField = Sideview.utils.replaceTokensFromContext(this.getParam("xField"), context);
        var splitByField = Sideview.utils.replaceTokensFromContext(this.getParam("zField"), context);
        context.set("sideview.xField", xField);
        context.set("sideview.splitByField", splitByField);
        context.set("sideview.reportKey", this.getParam("name"));
        context.set("sideview.xFieldBins", Sideview.utils.replaceTokensFromContext(this.getParam("xFieldBins"),context));
        context.set("sideview.zFieldBins", Sideview.utils.replaceTokensFromContext(this.getParam("zFieldBins"),context));
        context.set(this.getParam("name"), reportStr);

        return context;
    }
});