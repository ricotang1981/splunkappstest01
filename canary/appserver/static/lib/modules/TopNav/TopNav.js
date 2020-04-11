// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class TopNav extends Module {
    // cancel jobs on logo click

    constructor(container, params) {
        super(container, params);
        this.setupAppMenu(container);
        this.setupUserMenu(container);
        this.setupActivityMenu(container);
        this.setupTopLevelEventHandlers(container);
        $(".splunkIcons",container).click(function() {
            // Maybe this user has a default app or maybe not and we should
            // go to launcher. Who knows. So we go back to the beginning.
            // And wait for Vizzini.
            document.location = Sideview.make_url("/");
        })
        var managerUri = Sideview.make_url("manager", Sideview.getCurrentApp());
        $(".managerLink", container).attr("href", managerUri);
    }

    bindMenuClicks(menuItemCollection) {
        menuItemCollection.bind("click", function(evt){
            evt.stopPropagation();
        });
    }

    setupAppMenu(container) {
        var moduleReference = this;
        var menuContainer = $("<ul>")
            .addClass("appsMenu")
            .appendTo($("ul li.appsMenuOpener", container))
        var url = sprintf("/%s/splunkd/__raw/services/apps/local?search=%s", Sideview.getLocale(), encodeURIComponent("disabled=0"));
        var args = {
            search: "disabled=false"
        }
        Sideview.getCollection(url, args, function(appsCollection) {
            moduleReference.renderAppsList(menuContainer, appsCollection);
            moduleReference.bindMenuClicks($(".svMenu li", container));
        });
    }

    setupUserMenu(container) {
        var logoutUri = Sideview.make_url("/account/logout");
        var accountUri = Sideview.make_url(
            sprintf("/manager/%s/authentication/changepassword",
            Sideview.getCurrentApp())
        );
        $("<ul>")
            .addClass("userMenu")
            .append($("<li>").append(
                $("<a>")
                    .text(_("logout"))
                    .attr("href", logoutUri)
             ))
            .append($("<li>").append(
                $("<a>")
                    .text(_("account"))
                    .attr("href", accountUri)
            ))
            .appendTo($("ul li.userMenuOpener", container))
    }

    setupActivityMenu(container) {
        var jobManagerUri = Sideview.make_url(sprintf("/app/%s/job_manager", Sideview.getCurrentApp()));
        var alertsUri = Sideview.make_url(sprintf("/alerts/%s", Sideview.getCurrentApp()));

        $("<ul>")
            .addClass("userMenu")
            .append($("<li>").append(
                $("<a>")
                    .html("jobs")
                    .attr("target","_blank")
                    .attr("href", jobManagerUri)
             ))

            .append($("<li>").append(
                $("<a>")
                    .html("triggered alerts")
                    .attr("target","_blank")
                    .attr("href", alertsUri)
            ))
            .appendTo($("ul li.activityMenuOpener", container))
    }

    setupTopLevelEventHandlers(container) {
        var moduleReference = this;
        $(".svMenu li.topLevel",container).bind("click", function(evt){
            Sideview.openTopLevelMenu(moduleReference.container, $(this), evt);
        });
        Sideview.bindSharedMenuEvents(container);
    }

    renderAppsList(menuContainer, appsCollection) {
        for (var i=0,len=appsCollection.length;i<len;i++) {
            var a = appsCollection[i];
            var name = a["name"];
            var content = a["content"];
            if (!content["show_in_nav"] || !content["visible"]) {
                continue;
            }
            var label = content.hasOwnProperty("label") ? content["label"] : name;
            var href = Sideview.make_url("app", name);
            // TODO - yep.  we still need a canary_compatible=<boolean> somewhere.  If we extend app.conf
            // there still seems to be no way to actually get that key out via REST.
            // :facepalm:.  but maybe fresh coffee will find a way.
            // AND THESE AREN'T NECESSARY - cause each of these apps will redirect to a canary URI
            // from their homepage.  this just saves the user that 301.
            if (["canary","cisco_cdr","SA_cisco_cdr_axl", "shoretel", "covid19_sideview"].indexOf(name)!=-1) {
                href = "../" + name;
            }
            Sideview.renderMenuItem(menuContainer, href, label);
        }
        Sideview.renderMenuDivider(menuContainer);
        var manageAppsUrl = Sideview.make_url("manager", Sideview.getCurrentApp(), "apps","local");
        Sideview.renderMenuItem(menuContainer, manageAppsUrl, _("Manage Apps"));
    }
}
    return TopNav
});
