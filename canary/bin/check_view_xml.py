# -*- coding: utf-8 -*-
#Copyright (C) 2010-2019 Sideview LLC.  All Rights Reserved.
import traceback
import splunk.Intersplunk

import lxml.etree as et
import sideview_canary as sv
import module_loader

def main():
    """
    Example usage:
    | rest /servicesNS/-/-/data/ui/views
    | fields eai:acl.app title eai:acl.owner eai:data
    | rename eai:acl.app as app
    | checkxml
    | fields - eai:data
    | eval app_and_view=app + " " + title
    | stats values(app_and_view) count by warning
    | sort - count
    """
    # get the previous search results
    results, _unused, settings_dict = splunk.Intersplunk.getOrganizedResults()
    _keyword_list, options_dict = splunk.Intersplunk.getKeywordsAndOptions()
    merged = {}
    merged.update(settings_dict)
    merged.update(options_dict)

    session_key = merged.get("sessionKey", None)

    all_modules = module_loader.get_modules(session_key=session_key)

    parser = et.XMLParser(remove_blank_text=True, strip_cdata=False)

    for result in results:
        try:
            view_xml = et.XML(result.get("eai:data"), parser)
            view_type = sv.get_view_type(view_xml, all_modules)
            result["type"] = view_type
        except Exception as e:
            result["type"] = "malformed XML"
            result["exception"] = str(e)
            view_type = "Malformed XML"

        if view_type in ["Advanced XML", "Sideview XML", "Canary yaml"]:
            try:
                modified_view_element, warns, infos = sv.replace_bad_modules(view_xml, all_modules)
                view_dict = sv.convert_xml_to_canary_dict(modified_view_element, all_modules)
                errors = sv.get_validation_errors(view_dict, all_modules)
                
                result["errors"] = errors
                result["warnings"] = warns
                result["infos"] = infos

            except Exception as e:
                error_str = "Unexpected exception: %s \n %s" % (e, traceback.format_exc())
                result["errors"] = error_str
                result["warnings"] = error_str

    splunk.Intersplunk.outputResults(results)

main()
