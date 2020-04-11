// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.

define(
    [],
     function() {

class TimeZone {

    constructor(tzInfo) {
        this._tzInfo = tzInfo;

        this._standardOffsetSeconds = null;
        this._tzInfo = null;

        this._isConstant = false;
        this._offsetList =[];
        this._timeList   =[];
        this._indexList  =[];

        this.readOffsets(tzInfo);
    }

    getSerializedTimeZone() {
        return this._tzInfo;
    }

    numericBinarySearch(value) {
        if (!this._timeList) throw new TypeError("timeList must be non-null.");
        var high = this._timeList.length - 1;
        if (high < 0) return -1;

        var low = 0;
        var mid;
        var comp;

        while (low <= high) {
            mid = parseInt(low + (high - low) / 2, 10);
            comp = (value - this._timeList[mid]);

            if (comp < 0) {
                high = mid - 1;
            } else if (comp > 0) {
                low = mid + 1;
            } else {
                return mid;
            }
        }
        return -low - 1;
    }

    getOffset(epochTime) {
        if (this._isConstant) {
            return this._standardOffsetSeconds;
        }
        if (this._offsetList.length == 0) return 0;
        if (this._offsetList.length == 1) return this._offsetList[0];
        if (this._timeList.length == 0)   return 0;

        var timeIndex;
        if (this._timeList.length == 1) {
            timeIndex = 0;
        }
        else {
            timeIndex = this.numericBinarySearch(epochTime);
            if (timeIndex < -1) {
                timeIndex = -timeIndex - 2;
            } else if (timeIndex == -1) {
                timeIndex = 0;
            }
        }
        var offsetIndex = this._indexList[timeIndex];
        return this._offsetList[offsetIndex];
    }

    readOffsets(tzInfo) {
        // ### SERIALIZED TIMEZONE FORMAT 1.0
        // Y-25200 YW 50 44 54
        // Y-28800 NW 50 53 54
        // Y-25200 YW 50 57 54
        // Y-25200 YG 50 50 54
        // @-1633269600 0
        // @-1615129200 1
        // @-1601820000 0
        // @-1583679600 1

        // ### SERIALIZED TIMEZONE FORMAT 1.0
        // C0
        // Y0 NW 47 4D 54

        if (!tzInfo)
            return;

        var entries = tzInfo.split(";");
        for (var i=0; i<entries.length; i++) {
            var entry = entries[i];
            var entryVal = entry.substring(1,entry.length);
            if (!entryVal) continue;
            var elements = entryVal.split(" ");

            if (entry) {
                switch (entry.charAt(0)) {
                    case "Y":
                        if (elements.length < 1) continue;
                    case "@":
                        if (elements.length < 2) continue;
                        var element = elements[0];
                        if (!element) continue;
                        var elementInt = parseInt(element, 10);
                        if (element != elementInt) continue;
                }
                switch (entry.charAt(0)) {
                    case "C":
                        var time = parseInt(entryVal, 10);
                        if (time != entryVal) return false;
                        this._standardOffsetSeconds = time;
                        this._isConstant = true;
                        return;
                    case "Y":   // -25200 YW 50 44 54
                        this._offsetList.push(elementInt);
                        break;
                    case "@":   // -1633269600 0
                        element = elements[1];
                        if (!element)  continue;
                        var index = parseInt(element, 10);
                        if (index != element) continue;
                        if ((index < 0) || (index >= this._offsetList.length)) continue;
                        this._timeList.push(elementInt);
                        this._indexList.push(index);
                        break;
                    default:
                        break;
                }
            }
        }
        this._standardOffsetSeconds = this.getOffset(0);
    }
};
    return TimeZone;
});






