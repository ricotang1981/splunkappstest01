// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.

define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class ShowHide extends Module {

    constructor(container, params) {
        super(container, params);
        this.checkConfig();
    }

    getSelectorsToShow(context) {
        var show = this.getParam("show");
        show = Sideview.replaceTokensFromContext(show, context);
        return show ? show.split(",") : [];
    }

    getSelectorsToHide(context) {
        var hide = this.getParam("hide");
        hide = Sideview.replaceTokensFromContext(hide, context);
        return hide ? hide.split(",") : [];
    }

    resetUI() {}

    checkConfig() {
        if (this.show.length + this.hide.length < 1) {
            this.displayInlineErrorMessage("ShowHide module is configured with neither any selectors to show nor any to hide");
        }
    }


    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();

        var selectorsToHide = this.getSelectorsToHide(context)
        for (var i=0,len=selectorsToHide.length; i<len; i++) {
            $(selectorsToHide[i]).hide();
        }

        var selectorsToShow = this.getSelectorsToShow(context)
        for (var i=0,len=selectorsToShow.length; i<len; i++) {
            $(selectorsToShow[i]).show();
        }

    }
}
    return ShowHide;

});