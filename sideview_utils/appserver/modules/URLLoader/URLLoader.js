// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.
Splunk.Module.URLLoader = $.klass(Splunk.Module, {

    initialize: function($super, container) {
        $super(container);

        this.logger = Sideview.utils.getLogger();
        this.successfullyPrepopulatedFields = {};
        var pageTitle = this.getParam("pageTitle");
        var autoRunFieldName = this.getParam("autoRunFieldName");
        if (pageTitle || autoRunFieldName) {
            var context = this.getContextFromURL();
            if (autoRunFieldName && context.has(autoRunFieldName)) {
                var autoRun = context.get(autoRunFieldName);
                this.setParam("autoRun", autoRun);
            }
            if (pageTitle) {
                document.title = Sideview.utils.replaceTokensFromContext(pageTitle, context);
            }
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

        this.savedContextDict = this.getSavedContextDict();
        
        Sideview.utils.applyCustomProperties(this);
    },
    
    getSavedContextDict: function() {
        var dict = this.getParam("savedContext");
        for (key in dict) {
            if (Sideview.utils.endsWith(key,".rawValue")) {
                delete dict[key];
            }
        }
        return dict;
    },  
    
    getCurrentHash: function() {
        return Sideview.utils.getCurrentHash();
    },

    /** 
     * If there are not values in the config then this returns false.
     * note that this does token replacement, and the key can itself be a 
     * variable set by earliestTimeArg/latestTimeArg. 
     * (defaults to "$earliest$" and "$latest$" respectively)
     * Also note that this only gets the timerange from the querystring or 
     * hash. It does not retrieve the timerange from a saved search.
     */
    getTimeRangeFromURL: function() {
        var urlDict = this.getURLDict();
        if (this.getParam("earliestTimeArg") || this.getParam("latestTimeArg")) {
            var earliest = urlDict[this.getParam("earliestTimeArg")] || false;
            var latest   = urlDict[this.getParam("latestTimeArg")] || false;
            // without this here, URLLoader tends to set us to All Time 
            // whenever there's no argument present.
            // TODO - of course now you literally cannot specify "all time"
            // by doing &earliest=&latest= but this seems better than the 
            // alternative.
            if (earliest || latest) {
                return new Splunk.TimeRange(earliest, latest);
            }
        }
        return false;
    },
    
    
    /**
     * get the search, sometimes from the savedSearch our MAKO template might
     * have baked for us.  Some from any 'search' param in the QS.
     */
    getNormalizedSearch: function(urlDict) {
        // player 1 - the saved search.
        var ss = this.getParam("savedSearch");
        var search = (ss)? Sideview.utils.loadSavedSearch(ss) : new Splunk.Search();

        // player 2 - the 'search' argument from the URL
        if (urlDict.hasOwnProperty("search")) {
            if (search.isJobDispatched()) {
                alert("You have a dispatched job from a saved search and you are trying to then modify the search string. This is not yet supported in Sideview Utils.");
                search.abandonJob();
            }
            search.setBaseSearch(urlDict["search"]);
        }

        // player 3 - the time range
        var range = this.getTimeRangeFromURL();
        if (range) {
            if (ss && search.isJobDispatched()) {
                alert("You have a dispatched job from a saved search and you are trying to then modify the time range. This is not yet supported in Sideview Utils.");
                search.abandonJob();
            }
            search.setTimeRange(range);
        }
        return search;
    },


    /**
     * get a dictionary representing the merged union of the keys in the 
     * querystring and other keys in the document hash.
     */
    getURLDict: function(includeSavedSearchContext, explicitHashDict) {
        var urlDict = {};
        if (includeSavedSearchContext) {
            $.extend(urlDict, this.savedContextDict);
        }
        var qsDict   = Sideview.utils.stringToDict(document.location.search.substring(1));
        var hashDict = explicitHashDict || Sideview.utils.stringToDict(this.getCurrentHash());
        $.extend(urlDict, qsDict);
        $.extend(urlDict, hashDict);
        return Sideview.utils.escapeHTMLWithinURLDict(urlDict);
    },
    
    /**
     * get a Context instance populated with everything we see in the URL.
     */
    getContextFromURL: function() {
        var urlDict = this.getURLDict(true);
        var context = new Splunk.Context();
        
        // now all the flat keys out of the QS  
        // Note: they may override the keys from the saved search.
        for (key in urlDict) {
            if (key=="search.name") continue;
            if (key=="search") {
                // we'll pull it out explicitly in getNormalizedSearch.
                continue;
            }
            if (this.successfullyPrepopulatedFields.hasOwnProperty(key)) {
                continue;
            }
            context.set(key, urlDict[key]);
        }
        // getNormalizedSearch will put all the search info together and give
        // us something we can use.
        var search = this.getNormalizedSearch(urlDict);
        
        if (this.successfullyPrepopulatedFields.hasOwnProperty("earliest") 
            || this.successfullyPrepopulatedFields.hasOwnProperty("latest")) {
            var range = search.getTimeRange();
            var earliest = range.getEarliestTimeTerms();
            var latest   = range.getLatestTimeTerms();
            if (this.successfullyPrepopulatedFields.hasOwnProperty("earliest")) {
                earliest = null;
            }
            if (this.successfullyPrepopulatedFields.hasOwnProperty("latest")) {
                latest = null;
            }
            search.setTimeRange(new Splunk.TimeRange(earliest,latest));
        } 
        context.set("search", search);
        var ss = this.getParam("savedSearch");
        if (ss && ss.hasOwnProperty("name")) {
            context.set("search.name", ss["name"]);
        }
        Sideview.utils.setStandardTimeRangeKeys(context);
        return context;
    },
    
    /**
     * URLLoader makes keys available downstream so that downstream modules
     * can be prepopulated. Once that happens though he has to stop giving them
     * downstream cause he risks selecting the downstream modules again 
     * at runtime.
     */
    markSuccessfulPrepopulation: function(key, module) {
        if (key=="search.timeRange.earliest") key="earliest";
        if (key=="search.timeRange.latest")   key="latest";
        this.successfullyPrepopulatedFields[key] = 1;
        //this.setChildContextFreshness(false);
        module.setChildContextFreshness(false);
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
    },

    
    findNearestMatchingHashIndex: function(currentHash, oldIndex) {
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
    },

    /**
     * called during onHashChange. Tries to figure out where the heck we just
     * went. Forward or back.  If we went only one step forward or back,
     * it will return the module that was the relevant locus of change.
     * if we went more than one step then returns URLLoader itself.
     */
    findModuleToPushFrom: function(previousPage, currentPage) {
        var module;
        var delta = currentPage-previousPage;
        if (Math.abs(delta)>1) {
            this.logger.warn("we went more than one step... " + (previousPage-currentPage));
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
            this.logger.error("URLLoader.findModuleToPushFrom - delta is " + delta + ". This should not occur.");
            module = this;
        }
        return module;
    },

    
    /**
     * get the list of keys that are different, between the current URL state
     * and the previous URL state.  Note that although we only pass the hashes,
     * the function accounts for both the hard keys and the saved search keys.
     */
    getChangedKeys: function(currentHash, previousHash) {
        var d1 = this.getURLDict(true,Sideview.utils.stringToDict(currentHash));
        var d2 = this.getURLDict(true,Sideview.utils.stringToDict(previousHash));
        var changed = {};
        for (key in d1) {
            if (d1.hasOwnProperty(key) && d1[key]!=d2[key]) changed[key] = 1;
        }
        for (key in d2) {
            if (d2.hasOwnProperty(key) && d1[key]!=d2[key]) changed[key] = 1;
        }
        return changed;
    },

    onHashChange: function(evt){
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
            //this.logger.warn("we couldnt find this hash anywhere...");
            controllingModule = this;
        } 
        else {
            this.currentPage = currentPage;
            controllingModule = this.findModuleToPushFrom(previousPage, currentPage);
        }
        //this.dump("onHashChange");
        
        for (key in changedKeys) {
            delete this.successfullyPrepopulatedFields[key];
        }

        var context = this.getContextFromURL();
        
        if (controllingModule.resetToDefault) {
            controllingModule.resetToDefault();
        } 
        if (controllingModule.setToContextValue) {
            controllingModule.setToContextValue(context);
        }
        controllingModule.pushContextToChildren();
    },

    /**
     * Called when a Pulldown, Checkbox, TextField, SearchBar or 
     * TimeRangePicker downstream is updated. 
     * remembers the current hash, associates it with the module 
     * currently triggering the change, and changes the document hash.
     */
    updateURL: function(key,value,module) {
        if (Sideview.disableURLLoader) return;
        var args = [];
        if (key=="search.timeRange") {
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
    },
    
    multiUpdateURL: function(args, module) {
        // the nice and easy part.
        var currentHash = this.getCurrentHash();
        var currentHashDict = Sideview.utils.stringToDict(currentHash);
        var hashDict = $.extend(true,{},currentHashDict);
        var key,value;
        for (var i=0,len=args.length;i<len;i++) {
            key = args[i][0];
            value = args[i][1];
            hashDict[key] = value || "";
        }
        if (!module) module = this;

        // add autoRun. It'll get simplified out of hashDict if necessary.
        hashDict[this.getParam("autoRunFieldName")] = "True";
        Sideview.utils.simplifyHashDict(hashDict);

        // dont bother changing the hash if the dictionary representations are the same.
        if (Sideview.utils.compareObjects(hashDict, currentHashDict)) {
            this.logger.warn("URLLoader.multiUpdateURL - strangely the two dicts were the same");
            return false;
        }

        var newHash = Sideview.utils.dictToString(hashDict);
        
        this.pageHashes = this.pageHashes.slice(0,this.currentPage+1);
        this.pageHashes.push(newHash);
        this.controllingModules = this.controllingModules.slice(0,this.currentPage);
        this.controllingModules.push(module);
        this.currentPage++;
        document.location.hash = "#" + newHash;
        this.previousHash = newHash;
        //this.dump("multiUpdateURL");
    },

    dump: function(prefix) {
        this.logger.debug(prefix + " new URL=" + this.getCurrentHash());
        this.logger.debug(prefix + " currentPage=" + this.currentPage);
        this.logger.debug(prefix + " modules=\n" + this.getControllingModuleNames().join("\n"));
        this.logger.debug(prefix + " hashes=" + this.pageHashes.join(", "));
        this.logger.debug(prefix + " previousHash= " + this.previousHash);
    },

    getControllingModuleNames: function() {
        var ret = [];
        for (var i=0;i<this.controllingModules.length;i++) {
            ret.push(this.controllingModules[i].moduleId);
        }
        return ret;
    },

    getModifiedContext: function() {
        var context = this.getContextFromURL();
        context.set("sideview.onSelectionSuccess", this.markSuccessfulPrepopulation.bind(this));
        if (Sideview.utils.normalizeBoolean(this.getParam("keepURLUpdated"))) {
            context.set("sideview.onEditableStateChange", this.updateURL.bind(this));
        }
        //context.remove("autoRun");
        return context;
    },

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
    applyContext: function(context) {
        if (this.isPageLoadComplete()) {
            if (Sideview.utils.contextIsNull(context)) {
                this.logger.error("null context reached URLLoader. This should not happen");
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
            this.pushContextToChildren();
            // stop the upward-travelling context.
            return true;
        }
     }
    /**
     * we didnt end up using it, but it did end up getting fully tested.
     */
    /*
    getCommonAncestor: function(module1, module2) {
        var commonAncestor = null
        var ancestors1 = {};
        ancestors1[module1] = 1;
        module1.withEachAncestor(function(m) {
            ancestors1[m] = 1;
        },true);
        if (ancestors1.hasOwnProperty(module2)) {
            return module2;
        }
        module2.withEachAncestor(function(m) {
            if (ancestors1.hasOwnProperty(m)) {
                commonAncestor=m;
                return false;
            }
        },true);
        if (commonAncestor) return commonAncestor;
        return this;
    }
    */
});


/*
 * jQuery hashchange event - v1.3 - 7/21/2010
 * http://benalman.com/projects/jquery-hashchange-plugin/
 * 
 * Copyright (c) 2010 "Cowboy" Ben Alman
 * Dual licensed under the MIT and GPL licenses.
 * http://benalman.com/about/license/
 * USAGE HERE IS UNDER THE MIT LICENSE.
 */
(function($,e,b){var c="hashchange",h=document,f,g=$.event.special,i=h.documentMode,d="on"+c in e&&(i===b||i>7);function a(j){j=j||location.href;return"#"+j.replace(/^[^#]*#?(.*)$/,"$1")}$.fn[c]=function(j){return j?this.bind(c,j):this.trigger(c)};$.fn[c].delay=50;g[c]=$.extend(g[c],{setup:function(){if(d){return false}$(f.start)},teardown:function(){if(d){return false}$(f.stop)}});f=(function(){var j={},p,m=a(),k=function(q){return q},l=k,o=k;j.start=function(){p||n()};j.stop=function(){p&&clearTimeout(p);p=b};function n(){var r=a(),q=o(m);if(r!==m){l(m=r,q);$(e).trigger(c)}else{if(q!==m){location.href=location.href.replace(/#.*/,"")+q}}p=setTimeout(n,$.fn[c].delay)}$.browser.msie&&!d&&(function(){var q,r;j.start=function(){if(!q){r=$.fn[c].src;r=r&&r+a();q=$('<iframe tabindex="-1" title="empty"/>').hide().one("load",function(){r||l(a());n()}).attr("src",r||"javascript:0").insertAfter("body")[0].contentWindow;h.onpropertychange=function(){try{if(event.propertyName==="title"){q.document.title=h.title}}catch(s){}}}};j.stop=k;o=function(){return a(q.location.href)};l=function(v,s){var u=q.document,t=$.fn[c].domain;if(v!==s){u.title=h.title;u.open();t&&u.write('<script>document.domain="'+t+'"<\/script>');u.close();q.location.hash=v}}})();return j})()})(jQuery,this);


