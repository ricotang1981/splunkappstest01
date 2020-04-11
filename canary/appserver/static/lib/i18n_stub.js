function i18n_register() {

}

function _(foo) {
    return foo
}

function format_datetime(epochTime, type) {
    if (type=="long") {
        var d = new Date(parseInt(epochTime,10)* 1000);
        var locale = Sideview.getLocale();
        if (locale=="en-US") {
            return d.strftime("%m/%d/%Y %H:%M:%S");
        }
        else {
            return d.strftime("%d/%m/%Y %H:%M:%S");
        }
    }
    alert("Assertion failed - something called format_datetime with a type other than 'long'");
}
function format_datetime_range(locale, earliestTime, latestTime) {
    var range = new TimeRange(earliestTime, latestTime);
    // return range.toConciseString();
    return "ZOMG we have no timerange formatter for " + earliestTime + " to " + latestTime;
}
