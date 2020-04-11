// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.


Splunk.Module.SideviewUtils = $.klass(Splunk.Module, {

    initialize: function($super, container) {
        var retVal = $super(container);
        this.toneDownJobber();
        if (this.getParam("checkAutoRunAttributes")=="True") {
            this.checkAutoRunAttributes();
        }
        /* the code that imports the JSCharting libraries,  around 
        __WEBPACK_AMD_DEFINE_RESULT__  and early on in 
        /exposed/build/jscharting/index.js
        accidentally clobbers a bunch of stuff that other Splunk code had 
        already loaded into splunk.*.  Notably splunk.time but possibly 
        there are other victims we haven't found.
        Since the victim exists at module init time, but the clobbering 
        only happens later after JSChart's internals have woken up, 
        we save off a reference here,  and then ZoomLinks and TimeRangePicker
        each call Sideview.utils.patchToFixJSChartingClobbering() 
        lazily, just before calling the methods that expect splunk.time to 
        be there. 
        */
        window.keepItSecretKeepItSafe = splunk.time;


        return retVal;
    },

    checkAutoRunAttributes: function() {
        $(document).bind("allModulesInHierarchy", function() {
            setTimeout(function() {
                var moduleLoader = Splunk.Globals["ModuleLoader"];
                var modules = moduleLoader._modules;
                var modulesAlreadyChecked = {};
                var breakOut = false;
                var innerModule, outerModule;
                for (var i=0,len=modules.length;i<len;i++) {
                    innerModule = modules[i];
                    if (!Sideview.utils.normalizeBoolean(innerModule.getParam("autoRun"))) continue;
                    modulesAlreadyChecked[innerModule.moduleId] = true;
                    outerModule = innerModule;
                    while (outerModule.hasOwnProperty("parent") && outerModule.parent){
                        outerModule = outerModule.parent;
                        if (Sideview.utils.normalizeBoolean(outerModule.getParam("autoRun"))) {
                            breakOut = true;
                            break;
                        }
                        modulesAlreadyChecked[outerModule.moduleId] = true;
                    } 
                    if (breakOut) break;
                }
                if (breakOut) {
                    Sideview.utils.broadcastMessage("error", "splunk", "AUTORUN ERROR: The creator of this view has left an autoRun=\"True\" nested inside another autoRun=\"True\". This causes numerous significant problems in the Splunk UI and is of no benefit. Remove the inner one (currently on the " + innerModule.moduleId + " module) and check the view thoroughly because there may be more.");
                }
            })
        });
    },

    /**
     * tone down the Jobber's super aggressive defaults
     */
    toneDownJobber: function() {
        if (Splunk.Globals.hasOwnProperty("Jobber")) {
            Splunk.Globals["Jobber"].MIN_POLLER_INTERVAL = 500;
            Splunk.Globals["Jobber"].MAX_POLLER_INTERVAL = 1500;
            Splunk.Globals["Jobber"].POLLER_CLAMP_TIME   = 3000;
        }
    }
});



