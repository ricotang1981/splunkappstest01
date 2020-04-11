require([
    "splunkjs/mvc/simplexml/ready!"
], function() {

    var loc = document.location.pathname.toString();

    if (loc.indexOf("/manager/")!=-1) return;

    if (loc.indexOf("/app/canary/shunt")!=-1) {

        function infer_root_endpoint_from_path_segments(segments) {
            var root_endpoint = [];
            for (var i=0;i<segments.length;i++) {
                // does it look like a locale string?
                if  (segments[i].match(/\w{2}-\w{2}/)) {
                    break;
                }
                //otherwise throw it on the pile.
                root_endpoint.push(segments[i])
            }
            var root_endpoint_str = root_endpoint.join("/");
            if (root_endpoint.length>0) {
                root_endpoint_str = "/" + root_endpoint_str;
            }
            return root_endpoint_str;
        }

        var path_segments = document.location.toString().split("/").splice(3);
        var root_endpoint_str = infer_root_endpoint_from_path_segments(path_segments);
        var new_path = root_endpoint_str + "/splunkd/__raw/sv_view/canary/home";
        document.location = new_path;
    }
});

