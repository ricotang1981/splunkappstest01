// Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
define(
  ["jquery",
  "sideview",
  "svmodule"],
  function($, Sideview,Module) {

class PostProcess extends Module {

    constructor(container, params) {
        super(container, params);
    }

    resetUI() {}

    requiresResults() {return true;}

    /**
     * get the 'search' param, wash the context keys through it to replace
     * any $foo$ tokens, then set it as the postProcess argument for
     * downstream modules
     */
    getModifiedContext(context) {
        context = context || this.getContext();
        var search  = context.getSplunkSearch();

        if (!search) {
            console.error("UNEXPECTED ERROR - PostProcess got a Context instance that had no Search in it at all");
            console.trace();
        }
        else {
            // preserve any old postProcess values as $postProcess$
            var oldPostProcessSearch = search.getPostProcess();

            // another identical context, but one that we'll put extra keys in/
            // keys that we dont want to return.
            var internalContext = this.getContext();
            Sideview.setStandardTimeRangeKeys(internalContext);
            Sideview.setStandardJobKeys(internalContext);
            internalContext.set("postProcess", oldPostProcessSearch);

            var postProcessSearch = this.getParam("search");

            postProcessSearch = Sideview.replaceTokensFromContext(postProcessSearch, internalContext);

            // put the new postProcess in both ways
            search.setPostProcess(postProcessSearch);

            context.setSplunkSearch(search);
        }

        context.set("postProcess", postProcessSearch);

        return context;
    }
};
    return PostProcess;
});