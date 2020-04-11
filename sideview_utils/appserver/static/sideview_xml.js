// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.


Sideview.customBehaviors = {};
Sideview.registeredCustomBehaviors = {};  //DEPRECATED as of 1.3

$(document).ready(function() {
    /* It is lame, but to actually move this into DateTime.js trips another 
     * one of the bugs in Splunk's module js minification. I don't have the 
     * patience to unwind exactly what the minification code is screwing up
     * right now, so I'm leaving this defined here.
     */
    if (Splunk.Module.DateTime) {
        jQuery.fn.yellowfade = function () {
            $(this).each(function () {
                var el = $(this);
                $("<div/>")
                .width(el.outerWidth())
                .height(el.outerHeight())
                .css({
                    "position": "absolute",
                    "left": el.offset().left,
                    "top": el.offset().top,
                    "background-color": "#ffff99",
                    "opacity": ".7",
                    "z-index": "9999999"
                }).appendTo('body').fadeOut(1500).queue(function () { $(this).remove(); });
            });
        }
    }
});

if (typeof(Splunk)!="undefined" && Splunk.Module) {
    $.extend({
        bind: function(func, scope) {
          return function() {
            return func.apply(scope, arguments);
          }
        }
    });
    jQuery.fn.reverse = [].reverse;
        
    $(document).ready(function() {
        var qsDict = Sideview.utils.stringToDict(document.location.search.substring(1));
        if (qsDict.hasOwnProperty("showsvconsole") && Sideview.utils.normalizeBoolean(qsDict["showsvconsole"])) {
            window.setTimeout("Sideview.utils.launchConsole(false);",0);
        }
    })

}


$(window).bind('beforeunload', function(){ 
    if (Splunk.Globals.Jobber && $(document.body).attr("s:onunloadcanceljobs").toLowerCase()=="true") {
        //console.error("SV - we have a Jobber at least");
        Splunk.Globals.Jobber.listJobs(function(job){
        //console.error(job.getSearchId() + "SV - can be cancelled yay");
            return (job.canBeAutoCancelled());
        }).cancel();

    }
    $(document).unbind();
    $(this).unbind();
});




Sideview.XMLUtils = {
    _consoleWindow:null,
    _consoleDocument:null,
    _consoleBody : null,
    
    customTimeRanges: [],
    customCssClassesByModule: {},
    mvTokenRegex: /(.+)\[(\d+)\]$/,
    SAVED_SEARCH_PATCHER_CLASS: "Splunk.Module.CustomRESTForSavedSearch",
    TEMPLATED_CHILDREN_VISIBILITY_REASON: "never show templated children",
    
    moduleLoadStates: {
        WAITING_FOR_INITIALIZATION:1,
        WAITING_FOR_HIERARCHY:2,
        WAITING_FOR_CONTEXT:6,
        HAS_CONTEXT:7
    },

    getModule: function(moduleId) {
        try {
            return Splunk.Globals.ModuleLoader.getModuleInstanceById(moduleId);
        } catch(e) {
            console.error(e)
        }
        return false;
    },

    getModuleFromDOMElement: function(el) {
        el = $(el);
        if (el.hasClass("SplunkModule")) {
            return Sideview.utils.getModule(el.attr("id"));
        } else if (el.parent()){
            return Sideview.utils.getModuleFromDOMElement(el.parent());
        }
    },

    getBaseClass: function(requiresResults) {
        if (requiresResults) {
            if (Sideview.hasOwnProperty("Module")) return Sideview.Module
            else return Splunk.Module.DispatchingModule;
        }
        else return Splunk.Module;
    },

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
    getValueForFormElementSelection: function(name,context) {
        urlDict = {};
        if (Sideview.hasOwnProperty("savedContextDict")) {
            urlDict = $.extend(urlDict, Sideview.savedContextDict);
        }
        urlDict = $.extend(urlDict,Sideview.utils.getURLDict());
        var value = context.get(name + ".rawValue") || context.get(name);
        // if this same value is in the URL, just in non-HTML-escaped form...
        if (!value) return value;
        else if (urlDict.hasOwnProperty(name) && Sideview.utils.escapeHTML(urlDict[name]) == value) {
            // then use the un-escaped one. 
            return urlDict[name]
        } else {
            return value;
        }
    },

    htmlUnescapeContext: function(context) {
        var urlDict = Sideview.utils.getURLDict();
        var value;
        for (key in urlDict) {
            if (urlDict.hasOwnProperty(key)) {
                value = context.get(key);
                if (Sideview.utils.escapeHTML(urlDict[key])==value) {
                    context.set(key, urlDict[key]);
                }
            }
        }
        return context;
    },

    

    contextToQueryString: function(context) {
        var keys = [];
        for (var key in context._root) {
            if (context.has(key)) keys.push(key);
        }
        keys = keys.sort();

        var text = [];
        var endsWith = Sideview.utils.endsWith;
        var ignoredKeys = {
            "search":1,"autoRun":1,"search.name":1,"sideview.splitByField":1,"sideview.xField":1,"request.ui_edit_view":1,"results.count":1,"results.offset":1,"results.upstreamPagerCallback":1
        };

        for (var i=0,len=keys.length;i<len;i++) {
            var key = keys[i];
            if ((!key) || ignoredKeys.hasOwnProperty(key)) continue;
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
    },

    getConfigValue: function(key, fallback) {
        var c=window.$C;
        if (c && c.hasOwnProperty(key)) return c[key];
        else return fallback || "";
    },

    make_url: function() {
        var url = [];
        var rootEndpoint = Sideview.utils.getConfigValue("MRSPARKLE_ROOT_PATH", "/");
        if (rootEndpoint=="/") rootEndpoint="";
        url.push(rootEndpoint);

        url.push(Sideview.utils.getConfigValue("LOCALE", "en-US"));
        for (var i=0,len=arguments.length,arg=null; i<len; i++) {
            arg = arguments[i];
            while (arg.charAt(0)=="/") arg = arg.slice(1);
            while (arg.charAt(arg.length-1)=="/") arg = arg.slice(0,arg.length-1);
            url.push(arg);
            if (arg=="modules" || arg =="static" && i<2) {
                var buildNumber = Sideview.utils.getConfigValue("BUILD_NUMBER");
                if (buildNumber) {
                    var extraBits = ["@" + buildNumber];
                    var buildPushNumber = Sideview.utils.getConfigValue("BUILD_PUSH_NUMBER");
                    if (buildPushNumber>0) {
                        extraBits.push("." + buildPushNumber);
                    }
                    if (i<len-1 && arguments[i+1] == "app") {
                        var appBuildNumber = Sideview.utils.getConfigValue("APP_BUILD");
                        if (appBuildNumber>0) {
                            extraBits.push(":" + appBuildNumber);
                        }
                    }
                    url.push(extraBits.join(""));
                }
            }
        }
        return url.join("/");
    },

    contextIsNull: function(context) {
        return $.isEmptyObject(context._root);
    },

    launchConsole: function(focus) {
        focus = focus || false;
        var debugPopup = window.open('about:blank', 'sideview_console', 'toolbar=no, directories=no, location=no, status=yes, menubar=no, resizable=yes, scrollbars=yes, width=1200, height=800');
        debugPopup.document.writeln('<html><head><title>Console</title></head><body onload="opener.Sideview.utils.registerConsole(window,document, \'' + focus + '\')">Loading...</body></html>');
        debugPopup.document.close();
    },

    registerConsole: function(consoleWindow, consoleDocument, focus) {
        if (Sideview.utils.normalizeBoolean(focus)) consoleWindow.focus();
        Sideview.utils._consoleWindow   = consoleWindow;
        Sideview.utils._consoleDocument = consoleDocument;
        Sideview.utils._consoleBody = $(consoleDocument).find("body");

        var ml = Splunk.Globals["ModuleLoader"];
        ml._withEachModule(ml._modules, function(module) {
            $(module.container).mouseover(function(evt) {
                var wob = $("<div>");
                var context = module.getContext();
                var modifiedContext = module.getModifiedContext();
                wob.append(
                    $("<h2>").text("Class = " + module.moduleType),
                    $("<h4>").text("Id = " + module.moduleId),
                    $("<h4>").text("parent class = " + ((module.parent) ? module.parent.moduleType : "(has no parent. This is a top level module)"))
                );

                if (module.parent) {
                    wob.append(
                        $("<h4>").text("parent id = " + module.parent.moduleId)
                    );
                }

                wob.append(
                    $("<h4>Search values</h4>")
                );
                var search = context.get("search");
                var text = [];
                text.push("search=" + search.toString());
                var range = search.getTimeRange()
                text.push("timeRange.toConciseString() = " + range.toConciseString());
                text.push("timeRange.earliest = " + range.getEarliestTimeTerms());
                text.push("timeRange.latest = " + range.getLatestTimeTerms());
                if (search.getSavedSearchName()) {
                    text.push("saved search name=" + search.getSavedSearchName());
                }
                wob.append(text.join("<br>"))

                var keys = [];
                var modifiedKeys = [];
                
                for (var key in context._root) {
                    if (key=="search") continue;
                    if (context.has(key)) {
                        keys.push(key);
                    }
                }
                for (var key in modifiedContext._root) {
                    if (key=="search") continue;
                    if (modifiedContext.has(key)) {
                        modifiedKeys.push(key);
                    }
                }
                for (var i=modifiedKeys.length-1;i>=0;i--) {
                    var key = modifiedKeys[i];
                    if (keys.indexOf(key)!=-1) {
                        delete modifiedKeys[i];
                    }
                }

                keys = keys.sort();
                modifiedKeys = modifiedKeys.sort();

                wob.append(
                    $("<h4>Context keys added/modified for downstream modules</h4>")
                );
                
                text = [];
                for (var i=0,len=modifiedKeys.length;i<len;i++) {
                    if (modifiedKeys[i]) {
                        text.push(modifiedKeys[i] + " = " + modifiedContext.get(modifiedKeys[i]));
                    }
                }
                wob.append(text.join("<br>"));

                wob.append(
                    $("<h4>Context values received from upstream</h4>")
                );
                text = [];
                for (var i=0,len=keys.length;i<len;i++) {
                    text.push(keys[i] + " = " + context.get(keys[i]));
                }
                wob.append(text.join("<br>"));

                Sideview.utils.log(wob, true);
            })
        });
    },

    log: function(htmlElement, replaceEntireBody) {
        replaceEntireBody = replaceEntireBody || false;
        if (Sideview.utils._consoleBody) {
            if (replaceEntireBody) Sideview.utils._consoleBody.html('');
            Sideview.utils._consoleBody.append(htmlElement);
            Sideview.utils._consoleBody.append($('<div style="border-top:1px solid #ccc"></div>'));
        } else {
            console.error("SV log called but there's no console");
            console.error(htmlElement);
        }
    },

    whyHidden: function(moduleId) {
        module = Sideview.utils.getModule(moduleId);
        var modes = [];
        for (var mode in module._invisibilityModes) {
            if (module._invisibilityModes.hasOwnProperty(mode)) modes.push(mode);
        }
        console.log(moduleId + " is invisible because of " + modes);
    },

    getLogger: function() {
        if (typeof(console)!="undefined" && typeof(console.error)!="undefined") {
            if (!console.debug) console.debug = console.info;
            console.error = console.info;
            return console;
        }
        return Sideview.utils.getCustomLogger();
    },

    /** 
     * template method. Override in specific cases as necessary
     */
    getCustomLogger: function() {
        var c = {};
        c.error = c.warn = c.info = c.log = c.debug = function() {};
        return c;
    },

    /**
     * CUSTOMBEHAVIOR, CSSCLASS METHODS
     */

    /**
     * Called in the constructors for all Sideview modules. 
     */ 
    applyCustomProperties: function(module) {
        if (module.getParam("customBehavior")) {
            Sideview.utils.applyCustomBehavior(module);
        }
        if (module.getParam("cssClass")) {
            Sideview.utils.applyCustomCssClass(module);
        }
    },

    applyCustomCssClass: function(module, context) {
        var cssClass = module.getParam("cssClass");
        // TODO - port functions from URLLoader to here, and getUrlDict as the
        //        fallback.
        if (!context) context = new Splunk.Context();
        cssClass = Sideview.utils.replaceTokensFromContext(cssClass, context);
        
        
        // ok but only alphanumeric, hyphens and underscores please.
        cssClass  = cssClass.replace(/[^\w\s-]|_/g, "_");
        var newCssClasses = cssClass.split(" ");
        
        if (!Sideview.utils.customCssClassesByModule.hasOwnProperty(module.moduleId)) {
            Sideview.utils.customCssClassesByModule[module.moduleId] = newCssClasses;
        } 
        else {
            var previouslyLoadedClasses = Sideview.utils.customCssClassesByModule[module.moduleId];
            // bake the new ones into the record. All else is rendering from now on.
            Sideview.utils.customCssClassesByModule[module.moduleId] = newCssClasses;
            for (var i=previouslyLoadedClasses.length-1;i>=0;i--) {
                
                var c=previouslyLoadedClasses[i];
                
                // not in the new custom list
                if (newCssClasses.indexOf(c)==-1) {
                    // make sure to never remove these classnames.
                    if (c != "Splunk.Module." + module.moduleType && c!="SplunkModule") {
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
    },

    /**
     * Called by applyCustomProperties, which is called in all module 
     * constructors.
     */
    applyCustomBehavior: function(module) {
        var behaviorClass = module.getParam("customBehavior");
        if (!Sideview.customBehaviors.hasOwnProperty(behaviorClass)) {
            Sideview.utils.registerCustomBehavior(module);
            return;
        }
        Sideview.customBehaviors[behaviorClass](module);
    },

    /**
     * NOT TO BE CALLED WITHIN DOCUMENT.READY()
     */ 
    declareCustomBehavior: function(behaviorClass, func) {
        if (Sideview.customBehaviors.hasOwnProperty(behaviorClass)) {
            alert('App error - a customBehavior can only be defined once. Two definitions for ' + behaviorClass + ' are defined in this app');
        }
        else {
            Sideview.customBehaviors[behaviorClass] = func;
        }
    },


    /**
     * LEGACY CUSTOMBEHAVIOR METHODS,  DEPRECATED as of 1.3
     * registerCustomBehavior was designed to be called after document.ready 
     * Unfortunately that also meant that they could be registered after the 
     * autoRun push had begin.  Therefore if you were using a customBehavior 
     * to stitch in special search language, that search language would 
     * "miss the boat" in many cases on the initial autoRun search. 
     * 
     */
    registerCustomBehavior: function(module) {    //DEPRECATED as of 1.3
        var behaviorClass = module.getParam("customBehavior");
        if (!Sideview.registeredCustomBehaviors.hasOwnProperty(behaviorClass)) {
            Sideview.registeredCustomBehaviors[behaviorClass] = [];
        }
        Sideview.registeredCustomBehaviors[behaviorClass].push(module);
    },

    getModulesByCustomBehavior: function(behaviorClass) {  //DEPRECATED as of 1.3
        if (!Sideview.registeredCustomBehaviors.hasOwnProperty(behaviorClass)) {
            alert("developer misconfiguration - there is no custom module behavior named " + behaviorClass + ". Possibly you are trying to get the reference before document.ready().");
            return [];
        }
        return $.extend(true, Sideview.registeredCustomBehaviors[behaviorClass], [])
    },

    forEachModuleWithCustomBehavior: function(behaviorClass, func) {  //DEPRECATED as of 1.3
        var logger = Sideview.utils.getLogger();
        logger.warn("forEachModuleWithCustomBehavior has been deprecated as of 1.3. You should use declareCustomBehavior instead. (customBehavior=" + behaviorClass + ")  See SVU docs.");
        if (Sideview.registeredCustomBehaviors.hasOwnProperty(behaviorClass)) {
            $.each(Sideview.utils.getModulesByCustomBehavior(behaviorClass), function(i, module) {
                func(i,module);
            });
        }
    },

    

    /**
     * given a template (containing $foo$ tokens), and a context, 
     * populate all the tokens from the context.  Including $name$ as this.name
     * and $value$ as the passed value. 
     * This treatment of $name$ and $value$ is a common convention across 
     * Sideview modules.
     * NOTE that $value$ is assumed to ALREADY be backslash escaped.
     */
    templatize: function(context, template, name, value) {
        if (template && value) {
            var c = context.clone();
            c.set("name", name);
            c.set("value", value);
            c.set(name, value);
            return Sideview.utils.replaceTokensFromContext(template, c);
        } 
        return value;
    },

    safeTemplatize: function(context,template,name,value) {
        value = Sideview.utils.escapeBackslashes(value);
        if (value=="" || value==null) return ""
        if (!template) return value;
        if (Sideview.utils.isValueNestedInsideDoubleQuotes(template)) {
            value = value.replace(/"/g, "\\\"");
        }
        return Sideview.utils.templatize(context, template, name, value);
    },

    
    
    

    /**
     * lame, but useful because SplunkWeb has a nasty habit of calling trim 
     * on param values, and SOME Sideview modules workaround this by allowing
     * leading/trailing plus signs instead of space chars.
     */
    replacePlusSigns: function(s) {
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
    },
    
    
    
    

    getReportSearch: function(job) {
        if (job && job.hasOwnProperty("_reportSearch") && $.trim(job._reportSearch)) {
            return job._reportSearch;
        }
        return false;
    },



    mightNeedStatusBuckets: function(search) {
        if (search.hasOwnProperty("_needsStatusBuckets")) return search._needsStatusBuckets;

        var commands = Sideview.utils.getCommands(search.toString());

        var transforming = Sideview.utils.definitelyTransformingCommands
        var nonTransforming = Sideview.utils.definitelyNonTransformingCommands
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
    },

    

    

    /**
     * given a string containing zero or more "$foo$" tokens, 
     * replace each of the tokens with the context object's value for that 
     * token.  (ie replace $foo$ with context.get("foo"))
     * 
     * "$$" does not trigger dynamic replacement and instead 
     * gets replaced by a single literal "$" in the output.
     */
    replaceTokensFromContext: function(s, context) {
        if (!s) return "";
        var within = false;
        var currentTokenArr = [];
        var currentTokenName;
        var out = [];
        
        for (var i=0,len=s.length;i<len;i++) {
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

                    if (currentTokenName.match(Sideview.utils.mvTokenRegex)) {
                        var matches = currentTokenName.match(Sideview.utils.mvTokenRegex);
                        if (matches && matches.length>1) {
                            value = context.get(matches[1])
                            if ($.isArray(value)) {
                                out.push(value[matches[2]])
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
        return out.join("")
    },
    
    findDynamicKeys: function(str) {
        var allKeys = [];

        // sneaky mole is sneaky.
        var mole = new Splunk.Context();
        mole.get = function(name) {allKeys.push(name);}
        Sideview.utils.replaceTokensFromContext(str, mole);
        
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
    },

    withEachContextValue: function(context, arr, callback) {
        for (var i=0,key,len=arr.length; i<len; i++) {
            key = arr[i];
            if (!context.has(key)) continue;
            context.set(key, callback(context.get(key).toString()));
        }
    },

    loadSavedSearch: function(ssWob, group) {
        if (!ssWob || !ssWob.hasOwnProperty("search")) return new Splunk.Search("foo NOT foo ( the given saved search does not exist )");
        var search = new Splunk.Search(ssWob["search"]);
        search.setSavedSearchName(ssWob.name);
        var earliest = ssWob["dispatch.earliest_time"];
        var latest   = ssWob["dispatch.latest_time"];
        if (earliest=="0" || !latest) {
            earliest=latest="all";
        }
        var range = new Splunk.TimeRange(earliest,latest);

        search.setTimeRange(range);
        var jobJSON = ssWob["job"];
        if (jobJSON) {
            job = new Splunk.Job();
            job.updateByTicketValues(jobJSON);
            job.setAsAutoCancellable(false);
            search.job = job;
            $(document).trigger('jobResurrected', [job, group]);
        }
        return search;
    },
    getAbsoluteTimeRange: function(search) {
        var jobRange = search.getJob().getTimeRange();
        
        if (!jobRange.isAllTime()) return jobRange;

        var searchRange  = search.getTimeRange();
        
        // handles the cases where we havent heard from Jobber yet.
        if (searchRange.isAbsolute()) {
            return searchRange;
        } else {
            // FAIL. Splunk's API becomes a little deranged in all time searches. 
            // this is the best we can do. 
            var sortaEarliest = search.getJob()._createTime;
            var sortaLatest   = search.getJob()._cursorTime;
            if (sortaEarliest && sortaLatest) {
                var range = new Splunk.TimeRange(sortaEarliest,sortaLatest);
                return range;
            }
            return;
        }
    },
    parseDate: function(str, timeFormat) {
        if (timeFormat=="%s.%Q") {
            d = new Date();
            d.setUTCSeconds(str);
            if (isNaN(d.getTime())) return false;
            return d;
        }
    },
    getTimezoneOffsetDelta: function(serverOffsetThen, d) {
        if (!Sideview.utils.isInteger(serverOffsetThen)) return 0;
        return -60000 * (serverOffsetThen + d.getTimezoneOffset());
    },

    setStandardTimeRangeKeys: function(context, fillExplicitAllTimeArgs, optionalSearch) {
        var search = optionalSearch || context.get("search");
        if (!search) return context;
        var range = search.getTimeRange();
        var earliest = range.getEarliestTimeTerms();
        var latest = range.getLatestTimeTerms();
        if (fillExplicitAllTimeArgs) {
            latest=(!latest)? "all":latest;
            earliest=(!earliest || earliest==0)? "all":earliest;
        }
        context.set("search.timeRange.earliest", earliest);
        context.set("search.timeRange.latest",   latest);

        var stanza, header_label;
        // this loop only seems to add about 0.2ms if anyone else is keeping score.
        for (var i=0,len=Sideview.utils.customTimeRanges.length; i<len; i++) {
            stanza = Sideview.utils.customTimeRanges[i];
            if (stanza["earliest_time"] == earliest 
                    && stanza["latest_time"] == latest
                    && "header_label" in stanza) {
                header_label = stanza["header_label"];
                break;
            }
        }
        if (!header_label) header_label = range.toConciseString();
        context.set("search.timeRange.label", header_label);
        return context;
    },

    setStandardJobKeys: function(context, includePrefix, optionalSearch) {
        var search = optionalSearch || context.get("search");
        if (!search.isJobDispatched()) return context;
        var job = search.getJob();
        var pfx = (includePrefix && !job.isDone()) ? "&#8805;" : "";
        
        context.set("results.sid", job.getSearchId());
        context.set("results.isDone", job.isDone());
        context.set("results.eventSearch", job.getEventSearch() || "");
        var expandedSearch = job.getEventSearch() || "";
        var reportSearch = Sideview.utils.getReportSearch(job)
        if (reportSearch) {
            context.set("results.reportSearch", reportSearch);
            expandedSearch += " | " + reportSearch;
        }
        context.set("results.expandedSearch", expandedSearch);

        context.set("results.count",pfx + job.getResultCount());
        if (job.getResultCount() > 1) {
            context.set("results.pluralize","s");
        }
        context.set("results.eventCount", pfx + job.getEventCount());
        context.set("results.resultCount", pfx + job.getResultCount());
        context.set("results.scanCount", pfx + job.getScanCount());
        context.set("results.eventAvailableCount", pfx + job.getEventAvailableCount());
        context.set("results.eventFieldCount", pfx + job.getEventFieldCount());


        var p = job.getDoneProgress();
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
    },

    /**
     * there is an ugly bug in 5.0, where the saved search names are the full 
     * EAI path to the savedsearch entity,  but where the actual name part 
     * of that path is DOUBLE ESCAPED.  Even though the rest of the string 
     * is only singly-escaped. 
     * Although anything we do at this point is problematic,  the best we can 
     * do is check for hte new 5.0 convention by looking for "/" chars, and 
     * then manually decoding the name part one extra time...   
     */
    patchDoubleEscapedSavedSearchNames: function(searchName) {
        // should only be hit in Splunk 5.0 and up.
        if (searchName.indexOf("/services")==0) {
            segments = searchName.split("/");
            searchName = segments[segments.length-1];
            // 100% ick.   This is the death knell for both 
            // Appbar and default.xml.  In the long run this code is 
            // unacceptable and we'll have to give Sideview developers 
            // a new module that can replace AppBar and probably the whole
            // default.xml system with it.
            searchName = decodeURIComponent(searchName);
            // Although the above line might look normal,   at this point in 
            // the code the string has ALREADY been decoded once.
        }
        return searchName;
    },
    
    /**
     * utility method to merge 2 lists of filters without creating duplicates.
     */
    combineFilters: function(filterListA,filterListB) {
        var inBButNotA = [];
        var containedInA;
        for (var i=0,iLen=filterListB.length;i<iLen;i++) {
            containedInA = false;
            for (var j=0,jLen=filterListA.length;j<jLen;j++) {
                if (compareObjects(filterListA[j],filterListB[i])) {
                    containedInA = true;
                    break;
                }
            }
            if (!containedInA) {
                inBButNotA.push(filterListB[i]);
            }
        }
        return filterListA.concat(inBButNotA);
    },

    getSearchTermsFromFilters: function(filters) {
        var terms = [];
        var negation,field,value,term, operator;
        for (var i=0,len=filters.length;i<len;i++) {
            term = [];
            negation = filters[i].negation;
            field    = filters[i].field;
            value    = filters[i].value;
            
            // ONLY do the backslash escaping here. Note that further down 
            // the double quotes are handled separately.
            value = Sideview.utils.escapeBackslashes(value);
            operator = filters[i].operator;

            if (negation) term.push("NOT ");
            if (field) term.push(field);

            if (operator) term.push(operator);
            else if (field) term.push("=");
            
            if (operator && ( operator!="=" && operator!="!=")) {
                //kinda weird, but just for consistency.
                term.push(Sideview.utils.escapeDoubleQuotes(value));
            } else {
                term.push(Sideview.utils.doubleQuoteValue(value));
            }
            terms.push(term.join(""));
        }
        return terms;
    },

    /**
     * used only by setDrilldownSearchTerms
     */
    getFiltersForOTHER: function(splitByField,data) {
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
        for (key in map) {
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
    },

    getInferredSplitByField: function(context) {
        var search = context.get("search") || "";
        var combinedSearch = search.toString();
        var postProcess = search.getPostProcess();
        return Sideview.utils.inferSplitByField(combinedSearch,postProcess);
    },

    escapeLegacyKeyValues: function(context, drilldownPrefix) {
        var key,upperKey,value;
        var keys = ["value","name","value2","name2"];
        for (var i=0,len=keys.length;i<len;i++) {
            key = keys[i];
            upperKey = key.charAt(0).toUpperCase() + key.substring(1);
            value = context.get(drilldownPrefix + "." + key);
            context.set(drilldownPrefix + ".raw" + upperKey, value);
            context.set(drilldownPrefix + "." + key, Sideview.utils.escapeForSearchLanguage(value));
        }
    },

    setDrilldownSearchTerms: function(context, drilldownPrefix, xField, valueMap) {
        context.set("sideview.xField", xField);
        context.set(drilldownPrefix + ".xField", xField);

        if (!context.get(drilldownPrefix + ".splitByField")) {
            var splitByField = context.get("sideview.splitByField");
            context.set(drilldownPrefix + ".splitByField", splitByField);
        }

        var drilldownPrefixes = [];
        if (!context.has("sideview.drilldownPrefixes") && $.isArray(context.get("sideview.drilldownPrefixes"))) {
            drilldownPrefixes = context.get("sideview.drilldownPrefixes");
        }
        drilldownPrefixes.push(drilldownPrefix);
        context.set("sideview.drilldownPrefixes", drilldownPrefixes)

        var filters = [];
        var terms = [];

        if (!splitByField) {
            var inferred = Sideview.utils.getInferredSplitByField(context);
            if (inferred) {
                splitByField = inferred;
            }
        }
        if (splitByField) {
            var xField = context.get(drilldownPrefix + ".name");
            var splitByValue = context.get(drilldownPrefix + ".splitByValue");
            if (!splitByValue) {
                splitByValue = context.get(drilldownPrefix + ".name2");
            }
            
            if (splitByValue=="OTHER") {
                filters = Sideview.utils.getFiltersForOTHER(splitByField,valueMap);
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
            terms = Sideview.utils.getSearchTermsFromFilters(filters);
            context.set(drilldownPrefix + ".splitByFilters", JSON.stringify(filters));
            context.set(drilldownPrefix + ".splitByTerms", terms.join(" "));
        }
        if (xField && xField!="_time") {
            var xFilter = {
                "field" : xField,
                "value" : context.get(drilldownPrefix + ".rawValue") || context.get(drilldownPrefix + ".value")
            };
            filters.push(xFilter);
            var xTerm = Sideview.utils.getSearchTermsFromFilters([xFilter]);
            context.set(drilldownPrefix + ".xFilter", JSON.stringify([xFilter]));
            context.set(drilldownPrefix + ".xTerm", xTerm);
        }
        if (filters.length>0) {
            context.set(drilldownPrefix + ".filters", JSON.stringify(filters));
            var terms = Sideview.utils.getSearchTermsFromFilters(filters);
            context.set(drilldownPrefix + ".searchTerms", terms.join(" "));
        }
    },
    
    getResultsFromJSON: function(jsonStr) {
        var results = JSON.parse(jsonStr);
        if (results.hasOwnProperty("results")) {
            results = results["results"];
        }
        return results;
    },

    /**
     *  little utility to resubmit the search that the given module is 
     *  loaded with.
     */
    resubmitSearch: function(module) {
        while (module.getContext().get("search").isJobDispatched()) {
            module = module.parent;
        }
        module.pushContextToChildren();
    },



    augmentLastKnownSavedSearch: function(triggeringModule) {
        function getDefaultTriggeringModule() {
            var m = ["SearchControls", "ResultsActionButtons", "JobStatus"];
            for (var i=0;i<m.length;i++) {
                var triggeringModuleContainer = $("." + m[i]);
                if (triggeringModuleContainer.length>0) {
                    return Sideview.utils.getModuleFromDOMElement(triggeringModuleContainer);
                }
            }
            return false;
        }
        if (Sideview.activeSavedSearchName) {
            triggeringModule = triggeringModule || getDefaultTriggeringModule();
            var url = Sideview.utils.make_url('module', Sideview.utils.getConfigValue('SYSTEM_NAMESPACE'), Sideview.utils.SAVED_SEARCH_PATCHER_CLASS, 'render');
            
            var context = triggeringModule.getContext();
            var args = {}
            args["app"] = Sideview.utils.getCurrentApp();
            args["savedSearchName"] = Sideview.activeSavedSearchName
            args["serializedContext"] = Sideview.utils.contextToQueryString(context);
            args["editView"] = Sideview.utils.getCurrentView();
            url += "?" + Sideview.utils.dictToString(args);

            //http://localhost:8000/en-US/module/system/Splunk.Module.CustomRESTForSavedSearch/render?app=process_historian&savedSearchName=bargle221&serializedContext=foobarContext&editView=foobarView
            $.get(url, function(jsonResponse) {
                var response = JSON.parse(jsonResponse);
                if (response["success"]) {}
                else {
                    if ("message" in response) alert(response["message"]);
                    else alert("unexpected error occurred\n\n" + jsonResponse)
                }
            });
            Sideview.activeSavedSearchName = null;
        }
    },

    addExtraSavedSearchFields: function(modalPopup, triggeringModule) {
        Sideview.activeModalPopup = modalPopup;
        var iframe = $("iframe", Sideview.activeModalPopup.getPopup()); 
        iframe.load(function(){
            var contents = iframe.contents();
            // Somehow the wizard code was built such that you cant bind to the 
            // form submits so we're stuck with onchange events.
            contents.find("form").find("input#name")
                .change(function() {Sideview.activeSavedSearchName = $(this).val();});
            // if we loaded the success message than we infer that the search was 
            // saved.  Go add in our custom fields.
            var successMessages = contents.find("div.saveSearchSuccess").length 
                + contents.find("div.alertSuccess").length
                + contents.find("div.dashboardSuccess").length;

            if (successMessages>0) {
                Sideview.utils.augmentLastKnownSavedSearch(triggeringModule);
                // NavBar was updated a while ago and they broke core functionality
                // whereby it's supposed to reload it's saved search menus whenever 
                // the event from a new saved search/report creation is triggered. 
                // boo. This is a not a smart patch but it works.
                // technically the old module still lives and has references in 
                // ModuleLoader.modules[]  etc...   
                try {
                    var currentSplunkVersion = Splunk.util.getConfigValue("VERSION_LABEL");
                    if (typeof(Sideview)!="undefined" && 
                        Sideview.utils.compareVersions(currentSplunkVersion,"6") > -1) {
                        var appBarContainer = $("#AppBar_0_0_0");
                        if (appBarContainer.length==1) {
                            new Splunk.Module.AppBar(appBarContainer);
                        }
                    }
                } catch(e) {
                    console.error(e);
                }
            } 
        });
    },
    
    makeUnclonable: function(obj) {
        obj = $(obj[0]);
        obj.clone = function() { return this;}.bind(obj);
        return obj;
    },

    /**
     * called during Table Embedding to insert the $row.fields.someField$
     * and $row.fields.someField.rawValue$ keys into the relevant branch of 
     * cloned modules.
     */
    injectValuesIntoContext: function(clone, prefix, dict) {
        prefix = prefix || "";
        var escDict = $.extend({},dict);
        for (var key in escDict) {
            if (escDict.hasOwnProperty(key)) {
                escDict[key] = Sideview.utils.escapeForSearchLanguage(escDict[key]);
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
            //context.remove("sideview.onEditableStateChange");
            return context;
        }
    },

    /**
     * NOTE: topLevelBlockIndex is only defined on the very first cloneBranch call from a new multiplexed branch.
     */
    cloneBranch: function(module, moduleParent, globalMultiplexId, insertionPoint, reasonsToBeInvisible, topLevelBlockIndex) {

        reasonsToBeInvisible = reasonsToBeInvisible || [];
        var visibilityReason = Sideview.utils.TEMPLATED_CHILDREN_VISIBILITY_REASON;
        module.show(visibilityReason);
            
        var clonedContainer = module.container.clone();
        clonedContainer.addClass("clonedModule")
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
        if (Sideview.utils.isInteger(topLevelBlockIndex)) {
            var multiplexBlockWrapper = $("<div>")
                .addClass("multiplexedBlock")
                .addClass(globalMultiplexId + "_multiplexedBlock")
                .attr("id",globalMultiplexId + "_multiplexedBlock_" + topLevelBlockIndex)
                .append($("<div>").addClass("multiplexedBlockInner").append(clonedContainer))
            insertionPoint.after(multiplexBlockWrapper);
        }
        else {
            insertionPoint.after(clonedContainer);
        }
        var moduleType = module.moduleType.replace("Splunk.Module.","");
        Splunk.Module.loadParams[cloneId] = $.extend(true, {},Splunk.Module.loadParams[module.moduleId]);
        
        var clonedModule = new Splunk.Module[moduleType]($("#" + cloneId));
        
        clonedModule.moduleId = cloneId;
        clonedModule.moduleType = module.moduleType;
        if (module.hugoSimpson) clonedModule.hugoSimpson = module.hugoSimpson;
        
        moduleParent.addChild(clonedModule);
        insertionPoint = clonedModule.container;
        module.withEachChild(function(child) {
            var retVal = Sideview.utils.cloneBranch(child, clonedModule, globalMultiplexId, insertionPoint,reasonsToBeInvisible);  
            insertionPoint = retVal[1];
        });
        module.hide(visibilityReason);
        for (var i=0;i<reasonsToBeInvisible.length;i++) {
            clonedModule.hide(reasonsToBeInvisible[i]);
        }
        clonedModule.markPageLoadComplete();
        clonedModule.withEachDescendant(function(descendantModule) {
            descendantModule.markPageLoadComplete();
        });
        
        if ("ModuleLoader" in Splunk.Globals) {
            Splunk.Globals["ModuleLoader"]._modulesByID[cloneId] = clonedModule
        }
        return [clonedModule, insertionPoint];
    },


    normalizeBoolean: function(input) {
        switch (input) {
            case true:
            case "true":
            case "True":
            case "yes":
                return true;
        }
        if (Sideview.utils.isNumeric(input) && Math.floor(input) == input) {
            return parseInt(input, 10)>0;
        }
        return false;
        
    },

    
    getCurrentDisplayView: function() {
        return document.body.getAttribute("s:displayview") || Sideview.utils.getCurrentView();
    },
    getAutoCancelInterval: function() {
        return document.body.getAttribute("s:autoCancelInterval") || 90;
    },


    launchJobInspector: function(sid) {
        if (!sid) {
            Sideview.utils.broadcastMessage("error","wizards",_("no sid supplied for Job Inspector"));
        }
        var args = {
            namespace: Sideview.utils.getCurrentApp(),
            sid: sid
        };
        var url = Sideview.utils.make_url("search","inspector") + "?" + Sideview.utils.dictToString(args);
        return window.open(url, "inspector");
    },

    launchSaveSearchWizard: function(search) {
        if (Splunk && Splunk.Popup && Splunk.Popup.hasOwnProperty("SaveSearchWizard")) {
            return Splunk.Popup.SaveSearchWizard(search);
        }
        else {
            Sideview.utils.broadcastMessage("error","wizards",_("standalone saved search wizard not implemented yet"));
        }
    },

    launchShareLinkWizard: function(formContainer, title, search) {
        if (Splunk && Splunk.Popup && Splunk.Popup.hasOwnProperty("createShareLinkForm")) {
            return Splunk.Popup.createShareLinkForm(formContainer, title, search);
        }
        else {
            Sideview.utils.broadcastMessage("error","wizards",_("standalone share link wizard not implemented yet"));
        }
    },

     launchDashboardPanelWizard: function(search, mode) {
        if (Splunk && Splunk.Popup && Splunk.Popup.hasOwnProperty("DashboardWizard")) {
            return Splunk.Popup.DashboardWizard(search, {panel_type: mode});
        }
        else {
            Sideview.utils.broadcastMessage("error","wizards",_("standalone Create Dashboard Panel wizard not implemented yet"));
        }
    },

    launchSaveAlertWizard: function(search) {
        if (Splunk && Splunk.Popup && Splunk.Popup.hasOwnProperty("AlertWizard")) {
            return Splunk.Popup.AlertWizard(search);
        }
        else {
            Sideview.utils.broadcastMessage("error","wizards",_("standalone Create Alert Wizard not implemented yet"));
        }
    },

    launchCreateEventtypeWizard: function(formContainer, search) {
        if (Splunk && Splunk.Popup && Splunk.Popup.hasOwnProperty("createEventtypeForm")) {
            return Splunk.Popup.createEventtypeForm(formContainer, _('Save As Event Type'), search);
        }
        else {
            Sideview.utils.broadcastMessage("error","wizards",_("standalone Create Eventtype Wizard not implemented yet"));
        }
    },

    launchCreateScheduledSearchWizard: function(search) {
        if (Splunk && Splunk.Popup && Splunk.Popup.hasOwnProperty("ScheduleDigestWizard")) {
            return Splunk.Popup.ScheduleDigestWizard(search, {title: _("Create Scheduled Search")});
        }
        else {
            Sideview.utils.broadcastMessage("error","wizards",_("standalone Create Scheduled Search Wizard not implemented yet"));
        }
    },

    launchExportWizard: function(formContainer) {

        if (Splunk && Splunk.Popup) {
            var exportPopupHandle = null;
            var exportPopup = new Splunk.Popup(formContainer, {
                title: _("Export Results"),
                buttons: [
                    {
                        label: _("Cancel"),
                        type: "secondary",
                        callback: function(){return true;}
                    },
                    {
                        label: _("Export"),
                        type: "primary",
                        callback: function(){
                            var limit = $(exportPopupHandle).find('[name="spl_ctrl-limit"]:checked').val();
                            if (limit == "unlimited") {
                                 $(exportPopupHandle).find('[name="count"]').val("0");
                            } else {
                                var countstr =  $(exportPopupHandle).find('[name="spl_ctrl-count"]').val();
                                var count =  parseInt(countstr, 10);
                                if (isNaN(count) || count<1 || countstr!=count) {
                                    alert(_("Must export at least one result"));
                                    return false;
                                }
                                $(exportPopupHandle).find('[name="count"]').val(count);
                            }
                            return $(exportPopupHandle).find(".exForm").submit();
                        }
                    }
                ]
            });
            exportPopupHandle = exportPopup.getPopup();
            return exportPopupHandle;
        }
    },

    EditTagPopup: function(container, fieldName, fieldValue, callback) {
        if (Splunk && Splunk.Popup && Splunk.Popup.hasOwnProperty("createTagFieldForm")) {
            return new Splunk.Popup.createTagFieldForm($(".taggingLayer", container), _("Tag This Field"), fieldName, fieldValue,callback);
        }
        else {
            Sideview.utils.broadcastMessage("error","wizards",_("standalone Tag Editing UI not implemented yet"));
        }
        
    }
    
}



for (var name in Sideview.XMLUtils) { 
    if (Sideview.XMLUtils.hasOwnProperty(name)) {
        Sideview.utils[name] = Sideview.XMLUtils[name]; 
    }
}
