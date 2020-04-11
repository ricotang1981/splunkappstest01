// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.SearchControls= $.klass(Sideview.utils.getBaseClass(true), {

    initialize: function($super, container) {
        $super(container);
        this.logger = Sideview.utils.getLogger();
        Sideview.utils.applyCustomProperties(this);
        this.setFloatingBehavior();
        this.setupEventHandlers();
        this.stateWrapper = $(".stateWrapper", this.container);
        this.state = "null";

        this.initMenus();
    },
    requiresResults: function() {return true;},

    getCurrentJob: function() {
        var search = this.getContext().get("search");
        if (search.isJobDispatched()) return search.job;
        else false;
    },

    /**
     * Instead of wiring up each individually,  we just map the classNames
     * to the methodNames exactly.
     * corrolary: never add a class like 'resetUI' or 'pushContextToChildren'!
     */
    setupEventHandlers: function() {
        var moduleRef = this;
        $("a", this.container).not(".splButton-primary").click(function(evt) {
            moduleRef.hideMenus();
            evt.preventDefault();
            var className = $(this).attr('class');
            className = className
                .replace("splButton-primary ", "")
                .replace("splButton-tertiary ", "")
                .replace("svButton ", "");

            if (moduleRef[className]) {
                moduleRef[className](evt);
            }
            evt.stopPropagation();

            return false;
        });
    },



    /**
     * sets floats and clears as determined by the config.
     */
    setFloatingBehavior: function() {
        // unfortunately a module's mako template cannot control its *own*
        // container div.  So we are forced to float it here.
        if (this.getParam("float") && this.getParam("float")!="none") {
            $(this.container).css("float", this.getParam("float"));
        }
        if (this.getParam("clear")) {
            $(this.container).css("clear", this.getParam("clear"));
        }
    },

    background: function(evt) {
        var job = this.getCurrentJob();
        if (job) {
            job.save();
            if (job.isPreviewable()) job.setPreviewable(false);
            this.withEachDescendant(function(module) {
                module.reset();
            });
            var app = job['_eai:acl']['app'] || Sideview.utils.getCurrentApp();
            var view = job['_request']['ui_dispatch_view'] || Sideview.utils.getCurrentView();
            var url = sprintf("app/%s/%s?sid=%s", app, view, job.getSearchId());

            Sideview.utils.broadcastMessage('info', "splunk.search.job", _('Your search job has been backgrounded. To retrieve it, visit [['+url+'| this page]]. Backgrounded jobs expire after 1 week.'));
        }
    },

    /** just here to catch the click, because the button's class changes from
     *  pause to unpause at runtime.
     */
    unpause: function(evt) {
        this.pause(evt);
    },

    pause: function(evt) {
        var job = this.getCurrentJob();
        if (job) {
            var oldClass = "pause";
            var newClass = "unpause";
            if (job.isPaused()) {
                var tmp = oldClass;
                oldClass=newClass;
                newClass=tmp;
                job.unpause();
                this.update("progress");
            } else {
                job.pause();
                this.update("paused");
            }
            $("a." + oldClass, this.container).removeClass(oldClass).addClass(newClass);
        }
    },

    finalize: function(evt) {
        var job = this.getCurrentJob();
        if (job) {
            job.finalize();
        }
    },

    cancel: function(evt) {
        var job = this.getCurrentJob();
        if (job) {
            job.cancel(

                function() {
                    Sideview.utils.broadcastMessage("info", "splunk.search", _("Your search has been cancelled."));
                }.bind(this),
                function() {
                    Sideview.utils.broadcastMessage("error", "splunk.search", _("Failed to cancel search."));
                }.bind(this)
            );
        }
        this.update("null");
    },

    inspector: function(evt) {
        var job = this.getCurrentJob();
        if (job) {
            var sid = job.getSearchId()
            if (sid) Sideview.utils.launchJobInspector(sid);
            else {
                Sideview.utils.broadcastMessage("ERROR", "splunk.search", _("Unable to launch the Job Inspector - failed to find the search id (aka sid) for this search result."));
            }
        }
    },

    saveSearch: function(evt) {
        var search = this.getContext().get("search");
        var popup = Sideview.utils.launchSaveSearchWizard(search)
        Sideview.utils.addExtraSavedSearchFields(popup, this);
    },

    saveResults: function(evt) {
        var job = this.getCurrentJob();
        if (job) {
            job.save(
                function() {
                    Sideview.utils.broadcastMessage("info", "splunk.search", _("These search results have been saved. You can retrieve them later via the jobs manager."));
                }.bind(this),
                function() {
                    Sideview.utils.broadcastMessage("error", "splunk.search", _("Failed to save search results.  The search job may have expired."));
                }.bind(this)
            );
        }
    },

    saveAndShareResults: function(evt) {
        var formContainer = $(".shareLinkForm",this.container)[0];
        var title = _("Save and Share Results");
        var search = this.getContext().get("search");
        var popup = Sideview.utils.launchShareLinkWizard(formContainer, title, search);
        //Sideview.utils.addExtraSavedSearchFields(popup, this);
    },
    createDashboardPanel: function(evt) {
        var search = this.getContext().get("search");
        var mode = "event";
        if (search.job.areResultsTransformed()) {
            mode = "table";
            this.withEachDescendant(function(module) {
                var id = module.moduleId;
                var c = module.getContext();
                if ((id.indexOf("JSChart")==0 || id.indexOf("FlashChart")==0) &&
                    $(module.container).is(":visible")) {
                    var chartType = c.get("charting.chart");
                    if (chartType) mode = chartType;
                    return;
                }
            });
        }
        var popup = Sideview.utils.launchDashboardPanelWizard(search, mode);

        Sideview.utils.addExtraSavedSearchFields(popup, this);
    },

    createAlert: function(evt) {
        var search = this.getContext().get("search");
        var popup = Sideview.utils.launchSaveAlertWizard(search);
        Sideview.utils.addExtraSavedSearchFields(popup, this);
    },

    //createReport: function(evt) {
    //    alert("not implemented yet");
    //},

    createEventType: function(evt) {
        var search  = this.getContext().get("search");
        var formContainer = $(".eventtypeForm", this.container)[0];
        var popup = Sideview.utils.launchCreateEventtypeWizard(formContainer, search);
        Sideview.utils.addExtraSavedSearchFields(popup, this);
    },

    createScheduledSearch: function(evt) {
        var search = this.getContext().get("search");
        var popup = Sideview.utils.launchCreateScheduledSearchWizard(search);
        Sideview.utils.addExtraSavedSearchFields(popup, this);
    },

    print: function(evt) {
        var cl = document.body.classList;
        if (cl.contains("splVersion-5") || cl.contains("splVersion-6") || cl.contains("splVersion-7_0")) {
            // note quite sure why it used to be built this way
            // but... let us #backAwaySlowly?
            $(document).trigger("PrintPage");
        } else {
            window.print();
        }
    },

    export: function(evt) {
        var context = this.getContext();
        var formContainer = $(".exportPopup",this.container)[0];
        var search = context.get("search");
        if (!search.isJobDispatched() || !search.job || !search.job.isDone()){
            return;
        }

        var exportForm = $("form.exForm",formContainer);
        var postProcess = search.getPostProcess() || "";

        var layer = this.launchExportPopup(formContainer);

        layer.find("input[name='sid']").val(search.job.getSearchId())
        layer.find("input[name='search']").val(postProcess);
        layer.find("form.exForm").attr("action",Sideview.utils.make_url("/custom/sideview_utils/export/results"));

        search.job.setAsAutoCancellable(false);

        if(search.job.areResultsTransformed()){
            $("option[value='raw']", layer).remove();
        }
    },

    launchExportPopup: function(formContainer) {
        return Sideview.utils.launchExportWizard(formContainer);
    },

    resetUI: function() {
        this.update("null");
    },

    initMenus: function() {

        $(".svMenu > li",this.container).bind("click", function(evt) {
            $(".SearchControls ul ul").css("display", "none").css("left","auto");
            $(this).find("ul")
                .css("display","block");
            var menu = $($(this).find("ul")[0]);
            var menuRight = menu.offset().left + menu.width();
            var delta = menu.offset().left - menu.position().left;
            if (menuRight > $(window).width()) {
                menu.css("left",$(window).width()-menu.width()-2 - delta );
            } else {
                menu.css("left","auto");
            }
            evt.stopPropagation();
            evt.preventDefault();
            return false;
        });
        $(document).click(function() {
            $(".SearchControls ul ul").css("display", "none");
        });
    },

    hideMenus: function() {
        $(".SearchControls ul ul").css("display", "none");
    },

    onContextChange: function(context) {
        var context = context || this.getContext();
        var job = this.getCurrentJob(context);
        if (job && !job.isDone()) {
            this.update("progress");
            $("a.unpause", this.container).removeClass("unpause").addClass("pause");
        }

    },

    update: function(newState) {
        if (this.state && this.state==newState) {
            return;
        }
        this.stateWrapper
            .removeClass(this.state + "State")
            .addClass(newState + "State");
        this.state = newState;

        if (this.getParam("cssClass")) {
            var context = this.getContext();
            Sideview.utils.setStandardTimeRangeKeys(context);
            Sideview.utils.setStandardJobKeys(context, true);
            Sideview.utils.applyCustomCssClass(this,context);
        }
    },

    /**
     *
     */
    onJobProgress: function() {
        if (this.state=="paused") return;
        this.update("progress");
        var context = this.getContext();
        var search = context.get("search");
        var label = _("Save search...");
        if (search.job) {
            var reportSearch = Sideview.utils.getReportSearch(search.job);
            if (reportSearch) label = _("Save report...");
        }
        $(".saveSearch",this.container).text(label);

    },

    /**
     *
     */
    onJobDone: function() {
        this.update("done");
    }
});
