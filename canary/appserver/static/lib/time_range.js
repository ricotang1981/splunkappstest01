// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.

define(
    ["jquery",
    "moment",
    "twix"],
     function($, moment, Twix) {


    const UNITS   = ["millisecond","second","minute","hour","day","month","year"];
    const METHODS = {
        "millisecond":{get : "getMilliseconds", set: "setMilliseconds", min: 0},
        "second":     {get : "getSeconds",      set: "setSeconds",      min: 0},
        "minute":     {get : "getMinutes",      set: "setMinutes",      min: 0},
        "hour":       {get : "getHours",        set: "setHours",        min: 0},
        "day":        {get : "getDate",         set: "setDate",         min: 1},
        "month":      {get : "getMonth",        set: "setMonth",        min: 0},
        "year":       {get : "getFullYear",     set: "setFullYear",     min: 1970}
    }
    const UNIT_ABBREVIATIONS = {
        "second" : ["s","sec","secs","second","seconds"],
        "minute":  ["m","min","mins","minute","minutes"],
        "hour":    ["h","hr","hrs","hour","hours"],
        "day":     ["d","day","days"],
        "week":    ["w","week"],
        "month":   ["mon","month","months"],
        "year":    ["y","yr","yrs","year","years"]
    }

    var ABBREVIATION_MAP = {};
    for (key in UNIT_ABBREVIATIONS) {
        if (UNIT_ABBREVIATIONS.hasOwnProperty(key)) {
            for (var i=0;i<UNIT_ABBREVIATIONS[key].length;i++) {
                ABBREVIATION_MAP[UNIT_ABBREVIATIONS[key][i]] = key;
            }
        }
    }



    class TimeRange {

        constructor(earliest,latest) {
            this._rawEarliest = earliest;
            this._rawLatest   = latest;
            if (earliest && typeof(earliest.setTime)=="function") {
                earliest = earliest.valueOf();
            }
            if (latest && typeof(latest.setTime)=="function") {
                latest = latest.valueOf();
            }
            this._earliest    = earliest;
            this._latest      = latest;
        }
        clone() {
            //         o_O
            return new TimeRange( this._rawEarliest, this._rawLatest);
        }
        toString() {
            return this._rawEarliest + ", " + this._rawLatest;
        }
        getEarliestTimeTerms() {
            return this._earliest;
        }
        getLatestTimeTerms() {
            return this._latest;
        }

        equalToRange(range) {
            if (this._earliest!=range._earliest) return false;
            if (this._latest!=range._latest) return false;
            return true;
        }
        isAllTime() {
            return ((this._earliest=="all" || this._earliest==null || this._earliest==0) && (this._latest=="all" || this._latest==null));
        }
        isRealTime() {
            return (this._earliest && this._earliest.indexOf("rt")==0 && this._latest && this._latest.indexOf("rt")==0);
        }
        isEarliestAbsolute() {
            return (Sideview.isNumeric(this._earliest) && this._earliest>=0);
        }
        isLatestAbsolute() {
            return (Sideview.isNumeric(this._latest) && this._latest>=0);
        }

        isAbsolute() {
            return (this.isEarliestAbsolute() && this.isLatestAbsolute());
        }
        isHalfAbsolute() {
            return (this.isEarliestAbsolute() || this.isLatestAbsolute());
        }
        isRelative() {
            if (this.isAbsolute()) return false;
            if (this.isAllTime()) return false;
            return true;
        }
        getRelativeTermDict(arg) {
            var d = {};
            if (!arg) {
                console.trace();
                console.error("Error - this doesn't seem to be a relative time term " + arg);
                return d;
            }

            if (arg.indexOf("rt") == 0) {
                arg = arg.substring(2);
                d["rt"] = true;
            }
            var pieces = arg.split("@");
            if (pieces[0]=="") {
                d.count=0;
            }
            else if (parseInt(pieces[0],10)) {
                d.count = parseInt(pieces[0],10);
            }

            if (pieces.length>2) {
                throw("what the heck.  This relative time term looks malformed " + arg)

            } else {
                if (pieces.length==2) {
                    d.snapTo = pieces[1]
                }
                if (d.count==pieces[0]) {
                    d.unit = "second";
                } else {
                    d.unit = pieces[0].replace(d.count,"");
                }
            }
            return d;
        }

        toConciseString() {

            if (this.isAllTime()) {
                return _("over all time");
            }
            else if (this._earliest==0 && this._latest == "now") {
                console.error("ick... all time is screening out any events that are even a tiny bit in the future.")
                return _("over all time");
            }
            else if (this.isAbsolute()) {
                var earliestTime = moment("/Date("+(this._earliest*1000)+")/");
                var latestTime   = moment("/Date("+(this._latest*1000)+")/");

                // oh....  twix + moment are goddamn HUGE.  They're more than
                // half our whole goddamn codebase at this point
                // but.... it saves a vast amount of dev/qa time so yes. =/
                var range = earliestTime.twix(latestTime);
                return range.format();
            }
            else if (this.isEarliestAbsolute()) {
                var earliestTime = moment("/Date("+(this._earliest*1000)+")/");
                return sprintf(_("since %s"), earliestTime.format("LLL"));
            }
            else if (this.isLatestAbsolute()) {
                var latestTime = moment("/Date("+(this._latest *1000)+")/");
                return sprintf(_("before %s"), latestTime.format("LLL"));
            }

            else if (this.isRelative()) {
                try {
                    var relDictEarliest = this.getRelativeTermDict(this._earliest);
                    var fullUnit = ABBREVIATION_MAP.hasOwnProperty(relDictEarliest.unit)?ABBREVIATION_MAP[relDictEarliest.unit]:relDictEarliest.unit;

                    if (this._latest=="now" && relDictEarliest.count<0) {
                        var count = - relDictEarliest.count;
                        fullUnit = (count==1)? fullUnit : fullUnit+"s";

                        return "last " + count + " " + fullUnit;
                    } else {
                        //var relDictLatest   = this.getRelativeTermDict(this._latest);
                        return "custom relative range";
                    }
                }
                catch(e) {
                    console.error("Exception thrown parsing this as a relative arg" + this._earliest + ", " + this._latest + "\n" + e);
                }
            }
        }

        containsRange(range) {
            if (!this.isAbsolute() || !range.isAbsolute()) return -1;
            //if (this.equalToRange(range)) return true;
            return (this.getEarliestTimeTerms() <= range.getEarliestTimeTerms()  && this.getLatestTimeTerms() >= range.getLatestTimeTerms());
        }

        unitsRedundantBelow() {
            if (!this.isAbsolute()) {
                throw "Assertion Failed - unitsRedundantBelow called on an All Time timerange";
            }
            var earliest = new Date(this._earliest);
            var latest = new Date(this._latest);

            for (var i=0;i<UNITS.length;i++) {
                var unit = UNITS[i];
                var methods = METHODS[unit];

                if (earliest[methods["get"]]() != methods["min"] ||
                    latest[methods["get"]]() != methods["min"]) {
                    return unit;
                }
            }
            return "millisecond";
        }

        boundariesAreEqualAbove() {
            if (!this.isAbsolute()) throw "Assertion Failed - boundariesAreEqualAbove called on an All Time timerange";
            var earliest = new Date(this._earliest);
            var latest = new Date(this._latest);
            var equalAbove = "year";
            for (var i=UNITS.length-1;i>=0; i--) {
                var unit = UNITS[i];
                var methods = METHODS[unit];

                if (earliest[methods["get"]]() != latest[methods["get"]]()) {
                    return equalAbove;
                }
                equalAbove = unit;
            }
            throw "Assertion failed - TimeRange.boundariesAreEqualAbove reached the end";
        }
    };


    return TimeRange;

});






