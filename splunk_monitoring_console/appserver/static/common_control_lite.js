require(["models/search/Job","underscore","splunkjs/mvc","uri/route","util/console","backbone","views/Base","splunkjs/mvc/searchmanager","splunkjs/mvc/tableview","splunkjs/mvc/utils","splunkjs/mvc/dropdownview","jquery","models/services/search/jobs/Result","collections/services/saved/Searches","views/shared/controls/SyntheticSelectControl","splunkjs/mvc/sharedmodels","splunk.util","splunk.config","splunk.i18n","splunkjs/mvc/simplexml/ready!"],function(__WEBPACK_EXTERNAL_MODULE__16__,__WEBPACK_EXTERNAL_MODULE__1__,__WEBPACK_EXTERNAL_MODULE__5__,__WEBPACK_EXTERNAL_MODULE__11__,__WEBPACK_EXTERNAL_MODULE__14__,__WEBPACK_EXTERNAL_MODULE__3__,__WEBPACK_EXTERNAL_MODULE__13__,__WEBPACK_EXTERNAL_MODULE__8__,__WEBPACK_EXTERNAL_MODULE__6__,__WEBPACK_EXTERNAL_MODULE__10__,__WEBPACK_EXTERNAL_MODULE__15__,__WEBPACK_EXTERNAL_MODULE__0__,__WEBPACK_EXTERNAL_MODULE__17__,__WEBPACK_EXTERNAL_MODULE__12__,__WEBPACK_EXTERNAL_MODULE__18__,__WEBPACK_EXTERNAL_MODULE__9__,__WEBPACK_EXTERNAL_MODULE__4__,__WEBPACK_EXTERNAL_MODULE__19__,__WEBPACK_EXTERNAL_MODULE__20__,__WEBPACK_EXTERNAL_MODULE__2__){return function(modules){var installedModules={};function __webpack_require__(moduleId){if(installedModules[moduleId])return installedModules[moduleId].exports;var module=installedModules[moduleId]={i:moduleId,l:!1,exports:{}};return modules[moduleId].call(module.exports,module,module.exports,__webpack_require__),module.l=!0,module.exports}return __webpack_require__.m=modules,__webpack_require__.c=installedModules,__webpack_require__.d=function(exports,name,getter){__webpack_require__.o(exports,name)||Object.defineProperty(exports,name,{enumerable:!0,get:getter})},__webpack_require__.r=function(exports){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(exports,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(exports,"__esModule",{value:!0})},__webpack_require__.t=function(value,mode){if(1&mode&&(value=__webpack_require__(value)),8&mode)return value;if(4&mode&&"object"==typeof value&&value&&value.__esModule)return value;var ns=Object.create(null);if(__webpack_require__.r(ns),Object.defineProperty(ns,"default",{enumerable:!0,value:value}),2&mode&&"string"!=typeof value)for(var key in value)__webpack_require__.d(ns,key,function(key){return value[key]}.bind(null,key));return ns},__webpack_require__.n=function(module){var getter=module&&module.__esModule?function(){return module.default}:function(){return module};return __webpack_require__.d(getter,"a",getter),getter},__webpack_require__.o=function(object,property){return Object.prototype.hasOwnProperty.call(object,property)},__webpack_require__.p="",__webpack_require__(__webpack_require__.s="splunk_monitoring_console-extensions/common_control_lite")}({0:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__0__},1:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__1__},10:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__10__},11:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__11__},12:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__12__},13:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__13__},14:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__14__},15:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__15__},16:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__16__},17:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__17__},18:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__18__},19:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__19__},2:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__2__},20:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__20__},21:function(module,exports){module.exports='<div class="smc-alerts-panel smc-distributed-mode-row smc-distributed-mode-alerts-panel">\r\n    <div class="smc-alerts-title-section">\r\n        <div class="row-fluid">\r\n            <div class="span9">\r\n                <div class="smc-panel-title">\r\n                    <span id="smc-alerts-count">0</span>\r\n                    <span id="smc-alerts-title"><%= _("Alerts").t()%></span>\r\n                </div>\r\n                <div class="control-options">\r\n                    <a href="<%= alerts_setup_link %>" class="btn-pill"><%= serverInfo.isLite() ? _("Platform Alerts Setup").t() : _(\'Enable or Disable\').t()%></a>\r\n                    <a class="btn-pill" id="triggered-alerts-link" target="_blank"><%=_(\'Manage triggered alerts\').t()%></a>\r\n                </div>\r\n            </div>\r\n            <% if (!serverInfo.isLite()) { %>\r\n                <div class="dmc-svg-icons">\r\n                    <%= AlertIcon %>\r\n                </div>\r\n            <% } %>\r\n        </div>\r\n    </div>\r\n    <div class="panel-element-row details-row">\r\n        <div class="dashboard-element html" id="alerts-fired-table-view"></div>\r\n    </div>\r\n</div>'},22:function(module,exports){module.exports='<?xml version="1.0" encoding="UTF-8" standalone="no"?>\r\n<svg width="42px" height="42px" viewBox="0 0 42 42" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns">\r\n    \x3c!-- Generator: Sketch 3.0.4 (8054) - http://www.bohemiancoding.com/sketch --\x3e\r\n    <title>Alert</title>\r\n    <desc>Created with Sketch.</desc>\r\n    <defs></defs>\r\n    <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" sketch:type="MSPage">\r\n        <g id="Alert" sketch:type="MSLayerGroup" transform="translate(2.000000, 1.000000)" stroke="#333333">\r\n            <path d="M18,37.6021798 C24.0567208,37.6021798 29.5107829,36.289782 32.5240768,34.203406 C34.0005908,33.160218 34.7539143,32.0497275 34.7539143,30.8046322 C34.7539143,28.3480926 31.5598227,26.1271117 26.4070901,24.9156676 C23.8457903,24.3099455 21.0434269,24.0070845 18,24.0070845 C11.9432792,24.0070845 6.48921713,25.2858311 3.50605613,27.3722071 C1.99940916,28.4153951 1.24608567,29.5595368 1.24608567,30.8046322 C1.24608567,33.2611717 4.44017725,35.4821526 9.5929099,36.6935967 C12.1542097,37.2993188 14.9565731,37.6021798 18,37.6021798 Z" id="Path" sketch:type="MSShapeGroup"></path>\r\n            <path d="M7.19497784,25.5632078 C7.96602659,27.1353557 10.1728213,28.1179481 12.9113737,27.995124 C16.394387,27.9214296 18.9468242,26.3492817 18.9734121,24.1138839 L19,24.0647543" id="Path" sketch:type="MSShapeGroup"></path>\r\n            <path d="M21.8818316,1.91553134 L21.8818316,3.77929155 C26.2688331,4.89237057 29.0871492,7.81743869 29.6454948,11.5190736 L31.5864106,21.8991826 C31.8257016,23.2452316 32.4106352,24.3841962 33.2880355,25.3419619 C35.0960118,27.2833787 36,28.9141689 36,30.2343324 C36,33.0558583 32.5701625,35.5926431 27.0398818,36.9645777 C24.2747415,37.6634877 21.2703102,38 18,38 C11.4859675,38 5.61004431,36.5245232 2.41949778,34.1430518 C0.797636632,32.9523161 0,31.6580381 0,30.2343324 C0,28.9400545 0.903988183,27.3092643 2.73855244,25.3419619 C3.40324963,24.6171662 3.66912851,24.3324251 4.01477105,23.5299728 C4.20088626,23.1416894 4.3338257,22.6757493 4.41358936,22.1580381 L6.35450517,11.5190736 C6.91285081,7.81743869 9.73116691,4.89237057 14.1181684,3.77929155 L14.1181684,1.91553134 C14.1181684,0.802452316 14.9423929,0 16.0856721,0 L19.9143279,0 C21.0576071,0 21.8818316,0.802452316 21.8818316,1.91553134 L21.8818316,1.91553134 Z" id="Path" stroke-width="2" sketch:type="MSShapeGroup"></path>\r\n        </g>\r\n    </g>\r\n</svg>'},3:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__3__},4:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__4__},5:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__5__},6:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__6__},8:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__8__},9:function(module,exports){module.exports=__WEBPACK_EXTERNAL_MODULE__9__},"splunk_monitoring_console-extensions/common_control_lite":function(module,exports,__webpack_require__){var __WEBPACK_AMD_DEFINE_ARRAY__,__WEBPACK_AMD_DEFINE_RESULT__;__WEBPACK_AMD_DEFINE_ARRAY__=[__webpack_require__(0),__webpack_require__(1),__webpack_require__(5),__webpack_require__(11),__webpack_require__("splunk_monitoring_console-views/overview/Alerts"),__webpack_require__(9),__webpack_require__(14),__webpack_require__(2)],void 0===(__WEBPACK_AMD_DEFINE_RESULT__=function($,_,mvc,route,AlertsView,sharedModels,console){var submittedModel=mvc.Components.getInstance("submitted"),defaultModel=mvc.Components.getInstance("default"),model={};model.serverInfoModel=sharedModels.get("serverInfo"),$.when(model.serverInfoModel.dfd).then(function(){var alertsView=new AlertsView({model:{serverInfo:model.serverInfoModel}});$("#alertsPanel").append(alertsView.render().$el),$(".smc-alerts-title-section").hide()}),$("#link-switcher-view").on("click","a",function(e){e.preventDefault();var $target=$(e.target);$target.hasClass("active")||($target.siblings("a.btn-pill").removeClass("active"),$target.siblings("a.btn-pill").each(function(index,element){var item=$(element).data("item");defaultModel.unset(item),submittedModel.unset(item)}),$target.addClass("active"),defaultModel.set($target.data("item"),!0),submittedModel.set($target.data("item"),!0))}),$("h2.panel-title:contains('Snapshots')").css({"border-bottom":"none",padding:"10px 0 0 0"}).parent().css({"background-color":"inherit",border:"none","padding-bottom":"10px"}),$("h2.panel-title:contains('Historical')").css({"border-bottom":"none",padding:"10px 0 0 0"}).parent().css({"background-color":"inherit",border:"none"}),$("h2.panel-title:contains('Search Activity')").css({"border-bottom":"none",padding:"0 0 10px 0"}).parent().css({"background-color":"inherit",border:"none"}),$("h2.panel-title:contains('Scheduler Activity')").css({"border-bottom":"none",padding:"10px 0 10px 0"}).parent().css({"background-color":"inherit",border:"none"});var application=sharedModels.get("app"),learnMoreLink=route.docHelp(application.get("root"),application.get("locale"),"app.management_console.resource_usage_process_class");function setToken(name,value){var defaultTokenModel=mvc.Components.get("default");defaultTokenModel&&defaultTokenModel.set(name,value);var submittedTokenModel=mvc.Components.get("submitted");submittedTokenModel&&submittedTokenModel.set(name,value)}$(".dmc_process_class_learn_more").attr("href",learnMoreLink),$(".dashboard-body").on("click","[data-set-token],[data-unset-token],[data-token-json]",function(e){e.preventDefault();var target=$(e.currentTarget),setTokenName=target.data("set-token");setTokenName&&setToken(setTokenName,target.data("value"));var unsetTokenName=target.data("unset-token");unsetTokenName&&setToken(unsetTokenName,void 0);var tokenJson=target.data("token-json");if(tokenJson)try{_.isObject(tokenJson)&&_(tokenJson).each(function(value,key){setToken(key,null==value?void 0:value)})}catch(err){console.warn("Cannot parse token JSON: ",err)}})}.apply(exports,__WEBPACK_AMD_DEFINE_ARRAY__))||(module.exports=__WEBPACK_AMD_DEFINE_RESULT__)},"splunk_monitoring_console-views/overview/Alerts":function(module,exports,__webpack_require__){var __WEBPACK_AMD_DEFINE_ARRAY__,__WEBPACK_AMD_DEFINE_RESULT__;__WEBPACK_AMD_DEFINE_ARRAY__=[__webpack_require__(0),__webpack_require__(1),__webpack_require__(3),module,__webpack_require__(13),__webpack_require__(8),__webpack_require__(6),__webpack_require__(10),__webpack_require__(15),__webpack_require__(16),__webpack_require__(17),__webpack_require__(12),__webpack_require__(18),__webpack_require__("splunk_monitoring_console-views/overview/util"),__webpack_require__(4),__webpack_require__(19),__webpack_require__(20),__webpack_require__(11),__webpack_require__(21),__webpack_require__(22)],void 0===(__WEBPACK_AMD_DEFINE_RESULT__=function($,_,Backbone,module,BaseView,SearchManager,TableView,utils,DropdownView,SearchJobModel,ResultModel,SavedSearchesCollection,SyntheticSelectControl,dmcUtil,util,config,i18n,route,Template,AlertIcon){var root=0===config.MRSPARKLE_ROOT_PATH.indexOf("/")?config.MRSPARKLE_ROOT_PATH.substring(1):config.MRSPARKLE_ROOT_PATH;return BaseView.extend({moduleId:module.i,id:"smc-alerts-view-container",template:Template,initialize:function(){BaseView.prototype.initialize.apply(this,arguments),this.$el.html(this.compiledTemplate({alerts_setup_link:route.page(root,config.LOCALE,"splunk_monitoring_console","monitoringconsole_alerts_setup"),AlertIcon:AlertIcon,serverInfo:this.model.serverInfo})),this.alertsFiredSearch=this._alertsSearchManager(),this.alertsTableView=this._alertsTableView();var customInstanceRenderer=TableView.BaseCellRenderer.extend({canRender:function(cellData){return"Instance"===cellData.field},render:function($td,cellData){var sid=cellData.value,searchJob=new SearchJobModel({id:sid});searchJob.fetch().done(function(){var link_id=searchJob.entry.links.get("results"),result=new ResultModel({id:link_id});result.fetch().done(function(){var instances=_.unique(result.results.map(function(instance){return instance.get("Instance")[0]})),truncatedInstances=_.take(instances,10),$instanceList=_.reduce(truncatedInstances,function(memo,instance){return memo+instance+"<br/>"},"");instances.length>truncatedInstances.length&&($instanceList+=_("and ").t()+(instances.length-truncatedInstances.length)+_(" more instances ...").t()),$td.html($instanceList)})})}});this.customInstanceCellRenderer=new customInstanceRenderer,this.alertsTableView.addCellRenderer(this.customInstanceCellRenderer),this.alertsTableView.render(),this.dropdownFilterByLast=this._dropdownFilterByLast(),this.dropdownFilterByNumRows=this._dropdownFilterByNumRows(),this._bindCountListener(),this._bindFilterListener(),this._bindFilterByNumRows(),this.model.serverInfo.isCloud()||this.model.serverInfo.isLite()||$.when(this.options.deferreds.distSearchGroupsDfd).done(function(){"0"==this.model.appLocal.entry.content.get("configured")&&0===this.collection.distSearchGroups.models.length&&this.needsSetup()}.bind(this))},_alertsSearchManager:function(){return new SearchManager({id:"alerts-fired-search",search:"| `dmc_get_all_triggered_alerts(1440)`",cancelOnUnload:!0,app:utils.getCurrentApp()})},_alertsTableView:function(){return new TableView({id:"alerts-table",managerid:"alerts-fired-search",el:this.$("#alerts-fired-table-view"),wrap:"true",drilldown:"row",drilldownRedirect:!1,pageSize:5})},_handleAlertDrilldown:function(e){e.preventDefault();var alert_name=$(e.target).parent().children().first().text().trim(),alert_id=encodeURI(encodeURI("/servicesNS/nobody/splunk_monitoring_console/alerts/fired_alerts/"+alert_name));window.open(route.triggeredAlerts(root,config.LOCALE,"splunk_monitoring_console",{data:{app:"splunk_monitoring_console",owner:"-",serverity:"*",alerts_id:alert_id}}),"_blank")},_dropdownFilterByLast:function(){return new SyntheticSelectControl({model:null,modelAttribute:null,label:this.model.serverInfo.isLite()?"":_("Filter by Last:").t(),defaultValue:"1440",additionalClassNames:"overview-alert-time-range-picker",items:[{value:"60",label:_("1 Hour").t()},{value:"240",label:_("4 Hours").t()},{value:"1440",label:_("24 Hours").t()},{value:"4320",label:_("3 days").t()},{value:"10080",label:_("7 days").t()}],save:!1,elastic:!0,menuWidth:"narrow",toggleClassName:"btn-pill",popdownOptions:{attachDialogTo:"body"}})},_dropdownFilterByNumRows:function(){return new SyntheticSelectControl({model:null,modelAttribute:null,defaultValue:"5",additionalClassNames:"overview-alert-count-per-page",items:[{value:"5",label:_("5 per page").t()},{value:"10",label:_("10 per page").t()},{value:"15",label:_("15 per page").t()},{value:"20",label:_("20 per page").t()},{value:"25",label:_("25 per page").t()}],save:!1,elastic:!0,menuWidth:"narrow",toggleClassName:"btn-pill",popdownOptions:{attachDialogTo:"body"}})},_bindCountListener:function(){this.alertsFiredSearch.on("search:done",function(properties){var count=properties.content.resultPreviewCount;1===count?$("#smc-alerts-title").html(_("Triggered Alert").t()):$("#smc-alerts-title").html(_("Triggered Alerts").t()),$("#smc-alerts-count").html(count)})},_bindFilterListener:function(){this.dropdownFilterByLast.on("change",function(value){this.alertsFiredSearch.set("search","| `dmc_get_all_triggered_alerts("+value+")`")}.bind(this))},_bindFilterByNumRows:function(){this.dropdownFilterByNumRows.on("change",function(value){this.alertsTableView.settings.set("pageSize",value)}.bind(this))},events:{"click .smc-alerts-panel .shared-resultstable-resultstablerow":"_handleAlertDrilldown"},render:function(){return this.$(".control-options").append(this.dropdownFilterByLast.render().el),this.$(".control-options").append(this.dropdownFilterByNumRows.render().el),this.$("#triggered-alerts-link").attr("href",route.triggeredAlerts(root,config.LOCALE,"splunk_monitoring_console",{data:{"eai:acl.app":"splunk_monitoring_console","eai:acl.owner":"*",serverity:"*"}})),this.$("#smc-alerts-count").attr("href",route.triggeredAlerts(root,config.LOCALE,"splunk_monitoring_console")),this},needsSetup:function(){this.$(".control-options").remove(),this.$("#smc-alerts-count").remove(),this.$(".details-row").html('<h3 class="icon-alert"> '+_("Alerts require setup. Please ").t()+' <a href="'+dmcUtil.getFullPath("/app/splunk_monitoring_console/monitoringconsole_configure")+'">set up</a>'+_(" your instance first.").t()+"</h3>").css("text-align","center")}})}.apply(exports,__WEBPACK_AMD_DEFINE_ARRAY__))||(module.exports=__WEBPACK_AMD_DEFINE_RESULT__)},"splunk_monitoring_console-views/overview/util":function(module,exports,__webpack_require__){var __WEBPACK_AMD_DEFINE_ARRAY__,__WEBPACK_AMD_DEFINE_RESULT__;__WEBPACK_AMD_DEFINE_ARRAY__=[__webpack_require__(10)],void 0===(__WEBPACK_AMD_DEFINE_RESULT__=function(utils){return{getFullPath:function(path){var root=utils.getPageInfo().root,locale=utils.getPageInfo().locale;return(root?"/"+root:"")+"/"+locale+path}}}.apply(exports,__WEBPACK_AMD_DEFINE_ARRAY__))||(module.exports=__WEBPACK_AMD_DEFINE_RESULT__)}})});