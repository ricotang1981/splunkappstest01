// Copyright (C) 2013-2019 Sideview LLC.  All Rights Reserved.
define(
  [
    "jquery",
    "job"
  ],
  function($, Job) {

    class JobMonitor {

        constructor() {
            $(document).bind("splunkJobDispatched", this.monitorJob.bind(this));
            $(document).bind("splunkJobLoaded", this.monitorJob.bind(this));
            $(document).bind("splunkJobCancelled", this.onJobCancelled.bind(this));

            // all would-be client code needs the deferred reference returned so... as a triggerable event it's useless.
            // possibly these other two events should die too..
            //$(document).bind("splunkJobLoaded", this.onJobLoaded.bind(this));

            setInterval(this.retouch.bind(this), 60000);
            this.lastETag= 0;
            this.jobs= {};
            this.jobsWePersonallyEliminated = {}
            this.jobProps= ["scanCount", "eventCount", "eventAvailableCount", "resultCount", "dispatchState"];
            this.jobCallbacks= {};
            this.pageIsUnloading = false;

            //$(window).on("beforeunload", this.onWindowUnload.bind(this));
        }

        onJobCancelled(evt, sid) {
            this.removeJob(sid);
        }



        onJobLoaded(event, job, callback) {
            return this.monitorJob(event,job, callback);
        }

        onWindowUnload(evt) {
            this.pageIsUnloading = true;
            for (var sid in this.jobs) {
                var job = this.jobs[sid];
                if (job.canBeAutoCancelled()) {
                    if (!job.isRunning()) {
                        //console.info("we're cancelling a job that isn't running. However keeping the dispatch directory clean is good.");
                    }
                    job.cancel();
                }
            }
        }

        monitorJob(event,job,callback) {
            if (!job) {
                console.error("ASSERTION FAILED - JobMonitor received a null.");
                console.trace();
            }

            var sid = job.getSearchId();
            if (!sid) {
                console.error("ASSERTION FAILED - JobMonitor received a job without a SID.");
                console.trace();
            }
            this.jobs[sid] = job;
            if (job.isDone()) {
                $(document).trigger("splunkJobDone", [job]);
                if (callback) callback(job);
                return;
            }
            else if (callback) {
                this.jobCallbacks[sid] = callback;
            }
            return this.check();
        }

        hasJob(sid) {
            return this.jobs.hasOwnProperty(sid);
        }

        getJob(sid) {
            if (this.jobs.hasOwnProperty(sid)) return this.jobs[sid];
            else {
                var job = new Job(sid, "*");
                this.jobs[sid] = job;
                return job;
            }
        }

        removeJob(sid) {
            if (this.jobs.hasOwnProperty(sid)) {
                this.jobsWePersonallyEliminated[sid] = 1;
                delete this.jobs[sid];
            }
        }

        getArgs() {
            var sids = [];
            for (var sid in this.jobs) {

                if (this.jobsWePersonallyEliminated.hasOwnProperty(sid)) {
                    console.info("likely race condition between the cancel and the check(), so we're removing this job a second time. sid=" + sid);
                    this.removeJob(sid);
                    continue;
                }
                var job = this.jobs[sid];
                if (this.jobs.hasOwnProperty(sid)) {
                    if (!job.isCancelled() && (job.isRunning() || job.isPaused() || job.isQueued() || job.isParsing())) {
                        sids.push(sid);
                    }
                }
            }
            var args = {};
            args["s"] = sids;
            return args;
        }

        check() {
            var beforeSend = function(xhr) {
                if (this.lastETag) {
                    try {
                        xhr.setRequestHeader("If-None-Match", this.lastETag);
                    } catch (e) {}
                }
            }.bind(this);

            var sendTime = (new Date()).getTime();
            return $.ajax({
                type: "GET",
                dataType: "json",
                url: Sideview.make_url("/api/search/jobs"),
                data: this.getArgs(),
                beforeSend: beforeSend,
                complete: function(xhr, status) {
                    this.updateStatusValues(xhr, status, sendTime);
                }.bind(this),
                error: this.onUpdateError.bind(this)
            });
        }

        handleMissingJob(jobRecord) {
            var sid = jobRecord.sid;
            if (this.jobs.hasOwnProperty(sid)) {
                if (!this.getJob(sid).isCancelled()) {
                    Sideview.broadcastMessage("info", sprintf(_("The job \"%(sid)s\" either expired or was cancelled."), {"sid": sid}));
                    //$(document).trigger("jobStatusChanged", [sid, "cancel"]);
                    $(document).trigger("splunkJobCancelled", [sid]);
                }
                this.removeJob(sid);
            }
        }

        retouch() {
            var controlEndpoint = Sideview.make_url("/api/search/jobs/control");
            var pruneMissingJobs = function(r) {
                if (r && r.hasOwnProperty("data") && r.data.length > 0) {
                    for (var i=0,len=r.data.length; i<len; i++) {
                        if (!r.data[i]["response"]) {
                            this.removeJob(r.data[i]["sid"]);
                        }
                    }
                }
            }.bind(this);
            var sids = [];
            for (var sid in this.jobs) {
                if (this.jobs.hasOwnProperty(sid)) {
                    sids.push(sid);
                }
            }
            if (sids.length>0) {
                $.post(controlEndpoint, {action:"touch",sid:sids}, pruneMissingJobs, "json");
            }
        }

        updateJobFromJSON(jobRecord) {
            var localJob = this.getJob(jobRecord.sid);
            for (var key in jobRecord) {
                if (jobRecord.hasOwnProperty(key)) {
                    // this clones a copy of the little nested request dictionary verbatim
                    if (key=="request") {
                        localJob._request =  $.extend({}, jobRecord[key]);
                        continue;
                    }
                    localJob["_" + key] = jobRecord[key];
                }
            }
        }

        updateStatusValues(xhr, status, sendTime) {
            var receiveTime = (new Date()).getTime();
            var responseTimeMS = receiveTime - sendTime;
            var millisecondsBeforeNextCheck = Math.min(1200, responseTimeMS*4);
            //console.log(responseTimeMS + ", " + millisecondsBeforeNextCheck);
            this.lastETag = xhr.getResponseHeader("Etag");
            if (xhr.status == 304) {
                clearTimeout(this.timeout);
                this.timeout = setTimeout(this.check.bind(this), millisecondsBeforeNextCheck);
                //do we have to worry about real time searches?
                return;
            }

            var json = xhr.responseJSON;

            if (!json) {
                if (!this.pageIsUnloading) {
                    console.error("this shouldn't happen but we didn't get back JSON from the jobs endpoint. Most likely the request was aborting because the page was unloading.");
                }
                return;
            }

            var jobResults = json.data;

            if (!jobResults || !(jobResults instanceof Array)) {
                if (json.messages) {
                    for (var i=0, len=json.messages.length; i<len; i++) {
                        Sideview.broadcastMessage(json.messages[i].type.toLowerCase(), json.messages[i].message);
                    }
                }
                return;
            }

            for (var i=0, len=jobResults.length;i<len; i++) {
                var jobRecord = jobResults[i];

                var localJob = this.getJob(jobRecord.sid);

                if (jobRecord.hasOwnProperty("__notfound__")) {
                    if (!this.jobsWePersonallyEliminated.hasOwnProperty(jobRecord.sid)) {
                        this.handleMissingJob(jobRecord);
                    }
                    continue;
                }

                var hasFinished   = false;
                var progressedWithRespectTo=[];

                // Note that as written, if a job has progressed AND completed,  we will ONLY fire splunkJobDone.
                if (!localJob.isDone() && jobRecord["isDone"]) {
                    hasFinished   = true;
                }
                else {
                    var p;
                    for (var j=0,jLen=this.jobProps.length;j<jLen;j++) {
                        p = this.jobProps[j];
                        if (jobRecord[p]!=null && localJob["_" + p]!=null && localJob["_" + p] != jobRecord[p]) {
                            //console.error(localJob["_" + p] + " != " + jobRecord[p]);
                            progressedWithRespectTo.push(p);
                        }
                        //else {
                        //    console.error("no progress " + p + " " + jobRecord[p] + " " + localJob["_" + p] + " last_time:" + localJob["_" + p] + " != current:" + jobRecord[p]);
                        //}
                    }
                }

                this.updateJobFromJSON(jobRecord);

                if (progressedWithRespectTo.length>0) {
                    //console.error("job " + jobRecord.sid + " has progressed wrt " + progressedWithRespectTo.join(","));

                    $(document).trigger("splunkJobProgress", [localJob]);
                }
                if (hasFinished) {
                    //console.error("job " + jobRecord.sid + " has completed");
                    $(document).trigger("splunkJobDone", [localJob]);
                    // if we were given an explicit callback of this job.
                    // in practical terms, if this was loaded from SavedSearch or URLLoader.
                    if (this.jobCallbacks.hasOwnProperty(localJob.getSearchId())) {
                        this.jobCallbacks[localJob.getSearchId()](localJob);
                        delete this.jobCallbacks[localJob.getSearchId()];
                    }
                }
            }

            for (var sid in this.jobs) {
                var job = this.jobs[sid];
                if (this.jobs.hasOwnProperty(sid)) {
                    if (!job.isCancelled() && !job.isDone() && (job.isRunning() || job.isPaused() || job.isQueued() || job.isParsing())) {
                        clearTimeout(this.timeout);
                        this.timeout = setTimeout(this.check.bind(this),millisecondsBeforeNextCheck);
                        //console.error("checking again in " + millisecondsBeforeNextCheck + "ms");
                        break;
                    }
                }
            }
        }

        onUpdateError(xhr, status) {
            // if the window is unloading, XHR requests can get aborted and these would alarm people for no reason
            if (!this.pageIsUnloading) {
                console.error("we have an unexpected error on update status=" + status);
                console.trace();
            }
        }
    }

    // returning the instance and not the class, meaning this...
    // is...
    // a...
    // SINGLETON.   Say it with me.
    // besides who ever heard of a labyrinth having two minotaurs.
    var jobMinotaur = new JobMonitor();
    return jobMinotaur;
});