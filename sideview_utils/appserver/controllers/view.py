#Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

import logging
import cherrypy
import lxml.etree as et
import splunk.appserver.mrsparkle.controllers as controllers
from splunk.appserver.mrsparkle.lib.decorators import expose_page

import sideview as sv

logger = logging.getLogger('splunk.appserver.controllers.view')


# Gutted version of the SVU view controller,  just so we can still have our
# "view the xml for this page" links, but without the rest of the  Sideview
# Editor code.
class view(controllers.BaseController):

    @expose_page(must_login=True, methods=['GET'])
    def show(self, app, view, **kwargs):
        cherrypy.response.headers['Content-Type'] = "text/xml"

        uglyXML = sv.getViewXML(app, view)
        uglyXML = uglyXML.toxml()
        parser = et.XMLParser(remove_blank_text=True, strip_cdata=False)
        etXML = et.XML(uglyXML, parser)
        prettyXML = et.tostring(etXML, pretty_print=True)
        viewXML = sv.patchXMLForReadability(prettyXML)
        return viewXML
