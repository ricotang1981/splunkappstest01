// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.TimePicker= $.klass(Sideview.utils.getBaseClass(true), {
    
    initialize: function($super, container) {
        $super(container);
        Sideview.utils.applyCustomProperties(this);

        $.get(Sideview.utils.make_url("/splunkd/__raw/services/configs/conf-times?output_mode=json&sort_key=order"),this.buildMenus.bind(this));
        
        this.container.append($("<label>Time Range</label>"));
        this.container.append($("<ul>").addClass("svMenu").addClass("top").append($("<li>").addClass("topLevel").append($("<a>").addClass("topAnchor").attr("href","#"))));
    },

    setSelectedTimeRange: function(range, label) {
        this.selectedRange = range;
        var timeRangeLabel = $("ul.top > li.topLevel > a",this.container);
        if (label) {
            timeRangeLabel.text(label);
        } else {
            timeRangeLabel.text(this.selectedRange.toConciseString());
        }
    },

    buildSubMenus: function(jsonResponse) {
        var subMenus={};
        for (var i=0,len=jsonResponse.entry.length;i<len;i++) {
            var stanza=jsonResponse.entry[i];
            if (stanza.disabled) continue;
            if (stanza.content.sub_menu) {
                if (!subMenus.hasOwnProperty(stanza.content.sub_menu)) {
                    subMenus[stanza.content.sub_menu] = [];
                }
                subMenus[stanza.content.sub_menu].push(
                    $("<li>").append($("<a>")
                        .attr("href","#")
                        .attr("s:earliest_time", stanza.content.earliest_time)
                        .attr("s:latest_time",stanza.content.latest_time)
                        .text(stanza.content.label))
                );
            }
        }
        return subMenus;
    },
    
    /** 
     *  This is only run once,  not exactly when the page starts but when 
     * the call made in the constructor, to /services/configs/conf-times 
     * comes back with json data.. 
     */
    buildMenus: function(jsonResponse) {
        var subMenus=this.buildSubMenus(jsonResponse)
        var ul = $("<ul>");

        for (var i=0,len=jsonResponse.entry.length;i<len;i++) {
            var stanza=jsonResponse.entry[i];
            if (stanza.disabled) continue;
            
            var li = $("<li>");
            var a = $("<a>")
                .attr("href","#")
                .text(stanza.content.label);
            if (stanza.content.is_sub_menu) {
                a.addClass("hasSubMenu");
                li.addClass("hasSubMenu");
            } else if (stanza.content.sub_menu) {
                continue;
            } else {
                a.attr("s:earliest_time", stanza.content.earliest_time)
                .attr("s:latest_time",stanza.content.latest_time)
            }
            
            li.append(a);

            if (stanza.content.is_sub_menu && subMenus.hasOwnProperty(stanza.content.label)) {
                var sub = $("<ul>").addClass("svMenu");
                for (var j=0,jLen=subMenus[stanza.content.label].length;j<jLen;j++) {
                    sub.append(subMenus[stanza.content.label][j]);
                }
                sub.appendTo(li);
            }
            li.appendTo(ul);
        }
        if (this.deferredCustomLI) {
            ul.append(this.deferredCustomLI);
        }
        $("ul.top li",this.container).append(ul);
        
        this.initMenus();
        if (this.deferredCustomLI) {
            var range = this.getRangeForMenuItem(this.deferredCustomLI);
            this.setSelectedTimeRange(range, this.deferredCustomLI.text());
            this.deferredCustomLI = null
        }

    },

    alignSubMenu: function(li) {
        console.error("this implementation has never been tested in this module");
        $("ul ul",this.container).css("left","auto");
        $(this).find("> ul")
            .css("display","block");
        var menu = $(li.find("> ul")[0]);
        var menuRight = menu.offset().left + menu.width();
        
        var delta = menu.offset().left - menu.position().left;

        if (menuRight > $(window).width()) {
            menu.css("left",$(window).width()-menu.width()-2 - delta );
        } else {
            menu.css("left","auto");
        }
    },

    openTopLevelMenu: function(li, evt) {
        evt.preventDefault();
        evt.stopPropagation();

        li = $(li);
        // containment will cause this to fire on all clicks.
        if (!li.hasClass("topLevel")) return false;

        var subMenus = li.find("ul");
        
        if (subMenus.length == 0) return true;
        var subMenu = $(subMenus[0]);
        this.openMenu(subMenu);
        return false;
    },
    
    getMenuItemByLabel: function(label){
        var finder = $("a:contains("+label+")", this.container)
        if (finder.length==1) return finder;
        return false;
    },

    getMenuItemByTimeRange: function(timeRange) {
        var a, match = false;
        $("a",this.container).each(function(i) {
            var a = $(this)
            var r = new Splunk.TimeRange(a.attr("s:earliest_time"), a.attr("s:latest_time"));
            if (timeRange.equalToRange(r)) match = a;
        });
        return match;
    },

    getRangeForMenuItem: function(li) {
        var range;
        li.children('a').each(function(i) {
            var a = $(this)
            range = new Splunk.TimeRange(a.attr("s:earliest_time"), a.attr("s:latest_time"));
        });
        return range;
    },

    initMenus: function() {
        var container = this.container;
        var moduleReference = this;

        $(".svMenu > li",this.container).bind("click", function(evt){
            console.warn("alignMenus not being used here");
            moduleReference.openTopLevelMenu(this,evt)
        });

        $(".svMenu li.hasSubMenu",this.container).bind("mouseover", function(evt){
            console.warn("alignMenus not being used here");
            moduleReference.openSubMenu(this,evt);
        });

        $(".svMenu ul li:not(.hasSubMenu)",this.container).bind("click", function(evt) {
            moduleReference.onMenuClick(this,evt);
        });
            

        $(document).click(function(evt) {
            moduleReference.closeAllMenus();
        });
        var def = this.getParam("default");
        if (def) {
            var a = this.getMenuItemByLabel(def);
            if (a) {
                this.setSelectedTimeRange(new Splunk.TimeRange(a.attr("s:earliest_time"), a.attr("s:latest_time")), def);
            } 
            else {
                Sideview.utils.broadcastMessage("error", "splunk", "Error - this view specifies a default timerange that we can not find in the listed time ranges - " + def);
            }
        }
    },

    closeAllMenus : function() {
        $("ul ul",this.container).each(function() {
            $(this).removeClass("open");
        });
    },

    
    openMenu: function(openMenu) {
        $("ul ul",this.container).each(function() {
            if (openMenu[0] === this || $.contains(this,openMenu[0])) {
                $(this).addClass("open");
            }
            else {
                $(this).removeClass("open");
            }
        });
    },

    onMenuClick: function(li,evt) {

        // the user may just be trying to copy and paste the timerange label.
        if (Sideview.utils.getSelectedText()) return false;
        evt.stopPropagation();
        evt.preventDefault();

        var target = $(li);
        if (!target.is("li")) console.error("NOT sure what happened but TimePicker got a click not on an li element");
        var a = $(target.find("> a")[0]);

        this.setSelectedTimeRange(new Splunk.TimeRange(a.attr("s:earliest_time"), a.attr("s:latest_time")),a.text());
        this.updateURL();
        this.pushContextToChildren();
        this.closeAllMenus();
        
    },

    openSubMenu: function(li, evt) {
        li = $(li);
        if (li.hasClass("topLevel")) return false;

        var subMenus = li.find("ul");
        if (subMenus.length==0) return false;
        
        var subMenu = $(subMenus[0]);
        var parentMenu = li.parent();
        

        this.openMenu(subMenu);

        
        subMenu.css("left", parentMenu.width()+1);
        // Is the right edge going past the windows right edge?
        // If so, we flip it, and put the submenu on the left.
        if (subMenu.offset().left + subMenu.width()> $(window).width()) {
            subMenu.css("left",-(parentMenu.width()+1) );
            //subMenu.css("z-index","20");
        } 
        
        // Is the bottom edge going past the window's bottom?
        if ($(window).height() - li.offset().top - subMenu[0].scrollHeight < 0) {
            subMenu.css("top", $(window).height() - li.offset().top - subMenu[0].scrollHeight);
        }
        else {
            subMenu.css("top", 0);
        }

        // OK,  NOW is either the bottom edge going past the window's bottom,  or the top edge going past the window's top?
        var pastTop = subMenu.offset().top < 0;
        var pastBottom = subMenu.offset().top + subMenu[0].scrollHeight > $(window).height();
            
        if (pastTop ) {
            subMenu.css("overflow-y","auto");
            subMenu.css("top","0");
        } 
        if (pastBottom) {
            subMenu.css("overflow-y","auto");
            subMenu.css("height",$(window).height() - li.offset().top);
        } 
        pastTop = subMenu.offset().top < 0;
        pastBottom = subMenu.offset().top + subMenu[0].scrollHeight > $(window).height();
        if (!pastTop && !pastBottom) {
            subMenu.css("overflow-y","visible");
            subMenu.css("height","auto");
        }
        evt.stopPropagation();
        evt.preventDefault();
        return false;
    },



    getModifiedContext: function() {
        var modCon = this.getContext();
        if (this.selectedRange) {
            var search  = modCon.get("search");
            search.setTimeRange(this.selectedRange);
            var tr = search.getTimeRange();
            modCon.set("search",search);
        }
        Sideview.utils.setStandardTimeRangeKeys(modCon);
        return modCon;
    },

    onContextChange: function() {
        var context = this.getContext();
        this.setToContextValue(context);
        this.clearURLLoader(context);
    },

    setToContextValue: function(context) {
        var earliest = context.get("search.timeRange.earliest");
        var latest   = context.get("search.timeRange.latest");
        var range    = new Splunk.TimeRange(earliest,latest);
        
        // first we check for the explicit 'all time' timerange.  
        // (this is a Sideview convention.
        if ((range.getEarliestTimeTerms()=="all" && range.getLatestTimeTerms()=="all")) {
            range = new Splunk.TimeRange();
        }
        // then we check for the regular 'all time' timerange, which we 
        // tend to call the "implicit all time" range.
        else if (range.isAllTime()) return;
        
        var earliest = range.getEarliestTimeTerms() || null;
        var latest   = range.getLatestTimeTerms()   || null;
        // walk through all our existing options and if there's a match, select it.
        var moduleInstance = this;
        var foundAMatch = false;
        var self = this;

        var li = this.getMenuItemByTimeRange(range);
        if (!li) {
            li = $("<li>")
                    .addClass("custom")
                    .append($("<a>")
                        .attr("href","#")
                        .attr("s:earliest_time", range.getEarliestTimeTerms())
                        .attr("s:latest_time",range.getLatestTimeTerms())
                        .text(range.toConciseString() + " (custom)"));

            if ($("ul.top > li.topLevel > ul",this.container).length>0) {
                // take away any previous "custom" ones. there can be only one.
                $("ul.top > li.topLevel > ul li.custom", this.container).remove()
                $("ul.top > li.topLevel > ul",this.container).append(li);
            }
            else {
                this.deferredCustomLI = li;
                return;
            }
        }
        this.setSelectedTimeRange(range, li.text());
    },

    clearURLLoader: function(context) {
        context = context || this.getContext();
        // only do this once 
        if (!this.hasClearedURLLoader && context.has("sideview.onSelectionSuccess")) {
            var callback = context.get("sideview.onSelectionSuccess");
            callback("search.timeRange.earliest", this);
            callback("search.timeRange.latest", this);
            this.hasClearedURLLoader = true;
            // see core patches.  Hopefully we don't need this.
            //this.initialSelection = this._activator.text();
        }
    },

    updateURL: function() {
        var context = this.getContext();
        if (context.has("sideview.onEditableStateChange")) {
            var callback = context.get("sideview.onEditableStateChange");
            callback("search.timeRange", this.selectedRange, this);
        }
    }

});
