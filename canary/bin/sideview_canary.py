# -*- coding: utf-8 -*-
#Copyright (C) 2010-2020 Sideview LLC.  All Rights Reserved.
"""
    this contains various functions and classes used by canary endpoints and search commands.
"""
import logging
import re
import os
import xml.dom.minidom
import json
import sys
import traceback
from collections import OrderedDict
import lxml.etree as et
from mako import exceptions
from mako.lookup import TemplateLookup

import splunk
import splunk.rest as rest
import splunk.entity as en
from splunk.clilib import bundle_paths


APP = "canary"
SPLUNK_HOME = os.environ["SPLUNK_HOME"]
EAI_DATA_KEY = "eai:data"
ETC_APPS_DIR = bundle_paths.get_base_path()

if sys.version_info.major >= 3:
    sys.path.append(os.path.join(SPLUNK_HOME, "etc", "apps", APP, "bin", "yaml3"))
    import yaml3 as yaml
elif sys.version_info.major == 2:
    sys.path.append(os.path.join(SPLUNK_HOME, "etc", "apps", APP, "bin", "yaml2"))
    import yaml2 as yaml


MAKO_TEMPLATE_LOOKUP = TemplateLookup(
    input_encoding='utf-8',
    directories=[
        os.path.join(SPLUNK_HOME, "etc", "apps", APP, "appserver", "templates"),
        os.path.join(SPLUNK_HOME, "etc", "apps", APP, "appserver", "static", "lib")
    ])


#TODO - migrate resultsAreaLeft to resultsArea,  and what about "sidebar"
LEGAL_LAYOUT_PANELS = ["appHeader", "navigationHeader", "messaging", "viewHeader", "mainSearchControls", "graphArea", "pageControls", "resultsHeaderPanel", "resultsAreaLeft"]

HIERARCHY_DIRECTIVES = ["requiresDownstreamModules", "forbidsDownstreamModules", "requiresUpstreamModules", "forbidsUpstreamModules"]

MODULE_ATTRIBUTE_RE = re.compile(r"(\s+)<module ([^/>]+)(/)?>(.+)?")
CDATA_SPACE_BUG_RE = re.compile(r"(.+)?(]]>)(\s+)(</param>)(.?)")
DASHBOARD_PANEL_RE = re.compile(r"panel_row(\d+)_col(\d+)(?:_grp(\d+))?")
ALL_SLASHES_RE = re.compile(r"[/\\\\]")
DEFAULT_LAYOUT_PANEL = "panel_row1_col1"
BLANK_VIEW_XML = """<?xml version="1.0" ?>
<view><label>New View</label>

  <module name="TopNav" layoutPanel="appHeader" />

  <module name="AppNav" layoutPanel="appHeader" />

  <module name="HTML" layoutPanel="viewHeader">
    <param name="html"><![CDATA[
    <h1>Placeholder Page Title</h1>
    ]]></param>
  </module>

  <module name="Search" layoutPanel="panel_row1_col1">
    <param name="search"><![CDATA[
      | eventcount summarize=false index=* | search count>0 | fields index server count
    ]]></param>

    <module name="Pager">

      <module name="Table"/>
    </module>
  </module>
</view>
"""

BASE_DIR = os.path.abspath(bundle_paths.get_base_path())


def setup_logging(log_level):
    """ we use our own canary.log file, although regrettably this is still
    left to be handled by the _internal data input"""
    LOG_FILE_PATH = os.path.join(SPLUNK_HOME, "var", "log", "splunk", APP + ".log")
    LOGGING_FORMAT = "%(asctime)s %(levelname)-s\t%(module)s:%(lineno)d - %(message)s"

    our_logger = logging.getLogger(APP)
    if not our_logger.handlers:
        our_logger.propagate = False
        our_logger.setLevel(log_level)
        handler = logging.handlers.RotatingFileHandler(LOG_FILE_PATH, mode="a")
        handler.setFormatter(logging.Formatter(LOGGING_FORMAT))
        our_logger.addHandler(handler)
    return our_logger

logger = setup_logging(logging.DEBUG)


def fixed_writexml(self, writer, indent="", addindent="", newl=""):
    """ patches minidom's writexml method, so it doesnt add tons of whitespace."""
    writer.write(indent+"<" + self.tagName)

    attrs = self._get_attributes()
    a_names = attrs.keys()
    a_names.sort()

    for a_name in a_names:
        writer.write(" %s=\"" % a_name)
        xml.dom.minidom._write_data(writer, attrs[a_name].value)
        writer.write("\"")
    if self.child_nodes:
        if len(self.child_nodes) == 1 \
          and self.child_nodes[0].nodeType == xml.dom.minidom.Node.TEXT_NODE:
            writer.write(">")
            self.child_nodes[0].writexml(writer, "", "", "")
            newl = ""
            writer.write("</%s>%s" % (self.tagName, newl))
            return
        newl = ""
        writer.write(">%s"%(newl))
        for node in self.child_nodes:
            newl = ""
            node.writexml(writer, indent+addindent, addindent, newl)
        newl = ""
        writer.write("%s</%s>%s" % (indent, self.tagName, newl))
    else:
        newl = ""
        writer.write("/>%s"%(newl))

# replace minidom's function with ours
xml.dom.minidom.Element.writexml = fixed_writexml


def patch_xml_for_readability(pretty_xml):
    """
    implements a fairly simple list of cleanups that together improve the
    readability of the XML.
    """

    def attribute_sorter(whole_attribute):
        sort_orders = {
            "name":0,
            "layoutPanel":10,
            "group":20,
            "autoRun":99
        }

        if whole_attribute.find("="):
            order = sort_orders.get(whole_attribute.split("=")[0], 50)
            return str(order)
        return whole_attribute

    lines = pretty_xml.decode().split("\n")
    for i, _line in enumerate(lines):
        ## take off lame whitespace that gets stuck on the end.
        lines[i] = lines[i].rstrip()

        ## reorder the module attributes...
        module_tag_match = re.match(MODULE_ATTRIBUTE_RE, lines[i])
        if module_tag_match:
            whitespace = module_tag_match.group(1)
            att_str = module_tag_match.group(2)
            end_slash = module_tag_match.group(3)
            junk = module_tag_match.group(4)

            attributes = sorted(att_str.split(" "), key=attribute_sorter)
            line = []
            if whitespace:
                line.append(whitespace)
            line.append("<module ")
            line.append(" ".join(attributes))
            if end_slash:
                line.append(" " + end_slash)
            line.append(">")
            if junk:
                line.append(junk)
            lines[i] = "".join(line)

        # add newlines in front of every opening module tag.
        if lines[i].lstrip().find("<module") == 0:
            lines[i] = "\n"+lines[i]

        # fix the problematic spaces that get injected between closing
        # CDATA blocks and closing tags.
        if re.match(CDATA_SPACE_BUG_RE, lines[i]):
            lines[i] = re.sub(CDATA_SPACE_BUG_RE, r"\1\2\4\5", lines[i])

    return "\n".join(lines)



def get_text(node):
    """
    helper function to just grab all the normal text content out of a node
    """
    segments = []
    for child_node in node.child_nodes:
        if child_node.nodeType == child_node.TEXT_NODE:
            segments.append(child_node.data)
        if child_node.nodeType == child_node.CDATA_SECTION_NODE:
            segments.append(child_node.data)
    return ''.join(segments)


def migrate_field_picker(module_node, warnings, infos):
    """ super weird - but very limited migration.
    The FieldPicker module expects to get events!  and it gets the
    field names off those rows.
    the Fields module expects to get N rows where each row has a field
    called "field"
    so... this migration sneaks up to the Search module and rewrites
    the SPL that sideview's apps always have there.
    what could go wrong?
    """
    rename_module_to(module_node, "Fields")
    hidden_fields_param = et.SubElement(module_node, "param")
    hidden_fields_param.set("name", "hiddenFields")
    hidden_fields_param.text = "_time"
    module_node.append(hidden_fields_param)

    parent_module = module_node.getparent()
    if parent_module.get("name") == "Search":
        search_param = parent_module.find("./param[@name='search']")
        if search_param is not None:
            spl = search_param.text
            try:
                spl = re.sub(r'(?is)foo NOT foo \| append \[\r?\n?\s+', '', spl)
                spl = re.sub(r'(?is)\s+\| eval foobar="1"\s+\| chart count over foobar by field limit=500\r?\n?\s+\|\sfields - foobar\r?\n?\]\s?\r?\n\| eval _time=0', '', spl)

                search_param.text = spl
                infos.append("in replacing FieldPicker with Fields, we actually rewrote your SPL to match the difference in conventions, and somewhat surprisingly this seems to have worked.")
            except Exception:
                warnings.append("we tried to rewrite the SPL that was feeding the FieldPicker module so that it would match the conventions for the new Fields module but this failed so we did nothing.")

def convert_count_module_to_pulldown(module_node, warnings):
    """ neither SVU nor Canary has a special Count module and instead you're supposed
    to just use a Pulldown. This method attempts to make a generic Pulldown to replace your 'Count'"""
    rename_param_to(module_node, "options", "staticOptions", warnings)
    options_param = module_node.find("./param[@name='staticOptions']")
    for node in options_param.findall("list//param[@text]"):
        node.set("name", "label")
    rename_module_to(module_node, "Pulldown")

    name_param = et.SubElement(module_node, "param")
    name_param.set("name", "name")
    name_param.text = "results.count"
    module_node.append(name_param)
    warnings.append("We converted a Count module to a standard Pulldown module.")


def remove_all_params(module_node):
    """kill them all please"""
    for param in module_node.findall("param"):
        module_node.remove(param)

def remove_param(module_node, unwanted_param_names, warnings, suggestion=""):
    """removes any params bearing the given names. If any are found, it writes a warning about it """
    if isinstance(unwanted_param_names, str):
        unwanted_param_names = [unwanted_param_names]
    for param in module_node.findall("param"):
        param_name = param.get("name")
        if param_name in unwanted_param_names:
            module_node.remove(param)
            if warnings:
                warning_text = "%s's %s param has been discarded. %s" % (module_node.get("name"), param_name, suggestion)
                warnings.append(warning_text)

def rename_param_to(module_node, old_name, new_name, warnings):
    """renames the given param name and writes a warning"""
    for param in module_node.findall("param"):
        if param.get("name") == old_name:
            param.set("name", new_name)
            if warnings:
                warning_text = "%s's %s param has been renamed to %s" % (module_node.get("name"), old_name, new_name)
                warnings.append(warning_text)
            return

def rename_module_to(module_node, new_name):
    """self-explanatory really"""
    module_node.set("name", new_name)

def param_has_value(module_node, given_param_name, values, case_sensitive_match=True):
    """checks whether the given param has any of the given values. case-sensitive by default."""
    if not case_sensitive_match:
        values = [x.lower() for x in values]
    for param in module_node.findall("param"):
        param_name = param.get("name")
        if param_name == given_param_name:
            param_value = param.text
            if not case_sensitive_match:
                param_value = param_value.lower()
            if param_value in values:
                return True
            return False
    return False

def convert_svu_custom_css_and_js(view_element, warnings, infos, app):
    """airlift out any customStylesheet or customJavascript params"""
    sideview_utils_module = view_element.find("./module[@name='SideviewUtils']")
    if sideview_utils_module is None:
        return

    for param in sideview_utils_module.findall("param"):
        param_name = param.get("name")
        if param_name in ["customStylesheet", "customJavascript"]:
            if not param.text:
                continue
            param_uri = param.text
            param_uri_segments = param_uri.split("/")
            if len(param_uri_segments) > 1:
                app_in_uri = param_uri_segments[0]
                if app and app != app_in_uri:
                    warnings.append("the %s param on the view tag specifies %s but Canary can only include resources from the same app." % (param_name, param_uri))
                # its only get_view_type that does this, and we really dont care.
                #elif not app:
                #    logger.warning("we see a %s param of %s and although we're not sure whether this is our app or not, we are choosing not to care " % (param_name, param_uri))
                param_uri = param_uri_segments[1]

            new_uri = [param_uri]

            new_attribute_name = "customJS"
            if param_name == "customStylesheet":
                new_attribute_name = "stylesheet"
                if view_element.get("stylesheet"):
                    new_uri = new_uri+ [view_element.get("stylesheet")]
            infos.append("the value of the %s param on the SideviewUtils module was moved to be the value of the %s key on the view itself." % (param_name, new_attribute_name))
            view_element.set(new_attribute_name, ",".join(new_uri))


def final_inspection(view_element, module_conf):
    warnings = []
    for module_node in view_element.iter("module"):
        module_name = module_node.get("name")
        if module_name == "SearchBar":
            warnings.append("We can not migrate the legacy SearchBar module. Technically a combination of TextField, TimePicker and Search module might work, with some custom CSS")
        elif module_name == "Export":
            warnings.append("Export module - technically this can be manually replaced with a SearchControls module configured to have only the export icon")
        elif module_name == "SingleValue":
            warnings.append("SingleValue can typically be replaced by an HTML module with some effort, but this cannot be migrated automatically")
        elif module_name in ["RowNumbers", "SoftWrap"]:
            warnings.append("%s is a legacy Splunk module. It should be possible for you to manually replace this with a Checkbox module" % module_name)
        elif module_name in ["MaxLines"]:
            warnings.append("%s is a legacy Splunk module. It should be possible for you to manually replace this with a Pulldown module" % module_name)
        elif module_name == "ConditionalSwitcher":
            warnings.append("%s is a legacy Splunk module. It can be manually converted using a Switcher module and some customBehavior but this cannot be migrated automatically." % module_name)
        elif module_name != "Switcher" and module_name.endswith("Switcher"):
            first_part = module_name.replace("Switcher", "")
            if first_part in ["Tab", "Link", "Pulldown", "Button"]:
                warnings.append("%s is a legacy Splunk module. It should be possible to manually replace this with a Switcher plus a %s module but this cannot be migrated automatically." % (module_name, first_part))
        elif module_name in ["ReportType", "ReportSubType", "StatChooser", "SingleFieldChooser", "TimeRangeBinning"]:
            warnings.append(module_name + " is a legacy Splunk module and can not be migrated. It's unlikely this module still works, or that this view is used by anyone.")
        else:
            canary_module = module_conf.get(module_name, False)
            if not canary_module:
                if module_name in DEAD_SIDEVIEW_UTILS_MODULES:
                    warnings.append("We can not migrate the old Sideview %s module. This was technically never more than a prototype." % module_name)
                elif module_name in LEGACY_SPLUNK_MODULES:
                    warnings.append(module_name + " is a legacy Splunk module that we cannot migrate.")
                else:
                    warnings.append(module_name + " seems to be some unknown third-party module that we cannot migrate.")
    return warnings

# - TODO - TopNav and NavBar should be present by default.
#   and you have to put some top level config to NOT have them
def replace_bad_modules(view_element, module_conf, app=False):
    """This is basically the main migration - returns a "cleaned" version of the view"""
    warnings = []
    infos = []


    replacements = {
        "AccountBar": "TopNav",
        "AppBar": "AppNav",
        "FlashChart": "Chart",
        "FlashTimeline": "Timeline",
        "HiddenPostProcess": "PostProcess",
        "HiddenSearch":"Search",
        "JobProgressIndicator": "ProgressIndicator",
        "JSChart": "Chart",
        "NullModule": "CustomBehavior",
        "Paginator":"Pager",
        "ServerSideInclude": "HTML",
        "SimpleResultsTable": "Table"
    }

    # TODO: y no EventsViewer: Events ?

    convert_svu_custom_css_and_js(view_element, warnings, infos, app)

    for module_node in view_element.iter("module"):
        module_name = module_node.get("name")
        if module_name in replacements:
            new_module_name = replacements.get(module_name)
            module_node.set("name", new_module_name)
            infos.append("replaced %s with %s" % (module_name, new_module_name))

    for module_node in view_element.iter("module"):
        module_name = module_node.get("name")

        if module_name == "SearchControls":
            remove_param(module_node, ["saveMenu", "createMenu"], warnings)
            sections_param = module_node.find("./param[@name='sections']")
            if sections_param is not None:
                old_sections_value = sections_param.text
                new_sections_value = old_sections_value.replace(" saveMenu", "").replace(" createMenu", "")
                if old_sections_value != new_sections_value:
                    sections_param.text = new_sections_value
                    infos.append("we saw the 'saveMenu' and 'createMenu' param values from Sideview Utils but the Canary SearchControls module doesn't provide that so we removed them.")

        if module_name == "JobStatus":
            rename_module_to(module_node, "SearchControls")
            remove_all_params(module_node)
            warnings.append("We replaced a JobStatus module with a bare SearchControls module. This will almost certainly be a change in functionality (although it might be an improvement).")

        if module_name == "FieldPicker":
            migrate_field_picker(module_node, warnings, infos)

        if module_name == "SubmitButton":
            rename_module_to(module_node, "Button")
            remove_param(module_node, "updatePermalink", warnings, "This would need to be manually converted to a use of URLLoader")
            remove_param(module_node, "visible", warnings)

        # checking to see if straight replacement of FlashTimeline
        # left a height or width param in there.
        if module_name == "Timeline":
            remove_param(module_node, ["height", "width"], warnings)

        # checking to see if straight replacement of FlashChart/JSChart
        # left a drilldownPrefix param in there.
        if module_name == "Chart":
            remove_param(module_node, "maxRowsForTop", warnings)
            rename_param_to(module_node, "drilldownPrefix", "name", warnings)
            remove_param(module_node, "width", warnings, "Chart module replaces FlashChart/JSChart but does not have a width param and width is always effectively 100%")

        # checking to see if straight replacement of SimpleResultsTable
        # left various dead params in there
        if module_name == "Table":
            remove_param(module_node, ["displayRowNumbers", "entityName"], warnings)
            if param_has_value(module_node, "drilldown", "cell"):
                warnings.append("Table doesn't implement anything equivalent to 'cell' drilldown. This was discarded.")
            remove_param(module_node, "drilldown", warnings)

        # checking to see if straight replacement left Paginator's
        # weirder entityName values orphaned
        if module_name == "Pager":
            if param_has_value(module_node, "entityName", ["settings", "auto", "results"]):
                remove_param(module_node, "entityName", warnings)

        # checking to see if straight replacement left either of HiddenSearch's
        # legacy params as orphans
        if module_name == "Search":
            remove_param(module_node, ["maxCount", "maxEvents"], warnings)

        if module_name == "TimeRangePicker":
            rename_module_to(module_node, "TimePicker")
            rename_param_to(module_node, "selected", "default", warnings)

            if param_has_value(module_node, "searchWhenChanged", ["False"], False):
                warnings.append("""searchWhenChanged=False is not supported by the Canary TimePicker module
                    and was discarded. Consider using a Button module with allowSoftSubmit set to False.""")
            remove_param(module_node, "searchWhenChanged", warnings)

            # if there is no label param we have to create an explicit null one, to prevent
            # the TimePicker's default label from appearing.
            label_param = module_node.find("./param[@name='label']")
            if label_param is None:
                new_param = et.SubElement(module_node, "param")
                new_param.set("name", "label")
                module_node.append(new_param)

        # look for the group=" " workaround from advanced xml and delete it.
        if module_name == "Switcher":
            if module_node.get("group") == " ":
                del module_node.attrib["group"]

        if module_name == "EnablePreview":
            if param_has_value(module_node, "display", "true", False):
                warnings.append("EnablePreview module had display set to true. We removed the whole module for now but this requires manual migration if you want this functionality back. Note that the Search module has a preview param that takes $foo$ substitution, and the Checkbox module makes a working checkbox.")
            if param_has_value(module_node, "enable", "true", False):
                warnings.append("EnablePreview module had enable set to true. This requires manual migration -- Look up in the XML to the first Search that is a direct ancestor and set its preview param to true.")

        if module_name == "Pulldown":
            if param_has_value(module_node, "mode", "advanced"):
                warnings.append("Pulldown module used to have a 'mode' param you could set to 'advanced' but this is gone. Manually convert this view to use a CheckboxPulldown here instead.")
            remove_param(module_node, "mode", warnings)

        if module_name == "Count":
            convert_count_module_to_pulldown(module_node, warnings)

        if module_name == "StaticContentSample":
            rename_module_to(module_node, "HTML")
            rename_param_to(module_node, "text", "html", warnings)

        if module_name == "HiddenChartFormatter":
            rename_module_to(module_node, "ValueSetter")
            remove_param(module_node, "chartTitle", warnings, "HiddenChartFormatter's chartTitle param must be manually replaced with a simple HTML module")
            for param in module_node.findall("param"):
                old_name = param.get("name", "")
                new_name = old_name
                if not old_name.startswith("charting."):
                    new_name = "charting." + new_name
                elif not new_name.startswith("arg."):
                    new_name = "arg." + new_name
                param.set("name", new_name)
                infos.append("HiddenChartFormatter was replaced by Value Setter, and a %s param was replaced with %s." % (old_name, new_name))


    for module_node in view_element.iter("module"):
        module_name = module_node.get("name")
        if module_name in ["EnablePreview", "Message", "Messaging", "SideviewUtils"]:
            module_node.getparent().remove(module_node)
            infos.append("the %s module is redundant in Canary so we removed it." % module_name)

        #migration scratch paper
        #search.timeRange.* is now shared.timeRange.* and in theory migratable.

    warnings = warnings + final_inspection(view_element, module_conf)

    return view_element, warnings, infos

def get_advanced_xml_modules_by_type(view_element, module_conf):
    """
    only to be called after replace_bad_modules has run on this view_element
    """
    splunk_modules = []
    canary_modules = []
    for module_node in view_element.iter("module"):
        module_name = module_node.get("name")
        canary_module = module_conf.get(module_name, False)
        if canary_module:
            canary_modules.append(module_name)
        else:
            splunk_modules.append(module_name)

    return canary_modules, splunk_modules

def get_static_file_path(app):
    """
    gets the absolute path to the app's appserver/static directory.
    """
    return os.path.join(bundle_paths.get_base_path(), app, "appserver", "static")

def get_pattern(app, pattern_name):
    """load the given pattern from the FS please, as an lxml node"""
    pattern_file_path = os.path.join(bundle_paths.get_base_path(), app, "appserver", "patterns", pattern_name+".xml")
    with open(pattern_file_path, "r+") as file_handle:
        xml_str = "".join(file_handle.readlines())
        parser = et.XMLParser(remove_blank_text=True, strip_cdata=False)
        try:
            return et.XML(xml_str, parser)
        except Exception:
            logger.error("unexpected exception parsing XML for pattern %s in app %s.", pattern_name, app)
            logger.error(traceback.format_exc())
            logger.error(xml_str)
            raise


def replace_pattern(pattern_node, expanded_pattern_node):
    """take the given pattern tag, and replace it with the expanded pattern definition. The tricky part is respecting insertionPoints."""
    if pattern_node.get("skipNextModule", False):
        next_module = pattern_node.getnext()
        if next_module is not None:
            pattern_node.getparent().remove(next_module)

    insertion_point = expanded_pattern_node.findall(".//insertionPoint")
    if insertion_point:
        # explicit raise so that we can verify it in unit testing. for some reason assert()... gets nerfed?
        if len(insertion_point) > 1:
            raise AssertionError()

        insertion_point = insertion_point[0]

        # copy anything nested in the pattern_tag, into where the insertionPoint tag is
        for direct_child in pattern_node:
            insertion_point.addprevious(direct_child)

        insertion_point.getparent().remove(insertion_point)
    else:
        # explicit raise so that we can verify it in unit testing. for some reason assert()... gets nerfed?.
        if len(pattern_node.findall(".//module")) + len(pattern_node.findall(".//pattern")) > 0:
            raise AssertionError("View Configuration Error - This pattern tag has nested modules but the patter itself specifies no <insertionPoint/> node.")
    pattern_node.addnext(expanded_pattern_node)
    pattern_node.getparent().remove(pattern_node)


def replace_patterns(app, view_element):
    """finds any patterns in this view and expands them all"""
    for pattern_node in view_element.iter("pattern"):
        name = pattern_node.get("name")
        expanded_pattern_node = get_pattern(app, name)
        replace_pattern(pattern_node, expanded_pattern_node)
    return view_element

def remove_any_duplicated_patterned_modules(view_element):
    """oh hai"""
    for pattern_node in view_element.iter("pattern"):
        if pattern_node.get("skipNextModule", False):
            del pattern_node.attrib["skipNextModule"]
            next_module = pattern_node.getnext()
            if next_module:
                pattern_node.getparent().remove(next_module)
    return view_element


def get_view_element(request):
    """get the view node of the given view in the given app """
    if request.action == "create" and request.view == "_new":
        xml_str = BLANK_VIEW_XML
        assert(xml_str)
    else :
        uri = "/servicesNS/%s/%s/data/ui/views/%s" % (request.user_name, request.app, request.view)
        content = get_single_rest_api_entry(uri, session_key=request.session_key)
        xml_str = content[EAI_DATA_KEY]
        assert(xml_str)
    try:
        return parse_view_element(xml_str)
    except Exception:
        logger.error("unexpected exception parsing XML for view %s in app %s.", request.view, request.app)
        logger.error(traceback.format_exc())
        logger.error(content[EAI_DATA_KEY])
        raise

def parse_view_element(xml_str):
    parser = et.XMLParser(remove_blank_text=True, strip_cdata=False)
    xml_str_unclean = xml_str

    ## old versions of our apps, notably cisco_cdr used to put an encoding
    ## attribute. In hindsight this was pretty dumb of us, and it makes
    ## lxml in python3 pretty unhappy. Here we strip this out if it's here.

    xml_str = re.sub(r'<\?xml version="\d\.\d"\s+encoding="[^"]+"\s?\?>', '<?xml version="1.0" ?>', xml_str_unclean)
    if xml_str_unclean != xml_str:
        logger.debug("We found an encoding attribute in the root node of an XML view and we removed it at runtime.")


    return et.XML(xml_str, parser)


def make_view_dict(view_element, app, module_conf, replace_all_patterns=True):
    """get the canary dict representing the given view in the given app."""

    view_type = get_view_type(view_element, module_conf)
    if view_type in ["Advanced XML", "Sideview XML"]:
        if replace_all_patterns:
            view_element = replace_patterns(app, view_element)
        else:
            view_element = remove_any_duplicated_patterned_modules(view_element)

        # TODO - need to pass these warnings+infos back to the UI, or somewhere.
        view_element, _warnings, _infos = replace_bad_modules(view_element, module_conf, app)

        view_dict = convert_xml_to_canary_dict(view_element, module_conf)
    elif view_type in ["Canary yaml"]:
        view_dict = convert_yaml_to_canary_dict(view_element.text, {})
    else:
        raise LookupError(view_type)
    return view_dict

def add_ids_to_all_modules(view_element):
    """ walks the tree and adds a 'moduleId' attribute to all  modules.
    and adds 'patternId' attribute to all patterns.

    It does this simply by counting how many of each class it sees, such that
    the first "Search" module gets "Search_0", the second gets "Search_1" etc.
    """
    for type in ["module", "pattern"]:
        counter_map = {}
        for module_node in view_element.iter(type):
            name = module_node.get("name")
            if name not in counter_map:
                counter_map[name] = 0
            module_node.set("%sId" % type, "%s_%s" % (name, counter_map[name]))
            counter_map[name] += 1


def remove_ids_from_all_modules(view_element):
    for module_node in view_element.iter("module"):
        module_node.attrib.pop("moduleId")

def add_parent_ids(modules, module_conf):
    """
    By default in the Canary yaml or more generally canary lists-of-dicts,
    A given module is assumed to be "downstream" aka the "child" of the
    module before it in the list.
    This applies unless a given module has an explicit "parent" attribute
    in which case the view must also have somewhere a module with an "id"
    attribute of the same value.

    This function goes through all the modules and adds the explicit parent
    values to all modules.
    """
    valid_parent = {}
    for mod in modules:
        if mod.get("pattern"):
            continue
        module_name = mod["module"]
        if valid_parent and not "parent" in mod:
            mod["parent"] = valid_parent["moduleId"]

        if module_allows_downstream_modules(module_conf, module_name):
            valid_parent = mod

def add_default_param_values(modules, module_conf):
    """
    For many modules there are params that are not required, where if omitted
    they will assume some default value.  This function explicitly adds those
    default values to modules, (which is a list of dicts).
    """
    for mod in modules:
        if mod.get("pattern"):
            continue
        module_name = mod.get("module")
        for param in module_conf[module_name]["params"]:
            param_dict = module_conf[module_name]["params"][param]
            if param not in mod:
                default_value = param_dict.get("default", False)
                if default_value:
                    mod[param] = default_value


def get_module_id(mod):
    """returns the id of the given module."""
    if mod is None:
        return False
    if mod.tag == "view":
        return "top"
    return mod.attrib["moduleId"]

def get_rest_api_response(uri, session_key):
    """ simple wrapper around simpleRequest to return just the json response """
    getargs = {"output_mode":"json"}
    _response, content = rest.simpleRequest(uri, sessionKey=session_key, method="GET",
                                            raiseAllErrors=True, getargs=getargs)
    return json.loads(content)

def get_single_rest_api_entry(uri, session_key):
    """ simplified way to just get the contents of the first stanza, parsed as json.
        95% of the time this is all we want."""

    content = get_rest_api_response(uri, session_key)
    return content["entry"][0]["content"]


def get_app_labels(session_key):
    """return a dict mapping the app id's to the human-readable labels for those apps """
    uri = "/services/apps/local"
    content = get_rest_api_response(uri, session_key)
    app_labels = {}
    for app in content.get("entry", []):
        app_id = app["name"]
        app_labels[app_id] = app["content"].get("label", app_id)
    return app_labels


def memoize_non_empty_values(func):
    """these two memoize decorators are a little silly and strangely simple
    and each only used by ONE FUNCTION.   but.. they work."""
    cache = dict()

    def memoized_func(*args):
        if args in cache:
            return cache[args]
        result = func(*args)
        if result:
            cache[args] = result
        return result

    return memoized_func

def memoize_non_empty_values_by_app(func):
    """these two memoize decorators are a little silly and strangely simple
    and each only used by ONE FUNCTION.   but.. they work."""
    cache = dict()
    def memoized_func(session_key, app):
        if app in cache:
            return cache[app]
        result = func(session_key, app)
        if result:
            cache[app] = result
        return result

    return memoized_func

def get_config(session_key, app):
    """
    get the few keys that we send down with the page itself.
    """
    conf = {}
    conf.update(get_splunk_server_config(session_key))
    conf.update(get_app_config(session_key, app))
    return conf

@memoize_non_empty_values
def get_splunk_server_config(session_key):
    """ returns splunk version, build number, httpport and root_endpoint in a simple dict"""
    server_uri = "/server/info/server-info"
    server_entry = get_single_rest_api_entry(server_uri, session_key)

    web_conf_uri = "/services/configs/conf-web/settings"
    web_conf_entry = get_single_rest_api_entry(web_conf_uri, session_key)


    return {
        "SPLUNK_VERSION": server_entry.get("version", "0"),
        "SPLUNK_BUILD_NUMBER": server_entry.get("build","0"),
        # these ones... really do have to exist. If somehow they're not there
        # then throwing KeyError is perfectly fine.
        "SPLUNKWEB_PORT_NUMBER": web_conf_entry.get("httpport"),
        "ROOT_ENDPOINT": web_conf_entry.get("root_endpoint")
    }

@memoize_non_empty_values_by_app
def get_app_config(session_key, app):
    """ returns the app.conf version and build number as a simple dict"""
    uri = "/services/apps/local/%s" % app
    entry = get_single_rest_api_entry(uri, session_key)
    return {
        "APP_VERSION": entry.get("version","0"),
        "APP_BUILD_NUMBER": entry.get("build","0")
    }

def get_user_full_name(request):
    """ Job #1 is to not mess with Bjorn if he gives his actual name."""
    uri = "/services/authentication/current-context"
    entry = get_single_rest_api_entry(uri, request.session_key)
    name = entry.get("realname", request.user_name)

    shenanigans = {
        "Bjorn": "BjøΩöôoRN",
        "Bjoern": "Bj&ouml;rn",
        "BOOOOYYYYNNNN": "Björn",
        "Bj?rn": "BjOoöoøoõoΩoōoőoôoóoOOORN",
        "David Carasso": "David's the best",
        "Amrit Bath": "Fish",
        "Nick Mealy": "Fernaz Froufrou Fooferalla Bananapants"
    }
    for key in shenanigans:
        if name.startswith(key):
            name = name.replace(key, shenanigans[key])
    return name





def replace_tokens(s, qs_dict):
    """this is a straight port from replaceTokensFromContext() in JS.
    We use it here so that if a $foo$ token is present in the URL, we will load
    it initially with the value we see there.  Then later at runtime it may be
    replaced again, usually by URLLoader.  But this prevents the HTML from
    flashing the unreplaced "$foo$" briefly.
    And if there is no matching foo in the args this function will simply
    replace them with ""."""
    within = False
    token_name = []
    token_value = ""
    out = []
    for i, char in enumerate(s):
        if char == "$":
            within = not within
            # check for '$$' to handle all those cases correctly.
            if not within and i > 0 and s[i-1] == "$":
                out.append("$")
                continue
            # we just finished the token.
            if not within:
                token_value = qs_dict.get("".join(token_name), "")

                # only do the replacement for simple alphanumeric string values
                # or lists of simple alphanumeric string values.
                if isinstance(token_value, list):
                    if ("".join(token_value)).isalnum():
                        out.append(",".join(token_value))
                elif str(token_value).isalnum():
                    out.append(token_value)

                token_name = []
        elif within:
            token_name.append(char)
        else:
            out.append(char)
    return "".join(out)

def _(value):
    """
    It is unclear whether we're ever going to do localization, but stubbing it
    out for now.
    """
    if not value:
        return ""
    return value



def get_static_url_prefix(session_key, app, locale, root_endpoint=""):
    """ build the working URL that will be sent to the browser, for it to request
    a static asset in the given app"""
    app_config = get_app_config(session_key, app)
    if root_endpoint == "/":
        root_endpoint = ""
    if not locale:
        locale = "en-US"
    locale = "/" + locale
    prefix = "%s%s/static/@%s.%s/app/%s/" % (root_endpoint, locale, app_config["APP_VERSION"], app_config["APP_BUILD_NUMBER"], app)
    return prefix

def get_default_view_for_app(app, user_name, session_key):
    """
    Tries to find the view that's marked in the default.xml nav file as the
    default, or failing that any view called 'home'"""

    uri = "/servicesNS/%s/%s/data/ui/nav/default" % (user_name, app)
    try:
        entry = get_single_rest_api_entry(uri, session_key)
    except splunk.ResourceNotFound as e:
        return False

    nav_xml_str = entry[EAI_DATA_KEY]

    parser = et.XMLParser(remove_blank_text=True, strip_cdata=False)
    nav = et.XML(nav_xml_str, parser)
    default_view = nav.xpath("//view[@default='true']")
    if not default_view:
        if nav.xpath("//view[@name='home']"):
            #logger.error(nav_xml_str)
            return "home"
    return default_view[0].get("name")












def redirect(request, view_type=None):
    """ the caller decided we weren't in a good place so we're returning a
    301 response for them.
    CURRENTLY - either the request didn't specify an explicit view.
    OR the request was to the "search" view which is a contract Canary can't
    fulfill yet.
    """

    # TODO - ick.
    if request.app == "canary" and request.view == "shunt":
        request.view = "home"

    location = request.get_redirect_location(view_type)
    logger.info("redirecting to %s" % location)
    return build_response(301, "Redirecting to %s" % location, location=location)


def mako_template_exists(template_path):
    try:
        template = MAKO_TEMPLATE_LOOKUP.get_template(template_path)
    except TypeError:
        return False
    return True

def render_mako(template_path, template_dict):
    """
    wrapper to call render on the given mako template.
    """
    template_dict["replace_tokens"] = replace_tokens

    #TODO - please kill this and make it never come back again. kthx.
    template_dict["_"] = _

    template = MAKO_TEMPLATE_LOOKUP.get_template(template_path)
    return template.render(**template_dict)


def build_mako_response(template, template_dict):
    """ all mako templates are assumed to return HTML, and all calls to this function
    are assumed to be status-200 unless the mako template throws an exception, in which case it
    will return status=500 along with the stack trace rendered as HTML"""
    try:
        html = render_mako(template, template_dict)
        status = 200
    except Exception as e:
        logger.error(e)
        logger.error(traceback.format_exc())
        html = exceptions.html_error_template().render()
        status = 500
    return build_response(status, html, "text/html")



def is_view_editable(request):
    if request.action == "create" and request.view == "_new":
        return True
    if request.app in ["sideview_utils", "canary"]:
        return request.view.startswith("example_") or request.view.startswith("test_") or request.view.startswith("dev_")
    else:
        return request.app not in UNEDITABLE_VIEWS or request.view not in UNEDITABLE_VIEWS[request.app]

def build_uneditable_view_response(request):
    message = """This view has been mysteriously marked as uneditable.
    Or maybe it wasn't mysterious.  Honestly we can't tell. But you can't edit it."""
    if request.app in ["sideview_utils", "canary"]:
        message = """We cannot let you use the Editor to edit
            pieces of core Sideview apps themselves because that would be too silly.
            You may however edit any view in those apps whose name begins with the prefixes
             'example_', 'test_' or 'dev_'."""
    payload = json.dumps({"success:":False, "message": message})
    response = build_response(405, payload, "application/json")
    #logger.info(response)

    return response



def build_response(status, payload=None, content_type=None, location=None):
    """ core  method to return things to the client. """
    response_dict = {}
    response_dict["status"] = status

    if payload:
        response_dict["payload"] = payload

    # pro-tip - setting a "Content-Length" header works fine on mgmt port and blows up on the
    # web port proxy somehow.
    headers = {}
    if content_type:
        headers["Content-Type"] = content_type
        #if content_type == "application/json":
        #    logger.error("json response is \n" + json.dumps(response_dict, indent=4, sort_keys=True))

    if location:
        headers["Location"] = location

    if headers:
        response_dict["headers"] = headers
    return response_dict



class UnsortableList(list):
    """
    this is used here to avoid the yaml having keys in purely alphabetical
    order.  As a small improvement to readability, by convention for instance
    the "module" key is always listed first.
    Specifically, this code will always print them in the order they were
    added to the dict, and then the code itself is responsible for always
    adding them in whatever 'sensible' order was determined.
    """
    def sort(self, *args, **kwargs):
        pass

class UnsortableOrderedDict(OrderedDict):
    """
    oh hai
    """
    def items(self, *args, **kwargs):
        return UnsortableList(OrderedDict.items(self, *args, **kwargs))

def ordered_load(stream, Loader=yaml.SafeLoader, object_pairs_hook=OrderedDict):
    """This allows us to preserve the order of the keys on load"""
    class OrderedLoader(Loader):
        pass
    def construct_mapping(loader, node):
        loader.flatten_mapping(node)
        return object_pairs_hook(loader.construct_pairs(node))
    OrderedLoader.add_constructor(
        yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
        construct_mapping)
    return yaml.load(stream, OrderedLoader)

def ordered_dump(data, stream=None, Dumper=yaml.Dumper, **kwds):
    """ allows us to preserve the order of the keys when serialized"""
    class OrderedDumper(Dumper):
        pass
    def _dict_representer(dumper, data):
        return dumper.represent_mapping(
            yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
            data.items())
    OrderedDumper.add_representer(OrderedDict, _dict_representer)
    return yaml.dump(data, stream, OrderedDumper, **kwds)

yaml.add_representer(UnsortableOrderedDict, yaml.representer.SafeRepresenter.represent_dict)

def module_children_should_be_hidden(module_conf, module_type):
    """is this a module that says all children should be hidden by default"""
    m = module_conf.get(module_type, {})
    params = m.get("params", {})
    return params.get("hideChildrenOnload", False)

def module_allows_downstream_modules(module_conf, module_type):
    """ is this a module that allows other modules to exist downstream"""
    m = module_conf.get(module_type, {})
    forbids = m.get("forbidsDownstreamModules", False)
    return not forbids

def all_prior_siblings_forbid_downstream_modules(module_conf, module_node):
    """ Picturing the final upstream-downstream hierarchy, ie the tree.
    the given module module_node may or may not have siblings, ie other
    children of module_node's parent.  This function returns true if all
    of the prior siblings have said that they forbid downstream modules.
    """
    parent_node = module_node.getparent()
    # why
    #if parent_node.tag == "view":
    #    return False

    direct_children = parent_node.findall("module")
    for i, direct_child in enumerate(direct_children):
        # we made it all the way to the given child.
        if direct_child.attrib["moduleId"] == module_node.attrib["moduleId"]:
            if i == 0:
                return False
            return True
        module_name = direct_child.attrib["name"]
        if module_allows_downstream_modules(module_conf, module_name):
            return False

    logger.error("Assertion failed - we walked through all the children of " + parent_node.attrib.get("moduleId", "(no module id)") + " without reaching its child " + module_node.attrib["moduleId"])
    raise Exception("Assertion failed - we walked through all the children of " + parent_node.attrib.get("moduleId", "(no module id)") + " without reaching its child " + module_node.attrib["moduleId"])


def get_fake_pattern_module(node):
    """ nothing to see here. """
    fake_module = {}
    fake_module["pattern"] = node.attrib["name"]
    if node.attrib.get("skipNextModule") == "True":
        fake_module["skipNextModule"] = True
    return [fake_module]



last_rendered_module = False

def flatten_module(module_node, parent_node, module_conf, hidden=False):
    """
    flattens the current module and all its downstream modules following
    the yaml format.

    TRUTHS.
    if module forbidsDownstreamModules,  then don't give it an ID
    When the view is next read, the code will assume it can't have downstream modules
    and will assign modules "after" it to the nearest ancestor that CAN have downstream modules.

    EXCEPT THAT THE NEXT module after,  specifies parent/id unnecessarily. so we need to poke a
    hole in the last_rendered_module != parent_node rule as we go, if all the direct_children so
    far through the loop, have forbidsDownstreamModules = True,
    then none of those direct_children, NOR the one after it, require parentModuleId to be set.
    the code will interpret the yaml correctly even without them.

    as soon as we hit a directChild X who allows downstream modules,  then we have to give the
    parent an ID and the NEXT module after X,  must have a parentModuleId set to the parent.
    """
    assert parent_node is not None
    assert module_node is not None

    global last_rendered_module
    module_type = module_node.attrib["name"]

    if not module_allows_downstream_modules(module_conf, module_type):
        nested_modules = module_node.findall("module")
        nested_module_classes = []
        for m in nested_modules:
            nested_module_classes.append(m.attrib["name"])
        module_id = module_node.attrib.get("moduleId")
        assertion_message = "There is a %s module (moduleId=%s) that has one or more downstream modules (%s), but this is not allowed." % (module_type, module_id, ",".join(nested_module_classes))
        assert not nested_modules, assertion_message

    modules = []
    mod = UnsortableOrderedDict()

    # everyone gets an id, and then we take away all that aren't used in any parent=foo atts.
    mod["module"] = module_type
    mod["moduleId"] = get_module_id(module_node)
    if hidden:
        mod["visible"] = False

    if "layoutPanel" in module_node.attrib:
        mod["layoutPanel"] = module_node.attrib["layoutPanel"]

    if "group" in module_node.attrib:
        mod["group"] = module_node.attrib["group"]


    if parent_node is not None and last_rendered_module != parent_node and not all_prior_siblings_forbid_downstream_modules(module_conf, module_node):
        mod["parent"] = get_module_id(parent_node)

    last_rendered_module = module_node
    for param in module_node.findall("param"):

        items = []
        for list_element in param.findall("list"):
            list_entry = {}
            for inner_param in list_element.findall("param"):
                list_entry[inner_param.attrib.get("name")] = inner_param.text
            items.append(list_entry)
        if items:
            param_value = items

        elif is_big_param(module_type, param.attrib["name"] and param.text):
            param_value = param.text.lstrip().rstrip()
        else:
            param_value = param.text
        mod[param.attrib["name"]] = param_value

    modules.append(mod)

    for direct_child in module_node:
        if direct_child.tag == "pattern":
            modules = modules + get_fake_pattern_module(direct_child)
        if direct_child.tag == "module":
            if module_allows_downstream_modules(module_conf, module_type):
                effective_parent = module_node
            else:
                effective_parent = parent_node

            # the second we hit this flag, all children in the rest of the
            # recursive calls are to be hidden.
            if module_children_should_be_hidden(module_conf, module_type):
                hidden = True

            modules = modules + flatten_module(direct_child, effective_parent, module_conf, hidden)
    return modules


def remove_unused_ids(modules):
    """
    for all modules, remove any "moduleId" entries where the value is
    not also present in an explicit "parent" entry.
    """
    specified_parents = {}
    for mod in modules:
        if "parent" in mod:
            specified_parents[mod["parent"]] = 1
    for mod in modules:
        if "moduleId" in mod and mod["moduleId"] not in specified_parents:
            del mod["moduleId"]

def remove_repeated_layout_panels(modules):
    """
    layoutPanels can be specified redundantly if
    1) the same value is already specified as the layoutPanel of the nearest ancestor
    2) the same value is specified by a prior sibling.
    Currently this function only implements #1.

    """
    which_panel = {}
    parent_hash = {}
    for mod in modules:
        if "moduleId" not in mod:
            continue
        module_id = mod.get("moduleId")
        if "layoutPanel" in mod:
            which_panel[module_id] = mod["layoutPanel"]
        parent_hash[module_id] = mod

    for mod in modules:
        explicit_layout_panel = mod.get("layoutPanel", False)
        if explicit_layout_panel:

            # ----- could be pulled up
            relevant_module_node = mod
            relevant_ancestor_layout_panel = False
            while True:
                ancestor_id = relevant_module_node.get("parent", False)
                if not ancestor_id or ancestor_id == "top":
                    break
                if ancestor_id in which_panel:
                    relevant_ancestor_layout_panel = which_panel.get(ancestor_id)
                    break
                relevant_module_node = parent_hash[ancestor_id]
            # ----- end

            if relevant_ancestor_layout_panel:
                if explicit_layout_panel == relevant_ancestor_layout_panel:
                    #print("%s getting its layoutPanel deleted cause its the same as the next ancestor" % mod.get("moduleId"))
                    del mod["layoutPanel"]
                continue


def remove_redundant_parent_attributes(modules, module_conf):
    """ a bit odd - in almost all cases this will remove the parent="top"
    attribute from only the first module"""

    for mod in modules:
        #since we start from the top, all parent="top" are dumb.
        if "parent" in mod and mod["parent"] == "top":
            del mod["parent"]

        if mod.get("pattern"):
            continue
        module_type = mod["module"]
        #however the MOMENT we hit a module that DOESNT forbid downstream modules, then
        # any further parent="top" attributes are actually meaningful.
        if module_allows_downstream_modules(module_conf, module_type):
            return




def fill_in_inherited_layout_panels(modules):
    """
    a sort of inverse of remove_repeated_layout_panels, this will give every
    module an explicit value for layoutPanel.
    """


    # there's a convention allowing them to be omitted .
    # If you read the yaml top to bottom, each module will pick up the last
    # one seen in the file.
    # and if a top level module has none specified we assume 'viewHeader'

    last_layout_panel = DEFAULT_LAYOUT_PANEL
    # however whenever there's a 'parent' attribute, we have to set
    # last_layout_panel to the last_layout_panel that was in effect AT THE PARENT
    # MODULE, so this is how we remember which modules had which.
    which_panel = {}
    panels_used = {}

    for mod in modules:
        if mod.get("pattern"):
            continue
        parent_id = mod.get("parent", False)
        explicit_panel = mod.get("layoutPanel", False)
        module_id = mod.get("moduleId")


        if explicit_panel:
            panel_to_use = explicit_panel
            #logger.error("%s has explicit panel of %s ", module_id, explicit_panel)
            which_panel[module_id] = explicit_panel

        elif parent_id and parent_id == "top":
            panel_to_use = DEFAULT_LAYOUT_PANEL
        elif parent_id and parent_id != "top":
            panel_to_use = which_panel.get(parent_id, DEFAULT_LAYOUT_PANEL)
            #logger.error("%s had no explicit layoutPanel but did have a parent attribute of %s which had last known layoutPanel of %s ", module_id, parent_id, last_layout_panel)
        elif last_layout_panel:
            panel_to_use = last_layout_panel


        #logger.error("assigning %s a layout panel of %s", module_id, last_layout_panel)
        mod["layoutPanel"] = panel_to_use
        which_panel[module_id] = panel_to_use
        panels_used[panel_to_use] = 1


    # The list of the panels that actually had modules in them.
    return list(panels_used.keys())



def add_dynamic_params(view_dict, app):
    """
    get the params that actually require information beyond the view
    config and module config
    NOTE - currently it's ONLY the "src" param on the HTML module.
    """
    for mod in view_dict["modules"]:
        if mod.get("module", None) == "HTML":
            src = mod.get("src", None)
            if src:
                src_segments = re.split(ALL_SLASHES_RE, src)
                full_path = os.path.join(get_static_file_path(app), *src_segments)
                with open(full_path, "r+") as file_handle:
                    content = "".join(file_handle.readlines())
                    mod["html"] = content

def get_list_param(list_nodes):
    param_list = []
    for list_node in list_nodes:
        param_dict = {}
        for nested_param in list_node.findall("param"):
            param_dict[nested_param.get("name")] = nested_param.text
        param_list.append(param_dict)
    return param_list

def get_module_nodes_params_as_dict(module):
    params = {}
    for param in module.findall("param"):
        name = param.attrib.get("name")
        list_nodes = param.findall("list")
        if len(list_nodes) > 0:
            params[name] = get_list_param(list_nodes)
        else:
            params[name] = param.text
    return params

def get_module_attribute(module, name):
    if module is None:
        #logger.error(view_element.toprettyxml())
        raise KeyError("no module passed to get_module_attribute")
    value = module.attrib.get(name, None)
    inherited_value = None

    module_copy =  module
    while module_copy.getparent().getparent() and module_copy.getparent().attrib and not inherited_value:
        module_copy = module_copy.getparent()
        inherited_value = module_copy.attrib.get(name, None)
    if not inherited_value:
        inherited_value = ""
    if not value:
        value = inherited_value
    return value, inherited_value


def get_module_params(module_conf, module_name):
    """DRY"""
    return module_conf.get(module_name, {}).get("params", {})

def get_hierarchy_errors(modules, module_conf):
    """return a list of places where modules have gotten to somewhere they're
       not supposed to be."""
    fails = []

    modules_that_are_parents = []
    for mod in modules:
        parent = mod.get("parent", False)
        if parent and parent != "top":
            modules_that_are_parents.append(parent)

    for mod in modules:
        if mod.get("pattern"):
            continue

        module_name = mod["module"]
        # This function is forgiving of modules that are totally undefined.
        # (That's someone else's problem)
        module_params = get_module_params(module_conf, module_name)

        # Step 1 - check for required params
        #TODO - this could be optimized but first check how much time its actually taking.
        for param_name, param_value in module_params.items():

            if not param_value:
                continue

            if param_name == "forbidsDownstreamModules" and module_name in modules_that_are_parents:
                fails.append("%s does not allow downstream modules yet it has one in this view" % module_name)
            if param_name == "forbidsUpstreamModules" and mod.get("parent", "top") != "top":
                fails.append("%s does not allow upstrea modules yet it has one in this view" % module_name)
            if param_name == "requiresDownstreamModules" and not module_name not in modules_that_are_parents:
                fails.append("%s requires at least one downstream module to be valid, but it does not have one in this view" % module_name)
            if param_name == "requiresUpstreamModules" and not mod.get("parent", "top") == "top":
                fails.append("%s requires at least one upstream module to be valid, but it does not have one in this view" % module_name)
    return fails

def get_missing_param_errors(modules, module_conf):
    """ return a list of error messages about params that are missing"""
    fails = []

    for mod in modules:
        if mod.get("pattern"):
            continue
        module_name = mod["module"]
        # This function is forgiving of modules that are totally undefined.
        # (That's someone else's problem)
        module_params = get_module_params(module_conf, module_name)

        required_params = []
        for param_name, param_dict in module_params.items():
            if param_dict.get("required", "False") == "True":
                required_params.append(param_name)
        for required_param in required_params:
            if required_param not in mod:
                fails.append("error - %s module is missing a value for the required param '%s'."
                             % (module_name, required_param))
    return fails

def get_validation_errors(view_dict, module_conf):
    """get an overall list of all validation errors about the given view """
    modules = view_dict["modules"]
    fails = get_hierarchy_errors(modules, module_conf)
    fails += get_missing_param_errors(modules, module_conf)

    for mod in modules:
        if mod.get("pattern"):
            continue
        module_name = mod.get("module")

        # Step 1 - check for modules that are... just bad or unmigratable.
        if module_name not in module_conf:
            if module_name in DEAD_SIDEVIEW_UTILS_MODULES:
                fails.append("%s is a old Sideview module that never saw the light of day" % module_name)
            elif module_name in LEGACY_SPLUNK_MODULES:
                fails.append("%s is a legacy splunk module" % module_name)
            else:
                fails.append("%s is some kind of third-party module (ie not made by Sideview or Splunk)" % module_name)
            continue

        module_params = get_module_params(module_conf, module_name)

        wildcard_params = []
        for param_name in module_params:
            if param_name.endswith("*"):
                wildcard_params.append(param_name[:-1])

        for param_name in mod:
            if param_name in ["layoutPanel", "moduleId", "module", "parent", "group"]:
                continue

            # Step 2 - check for params that are just invalid.
            if param_name not in module_params:
                is_wildcard = False
                for wildcard_param in wildcard_params:
                    if param_name.startswith(wildcard_param):
                        is_wildcard = True
                if not is_wildcard and param_name != "visible":
                    fails.append("%s module does not have a param called '%s'." % (module_name, param_name))

            # step 3 - ok the param is valid but check the values
            else:
                values = module_params[param_name].get("values")
                param_value = mod[param_name]
                if values:
                    if param_value.startswith("$") and param_value.endswith("$"):
                        pass
                    elif param_value not in values:
                        fails.append("%s module does not allow '%s' as a value for the '%s' param."
                                     % (module_name, param_value, param_name))

    return fails


def get_view_type(view_element, module_conf):
    """ inspects the content of the given XML to determine what kind of view this is"""
    view_type = False

    if view_element.tag == "dashboard":
        view_type = "Simple XML (dashboard)"
    elif view_element.tag == "form":
        view_type = "Simple XML (form)"
    elif view_element.tag == "view":
        module_tags = view_element.findall("module")

        template_attribute = view_element.get("template", "")
        type_attribute = view_element.get("type", "")

        if not module_tags and template_attribute.endswith(".html"):
            view_type = "HTML dashboard"
        elif type_attribute == "redirect":
            view_type = "Splunk redirect view"
        elif module_tags:
            canary_modules, splunk_modules = get_advanced_xml_modules_by_type(view_element, module_conf)

            if splunk_modules and not canary_modules:
                view_type = "Advanced XML"

            cloned_view = et.fromstring(et.tostring(view_element))
            modified_clone, warnings, infos = replace_bad_modules(cloned_view, module_conf)

            if not view_type:
                canary_modules, splunk_modules = get_advanced_xml_modules_by_type(modified_clone, module_conf)
                if canary_modules:
                    view_type = "Sideview XML"
                else:
                    view_type = "Unable to determine view type"
        else:
            try:
                yaml.safe_load(view_element.text)
                view_type = "Canary yaml"
            except AttributeError:
                pass
    return view_type

def get_spacetree_json(request, module_conf):

    stJSON = {}
    stJSON["id"] = request.view
    stJSON["name"] = request.view
    stJSON["data"] = {"type": "view"}

    view_element = get_view_element(request)

    view_element, _warnings, _infos = replace_bad_modules(view_element, module_conf, request.app)

    add_ids_to_all_modules(view_element)
    convert_to_spacetree_json(stJSON, view_element)
    return json.dumps(stJSON)

def convert_to_spacetree_json(json_node, xml_node):
    json_node["children"] = []

    for child in xml_node:
        if child.tag == "pattern":
            json_child = {
                "id": child.attrib.get("patternId"),
                "name": child.attrib.get("name"),
                "data": {"type": "pattern"}
            }
        elif child.tag == "module":

            json_child = {
                "id": child.attrib.get("moduleId"),
                "name": child.attrib.get("name"),
                "data": {}
            }
            for param in child:
                if param.tag != "param":
                    continue
                param_name = param.attrib.get("name")
                json_child["data"][param_name] = param.text
        else :
            continue
        json_node["children"].append(json_child)
        convert_to_spacetree_json(json_child, child)

def convert_yaml_to_canary_dict(yaml_str, patterns):
    """ more or less just defers to load, except it has to do some magic
        with patterns """
    canary_dict = UnsortableOrderedDict()
    canary_dict = yaml.safe_load(yaml_str)
    modules = canary_dict["modules"]

    found_one = False
    for i, mod in enumerate(modules):
        pattern_name = mod.get("pattern", False)
        if not pattern_name:
            continue
        if pattern_name and not pattern_name in patterns:
            raise KeyError("pattern %s not found in currently loaded patterns" % pattern_name)
        found_one = True
        p_modules = patterns[pattern_name]["pattern"]
        #print(yaml.dump(p_modules, default_flow_style=False))
        modules[i:i+1] = p_modules

    if found_one:
        canary_dict["modules"] = modules

    return canary_dict

def convert_canary_dict_to_yaml(view_dict):
    """ dump out the view object as yaml"""

    #for thing in view_dict["modules"]:
    #    if thing["module"].get("pattern", False):
    #       thing["pattern"] = thing["module"].replace("pattern:", "")
    #        del thing["module"]


    return yaml.dump(view_dict, default_flow_style=False)

def convert_xml_to_canary_dict(view_element, module_conf):
    """
    Given an Elementtree node representing a Sideview XML view,
    return a minimal flat representation in the "canary" format.
    eg: instead of parent-child relationships being encoded by element
    nesting, they are usually inferred, with each module N in
    the by default assumed to be the "child" of module N-1
    """
    add_ids_to_all_modules(view_element)



    modules = []
    for child in view_element:

        if child.tag == "module":
            modules = modules + flatten_module(child, view_element, module_conf)
        elif child.tag == "pattern":
            modules = modules + get_fake_pattern_module(child)
    #logger.error(json.dumps(modules, indent=4))

    remove_repeated_layout_panels(modules)



    remove_redundant_parent_attributes(modules, module_conf)

    canary_dict = UnsortableOrderedDict()
    label_element = view_element.find("./label")
    if label_element is not None and label_element.text:
        canary_dict["viewLabel"] = label_element.text
    else:
        canary_dict["viewLabel"] = "(no label defined)"

    stylesheet = view_element.attrib.get("stylesheet")
    if stylesheet:
        canary_dict["customCSS"] = stylesheet

    custom_js = view_element.attrib.get("customJS")
    if custom_js:
        canary_dict["customJS"] = custom_js
    canary_dict["modules"] = modules

    #yaml_output = yaml.dump(canary_dict, default_flow_style=False)
    #logger.error("yaml_output is \n%s", yaml_output)

    return canary_dict



def to_app_path(file_path):
    """
    given a base file path like:
    p = "C:\\Program Files\\Splunk\\etc\\apps\\canary\\appserver\\modules\\HTML\\HTML.html
    it returns a weird relative path like
    "/modules/SomeModule/SomeModule.html"

    IT SEEMS LIKE THIS IS ONLY USED FOR HTML FILES.
    """

    if file_path.find(BASE_DIR) == 0:
        file_path = file_path.replace(BASE_DIR + os.path.sep, "")
        segments = file_path.split(os.path.sep)

        return "/" + "/".join(segments[4:])

    # I'm really not sure what this is, or if it's ever hit
    return "=" + file_path


def get_application_js(app):
    """ get the application.js file for this app if it exists"""
    if os.path.exists(os.path.join(get_static_file_path(app), "application.js")):
        file_path = "".join(("/static/app/", app, "/application.js"))
        return [file_path]
    return []

def get_application_css(app):
    """ get the application.css file for this app if it exists"""

    if os.path.exists(os.path.join(get_static_file_path(app), "application.css")):
        return ["application.css"]
    return []

def get_custom_js_for_view(view_dict):
    """ get any custom css file for this app if it exists"""
    filename = view_dict.get("customJS", False)

    if filename:
        return [filename.strip()]
    return []

def get_custom_css_for_view(view_dict):
    """ get any custom css file for this app if it exists"""
    file_names = view_dict.get("customCSS", False)
    ret = []
    if not file_names:
        return ret
    for name in file_names.split(","):
        ret.append(name.strip())
    return ret

def get_files_for_view(modules, module_conf):
    """
    This gets lists of html, css and js files needed to render this particular view.
    It also returns the list of class names as a convenience.
    """
    module_html = {}
    module_css = []
    module_js = []
    class_names = []

    for mod in modules:
        if mod.get("pattern"):
            continue
        module_name = mod.get("module")


        files = module_conf.get(module_name, {})

        if "html" in files and module_name != "SideviewUtils":
            module_html[module_name] = to_app_path(files["html"])
        if "css" in files and not files["css"] in module_css:
            module_css.append(files["css"])
        if "js" in files and not files["js"] in module_js:
            module_js.append(files["js"])
            class_names.append(module_name)
    return module_html, module_css, module_js, class_names

def get_unsupported_modules(modules, module_classes):
    """
    gets the modules that are for laying down and avoiding.
    """
    names = []
    for mod in modules:
        if mod.get("pattern"):
            continue
        module_type = mod.get("module")
        if module_type and module_type not in module_classes:
            names.append(module_type)
    return names


def validate_layout_panels(panels_used):
    """
    validates.
    """
    for panel_name in panels_used:
        if panel_name not in LEGAL_LAYOUT_PANELS:
            if not panel_name.startswith("panel_row"):
                raise Exception("layoutPanel \"" + panel_name + "\" is not a valid layoutPanel value")




def commit_changes_to_view(request, view_element):
    app = request.app
    view = request.view
    user_name = request.user_name
    session_key = request.session_key

    remove_ids_from_all_modules(view_element)

    prettyXML = et.tostring(view_element, pretty_print=True)

    prettyXML = patch_xml_for_readability(prettyXML)

    viewEntity = en.getEntity('data/ui/views', view, namespace=app, owner=user_name, sessionKey=session_key)

    #garbagePropertiesReturnedBySplunk6Beta = ["isDashboard","isVisible","label"]
    #for p in garbagePropertiesReturnedBySplunk6Beta:
    #    if (viewEntity.properties.get(p)):
    #        logger.warn("Sideview Editor - garbage property detected in the getEntity response (" + p + "). We are deleting it here or else it will correctly trigger an error from splunkd when we try to post the modified entity back via setEntity")
    #        del(viewEntity.properties[p])

    # in the create new cases, view will be "_new"
    if request.action == "create" and request.view == "_new":
        viewEntity.properties["name"] = request.post_dict["name"]

    viewEntity[en.EAI_DATA_KEY] = prettyXML

    try:
        en.setEntity(viewEntity, sessionKey=session_key)
        ## remnants of some 4.X logging insanity where I never got a handle on root cause.
        #logger.info("view updated by Canary Editor. view=%s user=%s %s", view, user_name, updateMetaData)

    except Exception as e:
        logger.error("exception trying to update view.  view=%s user=%s message=%s", view, user_name, str(e))
        #logger.error(traceback.print_exc())
        raise


def get_legal_values_for_module(module_class_name, module_conf):
    """ Vote for Pedro"""
    module_class = module_conf[module_class_name]
    values = {}
    params = module_class["params"]
    for param_name, param in params.items():
        newEntry = {}

        newEntry["required"] = param["required"]
        if "values" in param:
            newEntry["values"] = param["values"]
        values[param_name] = newEntry

    values["layoutPanel"] = {
        "required": False,
        "values": list(LEGAL_LAYOUT_PANELS)
    }
    return values

def static_file_exists(app, alleged_file_name):
    """ is there a file by the given name in /appserver/static of the given app. """
    possible_mixed_slashes = os.path.join(ETC_APPS_DIR, app, "appserver/static/")
    root_static_dir = os.path.abspath(possible_mixed_slashes)

    for name in os.listdir(root_static_dir):
        if name == alleged_file_name:
            return True
    return False

def get_view_attribute_error(attribute_name, legal_values, submitted_value, is_required):

    message = "ERROR - %s is not allowed as a value for %s. Set one of the allowed values - (%s)"
    if is_required:
        message += "."
    else:
        message += " or leave it blank."
    return message % (submitted_value, attribute_name, ", ".join(legal_values))


def set_params_for_module(module_element, module_params):

    for param in module_element.findall("param"):
        module_element.remove(param)

    module_class_name = module_element.get("name")

    for param_name in module_params:
        param_node = et.SubElement(module_element, "param")

        param_node.set("name", param_name)
        param_value = module_params.get(param_name)
        if is_list_param(module_class_name, param_name):
            set_list_param(param_node, param_value)

        elif is_big_param(module_class_name, param_name):
            param_node.text = et.CDATA(param_value)
        else :
            param_node.text = param_value




def is_big_param(module, param):
    """
    some module params, notably "html" in the HTML module and "search" in the
    Search module, are assumed to be generally very large, such that it is
    desirable to by default wrap the value in CDATA by default, even when this is
    not necessary.
    """
    for pair in BIG_PARAMS:
        if pair["module"] == module and pair["param"] == param:
            return True
    return False

def is_list_param(module_name, param):
    """
    Is the given param of the kind where it is a list of dictionaries and not
    a simple string value.
    """
    for param_dict in LIST_PARAMS:
        if param_dict["module"] == module_name and param_dict["param"] == param:
            return True
    return False

def set_list_param(param_node, json_str_value):
    json_value = json.loads(json_str_value)
    for item_dict in json_value:
        list_node = et.SubElement(param_node, "list")
        #enforce consistent order
        legal_names_in_order = ["name","value","label","selected"]
        for name in item_dict:
            if name not in legal_names_in_order:
                raise ValueError("%s seems to be an illegal nested param for a %s param", name, param_node.get("name"))

        for name in legal_names_in_order:
            if name not in item_dict:
                continue
            value = item_dict[name]
            inner_param_node = et.SubElement(list_node, "param")
            inner_param_node.set("name", name)
            inner_param_node.text = value
            list_node.append(inner_param_node)
        param_node.append(list_node)



VIEW_ATTRIBUTES = {
#    "displayView": "(optional) If this attribute is set, and searches and reports are saved in this view,  when those searches and reports are run later they will be loaded within the given view rather than this view.",
#    "refresh": "(optional) When set to an integer N, the view will automatically refresh every N seconds.",
#    "onunloadCancelJobs": "(optional) When set to True, the page will try to cancel any outstanding ad-hoc jobs that are running at the time. Note that jobs loaded from permalinks, jobs from scheduled saved searches, and jobs that the user might have redirected into new windows, are never cancelled by this functionality. ",
#    "autoCancelInterval": "(optional) If unset, defaults to 120.  value is given in seconds.  If a job is dispatched in this view and then the given number of seconds goes by with no requests to key endpoints such as /events, /results, /summary, /timeline or /touch,  the running job will be cancelled.",
    "template": "(optional) If unset, defaults to 'search.html'.  This determines the mako template for the page.  Be careful that the legal space of layoutPanel attributes is different for each template. For instance changing the template from dashboard.html to search.html will invalidate the view if there are any layoutPanels with the panel_rowN_colM syntax still in the view.",
#    "isSticky": "(optional) If set to True, then a small number of modules will attempt to remember the value set for each user and restore that value when the view is loaded.  Note that if you leave this set to True for a while and then you change it to False,  whatever value was last set at that time for each user will continue to prepopulate for that user.  To truly wipe the memory of this system you'll have to hunt down and delete many many viewstate stanzas. ",
    #"isPersistable": "(optional) If set to True, then when a search or report is saved, Splunk's legacy viewstate system will try to 'snapshot' certain context keys that are present at the point where the search is being saved.   If True those snapshotted keys will be preserved in a viewstate entity that is linked to the savedsearch entity",
    "isVisible": "(optional) defaults to True.  This determines whether the view is visible in the navigation. Note that if the user has correct permissions to view this view,  then they will always be able to go to it by typing the URL into their browser directly, regardless of the setting here. ",
    "stylesheet": "(optional) When set to a value like 'foo.css', the system will look for a CSS stylesheet by that name within /etc/apps/<appName>/appserver/static.  If the stylesheet is found, it will be included in the page.  Note that if the app also has an 'application.css' file in that same directory, BOTH CSS files will be included.."
}

UNEDITABLE_VIEWS = {
    "sideview_utils":["controls", "description", "home", "editor_intro", "licensing"],
    "cisco_cdr":["home", "browse", "call_detail", "devices", "extensions", "gateways", "sites", "911_calls", "general_report", "gateway_utilization", "busy_hour_calculator", "extension_detail", "device_detail", "gateway_detail", "site_detail", "update_license", "setup_data_inputs", "setup_clusters", "setup_sites", "setup_groups", "setup_clusters", "setup_groups"]
}

DEAD_SIDEVIEW_UTILS_MODULES = ["SankeyChart", "TreeMap", "NavBar"]

LEGACY_SPLUNK_MODULES = [
    "AccountBar",
    "AddTotals",
    "AdvancedModeToggle",
    "AjaxInclude",
    "AppBar",
    "AsciiTimeline",
    "AxisScaleFormatter",
    "BaseChartFormatter",
    "BaseReportBuilderField",
    "BreadCrumb",
    "ButtonSwitcher",
    "CakeBrushFormatter",
    "ChartTitleFormatter",
    "ChartTypeFormatter",
    "ConditionalSwitcher",
    "ConvertToDrilldownSearch",
    "ConvertToIntention",
    "ConvertToRedirect",
    "Count",
    "DashboardTitleBar",
    "DataOverlay",
    "DisableRequiredFieldsButton",
    "DispatchingModule",
    "DistributedSearchServerChooser",
    "EnablePreview",
    "EntityLinkLister",
    "EntityRadioLister",
    "EntitySelectLister",
    "EventsViewer",
    "Export",
    "ExtendedFieldSearch",
    "FancyChartTypeFormatter",
    "FieldPicker",
    "FieldSearch",
    "FieldViewer",
    "FlashChart",
    "FlashTimeline",
    "FlashWrapper",
    "GenericHeader",
    "Gimp",
    "HiddenChartFormatter",
    "HiddenFieldPicker",
    "HiddenIntention",
    "HiddenPostProcess",
    "HiddenSavedSearch",
    "HiddenSearch",
    "HiddenSoftWrap",
    "IFrameInclude",
    "IndexSizes",
    "JSChart",
    "JobManager",
    "JobProgressIndicator",
    "JobStatus",
    "LegendFormatter",
    "LineMarkerFormatter",
    "LinkList",
    "LinkSwitcher",
    "LiteBar",
    "ManagerBar",
    "MaxLines",
    "Message",
    "MultiFieldViewer",
    "MultiplexSparkline",
    "NotReporting",
    "NullModule",
    "NullValueFormatter",
    "Paginator",
    "PostProcessBar",
    "PostProcessFilter",
    "PulldownSwitcher",
    "RadioButtonSearch",
    "ReportBuilderSearchField",
    "ReportSubType",
    "ReportType",
    "ResultsActionButtons",
    "ResultsHeader",
    "RowNumbers",
    "SavedSearches",
    "SearchBar",
    "SearchLinkLister",
    "SearchMode",
    "SearchRadioLister",
    "SearchSelectLister",
    "SearchTextSetting",
    "Segmentation",
    "Selector",
    "ServerSideInclude",
    "ShowHideHeader",
    "ShowSource",
    "SimpleDrilldown",
    "SimpleEventsViewer",
    "SimpleResultsHeader",
    "SimpleResultsTable",
    "SingleFieldChooser",
    "SingleValue",
    "SoftWrap",
    "Sorter",
    "SplitByChooser",
    "SplitModeFormatter",
    "StackModeFormatter",
    "StatChooser",
    "StaticContentSample",
    "StaticRadio",
    "StaticSelect",
    "SubmitButton",
    "SuggestedFieldViewer",
    "TabSwitcher",
    "TextSetting",
    "TimeRangeBinning",
    "TimeRangePicker",
    "TitleBar",
    "ViewRedirector",
    "ViewRedirectorLink",
    "ViewstateAdapter",
    "XAxisTitleFormatter",
    "YAxisRangeMaximumFormatter",
    "YAxisRangeMinimumFormatter",
    "YAxisTitleFormatter"
]

BIG_PARAMS = [{
    "module": "HTML",
    "param":"html"
}, {
    "module": "Search",
    "param":"search"
}, {
    "module": "PostProcess",
    "param":"search"
}
             ]

LIST_PARAMS = [{
    "module": "Pulldown",
    "param": "staticOptions",
    "keys": ["value", "label", "selected"]
}, {
    "module": "Pulldown",
    "param": "staticFieldsToDisplay",
    "keys": ["value", "label", "selected"]
}, {
    "module": "CheckboxPulldown",
    "param": "staticOptions",
    "keys": ["value", "label", "selected"]
}, {
    "module": "Pulldown",
    "param": "searchFieldsToDisplay",
    "keys": ["value", "label"]
}, {
    "module": "Tabs",
    "param": "staticTabs",
    "keys": ["value", "label", "selected"]
}, {
    "module": "Radio",
    "param": "staticRadios",
    "keys": ["value", "label", "selected"]
}, {
    "module": "Checkboxes",
    "param": "staticCheckboxes",
    "keys": ["value", "label", "selected"]
}, {
    "module": "StaticRadio",
    "param": "staticFieldsToDisplay",
    "keys": ["value", "label", "checked"]
}]
