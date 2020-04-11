// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview, Module) {

class ViewRenderer extends Module {

    constructor(container, params) {
        super(container, params);
    }

    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        var form = $("form", this.container);
        form.attr("action", this.getViewURL());

        var viewConfig = Sideview.replaceTokensFromContext(this.getParam("config"), context);
        $('input[name="xml"]', this.container).val(viewConfig)
        $('input[name="splunk_form_key"]', this.container).val(Sideview.getSplunkCsrfToken());

        form.submit();
    }

    getViewURL(viewConfig) {
        var app = Sideview.getCurrentApp();
        var url = Sideview.make_url("splunkd","__raw","sv_view",app);
        return url;
    }

}
    return ViewRenderer;

});