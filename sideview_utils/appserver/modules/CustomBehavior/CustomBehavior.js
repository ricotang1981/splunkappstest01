// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.


Splunk.Module.CustomBehavior = $.klass(Sideview.utils.getBaseClass(true), {
    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        Sideview.utils.applyCustomProperties(this);
        
    },

    resetUI: function() {

    },

    requiresResults: function() {
        return (this.getParam("requiresDispatch") == "True")
    },
    requiresDispatch: function($super, search) {
        return (this.requiresResults() && $super(search));
    },

    /** 
     * see comment on DispatchingModule.requiresTransformedResults
     */
    requiresTransformedResults: function() {
        return true;
    }

});