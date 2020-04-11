// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.

define(
  ["jquery",
  "sideview",
  "svmodule",
  "time_range",
  "job",
  "context",
  "api/SplunkSearch",
  "job_monitor"],
  function($, Sideview, Module, TimeRange, Job, Context, SplunkSearch, jobMinotaur) {

class URLLoader extends Module{

    constructor(container, params) {
        super(container, params);
        this._cachedSavedSearch = false;
        this._cachedJob = false;
        this.successfullyPrepopulatedFields = {};
        var pageTitle = this.getParam("pageTitle");
        if (pageTitle) {
            var context = this.getContextFromURL();
            document.title = Sideview.replaceTokensFromContext(pageTitle, context);
        }
        this.previousHash = this.getCurrentHash();
        $(window).bind('hashchange', this.onHashChange.bind(this));
        this.alreadyLoaded = false;

        // these two arrays make a little zigzag data structure.
        // the hashes are the fenceposts.
        // the modules are the fenceboards in between.
        this.pageHashes         = [this.getCurrentHash()];
        this.controllingModules = [];
        this.currentPage        = 0;

        this.pushWhenDone = false;
        this.itemsToLoad = this.loadAsyncResources();

        $.when(...this.itemsToLoad)
            .done(function() {
                if (this.pushWhenDone) {
                    this.pushDownstream(this.wasPageStillLoadingOnOriginalPush);
                    this.wasPageStillLoadingOnOriginalPush = false;
                    this.pushWhenDone = false;
                }
            }.bind(this));
    }

    getDeferredItems() {
        return this.itemsToLoad;
    }

    isReadyForContextPush() {
        for (var i=0;i<this.itemsToLoad.length; i++) {
            var item = this.itemsToLoad[i];
            if (item.state()!="resolved") {
                return this.DEFER;
            }
        };
        return this.CONTINUE;
    }

    pushDownstream(pageIsLoading) {
        var ready = this.isReadyForContextPush();
        if (ready) {
            return this._pushDownstream(pageIsLoading);
        }
        else {
            this.pushWhenDone = true;
            this.wasPageStillLoadingOnOriginalPush = pageIsLoading;
        }
        return [];
    }



    loadAsyncResources() {
        var itemsToLoad = [];
        var urlDict = this.getURLDict(false);
        var hasSavedSearch = urlDict.hasOwnProperty("search.name")?1:0;
        var hasSearchId = urlDict.hasOwnProperty("sid")?1:0;
        var hasQuerystring = urlDict.hasOwnProperty("q")?1:0;

        if (hasSavedSearch + hasSearchId + hasQuerystring > 1) {
            alert("Assertion failed - URL's can have either 'search.name' or a 'sid' or a 'q' arg but here you have two or more of those");
        }
        if (hasSavedSearch) {
            if (hasSearchId) {
                alert("Bad querystring - URLLoader can not be given both a sid and a search.name argument (we're ignoring the sid)");
            }
            itemsToLoad.push(this.loadSavedSearchData(urlDict["search.name"]));
        }
        else if (hasSearchId) {
            itemsToLoad.push(this.loadSearchFromSearchId(urlDict["sid"]));
        }
        return itemsToLoad;
    }

    loadSearchFromSearchId(sid) {
        var job = new Job(sid, "*");
        var callback = function(job) {
            this._cachedJob = job;
        }.bind(this)
        return jobMinotaur.monitorJob(null, job, callback);
    }

    loadSavedSearchData(name) {
        var url = sprintf("/splunkd/__raw/servicesNS/%s/%s/saved/searches/%s",
                          encodeURIComponent(Sideview.getCurrentUser()),
                          encodeURIComponent(Sideview.getCurrentApp()),
                          encodeURIComponent(name))
        return Sideview.getCollection(url, {}, function(entry) {
            if (entry.length>1) {
                alert(sprintf("assertion failed - we requested a single saved search and received %d searches instead", entry.length));
            }
            var content = entry[0]["content"];
            //TODO - if this is a scheduled search, make the request for the most recent job and append its deferred  to itemsToLoad before this callback exits.
            this._cachedSavedSearch = content;
        }.bind(this))
    }


    getSavedSearchData(name) {
        if (!this._cachedSavedSearch) {
            throw "ERROR either the saved search " + name + " does not exist (unimplemented case at the moment), or our async load failed.";
            return {}
        }
        return this._cachedSavedSearch;
    }



    /**
     * get a dictionary representing the merged union of the keys in the
     * querystring and other keys in the document hash.
     */
    getURLDict(includeSavedSearchContext, explicitHashDict) {
        var urlDict = Sideview.getURLDict(explicitHashDict);
        if (includeSavedSearchContext) {
            if (urlDict.hasOwnProperty("search.name")) {
                var name = urlDict["search.name"];
                var d = this.getSavedSearchData(name);
                if (d && d.hasOwnProperty("request.ui_context")) {
                    // forget what you know. start again.
                    var ssPlusHashDict = {}
                    var ssContextDict = Sideview.stringToDict(d["request.ui_context"]);
                    $.extend(ssPlusHashDict, ssContextDict);
                    $.extend(ssPlusHashDict, explicitHashDict);
                    urlDict = Sideview.getURLDict(ssPlusHashDict);
                }
            }
        }
        return Sideview.escapeHTMLWithinURLDict(urlDict);
    }

    setSplunkSearchFromURL(urlDict, context) {
        var earliest = null;
        var latest = null;

        var search = new SplunkSearch();
        if (urlDict.hasOwnProperty("sid")) {
            var j = jobMinotaur.getJob(urlDict["sid"]);
            console.log("TODO - what about the SplunkSearch instance... we're leaving its spl unset");
            //search.setBaseSearch(THINGS);
            search.job = j;
        }
        else {
            if (urlDict.hasOwnProperty("search.name")) {
                context.set("search.name", urlDict["search.name"]);
                var ss = this.getSavedSearchData();
                search.setBaseSearch(ss["search"])
                var range = new TimeRange(
                    ss["dispatch.earliest_time"] || null,
                    ss["dispatch.latest_time"]|| null
                );
                earliest = range.getEarliestTimeTerms();
                latest = range.getLatestTimeTerms();
            }
            else if (urlDict.hasOwnProperty("search")) {
                search.setBaseSearch(urlDict["search"]);
            }
            // as long as it isn't a sid case, we can also check for explicit timerange.
            earliest = earliest || urlDict[this.getParam("earliestTimeArg")];
            latest = latest || urlDict[this.getParam("latestTimeArg")];
        }
        context.setSplunkSearch(search);

        if (earliest || latest) {
            // if something on the page has already prepopulated these keys,
            // then we play dumb.
            if (this.successfullyPrepopulatedFields.hasOwnProperty("earliest")) {
                earliest = null;
            }
            if (this.successfullyPrepopulatedFields.hasOwnProperty("latest")) {
                latest = null;
            }
            if (earliest || latest) {
                context.set("shared.timeRange", new TimeRange(earliest,latest));
            }
            Sideview.setStandardTimeRangeKeys(context);
        }

    }

    /**
     * get a Context instance populated with everything we see in the URL.
     */
    getContextFromURL() {
        var urlDict = this.getURLDict(true);
        var context = new Context();

        // now all the flat keys out of the QS
        // Note: they may override the keys from the saved search.
        for (key in urlDict) {
            if (key=="search.name") continue;
            if (key=="search") continue;
            if (this.successfullyPrepopulatedFields.hasOwnProperty(key)) {
                continue;
            }
            context.set(key, urlDict[key]);
        }
        this.setSplunkSearchFromURL(urlDict, context);
        return context;
    }

    /**
     * URLLoader makes keys available downstream so that downstream modules
     * can be prepopulated. Once that happens though he has to stop giving them
     * downstream cause he risks selecting the downstream modules again
     * at runtime.
     */
    markSuccessfulPrepopulation(key, module) {
        if (key=="shared.timeRange.earliest") key="earliest";
        if (key=="shared.timeRange.latest")   key="latest";
        this.successfullyPrepopulatedFields[key] = 1;
        // we now walk up from the calling module, to URLLoader.
        // it's sort of like we're pushing the locus of control,
        // for this particular subbranch,  down to this module.
        // Note that the same key can have this called from multiple modules.
        module.withEachAncestor(function (ancestor) {
            // break when we get up to ourselves.
            if (ancestor.moduleId == this.moduleId) return false;
            // nuke the site from orbit.
            if (ancestor.baseContext) {
                ancestor.baseContext.remove(key);
            }
        }.bind(this),true);
    }

    findNearestMatchingHashIndex(currentHash, oldIndex) {
        var iUp   = oldIndex;
        var iDown = iUp;
        var len = this.pageHashes.length;
        var hash;
        while (iDown>-1 || iUp<len) {
            if (iDown>-1) {
                hash = this.pageHashes[iDown];
                if (hash == currentHash) return iDown;
            }
            if (iDown!=iUp && iUp<len) {
                hash = this.pageHashes[iUp];
                if (hash == currentHash) return iUp;
            }
            iDown--;
            iUp++;
        }
        return -1;
    }

    /**
     * called during onHashChange. Tries to figure out where the heck we just
     * went. Forward or back.  If we went only one step forward or back,
     * it will return the module that was the relevant locus of change.
     * if we went more than one step then returns URLLoader itself.
     */
    findModuleToPushFrom(previousPage, currentPage) {
        var module;
        var delta = currentPage-previousPage;
        if (Math.abs(delta)>1) {
            console.warn("we went more than one step... " + (previousPage-currentPage));
            return this;
        }
        // went back
        else if (delta == 1) {
            module = this.controllingModules[currentPage-1];
        }
        // went forward
        else if (delta == -1) {
            module = this.controllingModules[currentPage];
        }
        else {
            console.error("URLLoader.findModuleToPushFrom - delta is " + delta + ". This should not occur.");
            module = this;
        }
        return module;
    }

    /**
     * get the list of keys that are different, between the current URL state
     * and the previous URL state.  Note that although we only pass the hashes,
     * the function accounts for both the hard keys and the saved search keys.
     */
    getChangedKeys(currentHash, previousHash) {
        var d1 = this.getURLDict(true,Sideview.stringToDict(currentHash));
        var d2 = this.getURLDict(true,Sideview.stringToDict(previousHash));
        var changed = {};
        for (key in d1) {
            if (d1.hasOwnProperty(key) && d1[key]!=d2[key]) changed[key] = 1;
        }
        for (key in d2) {
            if (d2.hasOwnProperty(key) && d1[key]!=d2[key]) changed[key] = 1;
        }
        return changed;
    }

    getCurrentHash() {
        return Sideview.getCurrentHash();
    }

    onHashChange(evt){
        // two strategies work.
        // 1 keep not just the keys
        // that have been successfully prepopulated, but also the modules.
        // Then we only null out the keys for the controllingModule.
        // 2. on each hash change, look at just the keys that are different.
        // These are the ones to null out, so they get sent
        // down fresh.
        // here we use strategy #2.
        var currentHash = this.getCurrentHash();
        if (currentHash == this.previousHash) {
            return false;
        }

        var changedKeys = this.getChangedKeys(currentHash, this.previousHash);
        this.previousHash = currentHash;

        var previousPage = this.currentPage;
        var currentPage  = this.findNearestMatchingHashIndex(currentHash, previousPage);
        var controllingModule;
        if (currentPage==-1) {
            //console.warn("we couldnt find this hash anywhere...");
            controllingModule = this;
        }
        else {
            this.currentPage = currentPage;
            controllingModule = this.findModuleToPushFrom(previousPage, currentPage);
        }
        for (key in changedKeys) {
            delete this.successfullyPrepopulatedFields[key];
        }
        if (controllingModule.resetToDefault) {
            controllingModule.resetToDefault();
        }
        if (controllingModule.setToContextValue) {
            var context = this.getContextFromURL();
            controllingModule.setToContextValue(context);
        }
        controllingModule.pushDownstream();
    }

    /**
     * Called when a Pulldown, Checkbox, TextField, SearchBar or
     * TimeRangePicker downstream is updated.
     * remembers the current hash, associates it with the module
     * currently triggering the change, and changes the document hash.
     */
    updateURL(key,value,module) {
        if (Sideview.disableURLLoader) return;
        var args = [];
        if (key=="search.timeRange") {
            console.error("ACK - someone gave us a search.timeRange key, but this has been removed and replaced by shared.timeRange");
        }
        if (key=="shared.timeRange") {
            var earliestKey = this.getParam("earliestTimeArg");
            var latestKey   = this.getParam("latestTimeArg");
            var earliestValue = value.getEarliestTimeTerms();
            var latestValue = value.getLatestTimeTerms();
            // careful cause earliest is often "0" which will evaluate to true
            if ((!earliestValue || earliestValue==0) && !latestValue) {
                earliestValue="all";
                latestValue="all";
            }
            args.push([earliestKey, earliestValue]);
            args.push([latestKey, latestValue]);
        }
        else {
            args.push([key,value]);
        }
        this.multiUpdateURL(args, module);
    }

    multiUpdateURL(args, module) {
        // the nice and easy part.
        var currentHash = this.getCurrentHash();
        var currentHashDict = Sideview.stringToDict(currentHash);
        var hashDict = $.extend(true,{},currentHashDict);
        var key,value;
        for (var i=0,len=args.length;i<len;i++) {
            key = args[i][0];
            value = args[i][1];
            hashDict[key] = value || "";
        }
        if (!module) module = this;

        Sideview.simplifyHashDict(hashDict);

        // dont bother changing the hash if the dictionary representations are the same.
        if (Sideview.compareObjects(hashDict, currentHashDict)) {
            console.warn("URLLoader.multiUpdateURL - strangely the two dicts were the same");
            return false;
        }

        var newHash = Sideview.dictToString(hashDict);

        this.pageHashes = this.pageHashes.slice(0,this.currentPage+1);
        this.pageHashes.push(newHash);
        this.controllingModules = this.controllingModules.slice(0,this.currentPage);
        this.controllingModules.push(module);
        this.currentPage++;
        document.location.hash = "#" + newHash;
        this.previousHash = newHash;
    }

    dump(prefix) {
        console.debug(prefix + " new URL=" + this.getCurrentHash());
        console.debug(prefix + " currentPage=" + this.currentPage);
        console.debug(prefix + " modules=\n" + this.getControllingModuleNames().join("\n"));
        console.debug(prefix + " hashes=" + this.pageHashes.join(", "));
        console.debug(prefix + " previousHash= " + this.previousHash);
    }

    getControllingModuleNames() {
        var ret = [];
        for (var i=0;i<this.controllingModules.length;i++) {
            ret.push(this.controllingModules[i].moduleId);
        }
        return ret;
    }

    getModifiedContext(context) {
        context = this.getContextFromURL();
        context.set("sideview.onSelectionSuccess", this.markSuccessfulPrepopulation.bind(this));
        if (this.getParam("keepURLUpdated")=="True") {
            context.set("sideview.onEditableStateChange", this.updateURL.bind(this));
        }
        return context;
    }

    /**
     * called when a module receives new context data from downstream.
     * This is rare, and only happens in configurations where custom behavior
     * logic is sending values upstream during interactions, for TextField
     * and Pulldown instances to 'catch'.
     *
     * NOTE:  a very valid question to ask is "why are some upstream
     * interactions implemented with an upward-travelling context
     * and some (note updateURL in this class) are implemented by dropping
     * method references downstream?
     * The answer is that the upward-travelling contexts ALWAYS have a contract
     * where the search(es) will get automatically redispatched.
     * OTOH the callback method is for cases where a new search dispatch
     * isnt wanted (or at least isnt required in all cases).
     */
    applyContext(context) {
        if (this.isPageLoadComplete()) {
            if (context.isNull()) {
                console.error("null context reached URLLoader. This should not happen");
                return;
            }
            var dict = context.getAll("");

            var pairs = [];
            for (key in dict) {
                if (dict.hasOwnProperty(key)) {
                    // strange bug in Context.getAll, only on IE.
                    if (key=="toJSON" && typeof(dict[key]) == "function") {
                        continue;
                    }
                    pairs.push([key, dict[key]]);
                }
            }
            this.multiUpdateURL(pairs);
            this.pushDownstream();
            // stop the upward-travelling context.
            return true;
        }
     }
}



/*
 * jQuery hashchange event - v1.3 - 7/21/2010
 * http://benalman.com/projects/jquery-hashchange-plugin/
 *
 * Copyright (c) 2010 "Cowboy" Ben Alman
 * Dual licensed under the MIT and GPL licenses.
 * http://benalman.com/about/license/
 * USAGE HERE IS UNDER THE MIT LICENSE.
 */
(function($,e,b){var c="hashchange",h=document,f,g=$.event.special,i=h.documentMode,d="on"+c in e&&(i===b||i>7);function a(j){j=j||location.href;return"#"+j.replace(/^[^#]*#?(.*)$/,"$1")}$.fn[c]=function(j){return j?this.bind(c,j):this.trigger(c)};$.fn[c].delay=50;g[c]=$.extend(g[c],{setup:function(){if(d){return false}$(f.start)},teardown:function(){if(d){return false}$(f.stop)}});f=(function(){var j={},p,m=a(),k=function(q){return q},l=k,o=k;j.start=function(){p||n()};j.stop=function(){p&&clearTimeout(p);p=b};function n(){var r=a(),q=o(m);if(r!==m){l(m=r,q);$(e).trigger(c)}else{if(q!==m){location.href=location.href.replace(/#.*/,"")+q}}p=setTimeout(n,$.fn[c].delay)}Sideview.isIE()&&!d&&(function(){var q,r;j.start=function(){if(!q){r=$.fn[c].src;r=r&&r+a();q=$('<iframe tabindex="-1" title="empty"/>').hide().one("load",function(){r||l(a());n()}).attr("src",r||"javascript:0").insertAfter("body")[0].contentWindow;h.onpropertychange=function(){try{if(event.propertyName==="title"){q.document.title=h.title}}catch(s){}}}};j.stop=k;o=function(){return a(q.location.href)};l=function(v,s){var u=q.document,t=$.fn[c].domain;if(v!==s){u.title=h.title;u.open();t&&u.write('<script>document.domain="'+t+'"<\/script>');u.close();q.location.hash=v}}})();return j})()})(jQuery,this);


    return URLLoader;
});