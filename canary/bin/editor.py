# -*- coding: utf-8 -*-
# Copyright (C) 2012-2020 Sideview LLC.  All Rights Reserved.

"""
oh hai
"""
import logging
import sys
import os
import time
import json
import splunk
from splunk.persistconn.application import PersistentServerConnectionApplication


if sys.platform == "win32":
    import msvcrt
    # Binary mode is required for persistent mode on Windows.
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stderr.fileno(), os.O_BINARY)

APP = "canary"
SPLUNK_HOME = os.environ["SPLUNK_HOME"]


# good times -- the net effect of this is that it will add the bin directory of
# ALL APPS. not just this one app.  Why?  Who the heck knows.
sys.path.append(os.path.join(os.environ['SPLUNK_HOME'], "etc", "apps", APP, "bin"))

import sideview_canary as sv
from request import Request

logger = sv.setup_logging(logging.DEBUG)


#def get_post_args(form_array):
#    """ just processing the inscrutable struct into more useful args"""
#    out = {}
#    for i, arr2 in enumerate(form_array):
#        out[arr2[0]] = arr2[1]
#    return out


class CanaryEditorHandler(PersistentServerConnectionApplication):
    """
    PersistentServerConnectionApplication is undocumented.  There are some vague
    references to this entire part of Splunk's functionality in restmap.conf.spec
    and that's it.   If it weren't for James Ervin's conf2016 talk, nobody outside
    of Splunk would have a clue how to make one of these handlers run.
    """

    def __init__(self, command_line, command_arg):
        """oh hai"""
        PersistentServerConnectionApplication.__init__(self)



    def handle(self, in_string):
        """
        This is the main method to handle requests.
        """

        params = json.loads(in_string)
        request = Request(params)

        view_dict = request.qs_dict.copy()

        canary_app_prefix = sv.get_static_url_prefix(request.session_key, "canary", request.locale)

        page_config = json.dumps(sv.get_config(request.session_key, APP))
        view_dict["splunkConfig"] = page_config
        view_dict["canary_static_url_prefix"] = canary_app_prefix
        view_dict["app"] = request.app
        view_dict["view"] = request.view
        view_dict["mode"] = request.action
        view_dict["user"] = request.user_name
        view_dict["module_id"] = request.qs_dict.get("module_id","")

        return sv.build_mako_response('/editor/editor.html', view_dict)
