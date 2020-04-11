// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.ShowHide= $.klass(Splunk.Module, {

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        this.checkConfig();
        Sideview.utils.applyCustomProperties(this);
        
    },

    getSelectorsToShow: function(context) {
        var show = this.getParam("show");
        show = Sideview.utils.replaceTokensFromContext(show, context);
        return show ? show.split(",") : [];
        
    },

    getSelectorsToHide: function(context) {
        var hide = this.getParam("hide");
        hide = Sideview.utils.replaceTokensFromContext(hide, context);
        return hide ? hide.split(",") : [];
    },

    resetUI: function() {},

    checkConfig: function() {
        if (this.show.length + this.hide.length < 1) {
            this.displayInlineErrorMessage("ShowHide module is configured with neither any selectors to show nor any to hide");
        }
    },
    
    
    onContextChange: function() {
        var context = this.getContext();

        var selectorsToHide = this.getSelectorsToHide(context)
        for (var i=0,len=selectorsToHide.length; i<len; i++) {
            $(selectorsToHide[i]).hide();
        }

        var selectorsToShow = this.getSelectorsToShow(context)
        for (var i=0,len=selectorsToShow.length; i<len; i++) {
            $(selectorsToShow[i]).show();
        }
        //Sideview.utils.balanceLabelWidths(this.container.parent); 
    }
});




