#Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

# NOTE THAT THIS FILE MAY STILL CONTAIN SOME CODE LICENSED FROM SPLUNK VIA
# THE "Splunk Developer Agreement" http://www.splunk.com/view/SP-CAAAFC6
# Specifically from $SPLUNK_HOME/lib/Python-2.7/site-packages/splunk/appserver
#    /mrsparkle/controllers/search.py
# Unlike other parts of Sideview Utils , for this controller we decided to
# simply license the existing python from core splunk.
# Since then of course the code has been significantly modified and improved.

import logging, cherrypy, re
import splunk.appserver.mrsparkle.controllers as controllers
from splunk.appserver.mrsparkle.lib.decorators import expose_page
import splunk.search, splunk.rest
import splunk.entity as en
logger = logging.getLogger('splunk.appserver.controllers.export')
import lib.i18n as i18n


# URL: /custom/sideview_utils/export/results

class export(controllers.BaseController):

    def getFileName(self, filename, outputMode, sid):
        if outputMode == "raw":
            outputMode = "txt"
        if not filename or len(filename) == 0:
            filename = sid
        if not outputMode or len(outputMode) == 0:
            outputMode = "csv"
        filename = filename.replace('.', '_')
        filename = "%s.%s" % (filename, outputMode)

        # sanitize filenames
        filename = re.split(r'[\r\n;"\']+', filename.encode("utf-8"))[0]
        filename = filename[:255]
        return filename


    @expose_page(must_login=True, methods=['GET'])
    def results(self, sid, outputMode, **kwargs):
        job_lite = splunk.search.JobLite(sid)
        rs = job_lite.getResults('results_preview', 0, 1)

        if not rs:
            resp = JsonResponse()
            cherrypy.response.status = 404
            resp.success = False
            resp.addError("job sid=%s not found" % sid)
            return self.render_json(resp)

        filename = self.getFileName(kwargs.get("filename", False), outputMode, sid)

        cherrypy.response.headers['content-type'] = 'application/force-download'
        cherrypy.response.headers['content-disposition'] = 'attachment; filename="%s"' % filename

        if 'search' in kwargs and len(kwargs['search']) > 0:
            pass
        elif 'fields' not in kwargs:

            # by default, dont send down underscore fields except time and raw
            kwargs['fields'] = [x for x in rs.fieldOrder() if (not x.startswith('_') or x == '_time' or x == '_raw')]

        job = splunk.search.getJob(sid)
        return self.streamingExport(job, outputMode, **kwargs)



    def streamingExport(self, job, outputMode, **kwargs):
        ns = job.eaiacl['app']
        sid = job.sid
        owner = job.eaiacl['owner']
        request = {}
        request['output_mode'] = outputMode
        if 'fields' in kwargs:
            request['f'] = kwargs['fields']

        postProcess = kwargs.get("search", False)
        if postProcess:
            request['search'] = postProcess

        if 'output_time_format' in kwargs:
            request['output_time_format'] = kwargs['output_time_format']
        else:
            request['output_time_format'] = i18n.ISO8609_MICROTIME


        # We're not going to read/write further from the user's session at this point
        # and streaming may take a while, so release the session read lock
        cherrypy.session.release_lock()
        # Don't buffer the (potentially sizeable) result in memory
        cherrypy.response.stream = True

        uri = en.buildEndpoint('search/jobs/%s/results/export' % job.sid, namespace=ns, owner=owner)

        stream = splunk.rest.streamingRequest(uri, getargs=request, postargs=None)
        return stream.readall() # returns a generator
