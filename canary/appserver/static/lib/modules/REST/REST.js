// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class REST extends Module {

    constructor(container, params) {
        super(container, params);
        this.name = this.getParam("name");
        // current values are initial,  success, and failure.
        this.state = "initial";
        this.errorMessage = "";
    }

    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        this.payloadArgs = {};
        for (var key in this._params) {
            if (!this._params.hasOwnProperty(key)) continue;
            if (key.indexOf("arg.")==0) {
                var payloadKey = Sideview.replaceTokensFromContext(key.substr(4),context);
                var value = Sideview.replaceTokensFromContext(this._params[key],context)
                this.payloadArgs[payloadKey] = value;
            }
        }
        var headers = {};
        var args = $.extend({},this.payloadArgs,true);
        args["output_mode"] = "json";
        var uri = Sideview.replaceTokensFromContext(this.getParam("uri"),context);
        //if (uri.startsWith("/")) {
        //    headers["X-Splunk-Form-Key"] = Sideview.getSplunkFormKey();
        //}
        this.inFlight = true;
        $.ajax({
            url: Sideview.make_url(uri),
            type: 'post',
            data: args,
            headers: headers,
            dataType: 'json',
            success: this.handleSuccess.bind(this),
            error: this.handleError.bind(this)
        });
    }

    isReadyForContextPush() {
        if (this.inFlight) {
            return this.DEFER;
        }
        else {
            return this.CONTINUE;
        }
    }

    handleSuccess(response) {
        this.inFlight = false;
        this.state = "success";
        this.errorMessage = "";
        if (this.onSuccess(response)) {
            this.pushDownstream();
        }
    }

    handleError(jqXHR, textStatus, error) {
        this.inFlight = false;
        this.state = "failure";
        var response = false;
        try {
            var response = JSON.parse(jqXHR.responseText);
        }
        catch(e) {
            this.errorMessage = "ERROR - Unexpected exception - " + e;
        }
        if (response) {
            if (response.hasOwnProperty("messages")) {
                this.errorMessage = response["messages"][0]["text"];
            }
            else {
                this.errorMessage = "ERROR - " + textStatus + ", " + error;
            }
        }
        this.onError(jqXHR, textStatus, error)
        this.pushDownstream();
    }

    onSuccess(response) {
        return true
    }

    onError(textStatus) {}

    getModifiedContext() {
        var context = this.getContext();
        context.set(this.name + ".state", this.state);
        context.set(this.name + ".errorMessage", this.errorMessage);
        return context;
    }
}
return REST;
});