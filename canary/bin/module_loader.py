# -*- coding: utf-8 -*-
#Copyright (C) 2015-2019 Sideview LLC.  All Rights Reserved.
"""
    Contains functions and classes used by Canary to deal with module classes
    and resource files.
"""

import logging
import os
import sys


import sideview_canary as sv
from splunk.clilib import bundle_paths
import splunk.clilib.cli_common as cli_common

logger = sv.setup_logging(logging.DEBUG)

APP = "canary"

if sys.version_info.major >= 3:
    sys.path.append(os.path.join(os.environ['SPLUNK_HOME'], "etc", "apps", APP, "bin", "yaml3"))
    import yaml3 as yaml
elif sys.version_info.major == 2:
    sys.path.append(os.path.join(os.environ['SPLUNK_HOME'], "etc", "apps", APP, "bin", "yaml2"))
    import yaml2 as yaml

CONF_EXTENSION = ".conf"
ETC_APPS_DIR = bundle_paths.get_base_path()




def get_params(conf):
    """
    for a particular module, load the information about the params it can take.
    """
    assert "module" in conf
    assert conf["module"].get("className", False)

    params = {}
    for stanza_name, stanza in conf.items():
        if stanza_name.startswith("param:"):
            param_name = stanza_name[6:].strip()
            params[param_name] = {}

            if "default" in stanza and 'required' in stanza and stanza["required"] == "True":
                logger.error("%s lists param %s as required but then has a default key.",
                             stanza_name, param_name)
                return {}
            if "values" in stanza:
                clean_values = []
                for val in stanza["values"].split(","):
                    clean_values.append(val.strip())
                stanza["values"] = clean_values

            for key in stanza:
                params[param_name][key] = stanza[key]

    return params



def get_conf_file(module_dir):
    """ for each directory tell me if there's a conf file in it with the same name."""
    for directory, _subdirectory, files in os.walk(module_dir):
        for name in files:
            if name.endswith(CONF_EXTENSION):
                return (name, cli_common.readConfFile(os.path.join(directory, name)))
    return False, False



def path_to_url(app, path):
    """
    given a FS path of
        C:\\LOTS_OF_THINGS\\appserver\\static\\sideview\\modules\\NavBar\\NavBar.js
    returns a url of
        /static/app/canary/sideview/modules/NavBar/NavBar.js
    """
    static_file_path = sv.get_static_file_path(app)
    if path.index(static_file_path) == -1:
        raise ValueError("this path %s is not within appserver/static" % path)
    path = path.replace("%s%s" % (static_file_path, os.sep), "")
    path = path.split(os.sep)
    return "/".join(path)



def simple_memoize_by_app_name(func):
    """ dead simple... hopefully that makes it ok. """
    cache = dict()

    def memoized_func(*args):
        if args in cache:
            return cache[args]
        result = func(*args)
        cache[args] = result
        return result

    return memoized_func

@simple_memoize_by_app_name
def get_modules_for_app(app_name):
    """ returns a list of dicts, each of which is everything you need to know
    about a given Canary UI module. eg what/whether they have html, css files"""

    #this can probably be cleaned up, IF we can trust bundle_paths to give the right slashes
    possible_mixed_slashes = os.path.join(ETC_APPS_DIR, app_name, "appserver/static/lib/modules")
    root_module_dir = os.path.abspath(possible_mixed_slashes)

    modules = {}
    for module_dir, _subdirectory, files in os.walk(root_module_dir):
        if module_dir == root_module_dir:
            continue
        name, conf = get_conf_file(module_dir)
        if not conf:
            continue

        mod = {
            "params": get_params(conf),
            "class": conf["module"]["className"],
            "description": conf["module"].get("description"),
            "filePrefix": name[:-len(CONF_EXTENSION)],
            "path": module_dir,
            "appName": app_name
        }
        for rule in sv.HIERARCHY_DIRECTIVES:
            rule_value = conf["module"].get(rule)
            assert rule_value in ["True", "False", None]
            if rule_value:
                mod[rule] = bool(rule_value)

        for filename in files:
            segments = filename.split(".")
            if len(segments) > 2:
                # this is some annoying foo.js.bak file. Skip it.
                continue
            ext = segments[1]
            mod[ext] = os.path.join(module_dir, filename)
            if ext in ["js", "css"]:
                mod[ext] = path_to_url(app_name, mod[ext])
        modules[mod["class"]] = mod

    return modules

def get_modules(session_key=None):
    """returns a list of dicts, each dict represents one module. The list
    represents all valid modules in the system. NOTE right now only the canary
    app itself can put modules into the system."""

    all_modules = {}
    if not session_key:
        raise Exception("We somehow have no session key")

    # at the moment no other app is allowed to load custom canary modules.
    # in theory this list will one day be a call to all non-disabled apps
    for app_name in ["canary"]:

        app_modules = get_modules_for_app(app_name)
        for module_name in app_modules:
            if module_name in all_modules:
                msg = "Can not import module %s from %s. Another app already has this module."
                raise ImportError(msg % (module_name, app_name))
        all_modules.update(app_modules)

    #yaml_output = yaml.dump(all_modules, default_flow_style=False)
    #logger.error("modules are \n%s", yaml_output)
    return all_modules
