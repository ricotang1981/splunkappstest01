// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.

define(
  ["jquery",
  "sideview",
  "time_range"],
  function($, Sideview, TimeRange) {

class Job {

    constructor(sid, s) {
        this.setSearchId(sid);
        this._search  = s;


        //this.ENDPOINT = "/api/search/jobs";
        this.ENDPOINT = "/splunkd/__raw/search/jobs";

        // it's confusing in the client code to have these start undefined... so we set them to 0.
        this._scanCount = 0;
        this._eventCount = 0;
        this._eventAvailableCount = 0;
        this._resultCount = 0;
        this._doneProgress = 0;
        this._canBeAutoCancelled = true;

        this._isCancelled = false;
    }

    isDone() {
        return this._isDone;
    }

    isCancelled() {
        return this._isCancelled;
    }

    isPaused() {
        return this._isPaused;
    }

    isSaved() {
        return this._isSaved;
    }

    isPreviewable() {
        return this._isPreviewEnabled;
    }

    isQueued() {
        return this._dispatchState == "QUEUED";
    }

    isParsing() {
        return this._dispatchState == "PARSING";
    }

    isRunning() {
        return (!this._isDone && !this._isPaused && !this.isQueued() && !this.isParsing());
    }

    isRealTimeSearch() {
        return this._isRealTimeSearch;
    }

    areResultsTransformed() {
        return (this._reportSearch !== null);
    }

    canBeAutoCancelled() {
        if (this.isSaved()) return false;
        return this._canBeAutoCancelled;
    }

    canGetResults() {
        if (this.isDone()) {
            return true;
        }
        if (this.isPreviewable() || this.getResultCount() > 0) {
            return true;
        }
        return false;
    }

    getSearchId() {
        return this._sid;
    }

    getSearch() {
        return this._search;
    }

    getEventSearch() {
        return this._eventSearch;
    }

    getReportSearch() {
        return this._reportSearch;
    }

    getTimeRange() {
        if (!this._earliestTime || !this._latestTime) {
            return new TimeRange();
        }
        if (Number.isInteger(this._earliestTime) && Number.isInteger(this._latestTime)) {
            return new TimeRange(this._earliestTime, this._latestTime);
        }
        else {
            console.warn("Job.getTimeRange() -- tz offset and dst are not fully trusted because we're using the browser still here. earliest=%s latest=%s", this._earliestTime, this._latestTime);
            var earliest = new Date(this._earliestTime).valueOf()/1000;
            var latest = new Date(this._latestTime).valueOf()/1000;
            return new TimeRange(earliest, latest);
        }
    }

    getCursorTime() {
        return this._cursorTime;
    }

    getStatusBuckets() {
        return this._statusBuckets;
    }

    setSearchId(sid) {
        this._sid = sid;
    }

    modifyJob(action, onSuccess, onFailure) {
        if (!onFailure) {
            var sid = this._sid;
            onFailure = function(jqXHR, textStatus, errorThrown) {
                console.error(sprintf("unexpected failure trying to %s job sid=%s", action, sid));
            };
        }
        $.ajax({
            type: "POST",
            url: Sideview.make_url(this.ENDPOINT, this._sid, "control"),
            data: {"action": action,  "wait":0, "output_mode":"json"},
            dataType: "json",
            success: function(data, textStatus, jqXHR) {
                if (onSuccess) onSuccess(data, textStatus, jqXHR);
                else console.log(sprintf("generic success for action=%s yay", action))
            },
            error:   function(jqXHR, textStatus, errorThrown) {
                onFailure(jqXHR, textStatus, errorThrown);
                console.trace();
            }
        });
    }


    save(onSuccess, onFailure) {
        this.modifyJob("save", onSuccess, onFailure);
    }

    pause(onSuccess, onFailure) {
        this.modifyJob("pause", onSuccess, onFailure);
    }

    unpause(onSuccess, onFailure) {
        this.modifyJob("unpause", onSuccess, onFailure);
    }

    finalize(onSuccess, onFailure) {
        this.modifyJob("finalize", onSuccess, onFailure);
    }

    cancel(callerOnSuccess, onFailure) {
        var onSuccess = function() {
            $(document).trigger("splunkJobCancelled", [this._sid]);
            if (callerOnSuccess) callerOnSuccess();
            this._sid = null;
        }.bind(this);
        this.modifyJob("cancel", onSuccess, onFailure);
        this._isCancelled = true;
    }

    setPreviewable() {
        alert("setPreviewable UNIMPLEMENTED");
    }

    markAutoCancellable(bool) {
        this._canBeAutoCancelled = bool;
    }

    getApp() {
        if (this.hasOwnProperty("_eai:acl")) {
            var acl = this["_eai:acl"];
            if (acl.hasOwnProperty("app")) return acl.app;
        }
        return false;
    }

    getDispatchView() {
        if (this._request && this._request.ui_dispatch_view) {
            return this._request.ui_dispatch_view;
        } else {
            console.warn("someone asked for a dispatchview and this job doesn't have one")
            console.warn(this._request);
            console.trace();
        }
        return false;
    }

    getResultCount() {
        if (!this._isDone && this._isPreviewEnabled && Sideview.isInteger(this._resultPreviewCount)) {
            return this._resultPreviewCount;
        }
        else if (Sideview.isInteger(this._resultCount)) {
            return this._resultCount;
        }
        return 0;
    }

    getScanCount() {
        return this._scanCount;
    }

    getEventCount() {
        return this._eventCount;
    }

    getEventAvailableCount() {
        return this._eventAvailableCount;
    }

    getEventFieldCount() {
        return this._eventFieldCount;
    }

    getDoneProgress() {
        var p = this._doneProgress;
        if (!p) return 0;
        else if (p.toString().endsWith("%")) {
            p = p.substring(0,p.length-1);
        }
        return parseFloat(p);
    }
}

    return Job;
});