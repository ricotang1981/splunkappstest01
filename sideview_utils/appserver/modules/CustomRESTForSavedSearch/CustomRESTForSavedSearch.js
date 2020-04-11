// Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

Splunk.Module.CustomRESTForSavedSearch = $.klass(Splunk.Module, {
    initialize: function($super, container) {
        $super(container);
        var errorText = this.container.text();
        alert(errorText);
        this.logger.error(errorText);
    }
});