// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview, Module) {

class AppNav extends Module {

    // INITIALIZING THINGS.
    constructor(container, params) {
        super(container, params);
        this.viewsListedExplicitly = new Map();
        this.allowExportedSavedSearches = this.getParam("allowSavedSearchesFromOtherApps") == "True";
        this.allowExportedDashboards = this.getParam("allowDashboardsFromOtherApps") == "True";
        this.secretSplunkViews = ["alert","alerts","data_models","data_model_explorer","data_model_manager","data_model_editor","datasets","dataset","dashboards"];

        this.itemsToLoad = this.getDeferredItemsToLoad();

        $.when(...this.itemsToLoad)
            .done(function() {
                var labelDict = {};
                for (var view of this.viewResults) {
                    labelDict[view["name"]] = view["content"]["label"] || view;
                }
                // the "search" view is commonly included in the nav even though
                // it wont come back in the getCollection call now that those are
                // scoped to only entities *in* the current app.
                if (!("search" in labelDict)) {
                    labelDict["search"] = "Search";
                }
                var navStr = this.navResults[0]["content"]["eai:data"];
                var nav = new DOMParser().parseFromString(navStr, "application/xml");
                var menuData = nav.getElementsByTagName('nav')[0];
                var menuContainer = $("ul.svMenu", this.container);
                this.buildMenus(menuContainer, menuData, this.viewResults, this.savedSearchResults, labelDict);

                this.initMenus();
            }.bind(this));
    }

    getDeferredItemsToLoad() {
        var locale = Sideview.getLocale();
        var user = Sideview.getCurrentUser();
        var app = Sideview.getCurrentApp();
        var navUri = sprintf("/%s/splunkd/__raw/servicesNS/%s/%s/data/ui/nav/default", locale, user, app);
        var viewsUri = sprintf("/%s/splunkd/__raw/servicesNS/%s/%s/data/ui/views", locale, user, app);
        var savedSearchesUri = sprintf("/%s/splunkd/__raw/servicesNS/%s/%s/saved/searches", locale, user, app);
        var savedSearchesSpecialArgs = this.getDefaultCollectionArgs(this.allowExportedSavedSearches);
        return [
            Sideview.getCollection(navUri, {}, function(navResults) {
                this.navResults = navResults;
            }.bind(this)),
            Sideview.getCollection(viewsUri, {}, function(viewResults) {
                this.viewResults = viewResults;
            }.bind(this)),
            Sideview.getCollection(savedSearchesUri, savedSearchesSpecialArgs, function(savedSearchResults) {
                this.savedSearchResults = savedSearchResults;
            }.bind(this))
        ];
    }

    initMenus() {
        var moduleReference = this;

        $(".svMenu li.topLevel", this.container).bind("click", function(evt){
            Sideview.openTopLevelMenu(moduleReference.container, this, evt)
        });

        $(".svMenu li", this.container).bind("mouseover", function(evt){
            var triggerLi = $(this);
            Sideview.handleMenuMouseOver(moduleReference.container, triggerLi, evt)
        });
        this.bindMenuClicks($(".svMenu li", this.container));

        Sideview.bindSharedMenuEvents(moduleReference.container);
    }

    bindMenuClicks(menuItemCollection) {
        menuItemCollection.bind("click", function(evt){
            evt.stopPropagation();
        });
    }

    buildMenus(menuContainer, menuData, views, savedSearches, labelDict) {
        menuData.childNodes.forEach(function(item) {
            var tagName = item.tagName;
            if (!tagName) return;

            switch(tagName) {
                case "view": {
                    var name = item.getAttribute("name");
                    this.viewsListedExplicitly.set(name,1);
                }
            }
        }.bind(this));

        menuData.childNodes.forEach(function(item) {
            if (item.nodeType==3) return;
            // this is the magic 'default'  'view'.
            if (item.tagName == "view" && item.getAttribute("name") == "shunt") return;

            var href = "#"
            var label = "no label set";

            var tagName = item.tagName;
            if (!tagName) return;

            switch(tagName) {
                case "view": {
                    if (item.getAttribute("source")=="unclassified") {
                        this.renderSavedDashboardsData(menuContainer, views)
                        this.viewsListedExplicitly.forEach(function(value, viewSeenInNav, dashboards) {
                            if (!dashboards.get(viewSeenInNav)) {
                                console.error(sprintf("Possible App Misconfiguration - %s is listed explicitly in the nav XML but either doesn't exist or isn't visible for this user", viewSeenInNav));
                                console.error("addendum - we have actually left the link to this view IN THE NAV, even though the user will get a 404 if/when they click on it.  This is a known issue.");
                            }
                        });
                        return;
                    }
                    var name = item.getAttribute("name");
                    if (!name) console.error("assertion failed - view has no name");
                    label = labelDict[name] || name;
                    href = name;
                    break;
                }
                case "saved": {
                    this.renderSavedSearchData(menuContainer, savedSearches)
                    return;
                }
                case "collection": {
                    label = item.getAttribute("label");
                    var subMenu = $("<ul>");
                    this.buildMenus(subMenu, item, views, savedSearches, labelDict);
                    break;
                }
                case "a": {
                    href = item.getAttribute("href");
                    if (href.indexOf("../../manager")==0) {
                        var newPrefix = "/"
                        if (Sideview.getLocale()) {
                            newPrefix = "/" + Sideview.getLocale() + "/"
                        }
                        href = href.replace("../../",newPrefix);
                    }
                    label = item.textContent;
                    break;
                }
                case "divider": {
                    Sideview.renderMenuDivider(menuContainer);
                    return;
                }
            }
            if (label=="no label set") alert(item.tagName);
            Sideview.renderMenuItem(menuContainer, href, label, subMenu);
        }.bind(this));
    }

    getDefaultCollectionArgs(allowExportedContent) {
        var searchStr = "disabled=false";
        if (!allowExportedContent) {
            searchStr += sprintf(" eai:acl.app=%s", Sideview.getCurrentApp());
        }
        return {
            "search": searchStr
        }
    }


    renderSavedSearchData(menuContainer, savedSearches) {
        var currentApp = Sideview.getCurrentApp();
        for (var i=0, len=savedSearches.length;i<len;i++) {
            var s = savedSearches[i];
            var label = s["name"];

            if (!this.allowExportedSavedSearches && s["acl"] && s["acl"]["app"] != currentApp) {
                console.error("UNEXPECTED ERROR - somehow we said we didn't want exported saved searches from other apps, and yet some came back in our response.");
                console.error(s);
                continue;
            }
            if (s["content"]["disabled"]) {
                console.error("UNEXPECTED ERROR  - we asked to only get back enabled $things$ but got back a disabled one");
                console.error(s);
                continue;
            }

            var displayView = "report";
            if (s["content"].hasOwnProperty("displayview") && s["content"]["displayview"]) {
                displayView = s["content"]["displayview"];
            }
            var href =  sprintf(
                "/%(locale)s/splunkd/__raw/sv_view/%(app)s/%(displayView)s?search.name=%(searchName)s",
                {
                    "locale": Sideview.getLocale(),
                    "app": Sideview.getCurrentApp(),
                    "displayView":displayView,
                    "searchName" : label
                }
            );
            Sideview.renderMenuItem(menuContainer, href, label)
        }
        this.bindMenuClicks($("li", menuContainer));
    }

    /**
     * This seems quite possibly useful+reusable enough to pull up, but I'll
     * leave it here for now.

    */
    convertEaiArrayToMap(array) {
        var map = new Map();
        for (var i=0,len=array.length;i<len;i++) {
            var d = array[i];
            map.set(d["name"], {
                label:d["content"]["label"],
                xml:d["content"]["eai:data"]
            });
        }
        return map;
    }


    renderSavedDashboardsData(menuContainer, dashboardsArray) {
        var dashboards = this.convertEaiArrayToMap(dashboardsArray);
        dashboards.forEach(function(content, name) {
            if (this.viewsListedExplicitly.has(name)) {
                return;
            }
            if (this.secretSplunkViews.indexOf(name)!=-1) {
                return;
            }
            // where are we going and why am I in this handbasket?
            var firstFewLines = content.xml.substring(0, 200);
            if (firstFewLines.match(/isVisible="?[Ff]alse"?/)) {
                return;
            }
            Sideview.renderMenuItem(menuContainer, name, content.label);
        }.bind(this));
        this.bindMenuClicks($("li", menuContainer));
    }
}
    return AppNav
});