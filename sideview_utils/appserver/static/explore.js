var layoutGlobal = $(".layout");
function quickAndDirtyResize() {
    layoutGlobal.width( ($(window).width() - 220)  );
    layoutGlobal.height( ($(document).height() - 40)  );
    $(".navigationHeader").height(($(document).height() - 40)  );
}
/*
switch (Sideview.utils.getCurrentView()) {
    case "explore":
        function setupResizeHandlers() {
            //TODO - check for splTemplate-dashboard 
            quickAndDirtyResize();
            $(window).bind('resize', function() {
                quickAndDirtyResize()    
            });
            $(document).bind("jobDone", function() {
                window.setTimeout("quickAndDirtyResize()", 1000); 
            });
        }
        setupResizeHandlers();
        break;

    default:
        break;
}
*/

$(document).bind("javascriptClassesLoaded", function() {

    Sideview.utils.declareCustomBehavior("addNewFilterToFilterBar", function(module) {
        module.onContextChange = function() {
            var context = this.getContext();
            var callback = context.get("filters.addNewFilter");
            var field = context.get("field");
            var operator = context.get("operator");
            var value = context.get("value");
            callback(field,value,operator);
        }
    });

    Sideview.utils.declareCustomBehavior("hideDownstreamModulesUntilFieldSelected", function(pulldown) {
        var visibilityId = "userHasntPickedAFieldYet";
        var pushContextToChildrenReference = pulldown.pushContextToChildren.bind(pulldown);
        pulldown.pushContextToChildren = function(explicitContext) {
            var active = this.select.val().length>0;
            this.withEachDescendant(function(module) {
                if (active) {
                    module.show(visibilityId);
                } 
                else {
                    module.hide(visibilityId);
                }
            }.bind(this))
            
            if (active) {
                return pushContextToChildrenReference(explicitContext);
            }
        }
    });
        
        
    Sideview.utils.declareCustomBehavior("activeOnlyIfManualEntrySelected", function(module) {
        var onContextChangeReference = module.onContextChange.bind(module);
        module.onContextChange = function() {
            var retVal = onContextChangeReference();
            var context = this.getContext();
            if (context.get("value")) {
                this.active=false;
                this.hide();
            }
            else {
                this.active=true;
                this.show();
            }
            return retVal;
        }
        var getModifiedContextReference = module.getModifiedContext.bind(module);
        module.getModifiedContext = function() {
            if (this.active) {
                return getModifiedContextReference();
            } else {
                return this.getContext();
            }
        }
    });

    Sideview.utils.declareCustomBehavior("constructReportHeader", function(behaviorModule) {
        behaviorModule.getModifiedContext = function() {
            var context = this.getContext();
            var search  = context.get("search");
            var text = [];
            text.push("Showing");
            text.push(context.get("stat.label"));
            text.push(context.get("yField.label"));
            text.push(context.get("xField.label"));
            if (context.get("zField.value")!="*" && context.get("yField.value")!="all") {
                text.push("split by " + context.get("zField.value"));
            }
            text.push(search.getTimeRange().toConciseString());
            
            context.set("reportHeader", text.join(" "));
            
            context.set("encodedSearch", encodeURIComponent(search.toString()));
            if (search.isJobDispatched()) context.set("rawSearchLinkText", "(see full search syntax)");
            return context;
        }
    });

    Sideview.utils.declareCustomBehavior("bounceUpToFilter", function(module) {
        module.onContextChange = function() {
            var context = this.getContext();
            // NOTE the $click$.   So this only works with SimpleResultsTable
            var xField = context.get("click.name");
            var upwardContext = new Splunk.Context();

            var currentFilters = JSON.parse(context.get("filters.json") || "[]");
            
            if (xField=="_time") {
                var search = new Splunk.Search("*");
                search.setTimeRange(context.get("search").getTimeRange());
                upwardContext.set("search",search);
            } 

            // NOTE the $click$.   So this only works with SimpleResultsTable
            var clickFilters = JSON.parse(context.get("click.filters") || "[]");
            currentFilters = currentFilters.concat(clickFilters);
            upwardContext.set("filters", JSON.stringify(currentFilters));

            this.passContextToParent(upwardContext);
            // if you were to use the Filter module's callback mechanism INSTEAD 
            // of the upward-travelling context mechanism,  then it would look 
            // something like this::
            /*
            var addNewFilterCallback = context.get("filters.addNewFilter");
            if (xField!="_time" && xValue) {
                addNewFilterCallback(xField, xValue);
            }
            if ((!xField || (xField!=splitByValue)) && splitByField) {
                addNewFilterCallback(splitByField, splitByValue);
            }
            */
        }
    });
    Sideview.utils.declareCustomBehavior("pivotToReportTab", function(module) {
        module.onContextChange = function() {
            var context = this.getContext();
            var upwardContext = new Splunk.Context();
            upwardContext.set("search", new Splunk.Search());
            // these two will get caught by the URLLoader
            upwardContext.set("stat", context.get("click.name2"));
            upwardContext.set("yField", context.get("click.value"));
            // this will get caught by the Tabs module.
            upwardContext.set("selectedTab", "Report");
            this.passContextToParent(upwardContext);
        }
    });

    Sideview.utils.declareCustomBehavior("customYFieldPulldownForExplore", function(pulldown) {
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
        pulldown.onRendered = function() {
            var context = this.getContext();
            var filterableFields = context.get("filterable_fields").split(" ");
            var numericFields = context.get("numeric_fields").split(" ");
            var stat = context.get("stat");
            
            this.select.find("option[class=dynamic]").each(function() {
                if (stat=="dc") {
                    if ($.inArray($(this).val(), numericFields)!=-1) {
                        $(this).remove();
                    }
                }
                else if ($.inArray($(this).val(), numericFields)==-1) {
                    $(this).remove();
                }
            });
        };

    });


    Sideview.utils.declareCustomBehavior("customZFieldPulldown", function(pulldown) {

    });

    Sideview.utils.declareCustomBehavior("customReportingLogic", function(searchModule) {
        var oldMethod = searchModule.getModifiedContext.bind(searchModule);
        
        searchModule.getModifiedContext = function(context) {
            var context = oldMethod(context || this.getContext());
            var splitSeries = false;
            var chartType = "column";
            
            if (context.get("yField.value") == "all") {
                
                if (context.get("xField.value") == "_time") {
                    chartType = "line";
                    splitSeries = true;
                } 
                context.set("zFieldVisible", false);
            }
            else {   // eg yField=='temp'
                if (context.get("stat") == "sum") {
                    chartType = "column";
                }
                else if (context.get("xField.value") == "_time") {
                    chartType = "line";
                }
                context.set("zFieldVisible", true);
            }

            context.set("charting.chart", chartType);
            context.set("charting.layout.splitSeries", splitSeries);
            context.set("charting.chart.markerSize", 5);
            context.set("charting.chart.showMarkers", "true");
            context.set("charting.chart.nullValueMode", "gaps");

            return context;
        }.bind(searchModule)
    });

    

});