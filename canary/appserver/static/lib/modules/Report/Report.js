// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class Report extends Module {

    constructor(container, params) {
        super(container, params);
    }

    getReportStr() {
        var r = [];

        var internalContext = this.getContext();
        var stat   = Sideview.replaceTokensFromContext(this.getParam("stat"), internalContext);
        var xField = Sideview.replaceTokensFromContext(this.getParam("xField"), internalContext);
        var yField = Sideview.replaceTokensFromContext(this.getParam("yField"), internalContext);
        var zField = Sideview.replaceTokensFromContext(this.getParam("zField"), internalContext);

        var xFieldBins = Sideview.replaceTokensFromContext(this.getParam("xFieldBins"), internalContext);
        var zFieldBins = Sideview.replaceTokensFromContext(this.getParam("zFieldBins"), internalContext);

        internalContext.set("stat", stat);
        internalContext.set("xField", xField);
        internalContext.set("yField", yField);
        internalContext.set("zField", zField);

        if (xFieldBins>0) {
            r.push("mvexpand $xField$ | bin $xField$ bins=$xFieldBins$ |");
        }
        if (zField && zFieldBins>0) {
            r.push("mvexpand $zField$ | bin $zField$ bins=$zFieldBins$ |");
        }

        if (xField=="_time") {
            r.push("timechart");
            if (xFieldBins>0) {
                r.push("bins=$xFieldBins$");
            }
        }
        else {
            r.push("chart");
        }
        if (stat && yField) {
            r.push("$stat$($yField$)");
        }
        else {
            r.push("count");
        }
        if (xField!="_time") {
            r.push("over $xField$");
        }
        if (zField) {
            r.push("by $zField$");
        }
        if (xFieldBins>0) {
            r.push("| makecontinuous $xField$ ");
        }

        return Sideview.replaceTokensFromContext(r.join(" "), internalContext);
    }

    getModifiedContext(context) {
        context = context || this.getContext();

        var reportStr = this.getReportStr();

        var xField = Sideview.replaceTokensFromContext(this.getParam("xField"), context);
        var splitByField = Sideview.replaceTokensFromContext(this.getParam("zField"), context);
        context.set("sideview.xField", xField);
        context.set("sideview.splitByField", splitByField);
        context.set("sideview.reportKey", this.getParam("name"));
        context.set("sideview.xFieldBins", Sideview.replaceTokensFromContext(this.getParam("xFieldBins"),context));
        context.set("sideview.zFieldBins", Sideview.replaceTokensFromContext(this.getParam("zFieldBins"),context));
        context.set(this.getParam("name"), reportStr);

        return context;
    }
}
    return Report
});