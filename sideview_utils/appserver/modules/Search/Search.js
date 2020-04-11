// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.
Splunk.Module.Search = $.klass(Splunk.Module, {

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        this.childEnforcement = Splunk.Module.ALWAYS_REQUIRE;
        
        Sideview.utils.applyCustomProperties(this);
    },

    resetUI: function() {},

    /**
     * Modifies the context so as to add in a "search" key whose value is an
     * instance of Splunk.Search,  and whose searchstring will be the value of
     * the module's 'search' param.    For every $foo$ token found in this
     * string, if there is a matching value in the context as set by all
     * modules upstream, those dynamic values will be substituted into the
     * searchstring.
     */
    getModifiedContext: function(context) {
        if (!context) context = this.getContext();
        var search  = context.get("search");
        if (search) {
            search.abandonJob();
        }
        else {
            console.error(this.moduleId + " - No search object was found in context");
        }

        if (this._params.hasOwnProperty('search')) {
            var s = this.getParam('search');
            if (s) {
                // we wont return this one. But we need the full set of tokens
                // for $foo$ replacements in the search param.
                var internalContext = this.getContext();
                internalContext = Sideview.utils.htmlUnescapeContext(internalContext);
                Sideview.utils.setStandardTimeRangeKeys(internalContext);
                Sideview.utils.setStandardJobKeys(internalContext);
                search.setBaseSearch(Sideview.utils.replaceTokensFromContext(s, internalContext));
            }
        }
        if (this.getParam("earliest") || this.getParam("latest") || this.getParam("earliest")==="" || this.getParam("latest")==="") {
            var earliest = Sideview.utils.replaceTokensFromContext(this.getParam("earliest"), context);
            var latest  =  Sideview.utils.replaceTokensFromContext(this.getParam("latest"), context);
            var range = new Splunk.TimeRange(earliest, latest);
            search.setTimeRange(range);
            Sideview.utils.setStandardTimeRangeKeys(context);
            // never give these downstream...
            //Sideview.utils.setStandardJobKeys(context);
        }
        if (this._params.hasOwnProperty("maxTime")) {
            search.setMaxTime(this.getParam("maxTime"));
        }
        if (this.getParam("preview")) {
            var p = Sideview.utils.replaceTokensFromContext(this.getParam("preview"), context);
            try {
                search.setPreview(p.toLowerCase());
            } catch (e) {
                console.error("It looks like core patches failed to get included")
            }
        }
        context.set("search", search);
        
        // bookkeeping cleanup, for standard timerange keys.
        if (this.getParam("earliest") || this.getParam("latest")) {
            Sideview.utils.setStandardTimeRangeKeys(context);
        }

        return context;
    }
});