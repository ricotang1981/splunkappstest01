// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "api/SplunkSearch",
  "svmodule",
  "time_range"],
  function($, Sideview, SplunkSearch, Module, TimeRange) {

class Search extends Module {

    constructor(container, params) {
        super(container, params);
    }

    // todo - we could have a 'setDefaultAPI' that pushes ["splunk"] down into
    // the activeApi's from Splunk module, and pushes ["elastic"] down into
    // the activeApi's from Elastic module etc..
    triggersNewDispatchForAPI(api) {
        // TODO - the argument currently isn't passed correctly.
        //return (api=="splunk");
        return true;
    }

    resetUI() {}

    // only here so we can see the classname in our traces.
    pushDownstream(pageIsLoading) {
        return this._pushDownstream(pageIsLoading);
    }

    /**
     * Modifies the context so as to add in a "search" key whose value is an
     * instance of Search,  and whose searchstring will be the value of
     * the module's 'search' param.    For every $foo$ token found in this
     * string, if there is a matching value in the context as set by all
     * modules upstream, those dynamic values will be substituted into the
     * searchstring.
     */
    getModifiedContext(context) {
        context = context || this.getContext();
        var search  = context.getSplunkSearch() || new SplunkSearch();
        search.abandonJob();

        if (this._params.hasOwnProperty('search')) {
            var s = this.getParam('search');
            if (s) {
                // we wont return this context. But we need the full set of tokens
                // for $foo$ replacements in the search param.
                var internalContext = context.clone();
                internalContext.setSplunkSearch(search);
                internalContext = Sideview.htmlUnescapeContext(internalContext);
                Sideview.setStandardTimeRangeKeys(internalContext);
                Sideview.setStandardJobKeys(internalContext);

                search.setBaseSearch(Sideview.replaceTokensFromContext(s, internalContext));
            }
        }
        if (this.getParam("earliest") || this.getParam("latest") || this.getParam("earliest")==="" || this.getParam("latest")==="") {
            var earliest = Sideview.replaceTokensFromContext(this.getParam("earliest"), context);
            var latest  =  Sideview.replaceTokensFromContext(this.getParam("latest"), context);
            var range = new TimeRange(earliest, latest);
            context.set("shared.timeRange",range);
            Sideview.setStandardTimeRangeKeys(context);
            // never give these downstream...
            //Sideview.setStandardJobKeys(context);
        }
        if (this._params.hasOwnProperty("maxTime")) {
            search.setMaxTime(this.getParam("maxTime"));
        }
        if (this.getParam("preview")) {
            var p = Sideview.replaceTokensFromContext(this.getParam("preview"), context);
            search.setPreview(p.toLowerCase());
        }
        context.setSplunkSearch(search);

        return context;
    }
}
    return Search;
});