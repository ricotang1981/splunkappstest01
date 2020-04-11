// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class Filters extends Module {

    constructor(container, params) {
        super(container, params);
        this.name = this.getParam("name");
        this.filters = [];
        this.container.click(this.onClick.bind(this));
    }

    onContextChange(context) {
        if (!context) context = this.getContextWithReprimand();
        Sideview.applyCustomCssClass(this,context);
        if (context.has(this.name)) {
            this.setToContextValue(context);
            this.clearURLLoader(context);
        }
    }

    resetToDefault() {
        this.filters = [];
        this.renderFilters();
    }

    setToContextValue(context) {
        try {
            var value = JSON.parse(context.get(this.name));
        } catch(e) {
            console.error(e);
            return;
        }
        if (!value) value=[];
        else this.filters = value;
        this.renderFilters();
    }

    clearURLLoader(context) {
        context = context || this.getContext();
        if (!this.hasClearedURLLoader && context.has("sideview.onSelectionSuccess")) {
            var callback = context.get("sideview.onSelectionSuccess");
            callback(this.name, this);
            this.hasClearedURLLoader = true;
        }
    }

    onPassiveChange() {
        var context = this.getContext();
        if (context.has("sideview.onEditableStateChange")) {
            var currentValue = JSON.stringify(this.filters);
            if (this.lastEdit==null || currentValue!=this.lastEdit) {
                var callback = context.get("sideview.onEditableStateChange");
                callback(this.name, currentValue, this);
                this.lastEdit = currentValue;
            }
        }
    }

    renderFilters() {
        var labelTemplate = this.getParam("labelTemplate");
        var context = this.getContext();
        this.container.html("");
        var negation,field,operator,value;
        for (var i=0,len=this.filters.length;i<len;i++) {
            negation = this.filters[i].negation
            field = this.filters[i].field;
            operator = this.filters[i].operator;
            value = this.filters[i].value;
            // spaces are fine. replace only nulls.
            if (operator==null) operator="=";
            if (negation==null) negation="";
            negation = (negation)? "NOT" : "";

            context.set("negation", negation);
            context.set("field", field);
            context.set("operator", operator);
            context.set("value", value);
            var label = Sideview.replaceTokensFromContext(labelTemplate, context);
            var term = $("<div>")
                .addClass("filter")
                .append($("<div>")
                    .addClass("filterLabel")
                    .text(label)
                )
                .append($("<a>")
                    .attr("href","#")
                    .attr("s:negation",negation)
                    .attr("s:field",field)
                    .attr("s:operator",operator)
                    .attr("s:value",value)

                    .text("x")
                    .addClass("closeLink")
                )
            this.container.append(term);
        }
        this.container.append($("<div>").addClass("clearFloats"));
    }

    addNewFilter(field,value,operator) {
        var filter = {
            "value" : value
        }
        if (field) {
            filter["field"] = field;
        }
        if (operator!=null) {
            filter["operator"] = operator;
        }
        this.filters.push(filter);
        this.onPassiveChange();
        this.renderFilters();
        this.pushDownstream();
    }

    removeFilter(field,value) {
        for (var i=0,len=this.filters.length;i<len;i++) {
            if (this.filters[i].field == field && this.filters[i].value == value) {
                this.filters.splice(i,1);
                break;
            }
        }
        this.onPassiveChange();
        this.renderFilters();
        this.pushDownstream();
    }

    onClick(evt) {
        try {
            var elt = $(evt.target);
            if (elt.hasClass("closeLink")) {
                this.removeFilter(elt.attr("s:field"), elt.attr("s:value"));
            }
            evt.preventDefault();
        }
        catch(e) {
            console.error(e);
        }

        return false;
    }

    getModifiedContext(context) {
        context = context || this.getContext();
        var terms = Sideview.getSearchTermsFromFilters(this.filters);
        var fields = [];
        for (var i=0,len=this.filters.length;i<len;i++) {
            if (this.filters[i].field && (!this.filters[i].negation && (!this.filters[i].operator || this.filters[i].operator=="="))) {
                fields.push(this.filters[i].field);
            }
        }
        context.set(this.name, terms.join(" "));
        context.set(this.name + ".addNewFilter", this.addNewFilter.bind(this));
        context.set(this.name + ".fields", fields.join(" "));
        context.set(this.name + ".json", JSON.stringify(this.filters));
        return context;
    }

    /**
     * called when a module receives new context data from downstream.
     * This is rare, and only happens in configurations where custom behavior
     * logic is sending values upstream during interactions, for weird things
     * like Filters/Pulldown/TextField,  to 'catch'.
     */
    applyContext(context) {
        if (this.isPageLoadComplete() && context.has(this.name)) {
            this.setToContextValue(context);
            this.onPassiveChange();
            context.remove(this.name);
            if (context.isNull()) {
                this.pushDownstream();
                // stop the upward-travelling context.
                return true;
            }
         }
     }

}
    return Filters;
});