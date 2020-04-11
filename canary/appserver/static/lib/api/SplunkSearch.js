// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.




define(
  ["jquery",
  "sideview",
  "time_range",
  "job",
  "job_monitor",
  "api/api"],
  function($, Sideview, TimeRange, Job, jobMinotaur, API) {

class SplunkSearch extends API {

    constructor(str) {
        super();
        this.str= str;
        this.statusBuckets = 0;
        this.requiredFields = [];
        this.selectedEventCount = -1;
        this.selectedEventAvailableCount = -1;
        this.preview = false;
    }

    getAPI() {
        return "splunk";
    }

    clone() {
        //          o_O
        var s = new SplunkSearch(this.str);

        s.statusBuckets = this.statusBuckets;
        s.requiredFields = $.extend([],this.requiredFields);
        s.selectedEventCount = this.selectedEventCount;
        s.selectedEventAvailableCount = this.selectedEventAvailableCount;

        s.maxTime = this.maxTime;
        // NOTE WE DO NOT CLONE THE JOB!!
        if (this.job) s.job = this.job;
        s.postProcess = this.postProcess;

        s.preview = this.preview;
        return s;
    }

    isDispatched() {
        return !!(this.getSearchId());
    }

    isDone() {
        return (this.job && this.job.isDone());
    }

    getResultCount() {
        if (this.job) {
            return this.job.getResultCount();
        }
        return 0;
    }

    getDoneProgress() {
        if (!this.job) return false;
        if (this.job.isRealTimeSearch()) return false;

        return this.job.getDoneProgress();
    }

    canGetResults() {
        if (!this.isDispatched()) {
            return false;
        }
        if (this.isDone()) {
            return true;
        }
        if (this.job && (this.job.isPreviewable() || this.getResultCount() > 0)) {
            return true;
        }
        //console.error(sprintf("dispatched, not done, but previewable=%s and resultCount=%s so canGetResults() returns false", this.job.isPreviewable(), this.getResultCount()));
        return false;
    }

    toString() {
        return this.str;
    }

    setBaseSearch(str) {
        this.str = str;
    }

    getSearchId() {
        if (this.job) {
            return this.job.getSearchId();
        }
        return false;
    }

    setSavedSearchName(name) {
        this.savedSearchName = name;
    }

    getSavedSearchName() {
        this.savedSearchName;
    }

    getPostProcess() {
        return this.postProcess;
    }

    setPostProcess(str) {
        this.postProcess = str;
    }

    getMinimumStatusBuckets() {
        return this.statusBuckets;
    }

    setMinimumStatusBuckets(statusBuckets) {
        if (statusBuckets > this.statusBuckets) {
            this.statusBuckets = statusBuckets;
        }
    }

    getRequiredFields() {
        return this.requiredFields;
    }

    setRequiredFields(fields) {
        fields = $.extend([], fields);

        if (this.requiredFields.length==1 && this.requiredFields[0]=="*") {
            return;
        }
        if (fields.length==1 && fields[0]=="*") {
            this.requiredFields = ["*"];
            return;
        }
        for (var i=0,len=fields.length; i<len; i++) {
            if (this.requiredFields.indexOf(fields[i])==-1) {
                this.requiredFields.push(fields[i]);
            }
        }
    }

    getUrl(endpoint, args) {
        args = args || {};

        if (!this.getSearchId()) {
            console.error("getURL called on a search with no sid");
        }

        //var url = ["api","search","jobs", this.getSearchId(), endpoint];
        var url = ["splunkd","__raw","search","jobs", this.getSearchId(), endpoint];

        return Sideview.make_url(url.join("/")) + "?" + Sideview.dictToString(args);
    }

    abandonJob() {
        this.job = null;
        this.statusBuckets = 0;
        this.requiredFields = [];
        this.selectedEventCount = -1;
        this.selectedEventAvailableCount = -1;
    }

    background() {}

    _getJobFromMinotaur() {
        var sid = this.job.getSearchId();
        if (jobMinotaur.hasJob(sid)) {
            return jobMinotaur.getJob(sid);
        }
        return false
    }

    getJob() {
        if (!this.job) {
            console.error("BLUE WIRE ALERT!!!!");
            console.trace();
            return false;
        }
        var minotaurJob = this._getJobFromMinotaur();
        if (this.job === minotaurJob) {
            return this.job;
        }
        if (this.job && !minotaurJob) {
            console.error("BLUE WIRE - this is the case where we only just triggered splunkJobDispatched and the minotaur has to wait until the end of hte call stack to add the sid to its internal dict?  or something like that? ");
            console.error(this.job);
            console.error(minotaurJob);
            return false;
        }
        return this.job;
    }

    getEventCount() {
        if (!isDispatched()) return 0;
        if (this.selectedEventCount != -1) return this.selectedEventCount;
        return this.job.getEventCount();
    }

    getEventAvailableCount() {
        if (this.selectedEventAvailableCount != -1) return this.selectedEventAvailableCount;
        return this.job.getEventAvailableCount();
    }

    setSelectedEventCount(count) {
        this.selectedEventCount = count;
    }

    setSelectedEventAvailableCount(count) {
        this.selectedEventAvailableCount = count;
    }

    getDispatchArgs(range, tz) {
        var args = {
            "auto_cancel"        : Sideview.getAutoCancelInterval(),
            "label"              : this.getSavedSearchName(),
            "max_time"           : this.getMaxTime(),
            "preview"            : this.getPreview(),
            "search"             : Sideview.addInitialCommandIfAbsent(this.str),
            "status_buckets"     : this.getMinimumStatusBuckets(),
            "namespace"          : Sideview.getCurrentApp(),
            "ui_dispatch_app"    : Sideview.getCurrentApp(),
            "ui_dispatch_view"   : Sideview.getCurrentDisplayView(),
            "wait": 0
        };
        if (tz) {
            args["tz"] = tz;
        }
        // sneak in to remove our all/all because splunkd wont know what we're talking about.
        // Also we have to be careful because this _constructorArgs property
        // is only on the legacy Splunk TimeRange, not the newer better Sideview one.
        if (range) {
            if (range.hasOwnProperty("_constructorArgs")) {
                if (range._constructorArgs[0]=="all" || range._constructorArgs[1]=="all") {
                    for (var i=0;i<2;i++) {
                        if (range._constructorArgs[i]=="all") range._constructorArgs[i] = false;
                    }
                }
            }
            args["earliest_time"] = range.getEarliestTimeTerms() || "";
            args["latest_time"]   = range.getLatestTimeTerms() || "";
            var isHalfAbsolute = (range.isHalfAbsolute)? range.isHalfAbsolute() : (range.getAbsoluteEarliestTime() || range.getAbsoluteLatestTime());
            if (isHalfAbsolute) {
                args["timeFormat"] = "%s.%Q";
            }
        } else {
            args["earliest_time"] = "";
            args["latest_time"] = "";
        }
        var nonNullArgs = ["adhoc_search_level","auto_finalize_ec","label","max_count","max_time","preview"];
        for (var i=0,len=nonNullArgs.length;i<len;i++) {
            if (!args[nonNullArgs[i]]) {
                delete args[nonNullArgs[i]];
            }
        }
        var fields = this.getRequiredFields();
        if (fields.length > 0) {
            args["required_field_list"] = fields.join(",");
        }
        return args;
    }

    dispatch(onSuccess, onFailure, timeRange, tz) {
        if (!this.str) {
            console.error('asked to dispatch a search with no search string');
            console.trace();
            return [];
        }
        return $.ajax({
            type: "POST",
            url: Sideview.make_url("/api/search/jobs"),
            data: this.getDispatchArgs(timeRange, tz),
            success: function(data, textStatus, jqXHR) {
                return this.dispatchSuccess(data, textStatus, jqXHR, onSuccess, onFailure);
            }.bind(this),
            error: function(jqXHR, textStatus, errorThrown) {
                return this.dispatchFailure(jqXHR, textStatus, errorThrown, onFailure);
            }.bind(this),
            dataType: "json"
        });
    }

    dispatchSuccess(data, textStatus, jqXHR, onSuccess, onFailure) {
        var success = data["success"]
        var sid = data["data"];
        if (success && sid) {

            this.job = new Job(sid);
            $(document).trigger("splunkJobDispatched", [this.job]);

            onSuccess(this);
            //jobMinotaur.monitorJob(null, this.job);
            //$(document).trigger("splunkJobDispatched", [this.job]);
        }
        else if (!success) {
            var messages = data["messages"] || [];

            messages.forEach(function(obj) {
                var messageText = _(obj.message);
                if (obj.type) {
                    messageText = _(obj.type) + ": " + messageText;
                }
                Sideview.broadcastMessage("error", messageText);
            });

            if (onFailure) onFailure(this);
        }
        else {
            Sideview.broadcastMessage("error", _("Received a successful response from a dispatch POST but no sid:"));
            if (onFailure) onFailure(this);
        }
    }

    dispatchFailure(jqXHR, textStatus, errorThrown, onFailure) {
        var status = jqXHR.status || "unknown";
        if (jqXHR.status=="401") {
            Sideview.redirectToLogin();
        }
        Sideview.broadcastMessage("error", sprintf(_("Failed to dispatch search. %s %s received from splunkd."), status, errorThrown));
        if (onFailure) onFailure(this);
    }

    setPreview(preview) {
        if (!{"true":1,"false":1,"auto":1}.hasOwnProperty(preview)) {
            console.error("Someone tried to set an illegal value for the preview arg - " + preview);
            return;
        }
        this.preview = preview;
    }

    getPreview() {
        return this.preview || false;
    }

    setMaxTime(t) {
        this.maxTime = t;
    }

    getMaxTime() {
        return this.maxTime;
    }

    getIntentionReference() {
        return false;
    }
}

    if (!window.Splunk) {
        window.Splunk = {};
    }
    window.Splunk.Search = SplunkSearch;
    return SplunkSearch;

});