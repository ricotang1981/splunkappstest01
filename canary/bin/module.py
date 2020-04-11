# -*- coding: utf-8 -*-
# Copyright (C) 2010-2020 Sideview LLC.  All Rights Reserved.

"""
  This is a simple endpoint that handles various simple GET requests about a
  specific module's config in a specific view.

  If your use of this app is through the Sideview Trial License Agreement,
  or through the Sideview Internal Use License Agreement, then as per the
  relevant agreement any modification of this file or modified copies made
  of this file constitutes a violation of that agreement.
"""
import os
import sys
import json
import traceback
import logging
import lxml.etree as et
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
import module_loader
from request import Request


MODULE_ATTRIBUTES_WITH_HELPTEXT = {
    "layoutPanel": """layoutPanel values are inherited from modules higher up
            in the tree.  As such, you do NOT need to set layoutPanel values
            on every module - set them only when you wish a particular module
            to be in a different panel than its parent.  <br><br>When you see
            a layoutPanel value in this interface that is greyed out, that is
            just showing you the value that the module has inherited from
            upstream. """,
    "group": """group attributes are weird.  They are used to match
            against selected subtrees when you're using a Switcher module
            to display different modules to the user,  or when you're using
            one of the old Splunk modules like PulldownSwitcher,
            LinkSwitcher, TabSwitcher, etc...  I'd write more but I gotta
            run to dinner. And you haven't read this far anyway.
            Group attributes are weird and not very useful. Dont use them. """

}

logger = sv.setup_logging(logging.DEBUG)


def get_base_url(session_key):
    return sv.get_static_url_prefix(session_key, "canary", "en-US", root_endpoint="")



class CanaryModuleHandler(PersistentServerConnectionApplication):
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
        try:

            params = json.loads(in_string)
            request = Request(params)

            request.action = params["path_info"].split('/', 0)[0]

            if request.action in ["edit", "add", "delete", "reattach_existing", "debug"]:
                # TODO / ZOMG / FIXME
                request.app = request.qs_dict.get("app", None)
                request.view = request.qs_dict.get("view", None)

                if not request.app or not request.view:
                    message = "ERROR - missing a key argument app=%s view=%s" % (request.app, request.view)
                    return sv.build_response(500, message)

                return self.handle_edit(request)


            elif request.action == "describe":
                module_class_name = request.qs_dict.get("moduleClass")
                param_name = request.qs_dict.get("param", False)
                return self.handle_describe(request.session_key, module_class_name, param_name)

            return sv.build_response(501, "this action is not yet implemented %s" % request.action)


        except Exception as exc:
            logger.error(exc)
            formatted_exc = traceback.format_exc()
            logger.error(formatted_exc)
            html_error = "<pre><h2>%s</h2>\n\n%s</pre>" % (str(exc), formatted_exc)
            return sv.build_response(500, html_error)



    def handle_edit(self, request):
        module_id = request.qs_dict.get("moduleId", None)

        view_element = sv.get_view_element(request)
        module_conf = module_loader.get_modules(request.session_key)

        view_element, _warnings, _infos = sv.replace_bad_modules(view_element, module_conf)

        sv.add_ids_to_all_modules(view_element)

        parent_module_id = request.qs_dict.get("parentModuleId", None)

        if request.qs_dict.get("parentModuleClass", None) == "view":
            parent_module_id = "_top"

        module_attributes = ["layoutPanel", "group"]
        attributes = {}
        template_dict = {
            "app": request.app,
            "view": request.view,
            "moduleId":module_id,
            "parentModuleId": parent_module_id,
            "bigParams": sv.BIG_PARAMS,
            "listParams": sv.LIST_PARAMS,
            "csrfToken": request.csrf_token,
            "canary_static_url_prefix": get_base_url(request.session_key)
        }


        if request.action == "add":
            template = "/editor/choose_module_to_add.html"

            class_names = module_conf.keys()
            class_names.sort()
            template_dict["moduleClasses"] = class_names
            return sv.build_mako_response(template, template_dict)

        elif request.action == "delete":
            template = "/editor/choose_node_to_delete.html"
            return sv.build_mako_response(template, template_dict)

        elif request.action == "debug":
            template = "/editor/choose_node_to_debug.html"
            return sv.build_mako_response(template, template_dict)

        elif request.action == "reattach_existing":
            template = "/editor/choose_module_to_reattach.html"
            return sv.build_mako_response(template, template_dict)

        # TODO - this one needs to have its sprawl pulled up and out into some
        # get_template_dict function so we can clean this up and just have
        # one call to sv.build_mako_response at the bottom
        elif request.action == "edit":

            if not module_id:
                template = "/editor/choose_node_to_edit.html"
                template_dict["successMessage"] = ""
                return sv.build_mako_response(template, template_dict)


            if module_id == "_new":
                currentParamValues = {}
                module_class = request.qs_dict.get("moduleClass", None)
                if parent_module_id != "_top":
                    parent_module = view_element.find(".//module[@moduleId='%s']" % parent_module_id)
                    if parent_module is None:
                        return sv.build_response(500, "no module with id %s" % parent_module_id)

                    for att_name in module_attributes:
                        val, _inheritedVal = sv.get_module_attribute(parent_module, att_name)

                        # NB: to see things from the child's perspective, we set BOTH to the the raw val.
                        attributes[att_name] = {
                            "value": val,
                            "inheritedValue": val
                        }
                else:
                    for att_name in module_attributes:
                        attributes[att_name] = {
                            "value": "",
                            "inheritedValue": ""
                        }
            else:
                module_class = module_id.split("_")[0]
                module = view_element.find(".//module[@moduleId='%s']" % module_id)
                for att_name in module_attributes:
                    val, inheritedVal = sv.get_module_attribute(module, att_name)

                    attributes[att_name] = {
                        "value":val,
                        "inheritedValue":inheritedVal
                    }
                currentParamValues = sv.get_module_nodes_params_as_dict(module)

        template_dict["currentParamValues"] = currentParamValues


        template = "/editor/edit_module_params.html"
        template_dict["className"] = module_class
        template_dict["module"] = module_conf[module_class]
        template_dict["moduleAttributeMap"] = attributes
        template_dict["insertBeforeModuleId"] = request.qs_dict.get("insertBeforeModuleId", None)

        template_dict["isSupported"] = module_class not in sv.LEGACY_SPLUNK_MODULES

        return sv.build_mako_response(template, template_dict)


    def handle_describe(self, session_key, module_class_name, param_name=None):

        module_conf = module_loader.get_modules(session_key)
        module_class = module_conf.get(module_class_name)

        template = "/editor/general_description.html"
        template_dict = {
            "escapedText":"",
            "canary_static_url_prefix": get_base_url(session_key),
            "module": module_class
        }
        if param_name in MODULE_ATTRIBUTES_WITH_HELPTEXT:
            text = MODULE_ATTRIBUTES_WITH_HELPTEXT.get(param_name)
            template_dict["title"] = "%s - \"%s\" attribute" % (module_class_name, param_name)
            template_dict["text"] = text
        else:
            template = "/editor/param_description.html"
            if param_name:
                #logger.error("we has a param %s ", param_name)
                #logger.error(json.dumps(module_class, sort_keys=True, indent=4))

                if param_name.find(".") != -1:
                    param_name = param_name[0:param_name.find(".") + 1] + "*"
                    paramObj = module_class["params"][param_name]
                else:
                    paramObj = module_class["params"][param_name]

                template_dict["pname"] = param_name
                template_dict["param"] = paramObj

            else:
                template = "/editor/module_description.html"

        return sv.build_mako_response(template, template_dict)
