Splunk.Module.Pager = $.klass(Sideview.utils.getBaseClass(true), {
    
    initialize: function($super, container){
        $super(container);
        this.logger = Sideview.utils.getLogger();
        this.offset = 0;
        this.postProcessCount = -1;
        this.entityName = this.getParam("entityName");
        // Note that if the Pager is acting as the secondary Pager, 
        // it is exempted. Note implementation of validateHierarchy.
        this.childEnforcement = Splunk.Module.ALWAYS_REQUIRE;
        this.invisibilityMode = "goAwayWhenBlank";
        this.collapseWhenEmpty = Sideview.utils.normalizeBoolean(this.getParam("collapseWhenEmpty"));
        Sideview.utils.applyCustomProperties(this);
    },

    requiresResults: function(){return true;},
        
    validateHierarchy: function($super) {
        var p = this.parent;
        while (p.parent && p != p.parent) {
            if (p.moduleType == "Splunk.Module.Pager") return;
            p = p.parent;
        }
        return $super();
    },

    requiresTransformedResults: function() {
        return (this.entityName=="results");
    },

    /******************
     * listening to change from above.
     ****************/
    onContextChange: function(){
        this.offset = 0;
        this.postProcessCount=-1;
        var context = this.getContext();
        Sideview.utils.applyCustomCssClass(this,context);
        var search  = context.get("search");
        var tc = this.getTotalCount();
        if (search.isJobDispatched() && tc==0) {
            this.resetUI();
        }
        // this is purely for so-called slaved Pagers that live underneath 
        // results and defer to their master Pagers upstream.
        
        if (context.has("results.offset")) {
            this.offset = context.get("results.offset");
            
            // this is zombie case #2 - this is the SLAVE pager needing to call destroy 
            // so that when it calls refresh it'll get a new set of links..
            //TODO OPTIMIZE - In many cases this destroy and subsequent refresh will be unnecessary.
            this.destroy();
        }
        else if (this.offset < tc  ){
            this.offset = 0;
        }
        //TODO OPTIMIZE - In many cases this refresh call will be unnecessary.
        this.refresh();
    },


    onBeforeJobDispatched: function(search) {
        if (this.entityName == "events") {
            search.setMinimumStatusBuckets(1);
        }
    },

    onJobProgress: function(event){
        if (!this.isPageLoadComplete()) return;
        var context = this.getContext();
        var search  = context.get("search");
        var postProcess = $.trim(search.getPostProcess() || "");
        if (!this.hasMaxPages() && (postProcess || this.getTotalCount() > 0)) {
            this.refresh();
        }
    },

    onClick: function(evt, page){
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
       }
       return this.go(page);
    },

    go: function(page){
        var context = this.getContext();
        var count = this.getCount(context);
        this.offset = (page-1) * count;
        this.refresh();
        this.pushContextToChildren();
        return false;
    },

    destroy: function() {
        if ($(this.container).data("twbs-pagination")){
            $(this.container).twbsPagination('destroy');
        }
    },

    doClickFromDownstreamPager: function(page) {
        // zombie case #1 - this method on the MASTER pager is being called as a callback from the slave.
        this.destroy();
        this.go(page);
        var upstreamTop = this.container.offset().top;
        var newScrollTop = Math.min($(window).scrollTop(), upstreamTop);
        $(window).scrollTop(newScrollTop);
    },

    cleanPostProcess: function(p) {
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
    },

    refresh: function() {
        var context = this.getContext();
        var search  = context.get("search");
        var postProcess = this.cleanPostProcess(search.getPostProcess());
        this.postProcessCount = -1;
        if (postProcess) {
            if (search.job.getResultCount()>0 || (!search.job.areResultsTransformed() && search.job.getEventCount()>0)) {
                var args = {};
                args["search"] = postProcess + " | stats count";
                args["outputMode"] = "json";
                var url = search.getUrl("results")+ "?" + Sideview.utils.dictToString(args);
                if (search.job.isPreviewable() || search.getTimeRange().isRealTime()) {
                    url = url.replace("/results?","/results_preview?");
                }
                $.get(url, this.postProcessCountResponse.bind(this));
            }
        }
        else {
            this.renderLinks();
        }
    },

    postProcessCountResponse: function(jsonStr) {
        var results = Sideview.utils.getResultsFromJSON(jsonStr);
        if (results.length>0) {
            this.postProcessCount = parseInt(results[0]["count"],10);
        } else {
            this.logger.error("somehow we sent a search and post process with | stats count on the end and got 0 results back. This should never happen");
            this.postProcessCount = -1;
        }
        this.renderLinks();
    },

    getCount: function(context) {
        var count = context.get("results.count");
        // patch for the snafu whereby some modules actually put in 
        // results.* fields from the job, one of which is....
        // results.count  yay omg.  If these are the same then ignore
        // the count.
        if (!count || (count==context.get("results.resultCount"))) {
            count = this.getParam("count");
        }
        return count;
    },

    renderLinks: function(){
        var context = this.getContext();
        var count = this.getCount(context);
        var totalPages = Math.ceil(this.getTotalCount() / count);
        var startPage  = Math.ceil((this.offset)/count)+1;
        if (totalPages>0) {
            if($(this.container).data("twbs-pagination")) {
                $(this.container).twbsPagination("destroy");
            } 
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
                alert("Unexpected Error at " + this.moduleId + " renderLinks. " + e);
            }
        }
        if (this.collapseWhenEmpty) {
            if (totalPages>1) {
                this.show(this.invisibilityMode);
                
            } else {
                this.hide(this.invisibilityMode);
            }
        }
    },

    getModifiedContext: function() { 
        var context = this.getContext();

        context.set("results.offset", parseInt(this.offset,10));
        // if it's set upstream, we'll be setting it back to the same value.
        context.set("results.count", this.getCount(context));
        context.set("results.upstreamPagerCallback", this.doClickFromDownstreamPager.bind(this));
        return context;
    },

    /**
     * template method to be overridden in 'custom' situations.
     */
    getCustomCount: function() {
        return 0;
    },

    getTotalCount: function(){
        var context = this.getContext();
        var search  = context.get("search");
        var postProcess = $.trim(search.getPostProcess() || "");
        
        if (this.entityName == "custom") {
            return this.getCustomCount();
        } else {
            if (postProcess!="") {
                if (this.postProcessCount >-1) {
                    return this.postProcessCount;
                }
                return 0;
            }
            if (this.entityName=="events") {
                return search.getEventAvailableCount();
            } else {
                 return search.job.getResultCount();
            }
        }
    },

    hasMaxPages: function() {
        var context = this.getContext();
        return ($("li.page", this.container).length >= this.getParam("maxPages"));
    },

    resetUI: function(){
        this.offset = 0;
        this.container.html("");
    }
});