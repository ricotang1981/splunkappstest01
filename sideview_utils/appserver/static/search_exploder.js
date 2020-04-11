/* Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved. */

$(document).ready(function() {
    Sideview.utils.declareCustomBehavior("explodeSearch", function(customBehaviorModule) {
        
        customBehaviorModule.getModifiedContext= function() {
            var context = this.getContext();
            var search  = context.get("search");
            var commands = Sideview.utils.getCommands(search.toString());

            var stepPyramid = [];
            for (var i=0,len=commands.length;i<len;i++) {
                var step = [];
                for (var j=0;j<i;j++) {
                    step.push(commands[j]);
                }
                step.push(commands[i]);
                stepPyramid.push(Sideview.utils.escapeForSearchLanguage(step.join(" | ")));
            }

            var explodedAndEscaped = stepPyramid.join(" **MAGIC** ");
            context.set("explodedAndEscaped",explodedAndEscaped);
            return context;
        }
    });
});
