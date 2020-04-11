#Copyright (C) 2010-2018 Sideview LLC.  All Rights Reserved.

import logging
import json
import re
import xml.dom.minidom
import traceback
import lxml.etree as et

import splunk.appserver.mrsparkle.controllers as controllers
from splunk.appserver.mrsparkle.lib.decorators import expose_page
import splunk.entity as en
from lib.module import moduleMapper
import splunk.auth as auth

# patch minidom's writexml method, so it doesnt add tons of whitespace.
def fixed_writexml(self, writer, indent="", addindent="", newl=""):
    writer.write(indent+"<" + self.tagName)

    attrs = self._get_attributes()
    a_names = attrs.keys()
    a_names.sort()

    for a_name in a_names:
        writer.write(" %s=\"" % a_name)
        xml.dom.minidom._write_data(writer, attrs[a_name].value)
        writer.write("\"")
    if self.childNodes:
        if len(self.childNodes) == 1 \
          and self.childNodes[0].nodeType == xml.dom.minidom.Node.TEXT_NODE:
            writer.write(">")
            self.childNodes[0].writexml(writer, "", "", "")
            newl = ""
            writer.write("</%s>%s" % (self.tagName, newl))
            return
        newl = ""
        writer.write(">%s"%(newl))
        for node in self.childNodes:
            newl = ""
            node.writexml(writer, indent+addindent, addindent, newl)
        newl = ""
        writer.write("%s</%s>%s" % (indent, self.tagName, newl))
    else:
        newl = ""
        writer.write("/>%s"%(newl))

# replace minidom's function with ours
xml.dom.minidom.Element.writexml = fixed_writexml

moduleAttributeRe = re.compile(r'(\s+)<module ([^/>]+)(/)?>(.+)?')
annoyingCDATASpaceBugRe = re.compile(r'(.+)?(]]>)(\s+)(</param>)(.?)')
dashboardPanelRe = re.compile(r'panel_row(\d+)_col(\d+)(?:_grp(\d+))?')

logger = logging.getLogger('splunk.appserver.controllers.view')


moduleAttributeSortOrders = {
    "name":0,
    "layoutPanel":10,
    "group":20,
    "autoRun":99
}

def getLegalValuesForModule(viewXML, moduleClass):
    definitions = moduleMapper.getInstalledModules()

    moduleDef = definitions["Splunk.Module." + moduleClass]
    attVals = {}
    for param in moduleDef["params"]:
        newEntry = {}

        newEntry["required"] = moduleDef["params"][param]["required"]
        if moduleDef["params"][param]["values"]:
            newEntry["values"] = moduleDef["params"][param]["values"]
        attVals[param] = newEntry

    attVals["layoutPanel"] = {
        "required":False,
        "values": getLegalLayoutPanels(viewXML)
    }
    attVals["autoRun"] = {
        "required":False,
        "values": {"True":1}
    }
    return attVals


def getLegalLayoutPanels(viewXML):
    viewNode = viewXML.getElementsByTagName("view")[0]
    if viewNode.hasAttribute("template"):
        template = viewNode.getAttribute("template")
    else:
        template = "search.html"

    layoutPanelDict = {}
    for d in legalLayoutPanelsByTemplate:
        if template == d["template"]:
            layoutPanelDict = d


    if layoutPanelDict:
        legalLayoutPanels = layoutPanelDict["panels"]

        legalPanelNames = {}
        for i in range(len(legalLayoutPanels)):
            legalPanelNames[legalLayoutPanels[i]] = 1

        if layoutPanelDict["allowsDashboardStylePanels"]:
            legalPanelNames.update(getAllDashboardStylePanelNames(viewXML))
            extendedNames = {"panel_row1_col1":1}
            for name in legalPanelNames:
                m = re.match(dashboardPanelRe, name)
                if m:
                    row = int(m.group(1))
                    column = int(m.group(2))
                    group = False
                    if m.group(3):
                        group = int(m.group(3))
                    # next row
                    extendedNames["panel_row%s_col1" % (row + 1)] = 1
                    # next column
                    if column < 3:
                        extendedNames["panel_row%s_col%s" % (row, column + 1)] = 1
                    #first interior groups
                    extendedNames["panel_row%s_col%s_grp1" % (row, column)] = 1
                    extendedNames["panel_row%s_col%s_grp1" % (row, column + 1)] = 1
                    if group:
                        #next interior group
                        extendedNames["panel_row%s_col%s_grp%s" % (row, column, group + 1)] = 1

            legalPanelNames.update(extendedNames)
            return legalPanelNames





def getAllDashboardStylePanelNames(viewXML):
    names = {}
    modules = viewXML.getElementsByTagName("module")
    for moduleEl in modules:
        if moduleEl.hasAttribute("layoutPanel"):
            names[moduleEl.getAttribute("layoutPanel")] = 1
    return names

def commitChanges(app, view, uglyXML, updateMetaData, fileNameForNewView=None):
    removeIdsFromAllModules(uglyXML)


    # plan A
    uglyXML = uglyXML.toxml()
    parser = et.XMLParser(remove_blank_text=True, strip_cdata=False)
    etXML = et.XML(uglyXML, parser)
    prettyXML = et.tostring(etXML, pretty_print=True)


    # plan B
    #prettyXML = uglyXML.toprettyxml(indent="  ")



    prettyXML = patchXMLForReadability(prettyXML)

    viewEntity = en.getEntity('data/ui/views', view, namespace=app)

    garbagePropertiesReturnedBySplunk6Beta = ["isDashboard", "isVisible", "label"]
    for p in garbagePropertiesReturnedBySplunk6Beta:
        if viewEntity.properties.get(p):
            logger.warn("Sideview Editor - garbage property detected in the getEntity response (" + p + "). We are deleting it here or else it will correctly trigger an error from splunkd when we try to post the modified entity back via setEntity")
            del viewEntity.properties[p]

    # in the create new cases, view will be "_new"
    if fileNameForNewView:
        viewEntity.properties["name"] = fileNameForNewView

    viewEntity[en.EAI_DATA_KEY] = prettyXML

    currentUser = auth.getCurrentUser()['name']
    try:
        en.setEntity(viewEntity)

        ## remnants of some 4.X logging insanity where I never got a handle on root cause.
        try:
            logger.info("view updated by Sideview Editor. view=" + str(view) + " user=" + str(currentUser) + " " + str(updateMetaData))
        except Exception as e:
            logger.error("exception trying to log view update. " + str(view) + " user=" + str(currentUser))
            return e

    except Exception as e:
        logger.error("exception trying to update view.  view=" + str(view) + " user=" + str(currentUser) + " message=" + str(e))
        logger.error(traceback.print_exc(e))
        return e



def patchXMLForReadability(prettyXML):
    prettyXMLList = prettyXML.split("\n")
    for i in range(len(prettyXMLList)):
        ## take off lame whitespace that gets stuck on the end.
        prettyXMLList[i] = prettyXMLList[i].rstrip()


        ## reorder the module attributes...
        moduleTagMatch = re.match(moduleAttributeRe, prettyXMLList[i])
        if moduleTagMatch:
            whitespace = moduleTagMatch.group(1)
            attStr = moduleTagMatch.group(2)
            endSlash = moduleTagMatch.group(3)
            junk = moduleTagMatch.group(4)

            attList = sorted(attStr.split(" "), key=attSortKeyFunction)
            newLine = []
            if whitespace:
                newLine.append(whitespace)
            newLine.append("<module ")
            newLine.append(" ".join(attList))
            if endSlash:
                newLine.append(" " + endSlash)
            newLine.append(">")
            if junk:
                newLine.append(junk)
            prettyXMLList[i] = "".join(newLine)

        # add newlines in front of every opening module tag.
        if prettyXMLList[i].lstrip().find("<module") == 0:
            prettyXMLList[i] = "\n"+prettyXMLList[i]

        # fix the problematic spaces that get injected between closing
        # CDATA blocks and closing tags.
        if re.match(annoyingCDATASpaceBugRe, prettyXMLList[i]):
            prettyXMLList[i] = re.sub(annoyingCDATASpaceBugRe, r"\1\2\4\5", prettyXMLList[i])

    return "\n".join(prettyXMLList)


def getViewAttributeMap():
    return {
        "displayView": "(optional) If this attribute is set, and searches and reports are saved in this view,  when those searches and reports are run later they will be loaded within the given view rather than this view.",
        "refresh": "(optional) When set to an integer N, the view will automatically refresh every N seconds.",
        "onunloadCancelJobs": "(optional) When set to True, the page will try to cancel any outstanding ad-hoc jobs that are running at the time. Note that jobs loaded from permalinks, jobs from scheduled saved searches, and jobs that the user might have redirected into new windows, are never cancelled by this functionality. ",
        "autoCancelInterval": "(optional) If unset, defaults to 120.  value is given in seconds.  If a job is dispatched in this view and then the given number of seconds goes by with no requests to key endpoints such as /events, /results, /summary, /timeline or /touch,  the running job will be cancelled.",
        "template": "(optional) If unset, defaults to 'search.html'.  This determines the mako template for the page.  Be careful that the legal space of layoutPanel attributes is different for each template. For instance changing the template from dashboard.html to search.html will invalidate the view if there are any layoutPanels with the panel_rowN_colM syntax still in the view.",
        "isSticky": "(optional) If set to True, then a small number of modules will attempt to remember the value set for each user and restore that value when the view is loaded.  Note that if you leave this set to True for a while and then you change it to False,  whatever value was last set at that time for each user will continue to prepopulate for that user.  To truly wipe the memory of this system you'll have to hunt down and delete many many viewstate stanzas. ",
        "isPersistable": "(optional) If set to True, then when a search or report is saved, Splunk's legacy viewstate system will try to 'snapshot' certain context keys that are present at the point where the search is being saved.   If True those snapshotted keys will be preserved in a viewstate entity that is linked to the savedsearch entity",
        "isVisible": "(optional) defaults to True.  This determines whether the view is visible in the navigation. Note that if the user has correct permissions to view this view,  then they will always be able to go to it by typing the URL into their browser directly, regardless of the setting here. ",
        "stylesheet": "(optional) When set to a value like 'foo.css', the system will look for a CSS stylesheet by that name within /etc/apps/<appName>/appserver/static.  If the stylesheet is found, it will be included in the page.  Note that if the app also has an 'application.css' file in that same directory, BOTH CSS files will be included..",
    }

def addIdsToAllModules(viewXML):
    usageCounter = {}
    # due to what looks like an ancient bug in memoizedviews.py,  the
    # core code doesn't actually implement the third number (position)
    # properly at the root level.
    # Thus we have to repeat the same bug here by passing in position=0
    # 0 for all the top level modules, although consistency would dictate
    # passing in i..
    if viewXML.childNodes.length > 0:

        viewTag = viewXML.getElementsByTagName("view")[0]
        for childModule in viewTag.childNodes:
            if childModule.nodeType != 1 or childModule.tagName != "module":
                continue
            addId(childModule, usageCounter, 0, 0)


def removeIdsFromAllModules(viewXML):
    modules = viewXML.getElementsByTagName("module")
    for moduleEl in modules:
        if moduleEl.hasAttribute("id"):
            moduleEl.removeAttribute("id")

def addId(xmlNode, usageCounter, depth, position):
    className = xmlNode.getAttribute("name")
    if className not in usageCounter:
        usageCounter[className] = 0
    else:
        usageCounter[className] = usageCounter[className]+1

    xmlNode.setAttribute("id", "%s_%s_%s_%s" % (
        className,
        usageCounter[className],
        depth,
        position)
    )
    xmlNode.setIdAttribute("id")

    nextLevelPosition = 0
    for childModule in xmlNode.childNodes:
        if childModule.nodeType != 1 or childModule.tagName != "module":
            continue

        addId(childModule, usageCounter, depth+1, nextLevelPosition)
        nextLevelPosition = nextLevelPosition + 1



def attSortKeyFunction(v):
    if v.find("="):
        o = moduleAttributeSortOrders.get(v.split("=")[0], 50)
        return str(o)
    return v




def cleanWhitespace(uglyXML):
    text_re = re.compile(r'>\n\s+([^<>\s].*?)\n\s+</', re.DOTALL)
    prettyXML = text_re.sub(r'>\g<1></', uglyXML)
    return prettyXML



def clearContents(xmlNode):
    while len(xmlNode.childNodes) > 0:
        child = xmlNode.childNodes[0]
        xmlNode.removeChild(child)


def getText(node):
    rc = []
    for node in node.childNodes:
        if node.nodeType == node.TEXT_NODE:
            rc.append(node.data)
        if node.nodeType == node.CDATA_SECTION_NODE:
            rc.append(node.data)
    return ''.join(rc)

def setText(doc, xmlNode, text):
    textNode = doc.createTextNode(str(text))
    xmlNode.appendChild(textNode)

def setListParam(doc, xmlNode, listJSON):
    for paramDict in listJSON:
        listNode = doc.createElement("list")
        for name in paramDict:
            innerParamNode = doc.createElement("param")
            innerParamNode.setAttribute("name", name)
            setText(doc, innerParamNode, paramDict[name])
            listNode.appendChild(innerParamNode)
        xmlNode.appendChild(listNode)

def setCDATA(doc, xmlNode, text):
    # the CDATA methods, or something, ends up adding a trailing linebreak.
    text = text.rstrip("\r\n")
    CDATASectionNode = doc.createCDATASection(text)
    xmlNode.appendChild(CDATASectionNode)

def getListParam(listNodes):
    jsonList = []
    for i in range(len(listNodes)):
        listNode = listNodes[i]
        paramDict = {}
        for param in listNode.childNodes:
            if param.nodeType != 1 or param.tagName != "param":
                continue
            paramDict[param.getAttribute("name")] = getText(param)
        jsonList.append(paramDict)
    return jsonList



def getParamDict(moduleXML):
    params = {}
    for param in moduleXML.childNodes:
        if param.nodeType != 1 or param.tagName != "param":
            continue
        listNodes = param.getElementsByTagName("list")
        if len(listNodes) > 0:
            paramList = getListParam(listNodes)
            params[param.getAttribute("name")] = paramList
        else:
            params[param.getAttribute("name")] = getText(param)
    return params

def getBlankViewXML():
    return xml.dom.minidom.parseString(EMPTY_VIEW_XML)

def getViewXML(app,view):
    viewEntity = en.getEntity('data/ui/views', view, namespace=app)
    viewStrList = viewEntity[en.EAI_DATA_KEY].split("\n")
    inCDATA = False
    for i in range(len(viewStrList)):
        if inCDATA:
            if viewStrList[i].find("]]>") > -1:
                inCDATA = False
        else:
            viewStrList[i] = viewStrList[i].strip()
            if viewStrList[i].find("<![CDATA[") > -1:
                inCDATA = True

    viewXML = xml.dom.minidom.parseString("\n".join(viewStrList))
    return viewXML

def buildModulesAsJSON(jsonNode, xmlNode):
    jsonNode["children"] = []

    for moduleEl in xmlNode.childNodes:
        if moduleEl.nodeType != 1 or moduleEl.tagName != "module":
            continue
        jsonChild = {
            "id": moduleEl.getAttribute("id"),
            "name": moduleEl.getAttribute("name"),
            "data": {}
        }
        for param in moduleEl.childNodes:
            if param.nodeType != 1 or param.tagName != "param":
                continue
            paramName = param.getAttribute("name")
            jsonChild["data"][paramName] = getText(param)

        jsonNode["children"].append(jsonChild)
        buildModulesAsJSON(jsonChild, moduleEl)



def isDownstream(moduleEl, allegedUpstreamModule):
    while moduleEl and moduleEl.parentNode and moduleEl.parentNode != moduleEl:
        if moduleEl.parentNode == allegedUpstreamModule:
            return True
        moduleEl = moduleEl.parentNode
    return False

# more complicated than you might think.
# in the Splunk view XML, attributes are always inherited.
# this function returns not only the direct attribute value if present,
# but also the value inherited from it's parent module.
def getAttributeValueForModule(app, view, moduleId, name):
    viewXML = getViewXML(app, view)
    addIdsToAllModules(viewXML)

    module = viewXML.getElementById(moduleId)

    if not module:
        logger.error(viewXML.toprettyxml())
        raise KeyError("no module found with id " + moduleId)

    value = None
    inheritedValue = None
    if module.getAttribute(name):
        value = module.getAttribute(name)
    while module.parentNode.parentNode and module.parentNode.getAttribute and not inheritedValue:
        module = module.parentNode
        if module.getAttribute(name):
            inheritedValue = module.getAttribute(name)

    if not inheritedValue:
        inheritedValue = ""
    if not value:
        value = inheritedValue


    return value, inheritedValue

def isBigParam(module, param):
    for pair in bigParams:
        if pair["module"] == module and pair["param"] == param:
            return True
    return False

bigParams = [{
        "module": "HTML",
        "param": "html"
    }, {
        "module": "Search",
        "param": "search"
    }, {
        "module": "PostProcess",
        "param": "search"
    }, {
        "module": "StaticContentSample",
        "param": "text"
    }, {
        "module": "HiddenSearch",
        "param": "search"
    }
]
listParams = [{
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
        "module": "Count",
        "param": "options",
        "keys": ["text", "label", "selected"]
    }, {
        "module": "Maxlines",
        "param": "options",
        "keys": ["text", "label", "selected"]
    }, {
        "module": "Segmentation",
        "param": "options",
        "keys": ["text", "label", "selected"]
    }, {
        "module": "SearchLinkLister",
        "param": "searchFieldsToDisplay",
        "keys": ["value", "label", "labelFormat"]
    }, {
        "module": "Sorter",
        "param": "fields",
        "keys": ["value", "label"]
    }, {
        "module": "SearchLinkLister",
        "param": "searchFieldsToDisplay",
        "keys": ["value", "label", "labelFormat"]
    }, {
        "module": "Breadcrumb",
        "param": "options",
        "keys": ["view", "label"]
    }, {
        "module": "RadioButtonSearch",
        "param": "options",
        "keys": ["value", "text"]
    }, {
        "module": "StaticRadio",
        "param": "staticFieldsToDisplay",
        "keys": ["value", "label", "checked"]
    }, {
        "module": "StaticSelect",
        "param": "staticFieldsToDisplay",
        "keys": ["value", "label", "selected"]
    }, {
        "module": "SearchSelectLister",
        "param": "searchFieldsToDisplay",
        "keys": ["value", "label"]
    }, {
        "module": "SearchSelectLister",
        "param": "staticFieldsToDisplay",
        "keys": ["value", "label"]
    }
]

abstractModules = [
    "Splunk.Module",
    "Splunk.Module.DispatchingModule",
    "Splunk.Module.BaseReportBuilderField",
    "Splunk.Module.BaseChartFormatter",
    "Splunk.Module.FlashWrapper",
]
unsupportedModules = [
    "Splunk.Module.ConvertToIntention",
    "Splunk.Module.ExtendedFieldSearch",
    "Splunk.Module.EntityLinkLister",
    "Splunk.Module.EntityRadioLister",
    "Splunk.Module.EntitySelectLister",
    "Splunk.Module.SearchLinkLister",
    "Splunk.Module.HiddenIntention",
    "Splunk.Module.SuggestedFieldViewer"
]
uneditableViews = {
    "sideview_utils": ["_admin", "controls", "description", "home", "editor_intro", "licensing"],
    "cisco_cdr": ["_admin", "home", "browse", "call_detail", "charting", "contact",
    "feedback", "phone_number_detail", "qos_thresholds", "report", "setup_2",
    "setup_clusters", "setup_groups", "simple_call_report"]
}

unusualModules = [
    "Splunk.Module.JobManager",
    "Splunk.Module.AjaxInclude",
    "Splunk.Module.ServerSideInclude",
    "Splunk.Module.IFrameInclude",
    "Splunk.Module.AdvancedModeToggle",
    "Splunk.Module.SubmitButton",
    "Splunk.Module.HiddenSearch",
    "Splunk.Module.DisableRequiredFieldsButton",
    "Splunk.Module.FieldSearch",
    "Splunk.Module.HiddenIntention",
    "Splunk.Module.ViewRedirector",
    "Splunk.Module.ConvertToIntention",
    "Splunk.Module.ConvertToDrilldownSearch",
    "Splunk.Module.ConvertToRedirect",
    "Splunk.Module.CakeBrushFormatter",
    "Splunk.Module.DistributedSearchServerChooser",
    "Splunk.Module.IndexSizes",
    "Splunk.Module.StaticContentSample",
    "Splunk.Module.ManagerBar",
    "Splunk.Module.BreadCrumb",
    "Splunk.Module.Gimp",
    "Splunk.Module.NotReporting",
    "Splunk.Module.SavedSearches",
    "Splunk.Module.ViewstateAdapter",
    "Splunk.Module.Sorter",
    "Splunk.Module.Selector",
    "Splunk.Module.GenericHeader",
    "Splunk.Module.ExcelExport",
    "Splunk.Module.CustomRESTForSavedSearch",
    "Splunk.Module.ProcessHistorianAppSetupHelper",
    "Splunk.Module.HiddenSearchSwapper",
    "Splunk.Module.LeftNavAppBar",
    "Splunk.Module.CiscoCDRAppSetupHelper",
    "Splunk.Module.CufonFontRenderer",
    "Splunk.Module.Paginator",
    "Splunk.Module.ReportType",
    "Splunk.Module.ReportSubType",
    "Splunk.Module.TimeRangeBinning",
    "Splunk.Module.ReportBuilderSearchField",
    "Splunk.Module.SingleFieldChooser",
    "Splunk.Module.StatChooser",
    "Splunk.Module.SplitByChooser",
    "Splunk.Module.ShowHideHeader",
    "Splunk.Module.TabSwitcher",
    "Splunk.Module.PulldownSwitcher",
    "Splunk.Module.ExtendedFieldSearch",
    "Splunk.Module.RadioButtonSearch",
    "Splunk.Module.PostProcessBar",
    "Splunk.Module.HiddenPostProcess",
    "Splunk.Module.PostProcessFilter",
    "Splunk.Module.ViewRedirectorLink",
    "Splunk.Module.HiddenFieldPicker",
    "Splunk.Module.AsciiTimeline",
    "Splunk.Module.MultiplexSparkline",
    "Splunk.InstrumentedModule",
    "Splunk.Module.LinkList",
    "Splunk.Module.SimpleResultsHeader",
    "Splunk.Module.ShowSource",
    "Splunk.Module.SoftWrap",
    "Splunk.Module.DataOverlay",
    "Splunk.Module.Segmentation",
    "Splunk.Module.TextSetting",
    "Splunk.Module.MaxLines",
    "Splunk.Module.RowNumbers",
    "Splunk.Module.Count",
    "Splunk.Module.HiddenSoftWrap",
    "Splunk.Module.Export",
    "Splunk.Module.AddTotals",
    "Splunk.Module.ChartTypeFormatter",
    "Splunk.Module.ChartTitleFormatter",
    "Splunk.Module.YAxisRangeMinimumFormatter",
    "Splunk.Module.LineMarkerFormatter",
    "Splunk.Module.XAxisTitleFormatter",
    "Splunk.Module.SplitModeFormatter",
    "Splunk.Module.LegendFormatter",
    "Splunk.Module.YAxisRangeMaximumFormatter",
    "Splunk.Module.NullValueFormatter",
    "Splunk.Module.StackModeFormatter",
    "Splunk.Module.YAxisTitleFormatter",
    "Splunk.Module.AxisScaleFormatter",
    "Splunk.Module.EntityLinkLister",
    "Splunk.Module.EntityRadioLister",
    "Splunk.Module.EntitySelectLister",
    "Splunk.Module.StaticRadio",
    "Splunk.Module.StaticSelect",
    "Splunk.Module.JobSpinner",
    "Splunk.Module.sosFTR",
    "Splunk.Module.DM_IFrame",
    "Splunk.Module.LinkSwitcher",
    "Splunk.Module.ButtonSwitcher",
    "Splunk.Module.ConditionalSwitcher",
    "Splunk.Module.FieldPicker",
    "Splunk.Module.SimpleEventsViewer",
    "Splunk.Module.FieldViewer",
    "Splunk.Module.ResultsHeader",
    "Splunk.Module.MultiFieldViewer",
    "Splunk.Module.SearchTextSetting",
    "Splunk.Module.FancyChartTypeFormatter",
    "Splunk.Module.SearchSelectLister",
    "Splunk.Module.SearchLinkLister",
    "Splunk.Module.SearchRadioLister",
    "Splunk.Module.SuggestedFieldViewer"
]

EMPTY_VIEW_XML = """
<view isVisible="true" onunloadCancelJobs="true" isSticky="False" template="dashboard.html"><label>New View</label>
    <module name="AccountBar" layoutPanel="appHeader" />
    <module name="AppBar" layoutPanel="appHeader" />
    <module name="SideviewUtils" layoutPanel="appHeader" />
    <module name="Message" layoutPanel="messaging">
        <param name="filter">*</param>
        <param name="maxSize">2</param>
        <param name="clearOnJobDispatch">False</param>
    </module>
    <module name="HTML" layoutPanel="viewHeader">
        <param name="html"><![CDATA[
        <h1>Placeholder Page Title</h1>
        ]]></param>
    </module>
</view>
"""


legalLayoutPanelsByTemplate = [
    {
        "template": "search.html",
        "allowsDashboardStylePanels": False,
        "panels": [
            "messaging",
            "appHeader",
            "navigationHeader",
            "viewHeader",
            "splSearchControls-inline",
            "mainSearchControls",
            "fullWidthControls",
            "graphArea",
            "sidebar",
            "resultsHeaderPanel",
            "resultsAreaLeft",
            "resultsAreaRight",
            "pageControls",
            "pageControls_1",
            "pageControls2",
            "resultsOptions"
        ]
    },
    {
        "template": "builder.html",
        "allowsDashboardStylePanels": True,
        "panels": [
            "messaging",
            "appHeader",
            "navigationHeader",
            "viewHeader",
            "splSearchControls-inline",
            "reportFirstPanel",
            "reportSecondPanel",
            "reportThirdPanel",
            "graphArea",
            "resultsArea"
        ]
    },
    {
        "template": "dashboard.html",
        "allowsDashboardStylePanels": True,
        "panels": [
            "messaging",
            "appHeader",
            "navigationHeader",
            "viewHeader",
            "splSearchControls-inline",
            "mainSearchControls"
        ]
    }
]
