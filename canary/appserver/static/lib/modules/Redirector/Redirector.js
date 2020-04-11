// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class Redirector extends Module {

    constructor(container, params) {
        super(container, params);
        var prefix = "arg";
        // pull out all the args for our URI
        this.args = {};
        for (var key in this._params) {
            if (!this._params.hasOwnProperty(key)) continue;
            // if this param begins with "arg."
            if (key.length > prefix.length && key.indexOf(prefix) == 0) {
                this.args[key.substring(prefix.length+1)] = this._params[key];
            }
        }
        this.checkConfig();
    }

    checkConfig() {
        if (this.getParam("autoDrilldown")=="True") {
            if (!this.getParam("generalSearchTermField") || this.getParam("mergeDrilldownKeys")=="False") {
                alert('VIEW CONFIGURATION ERROR - this view has a Redirector module configured with "autoDrilldown", but the other related Redirector params are not configured correctly to match this.  Remove the "autoDrilldown" param or consult the Sideview documentation.');
            }
        }
    }

    stripLastStandardReportCommand(s) {
        var commands = Sideview.getCommands(s);
        if (commands && commands.length>1) {
            var lastCommand = commands[commands.length-1].split(" ")[0];
            if (["timechart","chart","stats","top","rare"].indexOf(lastCommand)!=-1) {
                commands.splice(commands.length-1);
                s = commands.join(" | ");
            }
        }
        return s;
    }

    resetUI() {}

    /**
     * Only runs when the mergeDrilldownKeys param is set to True
     * ASSUMPTION - the developer has spelled out the argument names in the
     * arg.* params, so that they match EXACTLY with the field names.
     * ASSUMPTION - the developer is using the "fieldName.rawValue" keys in the
     * Redirector args, (as they should always)
     * ASSUMPTION - Something, either the Report module or something else,
     * has set the "sideview.splitByField" key accurately.
     *
     * This detects certain keys added by other Sideview modules, and overall
     * it is able to merge those arguments from the click, back into the
     * explicit args, WHERE APPROPRIATE.  If the 'generalSearchTermField'
     * param is set,  then click arguments that do not match some explicit
     * arg in the Redirector's params, will be appended as full searchterms
     * to this 'generalSearchTermField'
     */
    mergeDrilldownKeys(context, argList) {
        var drilldownPrefixes = context.get("sideview.drilldownPrefixes");
        if (!$.isArray(drilldownPrefixes) || drilldownPrefixes.length==0) return;

        var generalSearchTermField = this.getParam("generalSearchTermField");

        for (var i=0,len=drilldownPrefixes.length;i<len;i++) {
            var p = drilldownPrefixes[i];
            var matchedXField = false;
            var matchedSplitByField = false;

            // we look through our load-time arguments, to see if the drilldown
            // keys match these field names.  If they do, we merge/overwwrite.
            for (var key in argList) {
                if (context.get(p + ".xField") == key) {

                    if (context.has(p + ".rawValue")) {
                        context.set(key + ".rawValue", context.get(p + ".rawValue"));
                    } else {
                        context.set(key + ".rawValue", context.get(p + ".value"));
                    }
                    matchedXField = true;
                }
                if (context.get(p + ".splitByField") == key
                    && !context.get(p + ".isNullClick")
                    && !context.get(p + ".isNullClick")) {

                    if (context.has(p + ".rawName2")) {
                        context.set(key + ".rawValue", context.get(p + ".rawName2"));
                    } else {
                        context.set(key + ".rawValue", context.get(p + ".name2"));
                    }
                    matchedSplitByField = true;
                }
            }
            if (generalSearchTermField) {
                var currentTerms = context.get(generalSearchTermField + ".rawValue");
                if (this.getParam("autoDrilldown")) {
                    currentTerms = this.stripLastStandardReportCommand(currentTerms);
                }

                var newTerms = this.getNewSearchTerms(context, p, matchedXField, matchedSplitByField);
                var combinedTerms = this.combineTerms(currentTerms, newTerms);
                context.set(generalSearchTermField + ".rawValue", combinedTerms);
            }
        }
    }

    getNewSearchTerms(context, p, matchedXField, matchedSplitByField) {
        var newTerms = [];
        // we didn't find a direct match
        if (!matchedXField && context.has(p + ".xTerm") && context.has(p + ".xFilter")) {

            // NOTE the case where there is an explicit match in the Redirector's OWN args
            // for the field name involved here - that case may not work as expected because it will
            // already have been matched, and the "10-19" value will already have been explicitly
            // plugged into that field value. that MAY BE CORRECT! since it's ultimate destination may
            // be a pulldown for instance.
            // anyway, this here will only match generic search term drilldown term cases involving
            // binning, for which there isn't an explicit form field in the target view. GOT THAT? =)
            if (context.get("sideview.xFieldBins")>0) {
                if (context.has(p + ".xFilter")) {
                    try {
                        var xFilters = JSON.parse(context.get(p + ".xFilter"));
                        var xTermMinMax=xFilters[0]["value"].split("-");
                        xFilters[0]["operator"] = ">=";
                        xFilters[0]["value"] = xTermMinMax[0];
                        newTerms.push(Sideview.getSearchTermsFromFilters(xFilters));
                        xFilters[0]["operator"] = "<";
                        xFilters[0]["value"] = xTermMinMax[1];
                        newTerms.push(Sideview.getSearchTermsFromFilters(xFilters));
                    }
                    catch(e) {
                        console.error("unexpected exception while trying to parse a bucketed xFilter argument - " + str(e));
                        newTerms.push(context.get(p + ".xTerm"));
                    }
                } else {
                    console.error("Redirector module has found itself with an xFieldBins arg but no xFilter to work with. This drilldown may not work as expected.");
                    newTerms.push(context.get(p + ".xTerm"));
                }
            } else {
                newTerms.push(context.get(p + ".xTerm"));
            }
        }
        if (!matchedSplitByField && context.has(p + ".splitByTerms")) {
            newTerms.push(context.get(p + ".splitByTerms"));
        }
        return newTerms.join(" ");
    }

    combineTerms(currentTerms, newTerms) {
        var commands = Sideview.getCommands(currentTerms);
        if (commands.length==0) {
            commands.push(newTerms);
        }
        else if (commands.length==1) {
            commands[0] += " " + newTerms;
        }
        else if (commands[commands.length-1].indexOf("search")==0) {
            commands[commands.length-1] += " " + newTerms;
        }
        else if (commands && newTerms){
            newSearchCommand = "search " + newTerms;
            commands.push(newSearchCommand);
        }
        return commands.join(" | ");
    }

    getSingleKey(key) {
        if (!key || !key.split) return false;
        var pieces = key.split("$");
        if (pieces.length==3 && pieces[0]=="" && pieces[2]=="") {
            return pieces[1];
        }
        return false;
    }

    /**
     * given argList (basically just a map of the arg.* params)
     * returns a map of context values.
     */
    processArgs(context, argList) {
        var args = {};

        if (this.getParam("mergeDrilldownKeys")) {
            this.mergeDrilldownKeys(context, argList);
        }

        // do the inline replacement
        for (var key in argList) {
            if (!argList.hasOwnProperty(key)) continue;

            // key might have $foo$ tokens in it.  replace them.
            var substitutedArgKey = Sideview.replaceTokensFromContext(key, context);

            // raw, unsubstituted value. Note we use the unsubstituted key here.
            var argValue = argList[key];
            var singleKeyName=this.getSingleKey(argValue);
            // if it's a single key we tread more lightly so as to preserve
            // array-valued values.
            if (singleKeyName && context.get(singleKeyName)) {
                // note that we use the magic method to check whether the same
                // key WITH SAME VALUE, except that it's UNESCAPED, is present up in the QS.
                // if this is the case, this function will return the UNESCAPED value.
                // Essential to complying with 3.3.3's security fix for html/script injection.
                var value = Sideview.getValueForFormElementSelection(singleKeyName,context);
                // we have to call toString for things like $search$ to work right I think.
                if (!$.isArray(value)) {
                    value = value.toString();
                }
                args[substitutedArgKey] = value;
            }
            // whatever is listed,  it's not just $someSingleGiantKey$.
            // It has either static components, or it's more than one key
            else {
                var substitutedArgValue = Sideview.replaceTokensFromContext(argValue, context);
                args[substitutedArgKey] = substitutedArgValue;
            }

        }
        return args;
    }

    /**
     * this is a template method designed to be overridden in apps.
     * You could just dance your way around overriding onContextChange
     * but this makes it a lot easier.
     */
    customEditArgs(context, finalArgs) {}


    addArgs(url, args) {
        // handle cases where there are also args in the string URL.
        if (url.indexOf("?")!=-1) {
            var argsInURL = url.substring(url.indexOf("?")+1);
            url = url.substring(0,url.indexOf("?"));
            argsInURL = Sideview.stringToDict(argsInURL);

            // if the same arg is on both sides, delete the arg.* one if it's
            // emptystring-valued.  So that the conglomified one can win.
            for (var arg in args) {
                if (args.hasOwnProperty(arg) && args[arg]=="" && argsInURL.hasOwnProperty(arg) ) {
                    delete args[arg]
                }
            }
            //allow the explicit args to override the conglomified ones
            $.extend(argsInURL,args);
            args = argsInURL;
        }
        var argString = Sideview.dictToString(args);
        if (argString) {
            url += "?" + argString;
        }
        return url;
    }

    getURL(context) {
        Sideview.setStandardTimeRangeKeys(context, this.getParam("fillExplicitAllTimeArgs"));
        Sideview.setStandardJobKeys(context);
        var args = this.processArgs(context, this.args);
        this.customEditArgs(context, args);
        var url = Sideview.replaceTokensFromContext(this.getParam("url"), context);
        url = this.addArgs(url,args);
        return url;
    }

    /**
     * Once the page is loaded, even a single call to onContextChange will
     * trigger redirection.  As a result this is commonly hidden underneath
     * a SubmitButton with allowSoftSubmit set to False, or under an
     * interactive SimpleResultsTable module.
     */
    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        if (!this.isPageLoadComplete()) {
            console.info(this.moduleType + ".onContextChange called but page is still loading. Aborting redirect.");
            return false;
        }
        var url = this.getURL(context);

        var explicitWindowFeatures = this.getParam("windowFeatures") || false;

        if (this.getParam("target")) {
            window.open(url, this.getParam("target"), explicitWindowFeatures || "resizable=yes,status=yes,scrollbars=yes,toolbar=yes");
        }
        else {
            var newWindow = context.get("click.modifierKey") || this.getParam("popup")=="True";
            if (newWindow) {
                window.open(url, "_blank", explicitWindowFeatures || "resizable=yes,status=no,scrollbars=yes,toolbar=no");
            } else {
                if (explicitWindowFeatures) {
                    console.warn("Redirector module is configured with explicit windowFeatures param, although neither the popup param nor the target param is set. This may be a view-configuration error.");
                }
                document.location = url;
            }
        }
    }

}
    return Redirector;
});