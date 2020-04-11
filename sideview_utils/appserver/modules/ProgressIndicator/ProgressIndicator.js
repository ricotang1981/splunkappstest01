// Copyright (C) 2016 Sideview LLC.  All Rights Reserved.

Splunk.Module.ProgressIndicator= $.klass(Sideview.utils.getBaseClass(true), {
    
    VISIBILITY_CLASS: "only show when job is in progress",
    initialize: function($super, container) {
        $super(container);
        Sideview.utils.applyCustomProperties(this);
    },

    onBeforeJobDispatched: function() {
        this.setStateMessage("Queued...");
        this.update(0);
    },

    onJobProgress: function() {
        var context = this.getContext();
        var search  = context.get("search");
        if (search.job.isRealTimeSearch()) {
            this.hide(this.VISIBILITY_CLASS);
        } 
        else {
            this.setStateMessage("Loading...");
            this.show(this.VISIBILITY_CLASS);
            this.update(search.job.getDoneProgress());
        }
    },

    onJobDone: function() {
       this.setStateMessage("");
       this.hide(this.VISIBILITY_CLASS);
    },

    update: function(progress) {
        var progressPercent = (Math.round(progress * 10000) / 100) + "%";
        $(".innerBar", this.container).css('width', progressPercent);
        $(".progressPercent", this.container).text(progressPercent);
    }, 

    setStateMessage: function(m) {
        $('.stateMessage', this.container).text(m);
    }
});
