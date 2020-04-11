/* Copyright (C) 2010-2020 Sideview LLC.  All Rights Reserved. */

window.onunload = function() {
    var editor = window.parent.getEditor();
    if (editor.activeModuleSelector) {
        editor.activeModuleSelector  = [];
    }
}
function markDefault(input) {
    input = $(input);
    if (input.val() == input.attr("default")) {
        input.addClass("defaultValue")
    } else {
        input.removeClass("defaultValue")
    }
}
// could use $(this).serialize(), but that would not allow for our logic
// around defaults and null values.
function getFormValues() {
    var values = {};

    $("input.param").each(function() {
        var input = $(this);
        if (input.val() && input.val() != input.attr("default")) {
            values[input.attr("name")] = input.val();
        }
    })
    $("textarea").each(function() {
        var input = $(this);
        if (input.val() && input.val() != input.attr("default")) {
            values[input.attr("name")] = "\n" + input.val() + "\n";
        }
    })
    $("table.listParam").each(function() {
        var table = $(this);
        var value = [];
        var inputs = $("input",table);
        inputs.each(function(i,input) {
            var nameSegments = $(input).attr("name").split("_");
            var valueIndex = nameSegments[1];
            var listItemName = nameSegments[2];
            if ($(input).val()!="" || listItemName=="value") {
                if (!value[valueIndex]) value[valueIndex] = {};
                value[valueIndex][listItemName] = $(input).val();
            }
        })

        values[table.attr("s:name")] = JSON.stringify(value);
    });
    $("tr.newWildcardParam").each(function() {
        var tr = $(this);
        var label = $(".newWildcardLabel", tr);
        var value = $(".newWildcardValue", tr);
        //TODO error checking....
        if (label.val() != label.attr("prefix")) {
            values[label.val()] = value.val();
        }


    });
    var payload = [];

    if ("parentModuleId" in values && values["parentModuleId"] == "(the view itself)") {
        values["parentModuleId"] = "_top";
    }
    for (var key in values) {
        payload.push(encodeURIComponent(key) + "=" + encodeURIComponent(values[key]));
    }
    return payload;
}


$(document).ready(function() {

    function showDescription(moduleClass, param) {
        var editor = parent.getEditor();
        var url = ["/splunkd/__raw/sv_module/describe?moduleClass=" + moduleClass];
        if (param) url.push("param=" + param);
        try {
            var dW = editor.getDescriptionWindow();
            var vW = editor.getViewWindow();
            dW.document.location = vW.Sideview.utils.make_url(url.join("&"));
        } catch(e) {
            console.log("CAUGHT EXCEPTION " + e)
        }
    }
    $("input.cancel")
        .click(function() {
            var href = $("a.previous").attr("href");
            if (href) {
                document.location = href;
            }
            else {
                console.error("not sure what happened but there wasn't a breadcrumb URL")
            }
        });
    $("input")
        .focus(function() {
            if ($(this).attr("type")=="text") {
                $("tr.activeInputElement").removeClass("activeInputElement");
                $(this).parents("tr").addClass("activeInputElement");
            }
        });
    $("select#moduleClass")
        .change(function() {
            var moduleClass=$(this).val();
            showDescription(moduleClass, null);
        });
    $("textarea")
        .focus(function() {
            $("tr.activeInputElement").removeClass("activeInputElement");
            $(this).parents("tr").addClass("activeInputElement");
            var name = $(this).attr("name");
            showDescription(moduleClass, name);
        });
    $("input.moduleSelector")
        .focus(function() {
            var classInput = $($(this).siblings("input.classField")[0]);
            var editor = parent.getEditor();
            editor.setActiveModuleSelector($(this), classInput);
            var title, text;
            switch(editor.mode) {
                case "edit":
                    title = "Selecting a module to Edit";
                    text = "Now use the schematic view in the upper right to pick a particular module to edit.  <br><br>Remember that you can navigate around in the schematic window by dragging and clicking."
                    break;
                case "add" :
                    title = "Selecting where to add your new module.";
                    text = "Now use the schematic view in the upper right to pick a module below which you want to add a new module. <br><br>Remember that you can navigate around in the schematic window by dragging and clicking."
                    break;
                case "delete" :
                    title = "Selecting a module to Delete";
                    text = "Now use the schematic view in the upper right to pick a particular module you want to delete.  <br><br>BE CAREFUL.  WHEN YOU SUBMIT THIS FORM YOU WILL DELETE THAT MODULE AS WELL AS ANY MODULES DOWNSTREAM FROM IT."
                    break;
                case "reattach" :
                    title = "Selecting a module to remove and reattach";
                    text = "Now use the schematic view in the upper right to pick a particular module whose data you want to move somewhere else in the hierarchy.  <br><br>Remember that you can navigate around in the schematic window by dragging and clicking modules."
                    break;
                case "debug" :
                    title = "Selecting a module to debug";
                    text = "Now use the schematic view in the upper right to pick a particular module whose data you want to debug.  <br><br>Remember that you can navigate around in the schematic window by dragging and clicking modules."
                    break;
            }
            editor.displayHelp(title, text);

        })
    $("input[name='showWhichParams']").change(function() {
        var rowsWithoutValues = $("tr.noValueSet");

        if ($('input:radio[name="showWhichParams"]:checked').val() == "all") {
            $(".noParamsShowingMessage").hide();
            rowsWithoutValues.css("opacity","0");
            rowsWithoutValues.removeClass("hidden");
            rowsWithoutValues.animate({opacity: 1.0},500,"linear")
        } else {
            $(".noParamsShowingMessage").show();
            rowsWithoutValues.css("opacity","1");
            rowsWithoutValues.animate({opacity: 0},500,"linear", function() {
                rowsWithoutValues.addClass("hidden")
            })
        }
    });

    var moduleParamOnFocus = function() {
        if ($(this).attr("type")=="radio") return true;
        if ($(this).attr("type")=="submit") return true;
        var name;

        if ($(this).hasClass("newWildcardLabel") || $(this).hasClass("newWildcardValue")) {
            name = $(this).attr("prefix");
        }
        else if ($(this).hasClass("listParam")) {
            name = $(this).parents("table.listParam").attr("s:name");
        } else {
            name = $(this).attr("name");
        }
        showDescription(moduleClass, name);
    }
    var moduleParamOnKeyUp = function() {
        markDefault(this)
    }

    $("#moduleParamsForm input")
        .focus(moduleParamOnFocus)
        .each(function() {
            markDefault(this);
        })
        .keyup(moduleParamOnKeyUp)

    $('form :input:visible:first').focus()


    function clearListParam(elt) {
        $($(elt).parents("tr")[0]).remove();
        return false;
    }
    function clearWildcardParam() {
        $(this).parents("tr").remove()
    }
    $(".clearListParam").click(function(evt) {
        evt.preventDefault();
        clearListParam($(this))
    });
    $(".clearParam").click(function(evt) {
        evt.preventDefault();
        var input = $(this).parents("tr").find(".param");
        input.val(input.attr("default") || "");
        markDefault(input);

        return false;
    });

    $(".addNewListParam").click(function(evt) {
        evt.preventDefault();
        var parentTr = $($(this).parents("tr")[0]);
        var parentTable = $(parentTr.parents("table")[0]);
        var newIndex = parentTable.find("tr").length - 2;
        var firstTr = $(parentTable.find("tr")[1])
        var newTr = firstTr.clone()

        newTr.find("input").each(function(i, input) {
            var name = $(input).attr("id").split("_");
            name[1] = newIndex;
            $(input).val("");
            $(input).attr("id", name.join("_"));
            $(input).attr("name", name.join("_"));
        })
        newTr.find("a.clearListParam").click(clearListParam);
        newTr.insertBefore(parentTr);
    });

    $(".addNewWildCardParam").click(function(evt) {
        evt.preventDefault();
        var parentTr = $(this).parents("tr");

        var prefix = $(this).attr("prefix")

        var newTr = $("<tr class='newWildcardParam'>")
            .append($("<td>")
                .append($("<input type='text' class='newWildcardLabel' value='" + prefix + "'  prefix='" + prefix + "'>").focus(moduleParamOnFocus))
            )
            .append($("<td>")
                .append($("<input type='text' class='newWildcardValue' prefix='" + prefix + "'>").focus(moduleParamOnFocus))
            )
            .append($("<td>")
                .append($('<a href="#" class="clearParam">[x]</a>').click(clearWildcardParam))
            )
            .insertBefore(parentTr)
    });


});