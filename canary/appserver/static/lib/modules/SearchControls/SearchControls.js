// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class SearchControls extends Module {

    constructor(container, params) {
        super(container, params);
        this.setupEventHandlers();
        this.stateWrapper = $(".stateWrapper", this.container);
        this.state = "null";

        this.initMenus();
    }

    requiresResults() {return true;}

    getCurrentJob() {
        var search = this.getContext().getSplunkSearch();
        if (search && search.isDispatched()) return search.job;
        else false;
    }

    /**
     * Instead of wiring up each individually,  we just map the classNames
     * to the methodNames exactly.
     * corrolary: never add a class like 'resetUI' or 'pushDownstream'!
     */
    setupEventHandlers() {
        var moduleRef = this;
        $("a", this.container).not(".buttonPrimary").click(function(evt) {

            moduleRef.hideMenus();
            evt.preventDefault();
            var classNames = $(this).attr('class').split(" ");
            classNames = classNames.filter(function(value) {
                return ["svButton","smallButton"].indexOf(value)==-1;
            })
            if (classNames.length!=1) {
                alert("Error - SearchControls has unexpected classnames on its buttons/icons");
            }
            var className = classNames[0];
            if (moduleRef[className]) {
                moduleRef[className](evt);
            }
            else {
                console.error("not sure how this is possible but we clicked on an anchor in SearchControls that isn't supposed to be here");
                console.trace();
            }
            evt.stopPropagation();

            return false;
        });
    }

    background(evt) {
        var job = this.getCurrentJob();
        if (job) {
            job.save();
            if (job.isPreviewable()) job.setPreviewable(false);
            this.withEachDescendant(function(module) {
                module.reset();
            });
            // TODO - this still doesn't work properly.
            // because the background button lights up before we've actually gotten the first jobMinotaur response.
            // however the app and view wont necessarily be accurate then.

            var app = job.getApp() || Sideview.getCurrentApp();
            var view = job.getDispatchView() || Sideview.getCurrentView();
            var sid = job.getSearchId();
            var url = sprintf("app/%s/%s?sid=%s", app, view, sid);

            var message = sprintf(_('Your search job has been backgrounded. To retrieve it, visit [[%s | this page]]. Backgrounded jobs expire after 1 week.'), url);
            Sideview.broadcastMessage('info', message);
        }
    }

    /** just here to catch the click, because the button's class changes from
     *  pause to unpause at runtime.
     */
    unpause(evt) {
        this.pause(evt);
    }

    pause(evt) {
        var job = this.getCurrentJob();
        if (job) {
            var oldClass = "pause";
            var newClass = "unpause";
            if (job.isPaused()) {
                var tmp = oldClass;
                oldClass=newClass;
                newClass=tmp;
                job.unpause(function(data, textStatus, jqXHR) {
                    this.update("progress");
                }.bind(this));

            } else {
                job.pause(function(data, textStatus, jqXHR) {
                    this.update("paused");
                }.bind(this));
            }
            $("a." + oldClass, this.container).removeClass(oldClass).addClass(newClass);
        }
    }

    finalize(evt) {
        var job = this.getCurrentJob();
        if (job) {
            job.finalize(function(data, textStatus, jqXHR) {
                    this.update("done");
                }.bind(this)
            );
        }
    }

    cancel(evt) {
        var job = this.getCurrentJob();
        if (job) {
            var sid = job.getSearchId();
            if (sid.toString().startsWith("scheduler__")) {
                Sideview.broadcastMessage("warn", "Sorry - jobs created by the scheduler cannot be deleted in this UI. Go to Activity > Jobs");
                return false;
            }
            job.cancel(
                function() {
                    Sideview.broadcastMessage("info", _("Your search has been cancelled."));
                }.bind(this),
                function() {
                    Sideview.broadcastMessage("error", _("Failed to cancel search."));
                }.bind(this)
            );
        }
        this.update("null");
    }

    inspector(evt) {
        var job = this.getCurrentJob();
        if (job) {
            var sid = job.getSearchId()
            if (sid) Sideview.launchJobInspector(sid);
            else {
                Sideview.broadcastMessage("ERROR", _("Unable to launch the Job Inspector - failed to find the search id (aka sid) for this search result."));
            }
        }
    }

    saveSearch(evt) {
        var search = this.getContext().getSplunkSearch();
        var popup = Sideview.launchSaveSearchWizard(search)
        Sideview.addExtraSavedSearchFields(popup, this);
    }

    saveResults(evt) {
        var job = this.getCurrentJob();
        if (job) {
            job.save(
                function() {
                    Sideview.broadcastMessage("info", _("These search results have been saved. You can retrieve them later via the jobs manager."));
                }.bind(this),
                function() {
                    Sideview.broadcastMessage("error", _("Failed to save search results.  The search job may have expired."));
                }.bind(this)
            );
        }
    }

    saveAndShareResults(evt) {
        var formContainer = $(".shareLinkForm",this.container)[0];
        var title = _("Save and Share Results");
        var search = this.getContext().getSplunkSearch();
        var popup = Sideview.launchShareLinkWizard(formContainer, title, search);
    }

    createDashboardPanel(evt) {
        var search = this.getContext().getSplunkSearch();
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
        var popup = Sideview.launchDashboardPanelWizard(search, mode);

        Sideview.addExtraSavedSearchFields(popup, this);
    }

    createAlert(evt) {
        var search = this.getContext().getSplunkSearch();
        var popup = Sideview.launchSaveAlertWizard(search);
        Sideview.addExtraSavedSearchFields(popup, this);
    }

    //createReport(evt) {
    //    alert("not implemented yet");
    //}

    createEventType(evt) {
        var search  = this.getContext().getSplunkSearch();
        var formContainer = $(".eventtypeForm", this.container)[0];
        var popup = Sideview.launchCreateEventtypeWizard(formContainer, search);
        Sideview.addExtraSavedSearchFields(popup, this);
    }

    createScheduledSearch(evt) {
        var search = this.getContext().getSplunkSearch();
        var popup = Sideview.launchCreateScheduledSearchWizard(search);
        Sideview.addExtraSavedSearchFields(popup, this);
    }

    print(evt) {
        window.print();
    }

    export(evt) {
        var context = this.getContext();
        var search = context.getSplunkSearch();
        if (!search.isDispatched() || !search || !search.isDone()){
            return;
        }
        search.job.markAutoCancellable(false);
        var args = {
            output_mode: "csv"
        }
        var postProcess = search.getPostProcess();
        if (postProcess) {
            args["search"] = postProcess;
        }
        document.location = search.getUrl("results") + Sideview.dictToString(args);
    }

    resetUI() {
        this.update("null");
    }

    initMenus() {
        var container = this.container;
        $(".svMenu > li",this.container).bind("click", function(evt) {
            $(".SearchControls ul ul",container)
                .css("display", "none")
                .css("left","auto");
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
            $(".SearchControls ul ul",container).css("display", "none");
        });
    }

    hideMenus() {
        $(".SearchControls ul ul").css("display", "none");
    }

    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        var job = this.getCurrentJob(context);
        if (job && !job.isDone()) {
            this.update("progress");
            $("a.unpause", this.container).removeClass("unpause").addClass("pause");
        }

    }

    update(newState) {
        if (this.state && this.state == newState) {
            return;
        }
        this.stateWrapper
            .removeClass(this.state + "State")
            .addClass(newState + "State");
        this.state = newState;

        if (this.getParam("cssClass")) {
            var context = this.getContext();
            Sideview.setStandardTimeRangeKeys(context);
            Sideview.setStandardJobKeys(context, true);
            Sideview.applyCustomCssClass(this,context);
        }
    }

    onJobProgress(evt, job) {
        if (this.state=="paused") return;
        this.update("progress");
        var label = _("Save search...");
        if (job) {
            var reportSearch = job.getReportSearch();
            if (reportSearch) label = _("Save report...");
        }
        $(".saveSearch",this.container).text(label);
    }

    onJobDone(evt, job) {
        this.update("done");
    }
}
    return SearchControls;
});