# Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.
import json
import cherrypy
import logging
import controllers.module as module
import splunk.auth as auth
import splunk.entity as entity

from splunk.models.saved_search import *




class SideviewUI(UI):

    dispatch_view = Field('request.ui_dispatch_view')
    display_view = Field('displayview')
    vsid = None
    ui_context = Field('request.ui_context')
    edit_view = Field('request.ui_edit_view')

logger = logging.getLogger('splunk.appserver')


class SideviewSavedSearch(SavedSearch):
    resource = 'saved/searches'
    search = Field()
    description = Field()
    dispatch = DispatchField()
    schedule = ScheduleField()
    action = ActionField()
    alert = AlertField()
    is_disabled = BoolField('disabled')
    ui = SideviewUI()

    # AutoSummarization is a 5.0 only feature
    # this is sufficient to maintain support on 4.3.X
    try:
        auto_summarize = AutoSummarizeField()
    except NameError as e:
        pass

SAVED_SEARCHES_PATH = 'saved/searches'

class CustomRESTForSavedSearch(module.ModuleHandler):

    def generateResults(self, app, savedSearchName, serializedContext, editView, **args):

        response = {}

        currentUser = auth.getCurrentUser()['name']
        sessionKey = cherrypy.session['sessionKey']

        try:
            ssEntity = entity.getEntity(SAVED_SEARCHES_PATH, savedSearchName, namespace=app, owner=currentUser, sessionKey=sessionKey)
        except Exception as e:
            response["hypothesis"] = "is the saved search name incorrect?"
            response["message"] = str(e)
            response["success"] = False
            return json.dumps(response)

        params = {}
        params['name'] = savedSearchName
        ssModel = SideviewSavedSearch(app, currentUser, **params)

        ssModel.from_entity(ssEntity)

        ssModel.ui.ui_context = serializedContext
        ssModel.ui.edit_view = editView

        if ssModel.passive_save():
            response["success"] = True
        else:
            response["success"] = False
            response["message"] = "Error: we failed to inject the extra Sideview keys needed to correctly reload the savedsearch in this view."

        return json.dumps(response)
