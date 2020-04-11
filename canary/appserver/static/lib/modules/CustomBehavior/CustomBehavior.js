// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.

define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class CustomBehavior extends Module {

    constructor(container, params) {
        super(container, params);
    }

    requiresResults() {
        return (this.getParam("requiresDispatch") == "True")
    }

};
    return CustomBehavior
});