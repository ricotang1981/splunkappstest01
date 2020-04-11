// Copyright (C) 2016 Sideview LLC.  All Rights Reserved.

Splunk.Module.Messaging = $.klass(Splunk.Module, {

    initialize: function($super, container) {
        $super(container);
        var classesParam = this.getParam("classes") || "";
        this.classes = classesParam.split(",");
        if (window.hasOwnProperty("messagingManager")) {
            window.messagingManager.registerMessagingModule(this);
        }
        Sideview.utils.applyCustomProperties(this);
    }, 


    displayMessage: function (m) {
        this.container.html("");
        $("<div>").addClass(m.level).text(m.message).appendTo(this.container);
    }

});

var MessagingManager = $.klass( {
    messagingModules:{},
    initialize: function() {
        $(document).bind("sideview.message", this.handleMessage.bind(this));
    },

    getPriorityFromClassname: function(c) {
        // all hardcoded classnames have the same priority
        if (!c.endsWith("*")) return 100;
        return c.length;
    },

    isMatch: function(messageClass, moduleClass) {
        return (messageClass==moduleClass || (moduleClass.endsWith("*") 
            && messageClass.indexOf(moduleClass.substr(0,moduleClass.length-1))==0));
    },


    getMatchingModules: function(className) {
        var matchingModules = [];
        var highestPriority = 0;
        
        for (id in this.messagingModules) {
            if (this.messagingModules.hasOwnProperty(id)) {
                var m = this.messagingModules[id];
                var moduleClasses = m.classes;
                for (var i=0;i<moduleClasses.length; i++) {
                    var c = moduleClasses[i];
                    if (this.isMatch(className, c)) {
                        var priority = this.getPriorityFromClassname(c);
                        highestPriority = Math.max(priority,highestPriority);
                    }
                }
            }
        }
        for (id in this.messagingModules) {
            if (this.messagingModules.hasOwnProperty(id)) {
                var m = this.messagingModules[id];
                var moduleClasses = m.classes;
                for (var i=0;i<moduleClasses.length; i++) {
                    var c = moduleClasses[i];
                    if (this.isMatch(className, c)) {
                        var priority = this.getPriorityFromClassname(c);
                        if (priority==highestPriority) {
                            matchingModules.push(m);
                        }
                    }
                }
            }
        }
        return matchingModules;
    },

    handleMessage: function(event,msgObject) {
        var matchingModules = this.getMatchingModules(msgObject.className);
        for (var i=0; i<matchingModules.length; i++) {
            matchingModules[i].displayMessage(msgObject);
        }
    },

    registerMessagingModule: function(module) {
        this.messagingModules[module.container.attr("id")] = module;
    }
});

if (!window.messagingManager) {
    window.messagingManager = new MessagingManager();
}
