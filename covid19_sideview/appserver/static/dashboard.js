
 require([
      'jquery',
      'splunkjs/mvc/simplexml/ready!'
  ], function($) {


    var checkForEntity = function(url, args, successCallback, failureCallback) {
        args = args || {};
        return $.ajax({
            type: "GET",
            dataType: "json",
            url: url,
            data : args,
            async: true,
            success: successCallback,
            error: failureCallback
        });
    }

    var whatsAllThisThen = {}


    // I know. it would be nice to just use a proper Deferred when/done pattern.
    // .  but they way they built this, a 404 is fatal and derails everything.  It seems to abandon the other request/response callback
    // and trigger the always.
    // so we have to go sequential which is lame.
    var whenBothChecksComplete = function() {

        console.error(whatsAllThisThen)
        var error = false;
        if (whatsAllThisThen["canary"]!=1 && whatsAllThisThen["sideview_utils"]!=1) {
            error = "Setup Error - neither the Canary app nor the Sideview Utils app are installed on this Splunk instance yet. <br>Install the latest versions of both from Splunkbase -- see instructions below.";
        }
        else if (whatsAllThisThen["canary"]!=1) {
            error = "Setup Error - The Canary app is not installed on this Splunk instance yet. Install the latest version from Splunkbase -- see instructions below.";
        }
        else if (whatsAllThisThen["sideview_utils"]!=1) {
            error = "Setup Error - The Sideview Utils app is not installed on this Splunk instance yet. Install the latest version from Splunkbase -- see instructions below.";
        }
        else if (whatsAllThisThen["canary"]==1 && whatsAllThisThen["sideview_utils"]==1) {
            console.info("All is well. Both Canary and Sideview Utils seem to be installed")
            var uri = Splunk.util.make_url("/splunkd/__raw/services/sv_view/covid19_sideview/analysis")
            document.location = uri;
        }

        if (error) {
            console.error("WQTF")
            $("#panel1").prepend('<p style="padding:3px 10px; color:#fff; font-size:150%;background-color:#f66;">' + error + '</p>');
        }
        else {
            console.error("this should never happen but we checked for the 2 apps and then had neither success nor failure.")
        }
    }

    var checkForCanary = function() {
        var uri = Splunk.util.make_url("/splunkd/__raw/services/apps/local/canary?output_mode=json");
        return checkForEntity(
            uri,
            {},
            function() {
                whatsAllThisThen["canary"] = 1;
                whenBothChecksComplete();
            },
            function(xhr, ajaxOptions, thrownError){
                whatsAllThisThen["canary"] = -1;
                whenBothChecksComplete();
            })

    }

    var checkForSideviewUtilsThenCanary = function() {
        var uri = Splunk.util.make_url("/splunkd/__raw/services/apps/local/sideview_utils?output_mode=json");
        return checkForEntity(
            uri,
            {},
            function() {
                whatsAllThisThen["sideview_utils"] = 1;
                checkForCanary();
            },
            function(xhr, ajaxOptions, thrownError){
                whatsAllThisThen["sideview_utils"] = -1;
                checkForCanary();
            })
    }
    console.error('4')


    /*
    var itemsToLoad = [checkForCanary(), checkForSideviewUtils()];
    $.when(...itemsToLoad)
        .done(function() {
            console.log(whatsAllThisThen)
            console.error("done")
        })
        .fail(function() {
            console.error("fail")
            console.log(whatsAllThisThen)
        })
        .always(function() {
            console.error("always")
            console.log(whatsAllThisThen)
        });
    */

    checkForSideviewUtilsThenCanary()



 });



