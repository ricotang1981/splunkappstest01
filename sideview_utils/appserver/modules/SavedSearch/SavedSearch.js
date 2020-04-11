// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.
Splunk.Module.SavedSearch = $.klass(Splunk.Module, {

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        this.childEnforcement = Splunk.Module.ALWAYS_REQUIRE;
        
        Sideview.utils.applyCustomProperties(this);
    },

    resetUI: function() {},

    /**
     * Modifies the context to add in the search, timeRange and any serialized
     * context keys associated with a given Splunk Saved Search.
     */
    getModifiedContext: function(context) {
        var name = this.getParam("name");
        var ss   = this.getParam("savedSearch");
        
        var search = Sideview.utils.loadSavedSearch(ss, this.getParam("group"));

        var context = this.getContext();
        var serializedContext = this.getParam("savedContext");
        for (key in serializedContext) {
            context.set(key, serializedContext[key]);
            context.set(key+".value", serializedContext[key]);
        }

        context.set("search",search);
        context.set("search.name", name);
        return context;
    }
});