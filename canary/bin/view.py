# -*- coding: utf-8 -*-
# Copyright (C) 2010-2020 Sideview LLC.  All Rights Reserved.

"""
  This is the core endpoint that returns the HTML to the browser, for the given
  view inside the given app.

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
import time
import splunk
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

if sys.version_info.major >= 3:
    sys.path.append(os.path.join(os.environ['SPLUNK_HOME'], "etc", "apps", APP, "bin", "yaml3"))
    import yaml3 as yaml
elif sys.version_info.major == 2:
    sys.path.append(os.path.join(os.environ['SPLUNK_HOME'], "etc", "apps", APP, "bin", "yaml2"))
    import yaml2 as yaml




logger = sv.setup_logging(logging.DEBUG)


#def get_post_args(form_array):
#    """ just processing the inscrutable struct into more useful args"""
#    out = {}
#    for i, arr2 in enumerate(form_array):
#        out[arr2[0]] = arr2[1]
#    return out



def get_module_not_found_error(module_id, action):
    message = "No module with id %s could be found to %s. Check your selection and try again." % (module_id, action)
    return message

def get_error_response_json(message):
    resp = {"success": False}
    resp["message"] = str(message)
    return json.dumps(resp)


def get_module_params(post_dict, legal_attribute_values):

    module_params = {}

    for attribute_name, attribute_dict in legal_attribute_values.items():
        submitted_value = post_dict.get(attribute_name, None)
        if submitted_value:
            legal_values_list = attribute_dict.get("values", [])
            if attribute_name == "layoutPanel" and submitted_value.startswith("panel_"):
                continue
            if "values" in attribute_dict and legal_values_list and submitted_value not in legal_values_list:
                error_message = sv.get_view_attribute_error(attribute_name, legal_values_list, submitted_value, attribute_dict["required"])
                raise BadRequest(error_message)

        elif attribute_dict.get("required") == "True":
            raise BadRequest("%s is a required field." % attribute_name)

    for arg in post_dict:
        if arg in ["view", "app", "moduleId", "parentModuleId", "parentModuleClass", "insertionType", "insertBeforeModuleId", "insertBeforeModuleClass", "layoutPanel", "autoRun", "group", "moduleClass", "splunk_form_key"]:
            continue

        value = post_dict[arg]
        if sv.is_list_param(post_dict, arg):
            try:
                # json.loads will turn false to False and true to True so
                # we guard against that here.
                if (value != "false" and value != "true" and value[0] != '"' and value[-1] != '"'):
                    value = json.loads(value)
            except Exception as e:
                m = "exception trying convert following string to json - \n%s\n%s", e, value
                logger.error(m)
        module_params[arg] = value
    return module_params






def shared_set_params_for_module(module_node, module_params):
    try:
        sv.set_params_for_module(module_node, module_params)
    except ValueError as e:
        logger.error(str(e))
        logger.error(traceback.format_exc())
        raise BadRequest(e)


def apply_module_add(view_element, post_dict, module_conf):

    module_class_name = post_dict["moduleClass"]
    parent_module_id = post_dict.get("parentModuleId", None)
    insert_before_module_id = post_dict.get("insertBeforeModuleId", None)

    legal_attribute_values = sv.get_legal_values_for_module(module_class_name, module_conf)

    module_params = get_module_params(post_dict, legal_attribute_values)

    module_node = et.SubElement(view_element, "module")
    module_node.set("name", module_class_name)
    module_node.set("moduleId", "TEMPORARY - need it so it can be removed later by silly code")


    shared_set_params_for_module(module_node, module_params)

    if parent_module_id == "_top":
        module_node.set("layoutPanel", "viewHeader")

        view_element.append(module_node)
        #viewNode.appendChild(module_node)

    else:
        parent_module = view_element.find(".//module[@moduleId='%s']" % parent_module_id)

        if insert_before_module_id and insert_before_module_id != parent_module_id:
            insert_before_module = view_element.find(".//module[@moduleId='%s']" % insert_before_module_id)
            if insert_before_module is None:
                raise BadRequest(get_module_not_found_error(insert_before_module, "be the parent"))
            insert_before_module.addprevious(module_node)
        else:
            parent_module.append(module_node)

def apply_module_edit(view_element, post_dict, module_conf):
    module_id = post_dict["moduleId"]
    module_class_name = module_id.split("_")[0]

    legal_attribute_values = sv.get_legal_values_for_module(module_class_name, module_conf)

    module_params = get_module_params(post_dict, legal_attribute_values)

    module_node = view_element.find(".//module[@moduleId='%s']" % module_id)
    if module_node is None:
        raise BadRequest(get_module_not_found_error(module_id, "edit"))

    if module_node.getparent().tag == "view":
        if not post_dict.get("layoutPanel", None):
            sv.build_response(500, get_error_response_json("all top level modules must have a value set for 'layoutPanel'."))

    module_attributes = {
        "layoutPanel": post_dict.get("layoutPanel", None),
        "group": post_dict.get("group", None)
    }
    for name, value in module_attributes.items():
        if value:
            module_node.set(name, value)
        elif module_node.get(name):
            module_node.attrib.pop(name)

    shared_set_params_for_module(module_node, module_params)

def apply_module_delete(view_element, post_dict):
    module_id = post_dict["moduleId"]
    assert(module_id)
    assert(module_id != "_new")

    module = view_element.find(".//module[@moduleId='%s']" % module_id)

    if module is None:
        raise BadRequest(get_module_not_found_error(module_id, "delete"))

    module.getparent().remove(module)


def apply_module_reattach(view_element, post_dict):

    module_id = post_dict.get("moduleId")

    module = view_element.find(".//module[@moduleId='%s']" % module_id)
    if module is None:
        raise BadRequest(get_module_not_found_error(module_id, "reattach"))

    parent_module_id = post_dict.get("parentModuleId")

    if parent_module_id == "_top":
        new_parent = view_element
    else :
        new_parent = view_element.find(".//module[@moduleId='%s']" % parent_module_id)
        if new_parent is None:
            raise BadRequest(get_module_not_found_error(parent_module_id, "be the new parent"))

    #this can be "append" or "insert_before"
    insertion_type = post_dict.get("insertionType", "(no value submitted)")
    if insertion_type not in ["append","insertBefore"]:
        raise BadRequest("%s is not a valid insertion_type" % insertion_type)

    if insertion_type == "insertBefore":
        insert_before_module_id = post_dict.get("insertBeforeModuleId", False)
        if not insert_before_module_id:
            raise BadRequest("insertBefore mode but no insert_before_module_id specified")

        insert_before_module = view_element.find(".//module[@moduleId='%s']" % insert_before_module_id)
        if insert_before_module is None:
            raise BadRequest(get_module_not_found_error(insert_before_module, "be the parent"))
        insert_before_module.addprevious(module)

    else:
        new_parent.append(module)

    #logger.error("in theory we did the thing?")
    #logger.error(et.tostring(view_element, pretty_print=True))




def apply_view_attribute_edits(view_element, request):
    post_dict = request.post_dict
    app = request.app

    for name in sv.VIEW_ATTRIBUTES:
        posted_value = post_dict.get(name, False)

        fail = False

        if name=="template" and posted_value and not sv.mako_template_exists(posted_value):
            fail = "could not find a mako template by that name."
        elif name=="isVisible" and posted_value and posted_value not in ["False","True"]:
            fail = "isVisible can only be True, False or left blank."
        elif name=="stylesheet":
            if posted_value and posted_value.find("../") != -1:
                fail = "hey, quit that"
            elif posted_value and not sv.static_file_exists(app, posted_value):
                fail = "No stylesheet named %s could be found in the %s app." % (posted_value, app)

        if fail:
            raise BadRequest(fail)

        if posted_value:
            view_element.set(name, posted_value)
        else:
            if view_element.get(name):
                view_element.attrib.pop(name)
    label = view_element.find("label")
    if label is None:
        label = et.SubElement(view_element, "label")
        view_element.prepend(label)
    label.text = post_dict.get("label","")



class BadRequest(Exception):
    def __init__(self, message):
        self.status = 400
        self.message = message
    def __str__(self):
        return repr("status %s - %s" % (self.code, self.message))


class CanaryViewHandler(PersistentServerConnectionApplication):
    """
    PersistentServerConnectionApplication is undocumented.  There are some vague
    references to this entire part of Splunk's functionality in restmap.conf.spec
    and that's it.   If it weren't for James Ervin's conf2016 talk, nobody outside
    of Splunk would have a clue how to make one of these handlers run.
    """
    time_points = list()

    def __init__(self, command_line, command_arg):
        """oh hai"""
        PersistentServerConnectionApplication.__init__(self)

    def add_time_point(self, name):
        """
        used to do performance testing.
        """
        self.time_points.append({
            "name": name,
            "time": time.time()
        })


    def add_entries_for_static_files(self, request, view_dict):
        current_app_prefix = sv.get_static_url_prefix(request.session_key, request.app, request.locale)
        canary_app_prefix = sv.get_static_url_prefix(request.session_key, "canary", request.locale)

        view_dict["local_app_static_url_prefix"] = current_app_prefix
        view_dict["canary_static_url_prefix"] = canary_app_prefix
        view_dict["locale"] = request.locale

        module_html, module_css, module_js, class_names = sv.get_files_for_view(
            view_dict.get("modules"), self.module_conf)

        view_dict["moduleClassesRequired"] = class_names
        view_dict["moduleJSFiles"] = module_js
        view_dict["moduleCSS"] = module_css
        view_dict["moduleTemplates"] = module_html
        view_dict["jsFiles"] = sv.get_application_js(request.app)

        custom_app_css = sv.get_custom_css_for_view(view_dict)
        custom_app_css.extend(sv.get_application_css(request.app))
        view_dict["customAppCSS"] = custom_app_css

        custom_app_js = sv.get_custom_js_for_view(view_dict)
        view_dict["customAppJS"] = custom_app_js

        return view_dict




    def render_edit_view_form(self, request, view_element):
        view_attributes = dict(sv.VIEW_ATTRIBUTES)
        # it holds helptext but here we just want the keys
        for name in view_attributes:
            view_attributes[name] = ""

        for name, value in view_element.attrib.items():
            view_attributes[name] = value

        label = ""
        label_element = view_element.find("label")
        if label_element is not None:
            label = label_element.text
        template = "editor/edit_view_params.html"

        template_dict = {
            "viewAttributes":view_attributes,
            "label" : label,
            "csrfToken": request.csrf_token,
            "app":request.app,
            "view":request.view,
            "canary_static_url_prefix": sv.get_static_url_prefix(request.session_key, "canary", request.locale)
        }
        return sv.build_mako_response(template, template_dict)


    def render_view(self, request, view_dict):
        """
        called by handle if we're dealing with a GET request.
        """

        if "modules" not in view_dict:
            return sv.build_response(500, "there are no modules in this view!")

        view_dict = self.add_entries_for_static_files(request, view_dict)
        self.add_time_point("static file stuff added")

        sv.add_parent_ids(view_dict["modules"], self.module_conf)
        sv.add_default_param_values(view_dict["modules"], self.module_conf)
        used_panels = sv.fill_in_inherited_layout_panels(view_dict["modules"])

        bad_modules = sv.get_unsupported_modules(
            view_dict["modules"],
            view_dict["moduleClassesRequired"]
        )
        if bad_modules:
            raise Exception("Zoinks - we can't do anything with these modules - %s"
                            % ",".join(bad_modules))
        sv.add_dynamic_params(view_dict, request.app)
        self.add_time_point("mucking with view dict things")

        app_labels = sv.get_app_labels(request.session_key)
        self.add_time_point("app labels")

        validation_errors = sv.get_validation_errors(view_dict, self.module_conf)
        if validation_errors:
            raise Exception("\n".join(validation_errors))

        #logger.error("module json now is \n" + json.dumps(view_dict, indent=4, sort_keys=True))
        self.add_time_point("validation errors")

        splunk_config = json.dumps(sv.get_config(request.session_key, request.app))
        self.add_time_point("page config")

        keys_to_add = {
            "qs": request.qs_dict,
            "layoutPanelsUsed": used_panels,
            "navConfig": {},
            "modulesJSON": json.dumps(view_dict["modules"]),
            "splunkConfig": splunk_config,
            "timePoints": self.time_points,
            "user": request.user_name,
            "userFullName": sv.get_user_full_name(request),
            "viewId": str(request.view),
            "appId": str(request.app),
            "appLabels": app_labels
        }
        view_dict.update(keys_to_add)

        template = view_dict.get("template", "dashboard.html")

        sv.validate_layout_panels(used_panels)
        self.add_time_point("validating layout panels")

        if request.action == "spacetree":
            template = "spacetree.html"
            view_dict["stJSON"] = sv.get_spacetree_json(request, self.module_conf)

        elif template == "search.html":
            # currently the canary dashboard template can handle all the layoutPanels of the legacy
            # search template. So we are just pretending this view asked for dashboard instead, so
            # that effectively all panels are legal.
            template = "dashboard.html"

        if template.find("/") == -1:
            template = "/view/" + template
        self.add_time_point("end")

        return sv.build_mako_response(template, view_dict)







    def handle_post(self, request):
        if request.view and not sv.is_view_editable(request):
            logger.info("build_uneditable_view_response")
            return sv.build_uneditable_view_response(request)

        posted_xml = request.post_dict.get("xml", "")
        if posted_xml:
            view_element = sv.parse_view_element(posted_xml)
            view_dict = sv.make_view_dict(view_element, request.app, self.module_conf, True)
            return self.render_view(request, view_dict)

        try:
            view_element = sv.get_view_element(request)
            sv.add_ids_to_all_modules(view_element)

            if request.action in ["edit_view_props", "create"]:
                apply_view_attribute_edits(view_element, request)

            elif request.action == "reattach_module":
                apply_module_reattach(view_element, request.post_dict)

            elif request.action == "delete_module":
                apply_module_delete(view_element, request.post_dict)

            elif request.action == "add_module":
                apply_module_add(view_element, request.post_dict, self.module_conf)

            elif request.action=="edit_module":
                apply_module_edit(view_element, request.post_dict, self.module_conf)

            elif not request.action:
                raise BadRequest("No action specified on POST")

            else:
                raise NotImplementedError("Unimplemented action %s " % request.action)

            view_dict = sv.make_view_dict(view_element, request.app, self.module_conf, True)
            validation_errors = sv.get_validation_errors(view_dict, self.module_conf)
            if validation_errors:
                raise BadRequest("\n".join(validation_errors))


            sv.commit_changes_to_view(request, view_element)

        except BadRequest as e:
            logger.error(traceback.format_exc())
            return sv.build_response(400, get_error_response_json(e.message))

        except Exception as e:
            logger.error(traceback.format_exc())
            return sv.build_response(500, get_error_response_json(str(e)))


        return sv.build_response(200, '{"success":true, "action":"%s"}' % request.action)



    def handle_get(self, request):

        self.add_time_point("parsing params")
        if not request.view:
            request.view = sv.get_default_view_for_app(request.app, request.user_name, request.session_key)
            if not request.view:
                return sv.build_response(400, "unable to render any default view for the %s app" % request.app)


            # TODO - yep.  we still need a canary_compatible=<boolean> somewhere.
            # If we extend app.conf there still seems to be no way to actually get that
            # key out via REST.
            view_type = None
            if request.app in ["canary", "cisco_cdr", "SA_cisco_cdr_axl", "shoretel"]:
                view_type = "Sideview XML"
            # todo - rearrange this so as to move these to redirects inside Request.
            return sv.redirect(request, view_type)

        self.add_time_point("getting query args")

        replace_patterns = request.qs_dict.get("output_as", False) != "yaml"

        self.add_time_point("replacing patterns")


        if request.action == "create":
            if request.view == "_new":
                view_element = et.fromstring(sv.BLANK_VIEW_XML);
            else:
                raise BadRequest("with the 'create' action the only legal value for the view is '_new'")
        else:
            try:
                view_element = sv.get_view_element(request)
            except LookupError as view_type:
                logger.info("trying to redirect because %s is a %s", request.view, view_type)
                return sv.redirect(request, view_type)
            except splunk.ResourceNotFound:
                try:
                    sv.get_app_config(request.session_key, request.app)
                except splunk.ResourceNotFound:
                    logger.error(traceback.format_exc())
                    message = "<h3>HTTP Error 404 : There is no app named '%s' installed</h3> <p>(If you feel this app is installed though, check whether it's disabled, make sure splunkd has been restarted since install, or perhaps try logging in as a different splunk user.)</p>" % request.app
                    return sv.build_response(404, message)
                message = "<h3>HTTP Error 404 : There is no view named '%s' within this app.</h3> Or if there is, it isn't readable by your user account." % request.view
                return sv.build_response(404, message)
            except Exception:
                logger.error(traceback.format_exc())
                return sv.build_response(500, "Unexpected Server Error\n%s" % traceback.format_exc())

        if request.action in ["edit", "create"]:
            return self.render_edit_view_form(request, view_element)

        view_type = sv.get_view_type(view_element, self.module_conf)
        if view_type not in ["Sideview XML", "Advanced XML", "Canary yaml"]:
            return sv.redirect(request, view_type)

        view_dict = sv.make_view_dict(view_element, request.app, self.module_conf, replace_patterns)

        self.add_time_point("getting the actual view config")
        if request.qs_dict.get("output_as", False) == "yaml":
            yaml_output = sv.convert_canary_dict_to_yaml(view_dict)
            # make this thing not do the dumb linebreak thing.
            return sv.build_response(200, yaml_output)

        logger.info("rendering view user=\"%s\" locale=\"%s\" app=\"%s\" view=\"%s\" method=\"%s\"",
                    request.user_name, request.locale, request.app, request.view, request.method)
        return self.render_view(request, view_dict)

    def handle(self, in_string):
        """
        This is the main method to handle requests.
        """
        self.time_points = list()
        self.add_time_point("start")

        try:
            params = json.loads(in_string)
            request = Request(params)

            self.module_conf = module_loader.get_modules(request.session_key)

            self.add_time_point("getting modules")

            if request.method == "POST":
                return self.handle_post(request)

            elif request.method == "GET":
                return self.handle_get(request)

            else:
                return sv.build_response(405, "Method %s not allowed" % request.method)

        # no matter what kind of horrible things go wrong, we still need to make the proper
        # little response dict to return.
        except Exception as exc:
            formatted_exc = traceback.format_exc()
            logger.error(formatted_exc)
            html_error = "<pre><h2>%s</h2>\n\n%s</pre>" % (str(exc), formatted_exc)
            return sv.build_response(500, html_error)
