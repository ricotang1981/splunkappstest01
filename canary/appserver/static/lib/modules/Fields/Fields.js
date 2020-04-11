// Copyright (C) 2016-2019 Sideview LLC.  All Rights Reserved.


define(
  ["jquery",
  "jquery-ui",
  "sideview",
  "svmodule"],
  function($, jqueryUI, Sideview, Module) {

class Fields extends Module {

    constructor(container, params) {

        super(container, params);

        this.CURRENT_FIELDS_PREF = "display.results.currentFields";
        this.DEFAULT_FIELDS_PREF = "display.results.defaultFields"

        // fallback that only applies in the moments before the page preferences call comes back.
        // even if there are NO prefs for this page,  there's a call to this.loadPreferences({});
        this.fieldsFromParam = this.getParam("fields","").split(/[\s,]+/);
        this.fields = this.fieldsFromParam;
        this.defaultFields = this.fieldsFromParam;

        $('<button class="svButton">')
            .text("Edit Fields")
            .click(this.openLayer.bind(this))
            .appendTo(container);

        this.layer = $('<div>')
            .attr("id",this.moduleId + "_layer")
            .addClass("fieldsModuleLayer")
            .addClass("modalPopup")
            .addClass("fieldsModuleLayerClosed");
        $(document).bind("keyup", this.onKeyUp.bind(this));
    }

    lazyBuildLayer() {
        if (this.availableFields) return false;

        this.availableFields = $("<ul>")
            .addClass("availableFields");

        this.selectedFields = $("<ul>")
            .addClass("selectedFields");

        for (var i=0; i<this.fields.length; i++) {
            this.addSelectedField(this.fields[i]);
        }
        this.selectedFields.sortable({helper: 'clone'});


        this.layer
            .append($("<div>")
                .addClass("availableSide")
                .append($("<h4>").text("Available Fields"))
                .append($("<div>").addClass("filterAvailableFields")
                    .append($("<label>").text("filter"))
                    .append($("<input>").attr("type","text").keyup(this.filterAvailableFields.bind(this)))
                )
                .append(this.availableFields)
             )
            .append($("<div>")
                .addClass("selectedSide")
                .append($("<h4>").text("Selected Fields"))
                .append($("<div>").addClass("resetLink").css("visibility","hidden").addClass("explicitLinkStyle").text("(reset to default)").click(this.resetToDefault.bind(this)))
                .append(this.selectedFields)
             )
            .append($("<div>")
                .addClass("buttonRow")
                .append($("<button>").addClass("buttonPrimary").addClass("svButton").text("apply").click(this.commitChanges.bind(this)))
                .append($("<button>").addClass("buttonSecondary").addClass("svButton").text("cancel").click(this.closeLayer.bind(this)))
            )

        var resetLink = $(".resetLink",this.layer);
        if (this.fields.join(",")==this.defaultFields.join(",")) {
            resetLink.css("visibility","hidden");
        } else {
            resetLink.css("visibility","visible");
        }

        this.layer.appendTo($("body"));
        this.theNothing = $("<div>")
            .addClass("hereComesNothing")
            .click(this.closeLayer.bind(this))
            .prependTo($(document.body));
    }

    filterAvailableFields(evt) {
        this.getResults();
    }

    resetToDefault() {
        this.selectedFields.html("");
        if (this.defaultFields.length>0) {
            for (var i=0; i<this.defaultFields.length; i++) {
                this.addSelectedField(this.defaultFields[i]);
            }
        }
        else {
            for (var i=0; i<this.fieldsFromParam.length; i++) {
                this.addSelectedField(this.fieldsFromParam[i]);
            }
        }
        $(".resetLink",this.layer).css("visibility","visible");
        // easiest way to repaint the clickability of all the available fields
        this.getResults();
    }

    getPreferenceKeyNames() {
        return [this.CURRENT_FIELDS_PREF,this.DEFAULT_FIELDS_PREF];
    }

    loadPreferences(prefsDict) {
        this.fields = this.defaultFields = this.fieldsFromParam;
        var currentFields = prefsDict[this.CURRENT_FIELDS_PREF] || false;
        if (currentFields) {
            this.fields = currentFields.split(" ");
        }

        var defaultFields = prefsDict[this.DEFAULT_FIELDS_PREF] || false;
        if (defaultFields) {
            this.defaultFields = defaultFields.split(" ");
        }
    }

    commitChanges() {
        var newSelectedFields = [];
        this.selectedFields.find("li").each(function(i, li) {
            newSelectedFields.push($(li).text());
        });
        this.fields = newSelectedFields;
        var prefs = {
            "display.results.currentFields": this.fields.join(" ")
        }
        Sideview.commitNewPagePreferences(prefs);
        this.closeLayer();
        this.pushDownstream();
    }

    onKeyUp(evt) {
        // and 27 was the number of the escape key
        // and the number of the escape key was 27
        if (evt.keyCode==27 && this.theNothing) {
            this.closeLayer();
        }
    }

    onAvailableFieldClick(evt) {
        var li = $(evt.target);
        if (li.hasClass("selected")) return false;
        li.addClass("selected");
        this.addSelectedField(li.text());
    }

    updateAvailableHeader(count) {
        $(".availableSide h4", this.layer).text(sprintf("Available Fields (%s)", count));
    }

    addSelectedField(fieldName) {
        $(".resetLink",this.layer).css("visibility","visible");
        $("<li>")
            .click(this.removeSelectedField.bind(this))
            .append($("<span>")
                .addClass("svIcon")
            )
            .append($("<span>").text(fieldName))
            .appendTo(this.selectedFields)
    }

    removeSelectedField(evt) {
        $(".resetLink",this.layer).css("visibility","visible");
        var clickedUpon = $(evt.target);
        var li = clickedUpon;
        if (clickedUpon[0].tagName.toLowerCase()=="span") {
            li = clickedUpon.parent();
        }
        var fieldName = li.text();

        li.remove();
        this.availableFields.find("li").each(function(i, li) {
            li = $(li);
            if (li.text()==fieldName) {
                li.removeClass("selected");
            }
        });
    }

    requiresResults() {
        return true;
    }

    getModifiedContext(context) {
        context = context || this.getContext();
        var hiddenFields = this.getParam("hiddenFields","");
        hiddenFields = hiddenFields ? hiddenFields.split(" ") : [];
        context.set("results.fields", hiddenFields.concat(this.fields));
        return context;
    }

    onJobProgress(evt, job) {
        if (job && job.isPreviewable()) {
            this.getResults();
        }
    }

    onJobDone(evt, job) {
        this.getResults();
    }

    openLayer() {
        if (!this.isReadyForContextPush()) {
            alert("not implemented case - edit fields was clicked before we actually had even loaded the *selected* fields");
        }
        var search = this.getContext().getSplunkSearch();

        if (!search.isDispatched()) {
            console.warn(sprintf("%s module had its layer opened before its search was dispatched.", this.moduleId));
            console.trace();
        }
        this.lazyBuildLayer();
        this.theNothing.show();

        this.layer
            .removeClass("fieldsModuleLayerClosed")
            .addClass("fieldsModuleLayerOpen")

        return this.getResults();
    }

    closeLayer() {
        this.theNothing.hide();
        this.layer
            .removeClass("fieldsModuleLayerOpen")
            .addClass("fieldsModuleLayerClosed")
		this.selectedFields.html("");
		for (var i=0; i<this.fields.length; i++) {
            this.addSelectedField(this.fields[i]);
        }
    }

    /**
     * GET + RENDER.
     */
    getSplunkResultParams() {
        var args = {
            "output_mode":"json",
            "count":"1000"
        };

        var searchCommands = [];
        var postProcess = this.getContext().getSplunkSearch().getPostProcess();
        if (postProcess) {
            searchCommands.push(postProcess);
        }
        var filterControl = $(".filterAvailableFields input", this.layer);

        var filter = $(".filterAvailableFields input").val();
        if (filter) searchCommands.push(sprintf("search field=*%s*", filter.trim()));
        if (searchCommands.length==0) return args;

        args["search"] = searchCommands.join(" | ");
        return args;
    }

    renderResults(envelope) {
        if (!this.availableFields) return false;
        this.availableFields.html("");
        var results = $(envelope.results);

        var currentSelectedFields = [];
        this.selectedFields.find("li").each(function(i, li) {
            currentSelectedFields.push($(li).text());
        });

        results.each(function(i, result) {
            if (!result.hasOwnProperty("field")) {
                console.error(sprintf("ERROR - Fields command given search results where row %d has no 'field' field", i));
                console.error(result);
                return true;
            }
            this.addAvailableField(result.field, currentSelectedFields);
        }.bind(this));

        this.updateAvailableHeader(results.length);

    }

    addAvailableField(field, currentSelectedFields) {
        var newLi = $("<li>")
            .text(field)
            .click(this.onAvailableFieldClick.bind(this))
        if (currentSelectedFields.indexOf(field)!=-1) {
            newLi.addClass("selected");
        }
        newLi.appendTo(this.availableFields);
    }

}
return Fields;

});