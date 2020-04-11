#Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved. 

import logging, cherrypy
import splunk.appserver.mrsparkle.controllers as controllers
from splunk.appserver.mrsparkle.lib.decorators import expose_page

logger = logging.getLogger('splunk.appserver.controllers.example')


#THIS IS AN EXTREMELY SIMPLE HELLO WORLD CONTROLLER. 

# URL: /custom/sideview_utils/example/do_something
class example_controller(controllers.BaseController):

    @expose_page(must_login=True, methods=['GET']) 
    def do_something(self, series, **kwargs) : 
        
        logger.info("custom controller example has received a series value of " + series)

        return self.render_template("/sideview_utils:/templates/example_template.html", {
                "series": series
            })



