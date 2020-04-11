// Copyright (C) 2013-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery"],
  function($) {

class Context {

    constructor() {
        this._root = {};
        this._activeAPIs = {};
    }

    has(key) {
        if (key=="search") return this.hasSplunkSearch();
        return this._root.hasOwnProperty(key);
    }

    get(key) {
        if (key=="search") {
            console.error('deprecated - not supposed to call context.get("search") anymore');
            //console.trace();
            return this.getSplunkSearch();
        }
        if (this.has(key)) {
            return this.passByValue(this._root[key]);
        }
        return null;
    }

    isNull() {
        return $.isEmptyObject(this._root);
    }

    /**
     * Do any of the API's for which we have any information set,
     * eg ElasticSearch,  Splunk,   need the underlying query submitted?
     * put another way - do we have a set of args that can be formed into a
     * query,  without having a reference to the results of that query.
     */
    requiresDispatch() {
        var apisRequiringDispatch = [];
        if (Object.keys(this._activeAPIs).length === 0) {
            // TODO -- at the outset, Search should propagate down some call to
            // setDefaultAPI("splunk")...  that goes all the way down through.
            // then they can all have 'activeapi' for that.
            //console.trace();
            //throw("Context.requiresDispatch - Assertion failed - requiresDispatch was called on a context that had an empty _activeAPIs property");
            return ["splunk"];
        }
        for (var api in this._activeAPIs) {
            if (this._activeAPIs.hasOwnProperty(api)) {
                if (!this._activeAPIs[api].isDispatched()) {
                    apisRequiringDispatch.push(api);
                }
            }
        }
        if (apisRequiringDispatch.length>1) {
            throw("Context.requiresDispatch - Assertion failed - We have a point in the UI where we need to dispatch searches two different APIs, but the code does not yet support this.");
        }
        return apisRequiringDispatch;
    }


    getSearchForAPI(api) {
        if (this._activeAPIs.hasOwnProperty(api)) {
            return this._activeAPIs[api];
        }
        //console.error("no " + api + " search object found");
        return false;
    }

    setSearchForAPI(api, s) {
        this._activeAPIs[api] = s;
    }

    hasSearchForAPI(api) {
        return this._activeAPIs.hasOwnProperty(api);
    }
    removeSearchForAPI(api) {
        delete this._activeAPIs[api];
    }

    /**
     * TEMPORARY METHODS as we abstract away the splunk api.
     */
    getSplunkSearch() {
        return this.getSearchForAPI("splunk");
    }

    setSplunkSearch(s) {
        return this.setSearchForAPI("splunk",s);
    }

    hasSplunkSearch() {
        return this.hasSearchForAPI("splunk");
    }

    removeSplunkSearch() {
        return this.removeSearchForAPI("splunk");
    }

    getAll(name) {
        if (name=="" || name==null) {
            return this.passByValue(this._root);
        }
        var dict = {};
        for (var key in this._root) {
            if (this._root.hasOwnProperty(key)) {
                var shortKey;
                if (key == name) {
                    shortKey = "";
                } else if (key.indexOf(name+".")!=-1) {
                    shortKey = key.replace(name+".", "");
                } else {
                    continue;
                }
                dict[shortKey] = this.passByValue(this._root[key]);
            }
        }
        return dict;
    }

    set(key, value) {
        if (key=="search") return this.setSplunkSearch(value);
        value = this.passByValue(value);
        this._root[key] = value;
    }

    clone() {
        var clone = new Context();
        for (var key in this._root) {
            if (this._root.hasOwnProperty(key)) {
                clone.set(key, this.get(key));
            }
        }
        for (var api in this._activeAPIs) {
            if (this._activeAPIs.hasOwnProperty(api)) {
                // Note for the "splunk" api the job objects do not themselves
                // get cloned within SplunkSearch.clone();
                clone._activeAPIs[api] = this._activeAPIs[api].clone();
            }
        }
        return clone;
    }

    overlay(overridingContext) {
        var overrideDict = overridingContext.getAll();
        for (var key in overrideDict) {
            this.set(key, overrideDict[key]);
        }
    }

    passByValue(value) {
        if (value instanceof Object) {
            if (typeof(value.clone) == "function") {
                return value.clone();
            }
            else if (typeof(value) == "function") {
                return value;
            }
            else if (value instanceof Array) {
                return $.extend(true, [], value);
            }
            else {
                return $.extend(true, {}, value);
            }
        }
        return value;
    }

    remove(key) {
        if (this.has(key)) {
            this.set(key,null);
            delete(this._root[key]);
        }
    }
}
    return Context;

});