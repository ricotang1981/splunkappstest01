// Copyright (C) 2016-2019 Sideview LLC.  All Rights Reserved.

define(
  [],
  function() {

class API {
    constructor() {}

    isAsync() {
        return false;
    }

    isDone() {

    }

    getResultCount() {
        console.warn("getResultCount unimplemented");
    }

    getDoneProgress() {
        console.warn("getDoneProgress unimplemented");
    }


    getAPI() {
        throw("someone managed to call getAPI on the Abstract API Class");
    }

}
return API

})



