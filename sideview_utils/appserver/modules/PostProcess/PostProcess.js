// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.
Splunk.Module.PostProcess = $.klass(Sideview.utils.getBaseClass(true), {

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        this.childEnforcement = Splunk.Module.ALWAYS_REQUIRE;
        Sideview.utils.applyCustomProperties(this);
    },

    resetUI: function() {},

    requiresResults: function() {return true;},

    requiresTransformedResults: function() {return true;},

    /**
     * get the 'search' param, wash the context keys through it to replace 
     * any $foo$ tokens, then set it as the postProcess argument for 
     * downstream modules
     */
    getModifiedContext: function(context) {
        if (!context) context = this.getContext();
        var searchObject  = context.get("search");

        // preserve any old postProcess values as $postProcess$
        var oldPostProcessSearch = searchObject.getPostProcess();
        
        // another identical context, but one that we'll put extra keys in/
        // keys that we dont want to return.
        var internalContext = this.getContext();
        Sideview.utils.setStandardTimeRangeKeys(internalContext);
        Sideview.utils.setStandardJobKeys(internalContext);
        internalContext.set("postProcess", oldPostProcessSearch);

        var postProcessSearch = this.getParam('search');
        
        postProcessSearch = Sideview.utils.replaceTokensFromContext(postProcessSearch, internalContext);
        
        // put the new postProcess in both ways
        searchObject.setPostProcess(postProcessSearch);
        context.set("postProcess", postProcessSearch);

        context.set("search", searchObject);
        return context;
    }
});