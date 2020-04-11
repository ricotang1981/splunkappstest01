// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.

define(
    ["jquery",
    "sideview",
    "svmodule",
    "twbsPagination"],
    function($, Sideview, Module, twbsPagination) {

class Pager extends Module {

    constructor(container, params) {
        super(container, params);
        this.offset = 0;
        this.postProcessCount = -1;
        this.entityName = this.getParam("entityName");
        this.invisibilityMode = "goAwayWhenBlank";
        this.collapseWhenEmpty = (this.getParam("collapseWhenEmpty")=="True");
    }

    requiresResults(){return true;}

    /******************
     * listening to change from above.
     ****************/
    onContextChange(context){
        this.offset = 0;
        this.postProcessCount=-1;
        Sideview.applyCustomCssClass(this,context);
        var search  = context.getSplunkSearch();
        var tc = this.getTotalCount(context);
        if (search.isDispatched() && tc==0) {
            this.resetUI();
        }
        // this is purely for so-called slaved Pagers that live underneath
        // results and defer to their master Pagers upstream.

        if (context.has("results.offset")) {
            this.offset = context.get("results.offset");
        }
        else if (this.offset < tc  ){
            this.offset = 0;
        }
        //TODO OPTIMIZE - In many cases this refresh call will be unnecessary.
        this.refresh(context);
    }

    onBeforeJobDispatched(search) {
        if (this.entityName == "events") {
            search.setMinimumStatusBuckets(1);
        }
    }

    onProgressOrDone(evt, job) {
        var context = this.getContext();
        var search  = context.getSplunkSearch();
        var postProcess = $.trim(search.getPostProcess() || "");
        if (!this.hasMaxPages() && (postProcess || this.getTotalCount(context) > 0)) {
            this.refresh(context);
        }
    }

    onJobProgress(evt, job){
        return this.onProgressOrDone(evt, job);
    }

    onJobDone(evt, job) {
        return this.onProgressOrDone(evt, job);
    }

    onClick(evt, page){
        var context = this.getContext();
        var upstreamPagerCallback = context.get("results.upstreamPagerCallback");
        if (upstreamPagerCallback) {
            try {
                var count = this.getCount(context);
                this.offset = (page-1) * count;
                upstreamPagerCallback(page);
            } catch(e) {
                alert("unexpected error in slaved Pager trying to call the master pager's callback . " + e);
            }
            return
       }
       return this.doClick(page);
    }

    doClick(page){
        var context = this.getContext();
        var count = this.getCount(context);
        this.offset = (page-1) * count;
        this.refresh(context);
        this.pushDownstream();
        return false;
    }

    doClickFromDownstreamPager(page) {
        this.doClick(page);
        var upstreamTop = this.container.offset().top;
        var newScrollTop = Math.min($(window).scrollTop(), upstreamTop);
        $(window).scrollTop(newScrollTop);
    }

    cleanPostProcess(p) {
        if (!p) return p;
        p = $.trim(p);
        if (p=="") return p;
        for (var i=0;i<p.length;i++) {
            if (p.charAt(i)=="|") {
                p = p.slice(1);
                i--;
            }
            else break;
        }
        for (var i=p.length-1;i>0;i--) {
            if (p.charAt(i)=="|") p = p.slice(0,p.length-1);
            else break;
        }
        return p;
    }

    getSplunkResultParams(context,search) {
        var params = {};
        var postProcess = this.cleanPostProcess(search.getPostProcess());
        params["search"] = postProcess + " | stats count";
        params["output_mode"] = "json";
        return params;
    }

    refresh(context) {
        var search  = context.getSplunkSearch();
        var postProcess = this.cleanPostProcess(search.getPostProcess());
        this.postProcessCount = -1;
        if (postProcess) {
            if (!search.job) {
                console.error("Pager somehow has a search that has no Job object on it");
                console.trace();
            }
            if (search.job.getResultCount()>0 || (!search.job.areResultsTransformed() && search.job.getEventCount()>0)) {
                this.getResults();
            }
        }
        else {
            this.renderLinks(context);
        }
    }

    renderResults(jsonResponse) {
        var results = jsonResponse.results;
        if (results.length>0) {
            this.postProcessCount = parseInt(results[0]["count"],10);
        } else {
            console.error("somehow we sent a search and post process with | stats count on the end and got 0 results back. This should never happen");
            this.postProcessCount = -1;
        }
        var context = this.getContext();
        this.renderLinks(context);
    }

    getCount(context) {
        var count = context.get("results.count");
        // patch for the snafu whereby some modules actually put in
        // results.* fields from the job, one of which is....
        // results.count  yay omg.  If these are the same then ignore
        // the count.
        if (!count || (count==context.get("results.resultCount"))) {
            count = this.getParam("count");
        }
        return count;
    }

    renderLinks(context){
        var count = this.getCount(context);
        var totalPages = Math.ceil(this.getTotalCount(context) / count);
        var startPage  = Math.ceil((this.offset)/count)+1;

        if (totalPages>0) {

            $(this.container).empty();
            $(this.container).removeData("twbs-pagination");
            $(this.container).unbind("page");
            try {
                $(this.container).twbsPagination({
                    prev: "&laquo; " + _("prev"),
                    next: _("next") + " &raquo",
                    totalPages: totalPages,
                    visiblePages: this.getParam("maxPages"),
                    startPage: startPage,
                    initiateStartPageClick: false,
                    onPageClick: function(evt,page) {
                        this.onClick(evt,page)
                    }.bind(this)
                });
            }
            catch(e) {
                console.error(e);
                alert("Unexpected Error at " + this.moduleId + " renderLinks. " + e);
            }
        }
        if (this.collapseWhenEmpty) {
            if (totalPages < 2) {
                this.hide(this.invisibilityMode);
            } else {
                this.show(this.invisibilityMode);
            }
        }
    }

    getModifiedContext(context) {
        context = context || this.getContext();

        context.set("results.offset", parseInt(this.offset,10));
        // if it's set upstream, we'll be setting it back to the same value.
        context.set("results.count", this.getCount(context));
        context.set("results.upstreamPagerCallback", this.doClickFromDownstreamPager.bind(this));
        return context;
    }

    /**
     * template method to be overridden in 'custom' situations.
     */
    getCustomCount() {
        return 0;
    }

    getTotalCount(context){
        var search  = context.getSplunkSearch();
        if (!search) {
            console.error("peculiar, but there's no search at the pager module right now");
            return 0;
        }
        var postProcess = $.trim(search.getPostProcess() || "");

        if (this.entityName == "custom") {
            return this.getCustomCount();
        }
        if (postProcess!="") {
            if (this.postProcessCount >-1) {
                return this.postProcessCount;
            }
            return 0;
        }
        if (this.entityName=="events") {
            return search.getEventAvailableCount();
        } else {
             return search.getResultCount();
        }
    }

    hasMaxPages() {
        var context = this.getContext();
        return ($("li.page", this.container).length >= this.getParam("maxPages"));
    }

    resetUI(){
        this.offset = 0;
        this.hide(this.invisibilityMode);
    }
}
    return Pager;

});