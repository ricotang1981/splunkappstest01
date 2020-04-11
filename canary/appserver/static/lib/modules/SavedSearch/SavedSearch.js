define(
  ["jquery",
  "sideview",
  "api/SplunkSearch",
  "svmodule",
  "context",
  "job_monitor",
  "time_range",
  "job"],
  function($, Sideview, SplunkSearch, Module, Context, jobMinotaur, TimeRange, Job) {

class SavedSearch extends Module {

    constructor(container, params) {
        super(container, params);
        // this may or may not get pulled up where getDeferredItemsToLoad just becomes a template method
        // and if you implement it,  itemsToLoad has deferred instances in it, and if you dont
        // it's just [];
        // but right now its a bit wild west so i'm leaving it explicit.
        this.itemsToLoad = this.getDeferredItemsToLoad();
        $.when(...this.itemsToLoad)
            .done(function() {
                var sid = (this.lastJob) ? this.lastJob["name"] : null;
                var spl = this.savedSearchResult["search"];
                this.savedSearch = new SplunkSearch(spl);

                if (sid) {
                    var job = new Job(sid, spl)
                    // dont let this Job get cancelled by silly things like leaving the page.
                    job.markAutoCancellable(false);
                    this.savedSearch.job = job;

                    $(document).trigger("splunkJobLoaded", [job]);
                }

                this.timeRange = new TimeRange(
                    this.savedSearchResult["dispatch.earliest_time"],
                    this.savedSearchResult["dispatch.latest_time"]
                );

                if ("request.ui_context" in this.savedSearchResult) {

                    var uiContextStr = this.savedSearchResult["request.ui_context"]
                    console.error(uiContextStr)
                    var dict = Sideview.stringToDict(uiContextStr);
                    var c = new Context();
                    for (key in dict) {
                        console.log("setting " + key + " to " + dict[key])
                        c.set(key, dict[key]);
                    }
                    this.savedContext = c;
                }


                if (this.pushWhenDone) {
                    this.pushDownstream(this.wasPageStillLoadingOnOriginalPush);
                    this.wasPageStillLoadingOnOriginalPush = false;
                    this.pushWhenDone = false;
                }
            }.bind(this));
    }

    getDeferredItemsToLoad() {
        var name = this.getParam("name");
        var locale = Sideview.getLocale();
        var user = Sideview.getCurrentUser();
        var app = Sideview.getCurrentApp();
        var savedSearchUri = sprintf("/%s/splunkd/__raw/servicesNS/%s/%s/saved/searches/%s", locale, user, app, name);
        var args = {"output_mode":"json"};

        var deferreds = [
            Sideview.getCollection(
                savedSearchUri,
                args,
                function(results) {
                    this.savedSearchResult = results[0]["content"];
                }.bind(this),
                function(jqXHR, textStatus, errorThrown) {
                    Sideview.broadcastMessage("error",sprintf("saved search %s can not be found", name));
                    console.trace();
                }
            )
        ];

        var useHistory = this.getParam("useHistory")
        if (["Auto","True"].indexOf(useHistory)!=-1) {
            deferreds.push(Sideview.getCollection(savedSearchUri + "/history", args, function(results) {
                if (results) {
                    this.lastJob = results[results.length-1];
                }
                else if (useHistory=="True") {
                    Sideview.broadcastMessage("error", sprintf("SavedSearch module has useHistory %s but could not find any scheduled job for savedsearch %s.", useHistory, name));
                }
            }.bind(this)));
        }
        return deferreds;
    }

    resetUI() {}


    pushDownstream(isPageLoading) {
        if (!this.isReadyForContextPush()) {
            this.pushWhenDone = true;
            this.wasPageStillLoadingOnOriginalPush = isPageLoading;
            return [];
        }
        return this._pushDownstream();
    }

    getModifiedContext(context) {
        context = context || this.getContext();

        var useHistory = this.getParam("useHistory");

        context.setSplunkSearch(this.savedSearch);

        context.set("shared.timeRange", this.timeRange);
        context.set("search.name", this.getParam("name"));
        Sideview.setStandardTimeRangeKeys(context);
        Sideview.setStandardJobKeys(context);

        if (this.savedContext) {

            context.overlay(this.savedContext);
        }

        /*
        var serializedContext = this.getParam("savedContext");
        for (key in serializedContext) {
            context.set(key, serializedContext[key]);
            context.set(key+".value", serializedContext[key]);
        }
        */
        return context;
    }
}
    return SavedSearch;
});
