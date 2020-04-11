



function addKeysForRawSearchSyntax(context) {

    var search = context.get("search");
    var postProcess = context.get("postProcess") || "";
    if (postProcess.indexOf(" | stats count") !=-1) {
        postProcess = postProcess.replace(" | stats count", "");
    }
    var searchString = search.toString();
    if (postProcess && $.trim(postProcess)!="") { 
        searchString += " | " + postProcess;
    }
    
    
    context.set("encodedSearch", encodeURIComponent(searchString));
    
    if (search.isJobDispatched()) {
        context.set("rawSearchLinkText", _("(see full search syntax)"));
        if (searchString.indexOf("`")!=-1) {
            var expandedSearchString = search.job._eventSearch;
            if (search.job._reportSearch && $.trim(search.job._reportSearch)!="") {
                expandedSearchString += " | " + search.job._reportSearch;
            }
            expandedSearchString = Sideview.utils.removeInitialCommand(expandedSearchString);
        
            context.set("encodedAndExpandedSearch", encodeURIComponent(expandedSearchString));
            context.set("expandMacrosText", _("expand all macros &raquo;"));
        } else {
            context.set("expandMacrosText", "");
        }
    } 
};


$(document).bind("javascriptClassesLoaded", function() {
    Sideview.utils.declareCustomBehavior("customYFieldPulldown", function(pulldown) {
        onContextChangeReference = pulldown.onContextChange.bind(pulldown);
        pulldown.onContextChange = function() {
            var retVal = onContextChangeReference();
            var context = this.getContext();
            var yFieldInvisibilityMode = "when 'count of events' is selected, there is no yField."

            if (context.get("stat")=="") {
                this.hide(yFieldInvisibilityMode);
            } else {
                this.show(yFieldInvisibilityMode);
            }
        }
    });

    Sideview.utils.declareCustomBehavior("customSortByPulldown", function(pulldown) {
        pulldown.isCompatibleWithSortBy = function(context) {
            return ((context.get("zField")=="") && (context.get("xField")!="_time") && (context.get("xField")!=""));
        }
        
        var onContextChangeReference = pulldown.onContextChange.bind(pulldown);
        pulldown.onContextChange = function() {
            var context = this.getContext();
            var yFieldInvisibilityMode = "when there's any split-by there is no sortby."
            if (this.isCompatibleWithSortBy(context)) {
                this.show(yFieldInvisibilityMode);
            } else {
                this.hide(yFieldInvisibilityMode);
            }
            return onContextChangeReference();
        }

        var getModifiedContextReference = pulldown.getModifiedContext.bind(pulldown);
        pulldown.getModifiedContext = function() {
            var context = this.getContext();
            if (this.isCompatibleWithSortBy(context)) {
                return getModifiedContextReference();
            } else {
                context.set(this.name, "");
                return context;
            }
        }
    });

    Sideview.utils.declareCustomBehavior("stackModePulldown", function(pulldownModule) {
        var baseMethodReference = pulldownModule.onContextChange.bind(pulldownModule);
        pulldownModule.onContextChange = function() {
            var retVal = baseMethodReference();
            var context = this.getContext();
            var splitByField = context.get("sideview.splitByField");
            var visibilityReason = "only show for stackable charts";
            var stackable = ["area","column","bar"];
            if (splitByField && stackable.indexOf(context.get("charting.chart")) !=-1) {
                this.show(visibilityReason);
            }
            else {
                this.hide(visibilityReason);
                this.setSelection("default");
            }
            return retVal;
        }.bind(pulldownModule);
    });

    Sideview.utils.declareCustomBehavior("fullWidthTextField", function(textFieldModule) {
        var methodReference = textFieldModule.onContextChange.bind(textFieldModule);
        textFieldModule.onContextChange = function() {
            var retVal = methodReference();
            var w = $(".pageControls").width()
            textFieldModule.container.find("input").css("width",(w-50) + "px");
            return retVal;
        }
        
    });
    Sideview.utils.declareCustomBehavior("hideIfNoPostProcess", function(htmlModule) {
        var methodReference = htmlModule.onContextChange.bind(htmlModule);
        htmlModule.onContextChange = function() {
            var retVal = methodReference();
            var context = this.getContext();
            var range   = context.get("search").getTimeRange();
            var reason = "hide if no postprocess string and no timeline selection"
            if (context.get("pp") || range.isSubRangeOfJob()) this.show(reason);
            else this.hide(reason);
            return retVal;
        }
    });

    

    

    

    Sideview.utils.declareCustomBehavior("nullValueModePulldown", function(pulldownModule) {
        var baseMethodReference = pulldownModule.onContextChange.bind(pulldownModule);
        pulldownModule.onContextChange = function() {
            var retVal = baseMethodReference();
            var context = this.getContext();
            var visibilityReason = "only show for chart types that have points";
            var hasPoints = ["line","area"];
            if (hasPoints.indexOf(context.get("charting.chart")) !=-1) this.show(visibilityReason);
            else this.hide(visibilityReason);
            return retVal;
        }.bind(pulldownModule);
    });

    Sideview.utils.declareCustomBehavior("showMarkersPulldown", function(pulldownModule) {
        var baseMethodReference = pulldownModule.onContextChange.bind(pulldownModule);
        pulldownModule.onContextChange = function() {
            var retVal = baseMethodReference();
            var context = this.getContext();
            var visibilityReason = "only show for lines";
            var hasPoints = ["line"];
            if (hasPoints.indexOf(context.get("charting.chart")) !=-1) this.show(visibilityReason);
            else this.hide(visibilityReason);
            return retVal;
        }.bind(pulldownModule);
    });

    Sideview.utils.declareCustomBehavior("stackModePulldownForChartView", function(pulldownModule) {
        var baseMethodReference = pulldownModule.onContextChange.bind(pulldownModule);
        pulldownModule.onContextChange = function() {
            var retVal = baseMethodReference();
            var context = this.getContext();
            var visibilityReason = "only show for stackable charts";
            var stackable = ["area","column","bar"];
            if (stackable.indexOf(context.get("charting.chart")) !=-1) {
                this.show(visibilityReason);
            }
            else {
                this.hide(visibilityReason);
                this.setSelection("default");
            }
            return retVal;
        }.bind(pulldownModule);
    });

    Sideview.utils.declareCustomBehavior("hideDownstreamUntilSearchSubmitted", function(customBehaviorModule) {
        customBehaviorModule.onContextChange = function() {
            $(".mainSearchControls").show();
            $(".resultsArea").show();
            $(".graphArea").show();
            $(".noSearchEnteredMessage").parent().hide();
        }
    });

    Sideview.utils.declareCustomBehavior("endlessScrollerResize", function(eventsModule) {

        var leftNav = $(".sidebar")
            .css("margin-bottom","0px")
            .css("padding-bottom","0px")
        $(".FieldPicker .inlineHeader").width(145);
        var events = eventsModule.container;

        var resizeHandler = function() {
            if (!eventsModule.isVisible()) return;
            var topOfEvents = events.offset().top;
            var topOfSidebar = leftNav.offset().top;
            var bottomOfViewPort = $(window).height();
            var newEventsHeight  = bottomOfViewPort - topOfEvents;
            var newSidebarHeight = bottomOfViewPort - topOfSidebar;
            
            var damnExtraPadding = 10;
            events.height(newEventsHeight - damnExtraPadding);
            leftNav.css("min-height",newSidebarHeight + "px");
            leftNav.css("height",newSidebarHeight + "px");
        }
        setTimeout(resizeHandler, 2000);
        $(window).resize(resizeHandler);
        $(".FlashTimeline a.hideshow").click(function() {
            $(window).trigger("resize");
        });
        var OCCReference = eventsModule.onContextChange.bind(eventsModule);
        eventsModule.onContextChange = function() {
            resizeHandler();
            return OCCReference();
        }
        
        eventsModule.tweakPanelScrolling = function() {
            if (this.isVisible()) {
                $("body").css("overflowY","hidden");
                $(".sidebar").css("overflowY","auto");
            }
            else {
                $(".sidebar").css("overflowY","inherit");
                $("body").css("overflowY","auto");
            }
        }
        var showReference = eventsModule.show.bind(eventsModule);
        eventsModule.show = function(reason) {
            var retVal = showReference(reason);
            this.tweakPanelScrolling();
            return retVal;
        }
        var hideReference = eventsModule.hide.bind(eventsModule);
        eventsModule.hide = function(reason) {
            var retVal = hideReference(reason);
            this.tweakPanelScrolling();
            return retVal;
        }
        eventsModule.tweakPanelScrolling();
        
        

        
    });


    Sideview.utils.declareCustomBehavior("qualifyNumberOfResults", function(htmlModule) {
        htmlModule.addCustomKeys = function(context) {
            var job = context.get("search").job;
            var head = context.get("optionalHeadCommand.rawValue");
            if (head && job.isDone() && job.getResultCount() > (head/10)) {
                context.set("qualifier", "at least");
            }
            addKeysForRawSearchSyntax(context);
        }
    });

    Sideview.utils.declareCustomBehavior("rawSearchLink", function(htmlModule) {
        htmlModule.addCustomKeys = function(context) {
            addKeysForRawSearchSyntax(context);
        }
    });
    
    var splitByInferrer = new RegExp(".+\\|(\\s+)(chart|timechart)[^|]*?by\\s+([^|]+)(\\s+)?$");
    Sideview.utils.declareCustomBehavior("inferSplitByField", function(customBehaviorModule) {

        customBehaviorModule.getModifiedContext = function() {
            var context = this.getContext();
            var search  = context.get("search");
            var s = search.toString();
            var match = s.match(splitByInferrer);
            var hasSplitBy = ($.isArray(match) && match.length>1);

            if (hasSplitBy) {
                var command = match[2];
                var splitBy = match[3];
                if (command=="chart" && splitBy.indexOf(" ")!=-1) {
                    splitBy = splitBy.split(" ");
                    splitBy = splitBy[splitBy.length-1];
                }
                context.set("sideview.splitByField", match[3]);
            }
            var self = this;
            this.lastChange = false;
            this.withEachDescendant(function(module) {
                if (module.moduleType=="Splunk.Module.SimpleResultsTable" 
                    && self.lastChange!=module.drilldown) {
                    module.drilldown = (hasSplitBy)? "all" : "row";
                }
            });
            return context;
        }
    });
    Sideview.utils.declareCustomBehavior("prependSearchCommandAsAppropriate", function(module) {
        module.getModifiedContext = function() {
            var context = this.getContext();
            // $searchBar.value$ $flashChart.searchTerms$ $optionalHeadCommand$ `get_fields_for_report_pulldowns`
            // $searchBar.value$ $sidebarTable.searchTerms$ $flashChart.searchTerms$
            var searchBar = context.get("search").toString();
            var drilldownTerms = context.get("flashChart.searchTerms") || "";
            var optionalHeadCommand = context.get("optionalHeadCommand") || "";
            // you cant just split on "|", cause you might have a subsearch 
            // with multiple pipes, but the outer search is a simple search.
            if (Sideview.utils.getCommands(searchBar).length>1) {
                context.set("consolidatedSearch",searchBar + " | search " + drilldownTerms);
            } else {
                context.set("consolidatedSearch",searchBar + " " + drilldownTerms + optionalHeadCommand);
            }
            return context;
        }
    });

    
    
    /*
    Sideview.utils.declareCustomBehavior("traceFrameworkMethodCalls", function(module) {
        var occReference = module.onContextChange.bind(module);
        module.onContextChange = function() {
            console.log(this.moduleId + " OCC (TK) ");
            return occReference();
        }
        var pctcReference= module.pushContextToChildren.bind(module);
        module.pushContextToChildren = function(explicitContext) {
            console.log(this.moduleId + " PCTC (TK)");
            return pctcReference(explicitContext);
        }
        var fDReference = module._fireDispatch.bind(module);
        module._fireDispatch = function(search) {
            console.log(this.moduleId + " FD (TK)");
            return fDReference(search);
        }
    });
    */

    
    /*
TESTCASES
sourcetype=access_combined | stats count by clientip
sourcetype=access_combined | stats count by clientip user
sourcetype=access_combined | timechart count
sourcetype=access_combined | timechart count by clientip
sourcetype=access_combined | chart count by clientip
sourcetype=access_combined | chart count by clientip user
sourcetype=access_combined | chart count over clientip by user
sourcetype=access_combined | chart count over clientip by user 
sourcetype=access_combined |timechart count by clientip
sourcetype=access_combined |chart  count by clientip
sourcetype=access_combined |chart count by clientip user
sourcetype=access_combined |chart count over clientip by user
sourcetype=access_combined |chart count over clientip by user 
sourcetype=access_combined |chart count over clientip by  user
*/

    Sideview.utils.declareCustomBehavior("legacyDrilldown", function(customBehaviorModule) {
        customBehaviorModule.onContextChange = function() {
            var context = this.getContext();
            var search  = context.get("search");
            var range   = search.getTimeRange();
            var viewTarget = this.getParam("arg.view");

            var newWindow = context.get("click.modifierKey");

            var successHandler = function(searchStr) {
                args = {};
                args["autoRun"] = true;
                args["searchBar"] = Sideview.utils.removeInitialCommand(searchStr);
                args["earliest"] = range.getEarliestTimeTerms();
                args["latest"] = range.getLatestTimeTerms();
                var url = viewTarget  + "?" + Sideview.utils.dictToString(args);

                if (newWindow) {
                    window.open(url, "_blank", "resizable=yes,status=no,scrollbars=yes,toolbar=no");
                } else {
                    document.location = url;
                }

            };
            var failHandler = function(searchStr) {
                // no need for this, because the framework itself will send a 
                // message out.
            }
            search.absorbIntentions(successHandler, failHandler);
            
        }
    });
    

});