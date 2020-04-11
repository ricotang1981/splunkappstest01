// Copyright (C) 2010-2020 Sideview LLC.  All Rights Reserved.
define(
    ["jquery",
    "context",
    "module",
    "time_range",
    "timezone",
    "jquery-cookie",
    "json2",
    "sprintf",
    ],
    function($, Context, Module, TimeRange, TimeZone) {

class SideviewUtils {

    constructor() {
        this.customBehaviors = {};
        this._currentVersion = "3.4.8";
        this.SPLITBY_INFERRER = new RegExp(".+\\|(\\s)*?(chart|timechart)([^|]*?)?by\\s+([^|=]+)(\\s+)?( limit=\"?\\d+\"?)?$");
        this.PREFS_URI = this.make_url(sprintf(
            "/splunkd/__raw/servicesNS/%s/%s/configs/conf-ui-prefs",
            this.getCurrentUser(),
            this.getCurrentApp()
        ));
        this.customCssClassesByModule = {};
        // Rain Man ftw.
        this.definitelyTransformingCommands = {
            "stats":1,"chart":1,"timechart":1,"top":1,"rare":1,"sistats":1,"sichart":1,"sitimechart":1,"sitop":1,"sirare":1,"sort":1
        };
        this.definitelyNonTransformingCommands = {
            "eval":1,"rex":1,"where":1,"search":1,"addinfo":1,"convert":1,"extract":1,"regex":1,"head":1,"tail":1,"lookup":1,"replace":1,"rename":1,"strcat":1
        };
        this.mvTokenRegex = /(.+)\[(\d+)\]$/;
        this.isCanary = true;
    }

    endsWith(str, pattern) {
        var d = str.length - pattern.length;
        return d >= 0 && str.lastIndexOf(pattern) === d;
    }

    /**
     * recursively examine the two objects. Returns true if all keys and
     * values and all structure is the same.
     * There was a function in the splunk code to do this but it at that
     * time had a number of problems in it. Perhaps it no longer does I
     * don't know.
     */
    compareObjects(x,y) {
        var p;
        for (p in y) {
            if (typeof(x[p])=="undefined") {return false;}
        }
        for (p in y) {
            if (y[p]) {
                switch (typeof(y[p])) {
                        case "object":
                                if (typeof(y[p].equals)=="function") {
                                    if (!y[p].equals(x[p])) return false;
                                }
                                if (typeof(y[p].join)!=typeof(x[p].join)) return false;
                                if (typeof(y[p].join)=="function") {
                                    if (y[p].join("-x-")!=x[p].join("-x-")) return false;
                                }
                                break;
                        case "function":
                                if (typeof(x[p])=="undefined" || (p != "equals" && y[p].toString() != x[p].toString())) return false;
                                break;
                        default:
                                if (y[p] != x[p]) return false;
                }
            }
            else if (x[p]) {
                return false;
            }
        }
        for (p in x) {
            if (typeof(y[p])=="undefined") return false;
        }
        return true;
    }

    stringToList(s) {
        var list = [];
        if (!s) return [];
        var i=0;
        var c;
        var n;
        while (i<s.length) {
            c = s.charAt(i);
            if (c == "," || c==" ")  {
                n = $.trim(s.substring(0,i));
                if (n.length>0) {
                    list.push(n);
                }
                s = s.substring(i+1, s.length);
                i=0;
                continue;
            }
            i++;
        }
        n = $.trim(s);
        if (n.length>0) {
            list.push(n);
        }
        return list;
    }

    getCurrentQueryString() {
        return document.location.search.substring(1);
    }

    getURLDict(explicitHashDict) {
        var urlDict = {};
        var qsDict   = this.stringToDict(this.getCurrentQueryString());
        var hashDict = explicitHashDict;
        if (!hashDict) {
            hashDict = this.stringToDict(this.getCurrentHash());
        }
        $.extend(urlDict, qsDict);
        $.extend(urlDict, hashDict);
        return urlDict;
    }

    escapeHTMLWithinURLDict(urlDict) {
        var div = $("<div>");
        var value, t;
        for (var key in urlDict) {
            value = urlDict[key];
            t = typeof(value);
            if (t=="object") {
                for (var i=0,len=value.length;i<len;i++) {
                    value[i] = div.text(value[i]).html();
                }
                urlDict[key] = value;
            }
            else if (t=="string"){
                urlDict[key] = div.text(value).html();
            }
            //else console.error("Assertion failed - urlDict value seen with type=" + type + " key=" + key + " value=" + value.toString());
        }
        return urlDict;
    }

    escapeHTML(val) {
        return $("<div>").text(val).html();
    }

    getCurrentHash() {
        // we cannot use hash itself.
        // nasty bug in firefox.
        // https://bugzilla.mozilla.org/show_bug.cgi?id=483304
        //document.location.hash.substring(1)
        var loc = document.location.toString();
        var hashIndex = loc.indexOf("#");
        if (hashIndex==-1) return "";
        return loc.substring(hashIndex+1);
    }

    /**
     * does some merging to avoid repeating keys that are already represented
     * in the "hard" keys in the querystring
     */
    simplifyHashDict(hashDict) {
        var qsDict   = this.stringToDict(document.location.search.substring(1));
        for (var key in qsDict) {
            if (qsDict.hasOwnProperty(key) && hashDict.hasOwnProperty(key)) {
                if (qsDict[key] == hashDict[key]) {
                    delete hashDict[key];
                }
            }
        }
    }


    /**
     * pulled out as a separate getter just to facilitate unit testing.
     */
    _getLoginURI() {
        // we deliberately flatten the hash args into the qs args to make a simple flat qs url with
        // no hash.  iow getURLDict merges the hashDict into the qsDict.
        var qs = Sideview.dictToString(Sideview.getURLDict());
        var loginURIDict = {
            "session_expired": 1,
            "return_to": sprintf("%s?%s", document.location.pathname, qs)
        }
        return Sideview.make_url(sprintf("/account/login?%s", Sideview.dictToString(loginURIDict)));
    }

    /**
     * generally triggered when some code has just received a 401 from splunkd.
     */
    redirectToLogin() {
        document.location = this._getLoginURI();
    }

    createModules(modulesToLoad, moduleMap) {
        var modules = [];

        for (var i=0,len=modulesToLoad.length;i<len;i++) {
            var params = modulesToLoad[i];
            if (!moduleMap.hasOwnProperty(params.module)) {
                console.error("ERROR - could not find a class definition for " + params.module);
            }

            try {
                var container = $("div#" + params.moduleId);

                var m = new moduleMap[params.module](container, params);
                m.moduleType = params.module;
                // this can't be in the base constructor because CB
                // definitions tend to refer to properties that
                // aren't created until the main constructor.
                if (m.getParam("customBehavior")) {
                    this.applyCustomBehavior(m);
                }
                modules.push(m);
            }
            catch(e) {
                console.error("unexpected exception initializing the " + params.module + " module");
                console.error(e);
                console.log(params);
                console.trace();
                alert("unexpected exception initializing the " + params.module + " module\n" + e);

            }
        }
        return modules;
    }

    applyModuleHierarchy(modules) {
        var modulesById = {};
        for (var i=0,len=modules.length;i<len;i++) {
            modulesById[modules[i].moduleId] = modules[i];
        }
        for (var i=0,len=modules.length;i<len;i++) {
            var m = modules[i];
            var parentId = m.getParam("parent");
            if (parentId && parentId!="top") {
                var parent = modulesById[parentId];
                if (!parent) throw parentId + " could not be found";
                parent.addChild(m);
            }
        }
        for (var i=0,len=modules.length;i<len;i++) {
            var m = modules[i];
            try {
                this.validateHierarchy(m);
                m.onHierarchyApplied();
            }
            catch (e) {
                console.error(e);
                console.error("Exception thrown in hierarchy foo around a " + m.moduleType + " module instance");
            }
        }
    }

    pushFromTopLevelModules(modules) {
        var deferreds = [];
        for (var i=0,len=modules.length;i<len;i++) {
            var m = modules[i];
            var parentId = m.getParam("parent")
            if (!parentId || parentId=="top") {
                $.merge(deferreds, m.pushDownstream(true));
            }
        }
        return deferreds;
    }

    getModule(moduleId) {
        for (var module of this.moduleInstances) {
            if (module.moduleId == moduleId) {
                return module;
            }
        }
        return false;
    }
    getTzInfo() {
        var url = sprintf("/%s/splunkd/__raw/services/search/timeparser/tz", this.getLocale());
        $.get(url, function(responseStr) {
            //console.error(responseStr);
            window.$["SERVER_ZONEINFO"] = responseStr;

        }.bind(this));
    }

    getTimeZone() {
        var tzInfo = this.getConfigValue("SERVER_ZONEINFO");
        if (!tzInfo) {
            console.error("I was told... that there would be no math");
        }
        return new TimeZone(tzInfo);
    }

    /**
     * Honestly I don't know what to call this.
     * getPossiblyHTMLUnescapedValueIfURLContainsOurKey   is insane.
     * getValueForPrepopulation is too easy to misinterpret.
     * getValueForFormElementSelection is therefore the best we can do.
     * URLLoader now HTML-escapes All qs args that it passes down.
     * because of this, the form element modules have to worry about
     * unescaping them just before trying to set internal form element state.
     * see usage in form element modules.
     */
    getValueForFormElementSelection(name,context) {
        var urlDict = {};
        if (this.hasOwnProperty("savedContextDict")) {
            urlDict = $.extend(urlDict, this.savedContextDict);
        }
        urlDict = $.extend(urlDict,this.getURLDict());
        var value = context.get(name + ".rawValue") || context.get(name);
        // if this same value is in the URL, just in non-HTML-escaped form...
        if (!value) return value;
        else if (urlDict.hasOwnProperty(name) && this.escapeHTML(urlDict[name]) == value) {
            // then use the un-escaped one.
            return urlDict[name];
        } else {
            return value;
        }
    }

    htmlUnescapeContext(context) {
        var urlDict = this.getURLDict();
        var value;
        for (var key in urlDict) {
            if (urlDict.hasOwnProperty(key)) {
                value = context.get(key);
                if (this.escapeHTML(urlDict[key])==value) {
                    context.set(key, urlDict[key]);
                }
            }
        }
        return context;
    }

    contextToQueryString(context) {
        var keys = [];
        for (var key in context._root) {
            if (context.has(key)) keys.push(key);
        }
        keys = keys.sort();

        var text = [];
        var endsWith = this.endsWith;
        var ignoredKeys = {
            "search":1,"autoRun":1,"search.name":1,"sideview.splitByField":1,"sideview.xField":1,"sideview.yField":1,"request.ui_edit_view":1,"results.count":1,"results.offset":1,"results.upstreamPagerCallback":1
        };

        for (var i=0,len=keys.length;i<len;i++) {
            var key = keys[i];
            if ((!key) || ignoredKeys.hasOwnProperty(key)) continue;
            if (key.indexOf("shared.timeRange.")==0) continue;
            if (key.indexOf("search.timeRange.")==0) continue;
            if (endsWith(key,".label") || endsWith(key,".rawValue") || endsWith(key,".element") || endsWith(key,".callback") || endsWith(key,".value") || endsWith(key,".onEditableStateChange") || endsWith(key, ".onSelectionSuccess")) continue;
            if (key==context.get("sideview.reportKey")) continue;
            var value;
            if (context.has(key + ".rawValue")) {
                value = context.get(key + ".rawValue") || "";
            } else {
                value = context.get(key) || "";
            }
            if ($.isArray(value)) {
                for (var j=0,jLen=value.length;j<jLen;j++) {
                    text.push(encodeURIComponent(key.toString()) + "=" + encodeURIComponent(value[j].toString()));
                }
            }
            else {
                text.push(encodeURIComponent(key.toString()) + "=" + encodeURIComponent(value.toString()));
            }
        }
        return text.join("&");
    }

    getConfigValue(key, fallback) {
        var c=window.$C;
        if (c && c.hasOwnProperty(key)) return c[key];
        else {
            if (key=="VERSION_LABEL") {
                console.log("someone is using the old legacy VERSION_LABEL conf key");
                return this.getConfigValue("SPLUNK_VERSION");
            }
            if (key=="USERNAME") {
                console.warn("getConfigValue('USERNAME') is deprecated. Use getCurrentUser instead");
                return this.getCurrentUser() || fallback;
            }
            return fallback || "";
        }
    }

    getSplunkCsrfToken() {
        var name = "splunkweb_csrf_token_" + window.$C["SPLUNKWEB_PORT_NUMBER"];
        return $.cookie(name ) || "";
    }

    inferLocaleFromPathSegments(segments) {
        for (var i=0;i<segments.length;i++) {
            var segment = segments[i];
            // does it look like a locale string?
            if  (segment.match(/\w{2}-\w{2}/)) {
                return segment;
            }
        }
        return false;
    }

    getLocale() {
        var configLocale = this.getConfigValue("LOCALE");
        if (configLocale) return configLocale;

        if (!this._locale) {
            var segments = document.location.toString().split("/").splice(3);
            var inferredLocale = this.inferLocaleFromPathSegments(segments);
            if (inferredLocale) {
                this._locale = inferredLocale;
            }
            else {
                console.error("eek we failed to infer find a locale");
                return "en-US";
            }
        }

        return this._locale;
    }

    // Note that this function can accept any number of arguments, but those arguments
    // are referenced using the arguments array.
    make_url() {
        var url = [];
        var rootEndpoint = this.getConfigValue("ROOT_ENDPOINT", "");

        rootEndpoint = rootEndpoint.replace(/^\/|\/$/g, "");

        if (rootEndpoint) {
            url.push(rootEndpoint);
        }
        url.push(this.getLocale());

        var segments=[];
        for (var i=0,len=arguments.length,arg=null; i<len; i++) {
            var innerSegments = arguments[i].split("/");
            for (var j=0,jLen=innerSegments.length; j<jLen; j++) {
                if (innerSegments[j]!="") {
                    segments.push(innerSegments[j]);
                }
            }
        }

        for (var i=0,len=segments.length,arg=null; i<len; i++) {
            arg = segments[i];
            while (arg.charAt(0)=="/") arg = arg.slice(1);
            while (arg.charAt(arg.length-1)=="/") arg = arg.slice(0,arg.length-1);
            url.push(arg);
            if ((arg=="modules" || arg=="static") && (url.length==2 || (rootEndpoint && url.length==3))) {
                var splunkBuild = this.getConfigValue("SPLUNK_BUILD_NUMBER", 0);
                if (!splunkBuild) console.error("warning - we didn't load a value for SPLUNK_BUILD_NUMBER");
                var crud = [];
                if (splunkBuild) crud.push(splunkBuild);
                if (i<len-1 && segments[i+1] == "app") {
                    var appBuild = this.getConfigValue("APP_BUILD_NUMBER", 0);
                    if (!appBuild) console.error("warning - we didn't load a value for APP_BUILD_NUMBER");
                    if (appBuild) crud.push(appBuild);
                }
                if (crud.length) {
                    url.push("@"+crud.join("."));
                }
            }
        }
        return "/" + url.join("/");
    }

    getSelectedText() {
        if (window.getSelection) {
            return window.getSelection().toString();
        }
        else if (document.selection && document.selection.createRange) {
            var selectionRange = document.selection.createRange();
            return selectionRange.text;
        }
        return "";
    }

    applyCustomCssClass(module, context) {
        var cssClass = module.getParam("cssClass");
        // TODO - port functions from URLLoader to here, and getUrlDict as the
        //        fallback.
        if (!context) context = new Context();
        cssClass = this.replaceTokensFromContext(cssClass, context);

        // ok but only alphanumeric, hyphens and underscores please.
        cssClass  = cssClass.replace(/[^\w\s-]|_/g, "_");
        var newCssClasses = cssClass.split(" ");

        if (!this.customCssClassesByModule.hasOwnProperty(module.moduleId)) {
            this.customCssClassesByModule[module.moduleId] = newCssClasses;
        }
        else {
            var previouslyLoadedClasses = this.customCssClassesByModule[module.moduleId];
            // bake the new ones into the record. All else is rendering from now on.
            this.customCssClassesByModule[module.moduleId] = newCssClasses;
            for (var i=previouslyLoadedClasses.length-1;i>=0;i--) {

                var c=previouslyLoadedClasses[i];

                // not in the new custom list
                if (newCssClasses.indexOf(c)==-1) {
                    // make sure to never remove these classnames.
                    if (c != module.moduleType) {
                        module.container.removeClass(c);
                    }
                }
                // is in the new custom list, so no need to reapply.
                else {
                    // splice is evil.  splices out of the reference, messes
                    // up the logic.
                    //newCssClasses.splice(i);
                }
            }
        }
        for (var i=0,len=newCssClasses.length;i<len;i++) {
            module.container.addClass(newCssClasses[i]);
        }
    }

    /**
     * Called in the base module constructor for all modules.
     */
    applyCustomBehavior(module) {
        if (!module) {
            console.error("assertion failed - (probably trainwreck error) we went to apply the customBehavior for " + behaviorClass + " and the module is undefined");
        }

        var behaviorClass = module.getParam("customBehavior");
        if (!this.customBehaviors.hasOwnProperty(behaviorClass)) {
            console.error("ERROR - customBehavior \"" + behaviorClass + "\" listed in the page config, but we don't see it defined");
            return;
        }
        this.customBehaviors[behaviorClass](module);
    }

    /**
     * NOT TO BE CALLED WITHIN DOCUMENT.READY()
     */
    declareCustomBehavior(behaviorClass, func) {
        if (this.customBehaviors.hasOwnProperty(behaviorClass)) {
            alert("App error - a customBehavior can only be defined once. Two definitions for " + behaviorClass + " are defined in this app");
        }
        else {
            this.customBehaviors[behaviorClass] = func;
        }
    }

    /**
     * given a template (containing $foo$ tokens), and a context,
     * populate all the tokens from the context.  Including &name& as this.name
     * and $value$ as the passed value. This treatment of $name$ and $value$
     * is very common across Sideview modules.
     * NOTE that $value$ is assumed to ALREADY be backslash escaped.
     */
    templatize(context, template, name, value) {
        if (template && value) {
            var c = context.clone();
            c.set("name", name);
            c.set("value", value);
            c.set(name, value);
            return this.replaceTokensFromContext(template, c);
        }
        return value;
    }

    safeTemplatize(context,template,name,value) {
        value = this.escapeBackslashes(value);
        if (value=="" || value==null) return "";
        if (!template) return value;
        if (this.isValueNestedInsideDoubleQuotes(template)) {
            value = value.replace(/"/g, "\\\"");
        }
        return this.templatize(context, template, name, value);
    }

    multiTemplatize(context,name,values,template,separator,outerTemplate) {
        var templatizedValues = [];
        var templatizedValue;
        for (var i=0,len=values.length;i<len;i++) {
            templatizedValue = this.safeTemplatize(context, template, name, values[i]);
            templatizedValues.push(templatizedValue);
        }
        var gluedValue = templatizedValues.join(separator);
        // we do not escape slashes in the outer template. It's not input
        // from the user. And to the extent that other $foo$ tokens will
        // be in here, they will have been backslashed upstream.
        return this.templatize(context, outerTemplate, name, gluedValue);
    }

    mightNeedStatusBuckets(search) {
        if (search.hasOwnProperty("_needsStatusBuckets")) return search._needsStatusBuckets;

        var commands = this.getCommands(search.toString());

        var transforming = this.definitelyTransformingCommands;
        var nonTransforming = this.definitelyNonTransformingCommands;
        var c;
        // might be working too hard to return quickly
        // technically the transforming check just makes us return in the
        // first couple iterations in most cases, but isnt necessary.
        for (var i=1,len=commands.length;i<len;i++) {
            c = commands[i].split(" ")[0];
            if (c == "fields" || c == "table"
                || transforming.hasOwnProperty(c)
                || !nonTransforming.hasOwnProperty(c)) {
                search._needsStatusBuckets = false;
                return false;
            }
        }
        search._needsStatusBuckets = true;
        return true;
    }

    /**
     * given a string containing zero or more "$foo$" tokens,
     * replace each of the tokens with the context object's value for that
     * token.  (ie replace $foo$ with context.get("foo"))
     *
     * "$$" does not trigger dynamic replacement and instead
     * gets replaced by a single literal "$" in the output.
     */
    replaceTokensFromContext(s, context) {
        if (!s) return "";
        var within = false;
        var currentTokenArr = [];
        var currentTokenName;
        var out = [];

        for (var i=0,len=s.length;i<len;i++) {
            if (!s.charAt) {
                continue;
            }
            var ch = s.charAt(i);
            if (ch=="$") {
                within = !within;
                // check for '$$' to handle all those cases correctly.
                if (!within && i>0 && s.charAt(i-1)=="$") {
                    out.push("$");
                    continue;
                }
                // we just finished the token.
                if (!within) {
                    currentTokenName  = currentTokenArr.join("");

                    if (currentTokenName.match(this.mvTokenRegex)) {
                        var matches = currentTokenName.match(this.mvTokenRegex);
                        if (matches && matches.length>1) {
                            var value = context.get(matches[1]);
                            if ($.isArray(value)) {
                                out.push(value[matches[2]]);
                            } else {
                                out.push(context.get(currentTokenName));
                            }
                        }
                    } else {
                        out.push(context.get(currentTokenName));
                    }
                    currentTokenArr = [];
                }
            }
            else if (within) {
                currentTokenArr.push(ch);
            }
            else {
                out.push(ch);
            }
        }
        return out.join("");
    }

    findDynamicKeys(str) {
        var allKeys = [];

        // sneaky mole is sneaky.
        var mole = new Context();
        mole.get = function(name) {allKeys.push(name);};
        this.replaceTokensFromContext(str, mole);

        // part 2a find any dynamic keys and get the row #'s and field names
        var rowAndFieldNames = [];
        var fieldFinder = /results\[(\d+)?\]\.(.+)?/;
        // part 2b find things like 'results.count'  or 'results.eventCount'
        var resultsKeys  = [];
        var resultsKeyPrefix = "results.";

        for (var i=allKeys.length-1; i>-1; i--) {
            var m = fieldFinder.exec(allKeys[i]);
            if (m && m.length>0) {
                rowAndFieldNames.push({"row":m[1],"name":m[2]});
            }
            else if (allKeys[i].indexOf(resultsKeyPrefix)==0) {
                resultsKeys.push(allKeys[i]);
            }
        }
        return [rowAndFieldNames, resultsKeys, allKeys];
    }

    replacePlusSigns(s) {
        var decoded = [];
        for (var i=s.length;i>=0;i--) {
            if (s.charAt(i) == "+") {
                if (i>0 && s.charAt(i-1)=="+") {
                    decoded.unshift("+");
                    i--;
                } else {
                    decoded.unshift(" ");
                }
            }
            else decoded.unshift(s.charAt(i));
        }
        return decoded.join("");
    }

    withEachContextValue(context, arr, callback) {
        for (var i=0,key,len=arr.length; i<len; i++) {
            if (key=="search") {
                console.error("deprecated - not supposed to call context.get(\"search\") anymore");
                //console.trace();
                continue;
            }
            key = arr[i];
            if (!context.has(key)) continue;
            context.set(key, callback(context.get(key).toString()));
        }
    }

    getTimezoneOffsetDelta(serverOffsetThen, d) {
        if (!this.isInteger(serverOffsetThen)) return 0;
        return -60000 * (serverOffsetThen + d.getTimezoneOffset());
    }

    setStandardTimeRangeKeys(context, fillExplicitAllTimeArgs) {
        var range = context.get("shared.timeRange") || new TimeRange();

        var earliest = range.getEarliestTimeTerms();
        var latest = range.getLatestTimeTerms();
        if (fillExplicitAllTimeArgs) {
            latest=(!latest)? "all":latest;
            earliest=(!earliest || earliest==0)? "all":earliest;
        }
        if (earliest) {
            context.set("shared.timeRange.earliest", earliest);
            //legacy
            context.set("search.timeRange.earliest", earliest);
        }
        if (latest) {
            context.set("shared.timeRange.latest", latest);
            //legacy
            context.set("search.timeRange.latest", latest);
        }

        context.set("shared.timeRange.label", range.toConciseString());
        // legacy
        context.set("search.timeRange.label", range.toConciseString());
        return context;
    }

    setStandardJobKeys(context, includePrefix, optionalSearch) {
        var search = optionalSearch || context.getSplunkSearch();
        if (!search) {
            //console.error("we have no search object in this context");
            //console.trace();
            return context;
        }
        if (!search.isDispatched()) return context;
        var job = search.getJob();


        context.set("results.sid", job.getSearchId());
        context.set("results.isDone", job.isDone());
        context.set("results.eventSearch", job.getEventSearch() || "");
        var expandedSearch = job.getEventSearch() || "";
        var reportSearch = job.getReportSearch();
        if (reportSearch) {
            context.set("results.isTransforming","True");
            context.set("results.reportSearch", reportSearch);
            expandedSearch += " | " + reportSearch;
        }
        else if (expandedSearch)  {
            context.set("results.isTransforming","False");
        }
        context.set("results.expandedSearch", expandedSearch);

        var pfx = (includePrefix && !job.isDone()) ? "&#8805;" : "";

        context.set("results.count",pfx + job.getResultCount());
        context.set("results.eventCount", pfx + job.getEventCount());
        context.set("results.resultCount", pfx + job.getResultCount());

        context.set("results.scanCount", pfx + job.getScanCount());
        context.set("results.eventAvailableCount", pfx + job.getEventAvailableCount());
        context.set("results.eventFieldCount", pfx + job.getEventFieldCount());


        var p = search.getDoneProgress();
        if (p) {
            context.set("results.doneProgress",p);
            context.set("results.doneProgressPercent",Math.round(10000*p)/100);
        }
        context.set("results.runDuration", job._runDuration || "");

        //var t = job.getCreateTime()
        //if (t) context.set("results.createTime",t.valueOf()/1000);

        var range = job.getTimeRange();
        if (!range.isAllTime()) {
            context.set("results.timeRange.earliest",range.getEarliestTimeTerms());
            context.set("results.timeRange.latest",range.getLatestTimeTerms());
            context.set("results.timeRange.label",range.toConciseString());
        }
        return context;
    }

    getLogger() {
        console.trace();
        throw "OH NOES";
    }

    getCollection(url, extraArgs, successCallback, failureCallback) {
        var searchStr = sprintf("eai:acl.app=%s", this.getCurrentApp());
        if (!url.endsWith("/history")) {
            searchStr += " disabled=false"
        }

        var args = {
            output_mode: "json",
            count: 500,
            search: searchStr
        };
        $.extend(args,  extraArgs);

        return $.ajax({
            type: "GET",
            dataType: "json",
            url: url,
            data : args,
            async: true,
            error: function(jqXHR, textStatus, errorThrown) {
                console.error(sprintf("unexpected error getting results from %s, textStatus=%s error=%s", url, textStatus, errorThrown));

                if (failureCallback) {
                    failureCallback(jqXHR, textStatus, errorThrown);
                }
            }.bind(this),
            success: function(results) {
                if (!results.hasOwnProperty("entry")) {
                    console.error("results has no 'entry' property")
                    console.error(results);
                }
                successCallback(results["entry"]);
            }.bind(this)
        });
    }

    loadPagePreferences(modules) {
        var url = this.make_url(
            sprintf("/splunkd/__raw/servicesNS/%s/%s/configs/conf-ui-prefs/%s?output_mode=json",
            this.getCurrentUser(),
            this.getCurrentApp(),
            this.getCurrentView())
        );
        $.ajax({
            type: "GET",
            url: url,
            error: function(jqXHR, textStatus, errorThrown) {
                this.setPagePreferences(modules, {});
            }.bind(this),
            success: function(jsonResponse, textStatus) {
                var content = jsonResponse.entry[0].content;
                this.setPagePreferences(modules, content);
            }.bind(this)
        });
    }

    setPagePreferences(modules, content) {
        for (var i=0,len=modules.length;i<len;i++) {
            var module = modules[i];
            var keysWanted = module.getPreferenceKeyNames();
            var subset = {};
            for (var j=0,jLen=keysWanted.length;j<jLen;j++) {
                if (content.hasOwnProperty(keysWanted[j])) {
                    subset[keysWanted[j]] = content[keysWanted[j]];
                }
            }
            module.loadPreferences(subset);
            module.onPreferencesLoaded();
        }

    }

    commitNewPagePreferences(preferences) {
        var url = sprintf("%s/%s?output_mode=json", this.PREFS_URI, this.getCurrentView());
        return $.ajax({
            type: "POST",
            data: preferences,
            //dataType: "json",
            url: url,
            error: function(jqXHR, textStatus, errorThrown) {
                if (jqXHR.status==404) {
                    this.createPrefsStanza(function() {
                        if (this.stringOnFinger) {
                            console.error("ERROR We got a 404 saving to ui-prefs which is fine, but then we tried to create the stanza and tried to POST again and STILL got a 404. We are backing away slowly.");
                            return;
                        }
                        this.commitNewPagePreferences(preferences);
                        this.stringOnFinger = 1;
                    }.bind(this));
                }
            }.bind(this),
            success: function(jqXHR, textStatus) {
                console.info(sprintf("We successfully saved a preference to ui-prefs %s", textStatus));
            }.bind(this)
        });
    }

    createPrefsStanza(callback) {
        var url = sprintf("%s?output_mode=json", this.PREFS_URI);
        $.post(
            url,
            {name: this.getCurrentView()},
            function(data, textStatus, jqXHR) {
                callback();
            }
        );
    }


    /**
     * given a URL-encoded string, get back a dictionary.
     * Correctly supports multivalued arguments, and that feature is somewhat
     * essential, eg for prepopulating multiple-selection Pulldown modules.
     */
    stringToDict(s) {
        var dict = {};
        if (s.length==0 || s.indexOf("=")==-1) return dict;
        //if (s.indexOf("?")==0 || s.indexOf("#")==0) s = s.slice(1);
        var conjoinedTwins = s.split("&");
        var key, value, twins, heesAlreadyGotOne;
        for (var i=conjoinedTwins.length-1; i>=0; i--) {
            twins = conjoinedTwins[i].split("=");
            key = decodeURIComponent(twins.shift());
            value = decodeURIComponent(twins.shift());
            heesAlreadyGotOne = dict.hasOwnProperty(key);
            if (heesAlreadyGotOne) {
                if (typeof(dict[key])=="object") {
                    dict[key].push(value);
                } else {
                    var old = dict[key];
                    dict[key] = [old,value];
                }
            } else {
                dict[key] = value;
            }
        }
        return dict;
    }

    dictToString(dict) {
        var s = [];
        var singleValue, valueArray, i, len;
        for (var key in dict) {
            if (dict.hasOwnProperty(key)) {
                if (typeof(dict[key])=="object") {
                    valueArray = dict[key];
                    if (valueArray) {
                        for (i=0,len=valueArray.length; i<len; i++) {
                            singleValue = valueArray[i];
                            s.push(encodeURIComponent(key)+"="+encodeURIComponent(singleValue));
                        }
                    }
                } else {
                    singleValue = dict[key];
                    s.push(encodeURIComponent(key)+"="+encodeURIComponent(singleValue));
                }
            }
        }
        return s.join("&");
    }

    isNumeric(n) {
        if ($.isFunction($.isNumeric)) {
            return $.isNumeric(n);
        }
        return n!=="" && !isNaN(parseInt(n, 10));
    }
    isInteger(n) {
        return Math.floor(n) == n && this.isNumeric(n);
    }

    escapeBackslashes(s) {
        if (!s) return s;
        if (!s.hasOwnProperty("replace")) s = s.toString();
        return s.replace(/\\/g, "\\\\");
    }

    escapeDoubleQuotes(s) {
        if (!s) return s;
        return s.replace(/"/g, "\\\"");
    }

    escapeForSearchLanguage(s) {
        return this.escapeDoubleQuotes(this.escapeBackslashes(s));
    }

    doubleQuoteValue(s) {
        if (!s) return s;
        return "\"" + this.escapeDoubleQuotes(s) + "\"";
    }

    //this.isValueNestedInsideDoubleQuotes("fred\"$value$\"mildred")
    isValueNestedInsideDoubleQuotes(template, fooToken) {
        fooToken = fooToken || "$value$";

        var fooIndex = template.indexOf(fooToken);
        var i=0;
        var c=false;
        var insideQuotes, insideQuotesAtToken = false;
        while (i<template.length) {
            c = template.charAt(i);
            if (c == "\\") {
                i=i+2;
                continue;
            }
            else if (i==fooIndex) {
                insideQuotesAtToken = insideQuotes;
                i=i+fooToken.length;
                continue;
            }
            else if (insideQuotes) {
                if (c == "\"") insideQuotes = false;
            }
            else if (c == "\"") insideQuotes = true;
            i++;
        }
        // were we inside a quote at the token, and outside at the end.
        return (insideQuotesAtToken && !insideQuotes) ;
    }

    addInitialCommandIfAbsent(s, command) {
        command = command || "search";
        command += " ";
        var s2 = $.trim(s);
        if (s2.length==0 || s2.charAt(0)=="|") return s;
        if (s2.indexOf(command)!=0) return command + s2;
        return s;
    }

    removeInitialCommand(s,command) {
        if (!s) return s;
        command = command || "search";
        command += " ";
        var s2 = s;
        while (s2.length>1) {
            var c = s2.charAt(0);
            if (c==" " || c=="|") {
                s2 = s2.slice(1);
            } else {
                break;
            }
        }
        if (s2.indexOf(command)==0) {
            return s2.replace(command,"");
        }
        return s;
    }
    /**
     * Given a splunk search, decomposes it into trimmed strings
     * representing the splunk search commands as would be recognized by
     * Splunkd's SPL parser.
     * iow - you cant just split on "|" because pipes can be in quoted
     * literals, and then you have to worry about backslash-escaped quotes
     * and so on and so on.
     */
    getCommands(searchStr) {
        var commands = [];
        if (!searchStr) return [];
        var i=0;
        var insideQuotes = false;
        var bracketDepth = 0;
        var c;
        while (i<searchStr.length) {
            c = searchStr.charAt(i);
            if (c == "\\") {
                i=i+2;
                continue;
            }
            else if (insideQuotes) {
                if (c == "\"") insideQuotes = false;
            }
            else if (c == "\"") insideQuotes = true;
            else if (c == "[") bracketDepth++;
            else if (c == "]") {
                //malformed.
                if (bracketDepth <= 0) return [];
                bracketDepth--;
            } else if ((c == "|") && (bracketDepth ==0)) {
                commands.push($.trim(searchStr.substring(0,i)));
                searchStr = searchStr.substring(i+1, searchStr.length);
                i=0;
                continue;
            }
            i++;
        }
        // unbalanced quotes and brackets
        if (insideQuotes) return [];
        else if (bracketDepth != 0) return [];
        commands.push($.trim(searchStr));
        return commands;
    }

    /**
     * given a single search clause, return an array of the field names used
     * therein
     */
    getFieldNamesFromSearchExpression(searchStr, debugMode) {
        if (!searchStr) return [];
        searchStr=$.trim(searchStr);
        var insideQuotes = false;
        var command = searchStr.substring(0,searchStr.indexOf(" "));
        searchStr = searchStr.substring(searchStr.indexOf(" ")+1);
        var bracketDepth = 0;
        var c;
        var fields = [];
        var fieldsMap = {};
        var currentField = "";
        var handedness = "LHS";
        // Note we deliberately leave "*" out because correct handling of foo* cases
        // is more important.
        var operators = ["=",">","<","!=","+","-","/","!",")","("];
        var i=0;
        var waitingForAnOperator = false;

        while (i<searchStr.length) {
            c = searchStr.charAt(i);
            if (c == "\\") {
                i=i+2;
                continue;
            }
            else if (insideQuotes) {
                if (c == "\"") insideQuotes = false;
            }
            else if (c == "\"") insideQuotes = true;
            else if (c == "[") bracketDepth++;
            else if (c == "]") {
                //malformed.
                if (bracketDepth <= 0) {
                    console.error("malformed search expression. this.getFieldNamesFromSearchExpression was unable to get field names.");
                    console.error(command + " " + searchStr);
                    return [];
                }
                bracketDepth--;
            }
            else if (bracketDepth>0) {
                //pass
            }
            else if ((c == "|") && (bracketDepth ==0)) {
                console.error("you cannot use this.getFieldNamesFromSearchExpression on expressions that contain piped commands - run getCommands first and then process individual command strings");
                return [];
            }
            else if (c==")" || c=="(") {
                currentField="";
            }
            // we hit an operator
            else if (operators.indexOf(c)!=-1 ) {
                handedness = "OPERATOR";
                // if we were in an LHS field, we finalize the field name.
                if (currentField!="") {
                    if ((currentField!="NOT" && currentField!="OR" && currentField!="AND")
                        && !fieldsMap.hasOwnProperty(currentField)) {
                        fields.push(currentField);
                        fieldsMap[currentField]=1;
                    }
                    currentField = "";
                    if (debugMode) console.log(searchStr.substr(0,i) + " we were waiting for an operator. We found one, we baked out current field.");
                }
                else if (debugMode) {
                    console.log(searchStr.substr(0,i) + " Found an operator.");
                }
                waitingForAnOperator = false;
            }
            else {
                if (handedness=="OPERATOR") handedness="RHS";
                if (c==" ") {
                    if (currentField.length>0) {
                        if (command=="where" && handedness=="RHS") {
                            if (currentField!="") {
                                if ((currentField!="NOT" && currentField!="OR" && currentField!="AND")
                                    && !fieldsMap.hasOwnProperty(currentField)) {
                                    fields.push(currentField);
                                    fieldsMap[currentField]=1;
                                }
                                if (debugMode) console.log(searchStr.substr(0,i) + " (spacechar) where+RHS, so we baked out a field " + currentField);
                                currentField = "";
                            }
                            if (debugMode) console.log("set handedness to LHS");
                            handedness="LHS";
                        }
                        else {
                            if (debugMode) console.log(searchStr.substr(0,i) + " (spacechar) if the next non-space char we see is an operator,  then we make currentField into a field. if not, throw it away. OR if the next non-space char is a plainchar, AND we're in RHS, we bake out current field.");
                            waitingForAnOperator = true;
                        }

                    }
                }
                else if (command=="where" && handedness=="RHS") {
                    currentField += c;
                    if (debugMode) console.log(searchStr.substr(0,i) + " we're in a where command, RHS and writing to currentField (" + currentField + ")");
                }
                else if (waitingForAnOperator) {

                    currentField = c;
                    if (debugMode) console.log(searchStr.substr(0,i) + " waitingForAnOperator, NOT space, NOT (where &&  RHS) writing to currentField (" + currentField + ")");
                    waitingForAnOperator = false;
                }
                // YOU WOULD THINK THIS WOULD WORK, but handedness doesn't
                // get set to LHS correctly (ever), so this fails.
                //else if (handedness=="RHS" && command=="search") {
                //    currentField="";
                //    console.log(searchStr.substr(0,i) + " reached the end but handedness=" + handedness + ", command=" + command +", so we're stomping out currentField...");
                //}
                else  {

                    currentField += c;
                    if (debugMode) console.log(searchStr.substr(0,i) + " final else. waitingForAnOperator=" + waitingForAnOperator +", handedness=" + handedness + ", command=" + command +", writing to currentField (" + currentField + ")");
                }
            }
            i++;
        }
        if (command=="where" && currentField!="") {
            if ((currentField!="NOT" && currentField!="OR" && currentField!="AND")
                && !fieldsMap.hasOwnProperty(currentField)) {
                fields.push(currentField);
                fieldsMap[currentField]=1;
                if (debugMode) console.log(searchStr.substr(0,i) + " got to the end and we're in a where command so we baked out the field (" + currentField + ")");
            }
        }
        return fields;
    }


    inferSplitByField(search,postProcess) {
        if (postProcess) {
            if ($.trim(postProcess).charAt(0)!="|") {
                postProcess = " | " + postProcess;
            }
            search += postProcess;
        }
        search = search.replace(/\n/g," ");
        var match = search.match(this.SPLITBY_INFERRER);
        if ($.isArray(match) && match.length>1) {
            var command = match[2];
            var statsAndGroupBy = $.trim(match[3]);

            var splitBy = $.trim(match[4]);
            if (command=="chart") {
                if (splitBy.indexOf(" ")!=-1) {
                    splitBy = splitBy.split(" ");
                    splitBy = splitBy[splitBy.length-1];
                }
                else if (statsAndGroupBy.indexOf(" over ")==-1 && splitBy.indexOf(" ")==-1) {
                    return false;
                }
            }
            // if there are more than 2 functions then we can't return a *useful* splitBy field
            // to anyone anyway.   The implementation here is a bit of a cheap trick, but it works.
            var altered = statsAndGroupBy.replace("count ", "count(foo) ");
            // now we can just count opening parens and ignore all the "as" stuff.
            // Note - this will tend to not work with eval() madness.
            if (altered.split("(").length > 2) {
                return false;
            }

            splitBy = $.trim(splitBy);
            if (splitBy.indexOf(" ")!=-1) return false;
            return splitBy;
        }
        return false;
    }

    makeUnclonable(obj) {
        obj = $(obj[0]);
        obj.clone = function() { return this;}.bind(obj);
        return obj;
    }

    /**
     * called during Table Embedding to insert the $row.fields.someField$
     * and $row.fields.someField.rawValue$ keys into the relevant branch of
     * cloned modules.
     * also called by the Multiplexer
     */
    injectValuesIntoContext(clone, prefix, dict) {
        prefix = prefix || "";
        var escDict = $.extend({},dict);
        for (var key in escDict) {
            if (escDict.hasOwnProperty(key)) {
                escDict[key] = this.escapeForSearchLanguage(escDict[key]);
            }
        }
        var methodReference = clone.getContext;
        clone.getContext = function() {
            var context = methodReference.call(this);
            for (var key in dict) {
                if (dict.hasOwnProperty(key)) {
                    context.set(prefix+""+key, escDict[key]);
                    context.set(prefix+""+key + ".rawValue", dict[key]);
                }
            }
            return context;
        };
    }

    /**
     * NOTE: topLevelBlockIndex is only defined on the very first cloneBranch call from a new multiplexed branch.
     */
    cloneBranch(module, moduleParent, globalMultiplexId, insertionPoint, reasonsToBeInvisible, topLevelBlockIndex) {


        reasonsToBeInvisible = reasonsToBeInvisible || [];
        var visibilityReason = this.TEMPLATED_CHILDREN_VISIBILITY_REASON;
        module.show(visibilityReason);

        var clonedContainer = module.container.clone();
        clonedContainer.addClass("clonedModule");
        var idSuffix = "_" + globalMultiplexId;
        var cloneId = module.moduleId + idSuffix;

        clonedContainer.attr("id", cloneId);

        clonedContainer.find("input[type=radio]").each(function() {
            var newName = $(this).attr("name") + idSuffix;
            $(this).attr("name", newName);
        });
        clonedContainer.find("label[for]").each(function() {
            var newFor = $(this).attr("for") + idSuffix;
            $(this).attr("for", newFor);
        });

        clonedContainer.find("*[id]").each(function() {
            var newId = $(this).attr("id") + idSuffix;
            $(this).attr("id", newId);
        });

        if (!insertionPoint) insertionPoint = moduleParent.container;
        if (this.isInteger(topLevelBlockIndex)) {
            var multiplexBlockWrapper = $("<div>")
                .addClass("multiplexedBlock")
                .addClass(globalMultiplexId + "_multiplexedBlock")
                .attr("id",globalMultiplexId + "_multiplexedBlock_" + topLevelBlockIndex)
                .append($("<div>").addClass("multiplexedBlockInner").append(clonedContainer));
            insertionPoint.after(multiplexBlockWrapper);
        }
        else {
            insertionPoint.after(clonedContainer);
        }

        var moduleType = module.moduleType;
        var clonedParams = $.extend(true, {},module._params);
        try {
            var clonedModule = new this.modules[moduleType]($("#" + cloneId), clonedParams);
        }
        catch(e) {
            console.error("unexpected exception trying to clone a " + moduleType + " module")
            console.error(e);

        }

        // Note that we deliberately use the parent's context, and not its
        // getModifiedContext.  eg the table-embedded modules shouldn't inherit
        // $foo$ tokens from the table's drilldown context.
        clonedModule.baseContext = moduleParent.getContext();

        clonedModule.moduleId = cloneId;
        clonedModule.moduleType = module.moduleType;
        if (module.hugoSimpson) clonedModule.hugoSimpson = module.hugoSimpson;

        moduleParent.addChild(clonedModule);


        insertionPoint = clonedModule.container;
        var svu = this;
        module.withEachChild(function(child) {
            var retVal = svu.cloneBranch(child, clonedModule, globalMultiplexId, insertionPoint,reasonsToBeInvisible);
            insertionPoint = retVal[1];
        });


        module.hide(visibilityReason);
        for (var i=0;i<reasonsToBeInvisible.length;i++) {
            clonedModule.hide(reasonsToBeInvisible[i]);
        }

        clonedModule.markPageLoadComplete();
        clonedModule.withEachDescendant(function(descendantModule) {
            descendantModule.onHierarchyApplied();
            descendantModule.markPageLoadComplete();
        });

        return [clonedModule, insertionPoint];
    }

    getCurrentDisplayView() {
        return document.body.getAttribute("s:displayview") || this.getCurrentView();
    }

    getAutoCancelInterval() {
        return 60;
    }

    /**
     * utility method to merge 2 lists of filters without creating duplicates.
     */
    combineFilters(filterListA,filterListB) {
        var inBButNotA = [];
        var containedInA;
        for (var i=0,iLen=filterListB.length;i<iLen;i++) {
            containedInA = false;
            for (var j=0,jLen=filterListA.length;j<jLen;j++) {
                if (this.compareObjects(filterListA[j],filterListB[i])) {
                    containedInA = true;
                    break;
                }
            }
            if (!containedInA) {
                inBButNotA.push(filterListB[i]);
            }
        }
        return filterListA.concat(inBButNotA);
    }

    getSearchTermsFromFilters(filters) {
        var terms = [];
        var negation,field,value,term, operator;
        for (var i=0,len=filters.length;i<len;i++) {
            term = [];
            negation = filters[i].negation;
            field    = filters[i].field;
            value    = filters[i].value;

            // ONLY do the backslash escaping here. Note that further down
            // the double quotes are handled separately.
            value = this.escapeBackslashes(value);
            operator = filters[i].operator;

            if (negation) term.push("NOT ");
            if (field) term.push(field);

            if (operator) term.push(operator);
            else if (field) term.push("=");

            if (operator && ( operator!="=" && operator!="!=")) {
                //kinda weird, but just for consistency.
                term.push(this.escapeDoubleQuotes(value));
            } else {
                term.push(this.doubleQuoteValue(value));
            }
            terms.push(term.join(""));
        }
        return terms;
    }

    /**
     * used only by setDrilldownSearchTerms
     */
    getFiltersForOTHER(splitByField,data) {
        var filters = [];
        var unwantedFields= ["_offset","_span","_spandays","_time","OTHER"];
        var map = {};
        if ($.isArray(data)) {
            for (var i=0,len=data.length;i<len;i++) {
                map[data[i]] = 1;
            }
        } else {
            map = data;
        }
        for (var key in map) {
            if (key=="NULL") {
                filters.push({
                    "field":splitByField,
                    "value":"*"
                });
            }
            if (key.indexOf("VALUE_")==0) {
                key = key.replace("VALUE","");
            }
            if (map.hasOwnProperty(key) && key!="NULL" && map[key]!="0" && unwantedFields.indexOf(key)==-1) {
                filters.push({
                    "field":splitByField,
                    "operator": "!=",
                    "value":key
                });
            }
        }
        return filters;
    }

    getInferredSplitByField(context) {
        var search = context.getSplunkSearch() || "";
        var combinedSearch = search.toString();
        var postProcess = search.getPostProcess();
        return this.inferSplitByField(combinedSearch,postProcess);
    }

    setDrilldownSearchTerms(context, drilldownPrefix, xField, valueMap) {

        if (xField=="time") xField=false;


        context.set("sideview.xField", xField);
        context.set(drilldownPrefix + ".xField", xField);

        var splitByField = context.get(drilldownPrefix + ".splitByField");
        if (!splitByField) {
            splitByField = context.get("sideview.splitByField");
            context.set(drilldownPrefix + ".splitByField", splitByField);
        }

        var drilldownPrefixes = [];
        if (!context.has("sideview.drilldownPrefixes") && $.isArray(context.get("sideview.drilldownPrefixes"))) {
            drilldownPrefixes = context.get("sideview.drilldownPrefixes");
        }
        drilldownPrefixes.push(drilldownPrefix);
        context.set("sideview.drilldownPrefixes", drilldownPrefixes);

        var filters = [];


        if (!splitByField) {
            var inferred = this.getInferredSplitByField(context);
            if (inferred) {
                splitByField = inferred;
            }
        }
        if (splitByField) {
            var splitByValue = context.get(drilldownPrefix + ".splitByValue");
            if (!splitByValue) {
                splitByValue = context.get(drilldownPrefix + ".name2");
            }

            if (splitByValue=="OTHER") {
                filters = this.getFiltersForOTHER(splitByField,valueMap);
                context.set(drilldownPrefix + ".isOtherClick", true);
            }
            else if (splitByValue=="NULL") {
                filters.push({
                    "negation" : true,
                    "field" : splitByField,
                    "value" : "*"
                });
                context.set(drilldownPrefix + ".isNullClick", true);
            }
            else if (xField!=splitByValue && splitByValue!=null) {
                filters.push({
                    "field" : splitByField,
                    "value" : splitByValue
                });
            }
            var splitByTerms = this.getSearchTermsFromFilters(filters);
            context.set(drilldownPrefix + ".splitByFilters", JSON.stringify(filters));
            context.set(drilldownPrefix + ".splitByTerms", splitByTerms.join(" "));
        }
        if (xField && xField!="_time") {
            var xFilter = {
                "field" : xField,
                "value" : context.get(drilldownPrefix + ".xValue") || context.get(drilldownPrefix + ".value")
            };
            filters.push(xFilter);
            var xTerms = this.getSearchTermsFromFilters([xFilter]);
            context.set(drilldownPrefix + ".xFilter", JSON.stringify([xFilter]));
            context.set(drilldownPrefix + ".xTerm", xTerms.join(" "));
        }
        if (filters.length>0) {
            context.set(drilldownPrefix + ".filters", JSON.stringify(filters));

            var terms = this.getSearchTermsFromFilters(filters);
            context.set(drilldownPrefix + ".searchTerms", terms.join(" "));
        }
    }

    broadcastMessage(level, message) {
        console.log("this.broadcastMessage " + level + ", " + message);
        $("#messageBar")
            .html("")
            .append($("<div>")
                .addClass(level)
                .text(message)
            );
        console.error(message);
        console.trace();
    }

    clearMessages() {
        $("#messageBar").html("");
    }

    validateHierarchy(module) {
        var msgs = [];
        var n = module._children.length;

        if (module.getParam("requiresDownstreamModules")=="True" && n==0) {
            msgs.push(module.moduleType + " module requires downstream modules to do anything useful! Check the config for this page.");
        }
        if (module.getParam("forbidsDownstreamModules") == "True" && n>0) {
            msgs.push(module.moduleType + " module has downstream modules on this page, but this makes no sense! Check the config for this page.");
        }
        if (module.getParam("forbidsUpstreamModules")=="True" && module.parent) {
            msgs.push(module.moduleType + " module has an upstream parent module (of class=" + module.parent.moduleType + "), but this makes no sense! Check the config for this page.");
        }
        if (module.getParam("requiresUpstreamModules")=="True" && !module.parent) {
            msgs.push(module.moduleType + " module must have at least one module upstream but here it does not! Check the config for this page.");
        }
        for (var i=0;i<msgs.length;i++) {
            this.broadcastMessage("ERROR", msgs[i]);
        }
    }


    /**
     * version detection, to be used in the application.js files of dependent apps
     * and/or in the ModuleName.js files of dependent modules.
     *
     * returns int.
     * returns 0 if the versions are equal, -1 if v1<v2, and +1 if v1>v2
     */
    compareVersions(v1,v2) {
        var c1,c2,
            a1 = v1.split("."),
            a2 = v2.split(".");
		while (a1[a1.length-1]=="0") {
			a1.splice(-1)
		}
		while (a2[a2.length-1]=="0") {
			a2.splice(-1)
		}
        var len = Math.min(a1.length,a2.length);
        for (var i=0;i<len;i++) {
            c1 = parseInt(a1[i]);
            c2 = parseInt(a2[i]);
            if (c1 == c2) continue;
            else if (c1 < c2) return -1;
            else if (c1 > c2) return 1;
        }
        if (a1.length != a2.length) {
            if (a1.length > a2.length) return 1;
            else return -1;
        }
        return 0;
    }

    // USE THIS 98% OF THE TIME
    checkRequiredVersion(v2) {
        var ret = this.compareToCurrentVersion(v2);
        if (ret==-1) return false;
        return true;
    }

    // YOU PROBABLY DO NOT WANT TO USE THESE.
    compareToCurrentVersion(v2) {
        return this.compareVersions(this._currentVersion,v2);
    }

    getCurrentVersion() {
        return this._currentVersion;
    }

    getCurrentApp() {
        var app = document.body.getAttribute("s:app");
        if (app) return app;
        if (window.secretFramesetDict) return window.secretFramesetDict["app"];
        throw "FATAL - cannot determine current app";
    }

    getCurrentView() {
        var view = document.body.getAttribute("s:view");
        if (view) return view;
        if (window.secretFramesetDict) return window.secretFramesetDict["view"];
        throw "FATAL - cannot determine current view";
    }

    getCurrentUser() {
        var user = document.body.getAttribute("s:user");
        if (user) return user;

        if (window.secretFramesetDict) return window.secretFramesetDict["user"];

        throw "FATAL - cannot determine current user";
    }

    getCurrentAppVersion() {
        var version = this.getConfigValue("APP_VERSION");
        if (version) return version;
        throw "FATAL - cannot determine current app version";
    }

    // boo. $.browser was removed and jqmigrate doesn't work properly with it.
    isIE() {
        if (this.isIE==undefined) {
            this.isIE = (navigator.appName == "Microsoft Internet Explorer" ||  !!(navigator.userAgent.match(/Trident/) || navigator.userAgent.match(/rv 11/)));
        }
        return this.isIE;
    }

    // TEMPORARY HOLDING PLACE FOR MENU METHODS,
    // WHILE WE PULL UP THIS CODE AND MAKE IT A PROPER HOME.
    openTopLevelMenu(container, triggerLi, evt) {
        // close all open menus.  ALL OF THEM on the page
        $("ul.svMenu ul.open").removeClass("open");

        var anchor = $(evt.target);
        if (anchor.prop("tagName")=="SPAN" && anchor.hasClass("arrow")) {
            anchor = anchor.parent();
        }
        // I'm not sure why this was here but it seems useless/bad now
        //if (!anchor.parent().hasClass("topLevel")) {
        //    evt.preventDefault();
        //    return false;
        //}
        triggerLi = $(triggerLi);
        // containment will cause this to fire on all clicks.
        if (!triggerLi.hasClass("topLevel")) {
            evt.preventDefault();
            return false;
        }

        var subMenus = triggerLi.find("ul");

        if (subMenus.length == 0) {
            return true;
        } else {
            evt.preventDefault();
            var subMenu = $(subMenus[0]);
            this.openCurrentMenuBranch(container, subMenu);


            if (subMenu.offset().left + subMenu.width()> $(window).width()) {
                subMenu.css("left", triggerLi.offset().left - subMenu.width() + triggerLi.width());
            }

            evt.stopPropagation();
            return false;
        }
    }

    openCurrentMenuBranch(container, openMenu) {
        $("ul",container).each(function() {
            if (openMenu[0] === this || $.contains(this,openMenu[0])) {
                $(this).addClass("open");
            }
            else {
                $(this).removeClass("open");
            }
        });
    }
    renderMenuDivider(menuContainer) {
        var menuItem = $("<li>");
        var divider = $("<div>").addClass("divider");
        menuItem.append(divider);
        menuContainer.append(menuItem);
    }
    renderMenuItem(menuContainer, href, label, subMenu, customAttributes) {
        if (!customAttributes) customAttributes={};
        var menuItem = $("<li>");
        var link = $("<a>").text(label);
        link.attr("href",href);

        if (menuContainer.hasClass("svMenu")) {
            menuItem.addClass("topLevel");
            if (subMenu) {
                link.append($("<span>").addClass("arrow").text(" "));
            }
        }
        for (var att in customAttributes) {
            link.attr("s:" + att, customAttributes[att]);
        }
        menuItem.append(link);
        if (subMenu) {
            link.addClass("hasSubMenu");
            menuItem.addClass("hasSubMenu");
            subMenu.appendTo(menuItem);
        }
        menuContainer.append(menuItem);
    }
    openSubMenu(container,triggerLi, evt) {
        triggerLi = $(triggerLi);
        if (triggerLi.hasClass("topLevel")) return false;

        var subMenus = triggerLi.find("ul");

        if (subMenus.length==0) {
            // this case will never happen.
            return false;
        }

        var subMenu = $(subMenus[0]);
        var parentMenu = triggerLi.parent();

        this.openCurrentMenuBranch(container,subMenu);

        subMenu.css("left", parentMenu.width());
        // Is the right edge going past the windows right edge?
        // If so, we flip it, and put the submenu on the left.
        if (subMenu.offset().left + subMenu.width()> $(window).width()) {
            subMenu.css("left",-(parentMenu.width()+2) );
            //subMenu.css("z-index","20");
        }

        // Is the bottom edge going past the window's bottom?
        if ($(window).height() - triggerLi.offset().top - subMenu[0].scrollHeight < 0) {
            subMenu.css("top", $(window).height() - triggerLi.offset().top - subMenu[0].scrollHeight);
        }
        else {
            subMenu.css("top", 0);
        }

        // OK,  NOW is either the bottom edge going past the window's bottom,  or the top edge going past the window's top?
        var pastTop = subMenu.offset().top < 0;
        var pastBottom = subMenu.offset().top + subMenu[0].scrollHeight > $(window).height();

        if (pastTop ) {
            subMenu.css("overflow-y","auto");
            subMenu.css("top","0");
        }
        if (pastBottom) {
            subMenu.css("overflow-y","auto");
            subMenu.css("height",$(window).height() - triggerLi.offset().top);
        }
        pastTop = subMenu.offset().top < 0;
        pastBottom = subMenu.offset().top + subMenu[0].scrollHeight > $(window).height();
        if (!pastTop && !pastBottom) {
            subMenu.css("overflow-y","visible");
            subMenu.css("height","auto");
        }
        evt.stopPropagation();
        evt.preventDefault();
        return false;
    }

    handleMenuMouseOver(container, triggerLi, evt) {
        if (triggerLi.hasClass("hasSubMenu")) {
            this.openSubMenu(container, triggerLi, evt);
        }
        else {
            $("ul",container).each(function() {
                if (!$.contains(this,triggerLi[0])) {
                    $(this).removeClass("open");
                }
            });
        }
    }


    // TODO these need to be revisited
    closeAllMenus(container) {
        $("ul.svMenu ul", container).removeClass("open");
    }

    // TODO and I'm not wild about this particular closure...
    bindSharedMenuEvents(container) {
        function closeMenus() {
            $("ul.svMenu ul", container).removeClass("open");
        }
        $(document).click(closeMenus);

        // keypress isn't fast enough.
        // The user wants it closed so OMG CLOSE IT!
        $("body").keydown(function(e){
            if (e.which == 27){
                closeMenus();
            }
        });
    }

    launchJobInspector(sid) {
        if (!sid) {
            this.broadcastMessage("error",_("no sid supplied for Job Inspector"));
        }
        var args = {
            sid: sid
        };
		var splunkVersion = this.getConfigValue("SPLUNK_VERSION");
		var atLeast8 = this.compareVersions(splunkVersion, "8.0.0")>-1
		var url;
        if (atLeast8) {
			var app = this.getCurrentApp();
			url = this.make_url("manager",app, "job_inspector") + "?" + this.dictToString(args);
		}
        else {
			args["namespace"] = this.getCurrentApp();
			url = this.make_url("search","inspector") + "?" + this.dictToString(args);
		}
        return window.open(url, "inspector");
    }

    traceWindowWidthForScreenshots() {
        console.error("you are in screenshot mode.  hope you know what you're doing. Refresh the page to 'get out' of this mode.");
        $(".appHeader").hide();
        var callback = function(){
            var w = $(window)
            var mastheadHeight = $(".appHeader").height()
            console.log(sprintf("%s, %s (shooting for 1165x800)", w.width(), w.height(),  mastheadHeight));
        }
        callback();
        $(window).resize(callback)

    }
}



    if (window.Sideview) {
        console.error("that isn't good. we went to make the SideviewUtils object and there was already something there. Please go find whatever put this thing here and kill it with fire. kthxbai.")
    }

    var sideview = new SideviewUtils();
    window.Sideview = sideview;
    window.Sideview.utils = sideview;
    window.Splunk = {};
    window.Splunk.util = sideview;
    window.Splunk.Module = {};
    return sideview;
});