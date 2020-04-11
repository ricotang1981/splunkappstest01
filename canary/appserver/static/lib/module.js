
// Copyright (C) 2010-2020 Sideview LLC.  All Rights Reserved.


define(
  ["jquery",
  "sideview",
  "context",
  "api/SplunkSearch",
  "time_range"],
  function($, Sideview, Context, SplunkSearch,TimeRange) {
"use strict";
class Module {
    constructor(container, params) {
        this.CANCEL = -1;
        this.DEFER = 0;
        this.CONTINUE = 1;

        this.baseContext = null;

        // searches (remember one may exist for each "api") are transitory
        // things. When a determination is made by the framework that a
        // particular point in the tree needs one "dispatched", that module
        // becomes a "dispatch point" and the corresponding search object
        // gets saved into the activeAPIs property for that module.
        // Note the instance saved there will always be a "dispatched" one,
        // whatever that means for the given api.
        this._activeAPIs = {};
        this._isDispatchPoint = false;

        this.container = $(container);
        this.moduleId = params.moduleId;
        this.parent = null;
        this._children = [];
        this._invisibilityModes = {};
        this._params = params;
        this.getResultsXHR = null;

        // if and when a module loads anything asynchronously, where it
        // should return false from isReadyForContextPush() until that
        // content is loaded,  then it is supposed to leave an array of
        // Deferred/Promise instances in this property here.
        // Implementation of this across all modules is probably not yet
        // consistent - some async loading stuff predates this convention.
        this.itemsToLoad = [];
    }

    getDeferredItems() {
        return [];
    }

    setSearchForAPI(api, search) {
        if (!api || !search) {
            console.error("ERROR - setSearchForAPI called with improper arguments");
        }
        if (!search.isDispatched()) {
            console.error("Assertion Failed - setSearchForAPI was given an undispatched search");
            console.trace();
        }
        this._activeAPIs[api] = search.clone();
    }

    clearSearchForAPI(api) {
        delete(this._activeAPIs[api]);
    }

    getSearchForAPI(api) {
        if (this._activeAPIs.hasOwnProperty(api)) {
            return this._activeAPIs[api];
        }
        return false;
    }

    getActiveAPIs() {
        return this._activeAPIs;
    }

    hasAnyActiveAPIs() {
        return (Object.keys(this._activeAPIs).length !== 0);
    }

    isPageLoadComplete() {
        return this._pageLoadComplete || false;
    }

    markPageLoadComplete() {
        this._pageLoadComplete = true;
    }

    onHierarchyApplied() {}

    onPreferencesLoaded() {}

    /************
      EVENT HANDLERS
     ***********/
    listenForJobEvents() {
        if (this._isDispatchPoint) return;
        this._isDispatchPoint = true;

        $(document).bind("splunkJobProgress", function(evt, job) {
            if (!this.hasAnyActiveAPIs()) return;

            var splunkSearch = this.getSearchForAPI("splunk");
            if (splunkSearch && splunkSearch.getSearchId() != job.getSearchId()) {
                return;
            }
            this.withEachDescendantInDispatchTier(function(descendant) {
                var search = descendant.getContext().getSplunkSearch()
                if (search) {
                    descendant.onJobProgress(evt, job);
                }
            });
        }.bind(this));

        $(document).bind("splunkJobDone", function(evt, job) {
            if (!this.hasAnyActiveAPIs()) return;

            var splunkSearch = this.getSearchForAPI("splunk");
            if (splunkSearch && splunkSearch.getSearchId() != job.getSearchId()) {
                return;
            }
            this.withEachDescendantInDispatchTier(function(descendant) {
                var search = descendant.getContext().getSplunkSearch()
                if (search) {
                    if (search.getSearchId() && search.getSearchId() == job.getSearchId()) {
                        descendant.onJobDone(evt, job);
                    } else {
                        console.warn(descendant.moduleId + " has a Search with sid=" + search.getSearchId() + " and the job we're passing down through the dispatchTier has sid=" + job.getSearchId()  + ". This code seems to get a little tangled up when we cancel the previous job, but for now we're just ignoring this case.")
                    }
                }
                //else {
                //    console.log(sprintf("jobDone, and a %s module in the dispatch tier has no search (switcher involved?)", descendant.moduleType));
                //}
            });
        }.bind(this));
        // it could be that the job was cancelled in this UI, but it could
        // also be that something just noticed its mysterious dissappearance.
        $(document).bind("splunkJobCancelled", function(evt, sid) {
            if (!this.hasAnyActiveAPIs()) return;
            var splunkSearch = this.getSearchForAPI("splunk");
            if (splunkSearch && splunkSearch.getSearchId() != sid) {
                return;
            }
            this.clearSearchForAPI("splunk");
            // modules are not in their OWN dispatch tier.
            //this.reset();
            this.withEachDescendantInDispatchTier(function(descendant) {
                //console.error(descendant.moduleId)
                descendant.clearSearchForAPI("splunk")
                descendant.reset();
            });

        }.bind(this));
    }
    onContextChange(context) {}
    getContextWithReprimand() {
        console.error(sprintf("%s's onContextChange method was called but without any context instance passed. Most likely this is some customBehavior code - YOU CAN FIX THIS just by always passing a context instance to onContextChange in your customBehavior code. Then we'll stop nagging you here, we promise.", this.moduleType));

        console.trace();
        var context = this.getContext();
        return context;
    }
    onBeforeJobDispatched(search) {}
    onJobProgress(evt) {}
    onJobDone(evt) {}
    onResultsRendered() {}


    /************
     CORE CONTEXT METHODS
     ***********/

    addDispatchedSearchesToContext(c) {
        for (var api in this._activeAPIs) {
            var search = this._activeAPIs[api];
            if (!search.isDispatched()) {
                console.error("THIS SHOULD NEVER HAPPEN - we're sneaking in a dispatched search for api=" + api + " and it's not dispatched. Here have a trace.");
                console.error(search);
                console.trace();
            }
            c.setSearchForAPI(api,search);
        }
    }
    setChildContexts(c) {
        if (!c) {
            console.error(sprintf("moduleId=%s called setChildContexts but was given a null context ", this.moduleId));
            console.trace();
        }
        for (var i=0,len=this._children.length; i<len;i++) {
            this._children[i].baseContext = c;
        }
    }

    getContext() {
        if (!this.baseContext) {
            //console.error(this.moduleId + " weird - getContext called when it has no baseContext.. returning a new blank Context");
            this.baseContext = new Context();
        }
        // TODO - Why clone here...  seems paranoid.  Why not just clone the context that is passed to getModifiedContext.
        return this.baseContext.clone();
    }

    getModifiedContext(context) {
        return context;
    }

    _pushDownstream(pageIsLoading) {
        pageIsLoading = pageIsLoading || false;

        this.wasPageStillLoadingOnOriginalPush = pageIsLoading;

        var ready = this.isReadyForContextPush();
        //console.info(sprintf("%s pushDownstream,  ready=%s", this.moduleId, ready))


        var deferreds = [];

        var c = this.getModifiedContext(this.getContext());

        if (ready==this.CONTINUE) {
            //console.error(this.moduleId + " PUSHING DOWNSTREAM - pageIsLoading=" + pageIsLoading);
            if (!this.firstPushAfterDispatch) {

                var apisRequiringDispatch = this.childrenRequireDispatch(c);
                if (apisRequiringDispatch.length>0) {
                    //console.error("CASE 1 - we didn't just dispatch. Some children need something dispatched so we're not pushing to children but instead dispatching. moduleType=" + this.moduleId + " apisRequiringDispatch=" + apisRequiringDispatch);

                    for (var i=0;i<apisRequiringDispatch.length;i++) {
                        var api = apisRequiringDispatch[i];
                        var search = c.getSearchForAPI(api);
                        this.withEachDescendantInDispatchTier(function(module) {
                            module.onBeforeJobDispatched(search);
                        });
                        var range = c.get("shared.timeRange") || new TimeRange();
                        var timezone = c.get("shared.tz") || false;
                        //console.error("DISPATCHING at " + this.moduleId)


                        this.listenForJobEvents();
                        $.merge(deferreds, search.dispatch(
                            function(search) {
                                this.dispatchSuccess(search, pageIsLoading);
                            }.bind(this),
                            this.dispatchFailure.bind(this),
                            range,
                            timezone));
                        // for the initial topLevel push, this is where we
                        // kind of stop being delicate and just tell everyone
                        // downstream that the loading is all done...
                        // TODO - what if... they're not done down there!?
                        if (pageIsLoading) {
                            this.withEachDescendant(function(module) {
                                module.markPageLoadComplete();
                            });
                        }
                    }
                    return deferreds;
                }
                else {
                    //console.error("CASE 2 - no children here require dispatch for any API. We'll just proceed and push to children.  moduleType=" + this.moduleId);
                }
            }
            else {
                //console.error("PUSHING DOWNSTREAM - CASE 3- first push after a dispatch. We'll push to children and updateChildContexts will use the pinned search. moduleType=" + this.moduleId);
                this.firstPushAfterDispatch = false;
            }

            //var ss = c.getSearchForAPI("splunk");

            this.addDispatchedSearchesToContext(c);

            this.setChildContexts(c);


            this.withEachChild(function(child) {
                //console.log(sprintf("%s is calling onContextChange on its child module %s", this.moduleId, child.moduleId));
                var c = child.getContext();
                console.assert(!child.requiresResults() || c.getSplunkSearch(), sprintf("Assertion Failed - a context with an undispatched search was given to moduleId=%s  even though it returns true from requiresResults", child.moduleId));
                child.onContextChange(c);
                var newDeferreds = child.pushDownstream(pageIsLoading);
                console.assert(Array.isArray(newDeferreds), sprintf("%s module did not return an array from pushDownstream()", child.moduleId));

                $.merge(deferreds, newDeferreds);
                child.markPageLoadComplete();
            }.bind(this));
        }
        else if (ready==this.DEFER) {
            //console.log("PUSHING DOWNSTREAM  " + this.moduleId + " is deferring");
            this.pushAfterRendering = true;
        }
        else {
            //console.log("PUSHING DOWNSTREAM " + this.moduleId + " is NOT READY ");
        }
        return deferreds;
    }

    pushDownstream(pageIsLoading) {
        return this._pushDownstream(pageIsLoading);
    }

    pushContextToChildren() {
        console.warn("something, most likely a customBehavior is calling pushContextToChildren which is a deprecated legacy method name from the advanced xml. Please resolve this upstream as at some point this will be unsupported.");
        return this.pushDownstream();
    }

    applyContext() {}

    passContextToParent(context) {
        if (this.parent) {
            if (!this.isPageLoadComplete()) {
                throw("applyContext is illegal while page loading. Sideview XML does not support any kind of 'resurrection' or intention recomposition");
            }
            // we stop at the first return true
            if (!this.parent.applyContext(context)) {
                return this.parent.passContextToParent(context);
            }
        }
        return false;
    }

    /************
      DISPATCHING
     ***********/
    requiresResults() {return false;}

    _requiresDispatch(c) {
        if (!this.requiresResults()) return [];
        //var retVal = c.requiresDispatch();
        //console.error(this.moduleId + ".requiresDispatch - returned true from requiresResults. deferring to context.requiresDispatch which says " + retVal);
        //console.trace();
        return c.requiresDispatch();
    }

    requiresDispatch(c) {
        return this._requiresDispatch(c);
    }

    triggersNewDispatchForAPI(api) {
        return false;
    }

    cancelLastSearch(api) {
        var lastSearch = this.getSearchForAPI(api);
        if (!lastSearch) {
            return false;
        }
        if (!lastSearch.isDispatched()) {
            console.warn("weird - we went to cancel the last search and there is one but it's not dispatched");
        }
        if (lastSearch.job.isSaved()) {
            console.info("cant autocancel that search cause the job was saved.")
        }
        if (lastSearch.job.canBeAutoCancelled()) {
            console.info("the last search's job returned true from canBeAutoCancelled so we are cancelling it.")
            lastSearch.job.cancel();
            this.clearSearchForAPI(api);
        }
    }

    _dispatchSuccess(search, pageIsLoading) {
        if (!search.isDispatched()) {
            console.error("ASSERTION FAILED - the new search given to _dispatchSuccess was somehow not dispatched");
        }
        if (!search.job) {
            console.error("ASSERTION FAILED - the new search given to _dispatchSuccess does not have a job property");
        }
        //console.info(sprintf("%s successfully dispatched a search sid=%s spl=\n%s", this.moduleId, search.getSearchId(), search.toString()));


        // assumption being made here that this newly dispatched thing makes
        // all displayed data downstream irrelevant.
        this.withEachDescendant(function(module) {
            module.reset();
        });
        var api = search.getAPI();

        Sideview.clearMessages();
        this.cancelLastSearch(api);

        this.setSearchForAPI(api, search);
        this.firstPushAfterDispatch = true;



        //console.log(this.moduleId + " dispatchSuccess is pushing pageIsLoading=" + pageIsLoading);
        this.pushDownstream(pageIsLoading);
    }

    dispatchSuccess(search, pageIsLoading) {
        return this._dispatchSuccess(search, pageIsLoading);
    }

    _dispatchFailure(search) {
        this.cancelLastSearch(search.getAPI());

        this.withEachDescendant(function(module) {
            module.reset();
        });
    }
    dispatchFailure(search) {
        return this._dispatchFailure(search);
    }

    /**
     * The module is thinking ahead and asking itself "Do any of my immediate
     * children actually need anything in here dispatched before I give it to
     * them?     (If yes, calling code in pushDownstream() will pause to kick
     * off any queries that need to be kicked off)
     */
    childrenRequireDispatch(c) {
        if (!c) c=this.getModifiedContext();
        var apisRequiringDispatch = [];
        this.withEachChild(function(child) {
            var apis = child.requiresDispatch(c);
            // I feel like I've stared at this a dozen times and wondered
            // why the hell all these aren't maps instead of arrays.
            // but until I can prove it's a real problem I'm not fixing it.
            for (var i=0,len=apis.length;i<len;i++) {
                if (apisRequiringDispatch.indexOf(apis[i])==-1) {
                    apisRequiringDispatch.push(apis[i]);
                }
            }
        });
        return apisRequiringDispatch;
    }

    /**
     * Sure. these are technically URIs and not URLs.
     * usage here follows mainstream usage by normal humans.
     * if that is technically at odds with the RFC, #thisisfine
     */
    getResultURL(params, context) {
        context = context || this.getContext();
        var search  = context.getSplunkSearch();
        return search.getUrl("results_preview", params);
    }

    getSplunkResultParams(context, search) {
        return {};
    }

    hasResultsURLChanged() {
        var params = this.getResultParams();
        if (!this._previousResultURL) return true;
        if (this._previousResultParams) {
            if (!Sideview.compareObjects(this._previousResultParams, params)) {
                return true;
            }
        }
        var currentResultURL = this.getResultURL(params);
        return (this._previousResultURL != currentResultURL);
    }

    hasResultParamChanged(currentResultParams, param) {
        if (!this._previousResultParams) return true;
        if (currentResultParams.hasOwnProperty(param) == this._previousResultParams.hasOwnProperty(param)) {
            return (currentResultParams[param] != this._previousResultParams[param]);
        }
        return true;
    }

    _getResultsFailure(xhr, textStatus, errorThrown) {
        if (textStatus == "abort") {
            console.debug(this.moduleId, " getResults() aborted");
        }
        else {
            if (xhr.status=="401") {
                Sideview.redirectToLogin()
            }

            console.warn(sprintf("%s getResults error; textStatus=%s errorThrown=%s", this.moduleId, textStatus, errorThrown));

            if (xhr.responseXML) {
                console.info(this.moduleId, " getResults failed - there is a responseXML property. checking XML for errors");
                try {
                    var message = $(xhr.responseXML).find("messages").find("msg");
                    console.log(message.text())
                    Sideview.broadcastMessage("error", message.text());
                }
                catch(e) {

                    console.error(xhr.responseXML);
                }
            }
            else if (xhr.responseText) {
                console.info(this.moduleId, ".getResults failed - there is a responseText property. checking (presumed) JSON for errors")
                try {
                    var messages = JSON.parse(xhr.responseText).messages;
                    for (var i=0;i<messages.length;i++) {
                        var m = messages[i];
                        var error = m.message || m.text;
                        Sideview.broadcastMessage("error", error);
                    }
                }
                catch(e) {
                    console.error("unexpected exception trying to get messages out of the response.")
                    console.error(xhr.responseText);
                }
            }
            else {
                console.error(this.moduleId, "getResults failed and there was an unexpected exception trying to get messages out of the response.", );
            }
        }
        this.resetXHR();
    }

    getResultsFailure(xhr, textStatus, errorThrown) {
        this._getResultsFailure(xhr, textStatus, errorThrown);
    }

    getResultsSuccess(response, textStatus, xhr) {
        if (xhr.status==0) {
            return;
        }
        this.renderResults(response);
        this.resetXHR();
        if (this.pushAfterRendering) {
            this.pushDownstream(this.wasPageStillLoadingOnOriginalPush);
            this.pushAfterRendering = false;
            this.wasPageStillLoadingOnOriginalPush = false;
        }
    }

    getResultsComplete(xhr, textStatus) {
        this.resetXHR();
    }

    _getResults() {
        if (this.getResultsXHR) {
            if (this.getResultsXHR.readyState == 4) {
                this.resetXHR();
            }
        }
        var params = this.getResultParams();
        this._previousResultParams = $.extend(true, {}, params);

        var resultURI = this.getResultURL(params);
        this._previousResultURL = resultURI;

        if (!resultURI) {
            throw("getResultURL returned invalid URL - " + resultURI);
        }

        this.getResultsXHR = $.ajax({
            type: "GET",
            url: resultURI,
            cache: (Sideview.isIE() ? false : true),
            success:  this.getResultsSuccess.bind(this),
            error:    this.getResultsFailure.bind(this),
            complete: this.getResultsComplete.bind(this)
        });
        return this.getResultsXHR;
    }

    getResults() {
        return this._getResults();
    }
    _getResultParams(context) {
        context = context || this.getContext();
        var params = {};

        var search  = context.getSplunkSearch();
        //console.error(this.moduleType + " " + search.getAPI());
        if (!search) console.trace();
        switch (search.getAPI()) {
            case "splunk":
                var splunkParams = this.getSplunkResultParams(context,search);
                $.extend(params,splunkParams);
                break;

            default:
                console.warn("we  hasn't actually implemented support for any other API's yet because we are ridiculous!");
        }
        return params;
    }
    getResultParams(context) {
        return this._getResultParams(context);
    }


    /************
      RENDERING
     ***********/
    renderResults(response) {
        alert('I think this base implementation is obsolete now');
        this.container.html(response);
        this.onResultsRendered();
    }

    /**
     * grouped under rendering because in the Sideview world this is just an
     * item for Switcher and Table Embedding.
     */
    getGroupName () {
        if (!this.getParam("group")) {
            if (this.parent) return this.parent.getGroupName();
        }
        return this.getParam("group");
    }


    /************
      RESETTING
     ***********/
    reset() {
        this.resetXHR();
        this.resetUI();
    }

    resetXHR() {
        this.getResultsXHR = null;
    }

    resetUI () {}


    /************
      TREE METHODS
     ***********/
    withEachAncestor(fn, reverse) {
        var ancestors = this.getAncestors();
        if (reverse) ancestors.reverse();
        for(var i=0, j=ancestors.length; i<j; i++) {
            var retVal = fn(ancestors[i]);
            if (retVal === false) return false;
        }
        return true;
    }

    withEachChild(fn) {
        var children = this._children;
        for(var i=0, j=children.length; i<j; i++) {
            var retVal = fn(children[i]);
            if (retVal === false) return false;
        }
        return true;
    }

    withEachDescendant(fn) {
        this.withEachChild(function(child) {
            if (fn(child) === false) return false;
            child.withEachDescendant(fn);
        });
        return true;
    }

    /*

     Earlier implementations tried to walk down and ask each child childrenRequireDispatch(),
     with a fresh empty context...
     and if so, call the callback on that child, but do not recurse down.

     however what doomed this was a chicken and egg problem?
     That code was trying to use withEachDescendantInDispatchTier *itself* to set the dispatched searches

     so then from a given module, for each GRANDCHILD module, if they've never gotten ANY search, then they dont have any _activeAPIs,
     meaning they wont return true from requiresDispatch, meaning child.childrenRequireDispatch returned false.

     So right now this code is just "have we passed a Search module yet." basically.
     */
    withEachDescendantInDispatchTier(fn) {
        this.withEachChild(function(child) {
            if (!child.triggersNewDispatchForAPI("unused")) {
                fn(child);
                child.withEachDescendantInDispatchTier(fn);
            }
        });
        return true;
    }

    getRootAncestor() {
        var pointer = this, retVal = null;
        while(pointer) {
            retVal = pointer;
            pointer = pointer.parent;
        }
        return retVal;
    }

    getAncestors() {
        var pointer = this.parent, retVal = [];
        while(pointer) {
            retVal.unshift(pointer);
            pointer = pointer.parent;
        }
        return retVal;
    }

    getDescendants() {
        var descendants=this._children.slice();
        for(var i=0; i<descendants.length; i++) {
            descendants = descendants.concat(descendants[i]._children);
        }
        return descendants;
    }

    _addChild(child) {
        if (child.parent) {
            throw("tried to add " + child.moduleId + " as a child but it already has a parent of " + child.parent.moduleId);
        }
        child.parent = this;
        this._children.push(child);
    }

    addChild(child) {
        return this._addChild(child);
    }

    _removeChild(child) {
        var newFamily = [];
        for (var i=0,len=this._children.length; i<len;i++) {
            if (child == this._children[i]) {
                this._children[i].parent = null;
            } else {
                newFamily.push(this._children[i]);
            }
        }
        this._children = newFamily;
    }

    removeChild (child) {
        return this._removeChild(child);
    }

    isReadyForContextPush() {
        for (var i=0;i<this.itemsToLoad.length; i++) {
            var item = this.itemsToLoad[i];
            if (item.state()!="resolved") {
                return this.DEFER;
            }
        }
        return this.CONTINUE;

    }
    // SOON
    isReadyToPushDownstream(context) {
        return this.CONTINUE;
    }
    _doubleSecretIsReadyToPushDownstream(context) {
        context = context || this.getContext();
        if (!this.requiresResults()) return this.CONTINUE;
        var activeAPIs = this.getActiveAPIs();
        if (Object.keys(activeAPIs).length === 0) {
            return this.CONTINUE;
        }
        if ("splunk" in activeAPIs && !this.getSplunkSearch()) {
            console.error("SHOULD NOT HAPPEN - module that requires results has no search and it just thought about pushing downstream");
            return this.CANCEL;
        }
        return this.CANCEL;
    }


    /************
      VISIBILITY
     ***********/
    show(reason) {
        reason = reason || "global";
        if (this._invisibilityModes.hasOwnProperty(reason)) {
            delete this._invisibilityModes[reason];
        }
        this._changeVisibility();
    }

    hide(reason) {
        reason = reason || "global";
        this._invisibilityModes[reason] = 1;
        this._changeVisibility();
    }

    isVisible() {
        for (var mode in this._invisibilityModes) {
            if (this._invisibilityModes.hasOwnProperty(mode)) {
                return false;
            }
        }
        return true;
    }

    getReasonsToBeInvisible() {
        var reasons = [];
        for (var mode in this._invisibilityModes) {
            reasons.push(mode);
        }
        return reasons;
    }

    showDescendants(reason) {
        for (var i=0; i<this._children.length;i++) {
            this._children[i].show(reason);
            this._children[i].showDescendants(reason);
        }
    }


    hideDescendants(reason) {
        for (var i=0,len=this._children.length;i<len;i++) {
            this._children[i].hide(reason);
            this._children[i].hideDescendants(reason);
        }
    }

    _changeVisibility() {
        if (this.isVisible()) this.container.show();
        else this.container.hide();
    }


    /************
      PARAMS
     ***********/
    _getParam(key, defaultValue) {
        if (!key) {
            throw("no key passed to getParam");
        }
        if (this._params.hasOwnProperty(key)) {
            var value = this._params[key];
            if (value!=null) {
                return value;
            }
        }
        if (defaultValue || defaultValue=="") return defaultValue;
        return null;
    }

    getParam(key, defaultValue) {
        return this._getParam(key, defaultValue);
    }

    setParam(k,v) {
        this._params[k] = v;
    }

    /************
      Doing Things With Preferences.
     ***********/
    getPreferenceKeyNames() {
        return [];
    }

    loadPreferences(prefDict) {}


    /************
      MISC
     ***********/
    displayInlineErrorMessage(errorMessage) {
        this.container.css("height","auto");
        this.hide = function() {};
        this.container.show();
        var errorDiv = $("div.error", this.container);
        if (errorDiv.length == 0 ) {
            errorDiv = $("<div>")
                .addClass("error")
                .appendTo(this.container);
        }
        errorDiv.text(errorMessage);
    }

}
    return Module;

});