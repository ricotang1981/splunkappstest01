// Copyright (C) 2016-2019 Sideview LLC.  All Rights Reserved.

define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class ProgressIndicator extends Module {

    constructor(container, params) {
        super(container, params);
        this.container.html();
        $("<div>")
            .addClass("stateMessage")
            .appendTo(this.container);
        $("<div>")
            .addClass("outerBar")
            .append(($("<div>").addClass("innerBar")))
            .appendTo(this.container);
        $("<div>")
            .addClass("progressPercent")
            .appendTo(this.container);
        this.VISIBILITY_CLASS ="only show when job is in progress";
    }

    requiresResults(c) {
        return true;
    }

    startIdler() {
        if (!this.idler) {
            var that = this;
            this.idleIterations = 0;
            this.idler = setInterval(function(){that.onIdle()}, 650);
        }
    }

    clearIdler() {
        if (this.idler) {
            clearTimeout(this.idler);
            this.setStateMessage("");
        }
    }


    onBeforeJobDispatched() {
        this.update(0);
        this.startIdler()

    }

    onJobProgress() {
        var context = this.getContext();
        var search  = context.getSplunkSearch();
        var doneProgress = search.getDoneProgress();

        if (doneProgress===false) {
            this.clearIdler();
            this.hide(this.VISIBILITY_CLASS);
        }
        else {
            this.startIdler();
            this.show(this.VISIBILITY_CLASS);
            this.update(doneProgress);
        }
    }

    onJobDone() {
       this.clearIdler();
       this.hide(this.VISIBILITY_CLASS);
    }

    onIdle() {
        this.idleIterations++;
        var ellipsis = "...";
        var search = this.getContext().getSplunkSearch();
        var message;
        if (search) {
            var doneProgress = search.getDoneProgress();
            if (doneProgress) {
                this.clearIdler();
                return;
            }
            message = "Queued";
        }
        else {
            message = "Dispatching";
        }
        for (var i=0;i<this.idleIterations;i++) {
            ellipsis += ".";
        }
        this.setStateMessage(message + ellipsis);
        //console.error(this.moduleId + " is idling - " + message + ellipsis + " idleIterations=" + this.idleIterations)
    }

    update(progress) {
        var progressPercent = (Math.round(progress * 10000) / 100) + "%";
        $(".innerBar", this.container).css('width', progressPercent);
        $(".progressPercent", this.container).text(progressPercent);
    }

    setStateMessage(m) {
        $('.stateMessage', this.container).text(m);
    }

    resetUI() {
        this.clearIdler();
        this.hide(this.VISIBILITY_CLASS);
    }
}
    return ProgressIndicator;

});