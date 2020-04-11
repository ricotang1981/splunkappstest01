// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Sideview = {};



Sideview.utils = {
    _currentVersion : "3.4.11",
    SPLITBY_INFERRER: new RegExp(".+\\|(\\s)*?(chart|timechart)([^|]*?)?by\\s+([^|=]+)(\\s+)?( limit=\"?\\d+\"?)?$"),

    endsWith: function(str, pattern) {
        var d = str.length - pattern.length;
        return d >= 0 && str.lastIndexOf(pattern) === d;
    },

    /**
     * recursively examine the two objects. Returns true if all keys and
     * values and all structure is the same.
     * There was a function in the splunk code to do this but it at that
     * time had a number of problems in it. Perhaps it no longer does I
     * don't know.
     */
    compareObjects: function(x,y) {
        for(p in y){
            if(typeof(x[p])=='undefined') {return false;}
        }
        for(p in y) {
            if (y[p]) {
                switch(typeof(y[p])) {
                        case 'object':
                                if (typeof(y[p].equals)=="function") {
                                    if (!y[p].equals(x[p])) return false;
                                }
                                if (typeof(y[p].join)!=typeof(x[p].join)) return false;
                                if (typeof(y[p].join)=="function") {
                                    if (y[p].join("-x-")!=x[p].join("-x-")) return false;
                                }
                                break;
                        case 'function':
                                if (typeof(x[p])=='undefined' || (p != 'equals' && y[p].toString() != x[p].toString())) return false;
                                break;
                        default:
                                if (y[p] != x[p]) return false;
                }
            }
            else if (x[p]) {
                return false;
            }
        }
        for(p in x) {
            if(typeof(y[p])=='undefined') return false;
        }
        return true;
    },

    stringToList: function(s) {
        var list = [];
        if (!s) return [];
        var i=0;
        var c;
        var n;
        while (i<s.length) {
            c = s.charAt(i)
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
    },




    getURLDict: function() {
        var urlDict = {};
        var qsDict   = Sideview.utils.stringToDict(document.location.search.substring(1));
        var hashDict = Sideview.utils.stringToDict(Sideview.utils.getCurrentHash());
        $.extend(urlDict, qsDict);
        $.extend(urlDict, hashDict);
        return urlDict;
    },

    escapeHTMLWithinURLDict: function(urlDict) {
        var div = $("<div>");
        var value, t;
        for (key in urlDict) {
            value = urlDict[key];
            t = typeof(value);
            if (t=="object" && value && value.hasOwnProperty("length")) {
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
    },

    escapeHTML: function(val) {
        return $("<div>").text(val).html();
    },


    getCurrentHash: function() {
        // we cannot use hash itself.
        // nasty bug in firefox.
        // https://bugzilla.mozilla.org/show_bug.cgi?id=483304
        //document.location.hash.substring(1)
        var loc = document.location.toString();
        var hashIndex = loc.indexOf("#");
        if (hashIndex==-1) return "";
        return loc.substring(hashIndex+1);
    },

    /**
     * does some merging to avoid repeating keys that are already represented
     * in the "hard" keys in the querystring
     */
    simplifyHashDict: function(hashDict) {
        var qsDict   = Sideview.utils.stringToDict(document.location.search.substring(1));
        for (key in qsDict) {
            if (qsDict.hasOwnProperty(key) && hashDict.hasOwnProperty(key)) {
                if (qsDict[key] == hashDict[key]) {
                    delete hashDict[key];
                }
            }
        }
    },


    //getSplunkFormKey: function() {
    //    var port = Sideview.utils.getConfigValue('MRSPARKLE_PORT_NUMBER', '')
    //    var name = "splunkweb_csrf_token_" + port;
    //    return $.cookie(name ) || "";
    //},


    wf_updateHash: function(key,value) {
        var hashDict = Sideview.utils.getCurrentHash();
        hashDict[key] = value;
        hashDict = Sideview.utils.simplifyHashDict(hashDict);
        document.location.hash = Sideview.utils.dictToString(hashDict);
    },


    patchToFixJSChartingClobbering: function(moduleType) {
        if (!splunk.time && window.keepItSecretKeepItSafe) {
            splunk.time = window.keepItSecretKeepItSafe;
            window.keepItSecretKeepItSafe = null;
            console.warn(moduleType + " was the first on the scene. splunk.time has now been restored.");
        }
    },

    wf_URLLoading: function(tokens) {
        var instanceNames = splunkjs.mvc.Components.getInstanceNames();
        var name, instance;
        var sideviewIds = [];
        for (var i=0,len=instanceNames.length;i<len;i++) {
            var name = instanceNames[i];
            if (["default","header"].hasOwnProperty(name)) continue;
            instance = splunkjs.mvc.Components.getInstance(name);
            if (instance.hasOwnProperty("settings") && instance.settings.get("hasSideviewTemplating")) {
                sideviewIds.push(name);
            }
        }


        var urlDict = Sideview.utils.getURLDict();
        var value;

        // ITERATE OVER THE SIDEVIEW IDS INSTEAD.
        for (var key in urlDict) {
            tokens.on("change:" + key, function(tokens, value, wtf) {
                Sideview.utils.wf_updateHash(key,value);


                if ($.isArray(value)) {
                    if (sideviewIds.indexOf(key)) {
                        var instance = splunkjs.mvc.Components.getInstance(key);
                        var separator = instance.settings.get("template");
                        var separator = instance.settings.get("separator");
                        var outerTemplate = instance.settings.get("outerTemplate");
                        var templatedValue = Sideview.utils.multiTemplatize(new Context(),key,value,template,separator,outerTemplate);
                        tokens.set(key+"Templated",templatedValue);
                    }
                }
                else if (value) {
                    tokens.set(key+"Templated", key + "=" + Sideview.utils.doubleQuoteValue(value));
                } else {
                    tokens.set(key+"Templated", "");
                }
            });
            tokens.set(key, urlDict[key]);
        }
    },

    getSelectedText: function() {
        if (window.getSelection) {
            return window.getSelection().toString();
        }
        else if (document.selection && document.selection.createRange) {
            var selectionRange = document.selection.createRange();
            return selectionRange.text;
        }
        return "";
    },

    multiTemplatize: function(context,name,values,template,separator,outerTemplate) {
        var templatizedValues = [];
        var templatizedValue;
        for (var i=0,len=values.length;i<len;i++) {
            templatizedValue = Sideview.utils.safeTemplatize(context, template, name, values[i]);
            templatizedValues.push(templatizedValue);
        }
        var gluedValue = templatizedValues.join(separator);
        // we do not escape slashes in the outer template. It's not input
        // from the user. And to the extent that other $foo$ tokens will
        // be in here, they will have been backslashed upstream.
        return Sideview.utils.templatize(context, outerTemplate, name, gluedValue);
    },

    /**
     * given a URL-encoded string, get back a dictionary.
     * Correctly supports multivalued arguments, and that feature is somewhat
     * essential, eg for prepopulating multiple-selection Pulldown modules.
     */
    stringToDict: function(s) {
        var dict = {};
        if (s.length==0 || s.indexOf("=")==-1) return dict;
        //if (s.indexOf("?")==0 || s.indexOf("#")==0) s = s.slice(1);
        var conjoinedTwins = s.split('&');
        var key, value, twins, heesAlreadyGotOne;
        for (var i=conjoinedTwins.length-1; i>=0; i--) {
            twins = conjoinedTwins[i].split('=');
            key = decodeURIComponent(twins.shift());
            value = decodeURIComponent(twins.shift());
            heesAlreadyGotOne = dict.hasOwnProperty(key);
            if (heesAlreadyGotOne) {
                if (typeof(dict[key])=="object") {
                    dict[key].push(value)
                } else {
                    var old = dict[key]
                    dict[key] = [old,value];
                }
            } else {
                dict[key] = value;
            }
        }
        return dict;
    },


    dictToString: function(dict) {
        var s = [];
        var singleValue, valueArray, i, len;
        for (var key in dict) {
            if (dict.hasOwnProperty(key)) {
                if (typeof(dict[key])=="object") {
                    var valueArray = dict[key];
                    if (valueArray) {
                        for (var i=0,len=valueArray.length; i<len; i++) {
                            singleValue = valueArray[i];
                            s.push(encodeURIComponent(key)+"="+encodeURIComponent(singleValue));
                        }
                    }
                } else {
                    var singleValue = dict[key];
                    s.push(encodeURIComponent(key)+"="+encodeURIComponent(singleValue));
                }
            }
        }
        return s.join("&");
    },

    isNumeric: function(n) {
        if ($.isFunction($.isNumeric)) {
            return $.isNumeric(n);
        }
        return n!=='' && !isNaN(parseInt(n, 10));
    },
    isInteger: function(n) {
        return Math.floor(n) == n && Sideview.utils.isNumeric(n)
    },

    escapeBackslashes: function(s) {
        if (!s) return s;
        if (!s.hasOwnProperty("replace")) s = s.toString();
        return s.replace(/\\/g, "\\\\");
    },

    escapeDoubleQuotes: function(s) {
        if (!s) return s;
        return s.replace(/"/g, "\\\"")
    },

    escapeForSearchLanguage: function(s) {
        return Sideview.utils.escapeDoubleQuotes(Sideview.utils.escapeBackslashes(s));
    },

    doubleQuoteValue: function(s) {
        if (!s) return s;
        return '"' + Sideview.utils.escapeDoubleQuotes(s) + '"';
    },



    //Sideview.utils.isValueNestedInsideDoubleQuotes("fred\"$value$\"mildred")
    isValueNestedInsideDoubleQuotes: function(template, fooToken) {
        fooToken = fooToken || "$value$";

        var fooIndex = template.indexOf(fooToken);
        var i=0;
        var c=false;
        var insideQuotes, insideQuotesAtToken = false;
        while (i<template.length) {
            c = template.charAt(i)
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
                if (c == '"') insideQuotes = false;
            }
            else if (c == '"') insideQuotes = true;
            i++;
        }
        // were we inside a quote at the token, and outside at the end.
        return (insideQuotesAtToken && !insideQuotes) ;
    },


    addInitialCommandIfAbsent: function(s,command) {
        command = command || "search";
        command += " ";
        var s2 = $.trim(s);
        if (s2.length==0 || s2.charAt(0)=="|") return s;
        if (s2.indexOf(command)!=0) return command + s2;
        return s;
    },



    removeInitialCommand: function(s,command) {
        if (!s) return s;
        command = command || "search";
        command += " ";
        var s2 = s;
        while (s2.length>1) {
            var c = s2.charAt(0)
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
    },

    /**
     * Given a splunk search, decomposes it into trimmed strings
     * representing the splunk search commands as would be recognized by
     * Splunkd's SPL parser.
     * iow - you cant just split on "|" because pipes can be in quoted
     * literals, and then you have to worry about backslash-escaped quotes
     * and so on and so on.
     */
    getCommands: function(searchStr) {
        var commands = [];
        if (!searchStr) return [];
        var i=0;
        var insideQuotes = false;
        var bracketDepth = 0;
        var c;
        while (i<searchStr.length) {
            c = searchStr.charAt(i)
            if (c == "\\") {
                i=i+2;
                continue;
            }
            else if (insideQuotes) {
                if (c == '"') insideQuotes = false;
            }
            else if (c == '"') insideQuotes = true;
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
    },

    /**
     * given a single search clause, return an array of the field names used
     * therein
     */
    getFieldNamesFromSearchExpression: function(searchStr,debugMode) {
        if (!searchStr) return [];
        searchStr=$.trim(searchStr);
        var insideQuotes = false;
        var command = searchStr.substring(0,searchStr.indexOf(" "));
        searchStr = searchStr.substring(searchStr.indexOf(" ")+1)
        var bracketDepth = 0;
        var c;
        var fields = [];
        var fieldsMap = {};
        var currentField = "";
        var handedness = "LHS";
        var operators = ["=",">","<","!=","+","-","/","!",")","("];
        var i=0;
        var waitingForAnOperator = false;

        while (i<searchStr.length) {
            c = searchStr.charAt(i)
            if (c == "\\") {
                i=i+2;
                continue;
            }
            else if (insideQuotes) {
                if (c == '"') insideQuotes = false;
            }
            else if (c == '"') insideQuotes = true;
            else if (c == "[") bracketDepth++;
            else if (c == "]") {
                //malformed.
                if (bracketDepth <= 0) {
                    console.error("malformed search expression. Sideview.utils.getFieldNamesFromSearchExpression was unable to get field names.");
                    console.error(command + " " + searchStr);
                    return [];
                }
                bracketDepth--;
            }
            else if (bracketDepth>0) {
                //pass
            }
            else if ((c == "|") && (bracketDepth ==0)) {
                console.error("you cannot use Sideview.utils.getFieldNamesFromSearchExpression on expressions that contain piped commands - run getCommands first and then process individual command strings");
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
                            handedness=="LHS"
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
                if (debugMode) console.log(searchStr.substr(0,i) + " got ot the end and we're in a where command so we baked out the field (" + currentField + ")");
            }
        }
        return fields;
    },


    inferSplitByField: function(search,postProcess) {
        if (postProcess) {
            if ($.trim(postProcess).charAt(0)!="|") {
                postProcess = " | " + postProcess;
            }
            search += postProcess;
        }
        search = search.replace(/\n/g," ");
        var match = search.match(Sideview.utils.SPLITBY_INFERRER);
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
            splitBy = $.trim(splitBy);
            if (splitBy.indexOf(" ")!=-1) return false;
            return splitBy;
        }
        return false;
    },

    broadcastMessage: function(level, className, message) {
        var messenger = Splunk.Messenger.System.getInstance();
        messenger.send(level, className, message);
    },

    clearMessages: function() {
        Sideview.utils.broadcastMessage("info","control","CLEAR")
    },


    /**
     * version detection, to be used in the application.js files of dependent apps
     * and/or in the ModuleName.js files of dependent modules.
     *
     * returns int.
     * returns 0 if the versions are equal, -1 if v1<v2, and +1 if v1>v2
     */
    compareVersions: function(v1,v2) {
        var c1,c2,
            a1 = v1.split("."),
            a2 = v2.split(".");
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
    },

    // USE THIS 98% OF THE TIME
    checkRequiredVersion: function(v2) {
        var ret = Sideview.utils.compareToCurrentVersion(v2);
        if (ret==-1) return false;
        return true;
    },

    // YOU PROBABLY DO NOT WANT TO USE THESE.
    compareToCurrentVersion: function(v2) {
        return Sideview.utils.compareVersions(Sideview.utils._currentVersion,v2);
    },

    getCurrentVersion: function() {
        return Sideview.utils._currentVersion;
    },

    getCurrentApp: function() {
        return document.body.getAttribute("s:app") || 'unknown_app';
    },

    getCurrentView: function() {
        return document.body.getAttribute("s:view") || 'unknown_view';
    },

    /**
     * added in 3.4.9 as a convenience method, and also to mirror what Canary does.
     */
    getCurrentUser: function() {
        return Sideview.utils.getConfigValue("USERNAME");
    },


    balanceLabelWidths: function(commonParent) {
        var labels = $(".TextField label", commonParent);
        labels = labels.add($(".Pulldown label", commonParent));
        labels = labels.add($(".CheckboxPulldown label", commonParent));
        labels = labels.add($(".TimeRangePicker span.timeRangePickerLabel", commonParent));


        for (var i=0;i<labels.length;i++) {
            $(labels[i]).css("width","auto");
            $(labels[i]).css("display","inline-block");

        }
        var newWidth = 0;
        for (var i=0;i<labels.length;i++) {
            newWidth = Math.max(newWidth, labels[i].offsetWidth-20);
        }
        console.log("new width is " + newWidth);
        if (newWidth>0) {
            for (var i=0;i<labels.length;i++) {
                $(labels[i]).css("width",newWidth + "px");
            }
        }
    },

    // Rain Man ftw.
    definitelyTransformingCommands: {
        "stats":1,"chart":1,"timechart":1,"top":1,"rare":1,"sistats":1,"sichart":1,"sitimechart":1,"sitop":1,"sirare":1,"sort":1
    },
    definitelyNonTransformingCommands: {
        "eval":1,"rex":1,"where":1,"search":1,"addinfo":1,"convert":1,"extract":1,"regex":1,"head":1,"tail":1,"lookup":1,"replace":1,"rename":1,"strcat":1
    }
}
