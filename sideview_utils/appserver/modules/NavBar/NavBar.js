// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.NavBar= $.klass(Splunk.Module, {

    initialize: function($super, container) {
        $super(container);
        
        this.initMenus();
        Sideview.utils.applyCustomProperties(this);
    },

    openCurrentMenuBranch: function(openMenu) {
        $("ul ul",this.container).each(function() {
            if (openMenu[0] === this || $.contains(this,openMenu[0])) {
                $(this).addClass("open");
            }
            else {
                $(this).removeClass("open");
            }
        });
    },
    showTopLevelMenu: function(triggerLi, evt) {
        
        if (!$(evt.target).parent().hasClass("topLevel")) {
            evt.preventDefault();
            return false;
        }
        triggerLi = $(triggerLi);
        // containment will cause this to fire on all clicks.
        if (!triggerLi.hasClass("topLevel")) {
            evt.preventDefault();
            return false;
        }

        var subMenus = triggerLi.find("ul");
        
        if (subMenus.length == 0) {
            return true;
        } else {
            evt.preventDefault();
            var subMenu = $(subMenus[0]);
            this.openCurrentMenuBranch(subMenu);
            evt.stopPropagation();
            return false;
        }
    },
    showSubMenu: function(triggerLi, evt) {
        triggerLi = $(triggerLi);
        if (triggerLi.hasClass("topLevel")) return false;

        var subMenus = triggerLi.find("ul");
        if (subMenus.length==0) return false;
        
        var subMenu = $(subMenus[0]);
        var parentMenu = triggerLi.parent();
        

        this.openCurrentMenuBranch(subMenu);

        
        subMenu.css("left", parentMenu.width()+1);
        // Is the right edge going past the windows right edge?
        // If so, we flip it, and put the submenu on the left.
        if (subMenu.offset().left + subMenu.width()> $(window).width()) {
            subMenu.css("left",-(parentMenu.width()+1) );
            //subMenu.css("z-index","20");
        } 
        
        // Is the bottom edge going past the window's bottom?
        if ($(window).height() - triggerLi.offset().top - subMenu[0].scrollHeight < 0) {
            subMenu.css("top", $(window).height() - triggerLi.offset().top - subMenu[0].scrollHeight);
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
            subMenu.css("height",$(window).height() - triggerLi.offset().top);
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
    initMenus: function() {
        var moduleReference = this;

        $(".svMenu li.topLevel",this.container).bind("click", function(evt){
            moduleReference.showTopLevelMenu(this,evt)
        });

        $(".svMenu li.hasSubMenu",this.container).bind("mouseover", function(evt){
                moduleReference.showSubMenu(this,evt)
        });
        
        $(".svMenu li",this.container).bind("click", function(evt){
            evt.stopPropagation();
            // we can't let user clicks here trigger the document.onclick close behavior.
            if ($(this).hasClass("hasSubMenu") && !$(this).hasClass("topLevel")) {
                evt.preventDefault();
            }
        });
        
        function closeNavBar() {
            $(".NavBar ul ul",this.container).removeClass("open");
        }
        $(document).click(closeNavBar);

        // keypress isn't fast enough.  
        // The user wants it closed so OMG CLOSE IT!
        $('body').keydown(function(e){
            if (e.which == 27){
                closeNavBar();
            }
        });

        
    }

});
