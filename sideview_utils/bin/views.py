#Copyright (C) 2015-2018 Sideview LLC.  All Rights Reserved.

import logging, os, re
from splunk.clilib import bundle_paths
import lxml.etree as et
logger = logging.getLogger("splunk.appserver")
import cherrypy

from splunk.appserver.mrsparkle.lib.memoizedviews import memoizedViews
from splunk import entity, ResourceNotFound
from splunk.appserver.mrsparkle.lib import appnav

class LegacyAppNavigation():

    lastReturnValue = False

    def getAppNavigation(self, app):
        searches = getSavedSearches(app)
        available_views = {}
        memoizedViews.getAvailableViews(app, 0, available_views, flash_ok=False)
        navConfig, tmp_dv, navColor = appnav.getAppNav(app, available_views, searches)
        for topLevelMenuItem in navConfig:
            self.rewriteURLsInMenu(topLevelMenuItem, app)

        return navConfig, navColor

    def rewriteURLsInMenu(self, jsonDict, app):
        for key, menuItem in jsonDict.iteritems():
            if key == "uri":
                match = re.search(r"^/[\w-]+/app/" + app + "/", menuItem)
                if match:
                    jsonDict[key] = menuItem.replace("/en-US/app/sideview_utils/", "")

            elif key == "submenu":
                for subMenuItem in menuItem:
                    self.rewriteURLsInMenu(subMenuItem, app)

legacyAppNavigation = LegacyAppNavigation()

def legacyGetAppNavigation(app):
    if not legacyAppNavigation.lastReturnValue:
        legacyAppNavigation.lastReturnValue = legacyAppNavigation.getAppNavigation(app)
    return legacyAppNavigation.lastReturnValue


def getSavedSearches(app):
    can_alert = False
    try:
        searches = entity.getEntities("saved/searches", namespace=app, search="disabled=0", count=500, _with_new="1")
        if '_new' in searches:
            can_alert = "alert.severity" in searches["_new"].get("eai:attributes", {}).get("optionalFields", [])
            del searches['_new']
    except ResourceNotFound:
        logger.error("we were unable to list out current saved searches")
        searches = {}
    return searches


def getViewXML(directory, filename):
    fullpath = os.path.join(directory, filename)
    with open(fullpath, 'r+') as fp:
        viewXML = "".join(fp.readlines())
        viewName = filename.split(".")[0]
        parser = et.XMLParser(remove_blank_text=True, strip_cdata=False)
        return (viewName, et.XML(viewXML, parser))



def getViewsFromLayer(app, which):
    d = os.path.abspath(os.path.join(bundle_paths.get_base_path(), app, which, "data/ui/views"))
    views = {}
    for directory, subdirectory, files in os.walk(d):
        for filename in files:
            viewName, view = getViewXML(directory, filename)
            views[viewName] = view
    return views


def getViews(app):

    # TODO - need to also get exported views from the REST API.   Yes I know
    # that's crazy, but we need to put the "search" view into people's menus
    # if they listed it in the nav.
    defaultViews = getViewsFromLayer(app, "default")
    localViews = getViewsFromLayer(app, "local")

    views = defaultViews.copy()
    views.update(localViews)
    return views



def testGetViews(app):
    import splunk.auth
    svViews = getViews(app)
    splunkViews = {}

    service = client.connect(token=cherrypy.session['sessionKey'])
    #splunk.auth.getSessionKey("admin","XXXXX")

    memoizedViews.getAvailableViews(app, 0, splunkViews, flash_ok=False)
    for view in splunkViews:
        if view not in svViews:
            print("splunk returned a view not in the sideview list " +view)
    for view in svViews:
        if view not in splunkViews:
            print("Sideview returned a view not in the Splunk list " + view)




if __name__ == "__main__":
    testGetViews("sideview_utils")
