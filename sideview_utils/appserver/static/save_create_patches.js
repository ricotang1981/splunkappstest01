
$(document).ready(function() {
    
    var qsDict   = Sideview.utils.stringToDict(document.location.search.substring(1));
    if (qsDict.hasOwnProperty("s")) {
        var searchName = qsDict["s"];
        
        // Patching a bug in Splunk 5.0 GA. See comments on the method itself.
        searchName = Sideview.utils.patchDoubleEscapedSavedSearchNames(searchName);
        
        qsDict["search.name"] = searchName;
        qsDict["autoRun"] = "true";
        
        delete qsDict["s"];
        Sideview.disableURLLoader = true;
        document.location.replace(Sideview.utils.getCurrentView() + "?" + Sideview.utils.dictToString(qsDict));
        return;
    }
    
    var splunkVersion = Sideview.utils.getConfigValue("VERSION_LABEL");

    if (Sideview.utils.compareVersions(splunkVersion,"4.2") == -1) {
        
        Splunk.Popup.createSavedSearchForm = function(formContainer, title, search) {
            options = {
                url: Sideview.utils.make_url('manager', Sideview.utils.getCurrentApp(), "/saved/searches/_new?action=edit&noContainer=1&viewFilter=modal&eleOnly=1"),
                titlebar_class: 'TitleBarSavedSearchPopup',
                setupPopup: function(EAIPopup) {
                    if (search) {
                        var searchStr = search.toString();
                        var timeRange = search.getTimeRange();
                        var earliestTime = timeRange.getEarliestTimeTerms();
                        var latestTime = timeRange.getLatestTimeTerms();

                        // pre-populate the search string if we were given one.
                        if (searchStr) {
                            $('form.entityEditForm textarea[name="search"]').val(Sideview.utils.removeInitialCommand(searchStr));
                        }

                        if (earliestTime) {
                            $('form.entityEditForm input[name="dispatch.earliest_time"]').val(earliestTime);
                        }

                        if (latestTime) {
                            $('form.entityEditForm input[name="dispatch.latest_time"]').val(latestTime);
                        }
                    }
                    // Save the dispatching view
                    var dV = Sideview.utils.getCurrentDisplayView();
                    $('form.entityEditForm input[name="displayview"]', EAIPopup.getPopup()).val(dV);
                    $('form.entityEditForm input[name="request.ui_dispatch_view"]', EAIPopup.getPopup()).val(dV);

                    
                    
                    // get the context data so we can put it into "request.ui_context"
                    var module = Sideview.utils.getModuleFromDOMElement(formContainer);
                    var context = module.getContext();
                    
                    // cry havoc
                    $('form.entityEditForm',EAIPopup.getPopup())
                        .append($("<input>")
                            .attr("type", "text")
                            .attr("name", "request.ui_context")
                            .attr("value", Sideview.utils.contextToQueryString(context))
                        )
                        .append($("<input>")
                            .attr("type", "text")
                            .attr("name", "request.ui_edit_view")
                            .attr("value", Sideview.utils.getCurrentView())
                        )

                },
                beforeSaveForm: function(eai) {
                    var viewStateId = Splunk.Globals.ModuleLoader.commitViewParams(null, true);
                    $('form.entityEditForm input[name="vsid"]').val(viewStateId);

                    // pull out the name and pass it as the argument to the 
                    // client's callback. It will be called if the POST succeeds.
                    var name = $('form.entityEditForm input[name="name"]').val();
                    eai.success_message = sprintf(_("Your search '%(savedSearchName)s' was saved."), {savedSearchName: name}); 
                },
                onAjaxError: function() {
                    Sideview.utils.broadcastMessage("error",
                        "splunk.savedsearches",
                        _("Splunk encountered an error when it attempted to retrieve the save search form. Try again or contact an admin.")
                    );
                }
            }
            return Splunk.Popup.createEAIForm(formContainer, title, options);
        };
    }
    else {

    }
});

/*

evaluate portability of the request.ui_context code.
move code from save_create_patches into.... SideviewUtils.html ?  always or only sometimes?
repair and test all cisco cdr popup patches 
under 'create', add 'create report' that links from search to report. 

*/