
/* This module contains parts derived from Bill White's zoomable TreeMap 
 * implementation at 
 * www.billdwhite.com/wordpress/2012/12/16/d3-treemap-with-title-headers
 * licensing is via MIT license.  
 * www.billdwhite.com/wordpress/source-code-license/
 */

Splunk.Module.TreeMap = $.klass(Sideview.utils.getBaseClass(true), {

    initialize: function($super, container) {
        $super(container);
        
        this.headerHeight = 20;
        this.headerColor = "#555555";
        this.selectedFilters = [];

        this.transitionDuration = 500;
        var width = this.getParam("width");
        if (width=="100%") {
            width=this.container.parent().width() - 104;
        }
        this.chartWidth = width;
        this.chartHeight = this.getParam("height");
        this.xscale = d3.scale.linear().range([0, this.chartWidth]);
        this.yscale = d3.scale.linear().range([0, this.chartHeight]);
    },

    requiresResults: function() {return true;},
    
    setupD3: function() {
     
        this.treemap = d3.layout.treemap()
            .round(false)
            .size([this.chartWidth, this.chartHeight])
            .sticky(true)
            .value(function(d) {
                return d.size;
            });
        this.stackedHeaderDiv = $("<div>")
            .appendTo(this.container);
        
        this.treeMapSvg = d3.select("#" + this.container.attr("id"))
            .append("svg:svg")
            .attr("width", this.chartWidth)
            .attr("height", this.chartHeight);
            
     
        this.chart = this.treeMapSvg.append("svg:g");

     
        var defs = this.treeMapSvg.append("defs");
     
        var filter = defs.append("svg:filter")
        .attr("id", "outerDropShadow")
            .attr("x", "-20%")
            .attr("y", "-20%")
            .attr("width", "140%")
            .attr("height", "140%");
        
        filter.append("svg:feOffset")
            .attr("result", "offOut")
            .attr("in", "SourceGraphic")
            .attr("dx", "1")
            .attr("dy", "1");
     
        filter.append("svg:feColorMatrix")
            .attr("result", "matrixOut")
            .attr("in", "offOut")
            .attr("type", "matrix")
            .attr("values", "1 0 0 0 0 0 0.1 0 0 0 0 0 0.1 0 0 0 0 0 .5 0");
     
        filter.append("svg:feGaussianBlur")
            .attr("result", "blurOut")
            .attr("in", "matrixOut")
            .attr("stdDeviation", "3");
     
        filter.append("svg:feBlend")
            .attr("in", "SourceGraphic")
            .attr("in2", "blurOut")
            .attr("mode", "normal");

    },

    onContextChange: function() {
        
        this.container.html("");
        this.setupD3();
        
        this.selectedFilters = [];
    },
    
    

    onJobDone: function(event) {
        this.getResults();
    },

    getResultURL: function(params) {
        var context = this.getContext();
        var search  = context.get("search");
        var url = sprintf("/en-US/splunkd/__raw/servicesNS/nobody/%s/search/jobs/%s/results_preview", Sideview.utils.getCurrentApp(), search.job.getSearchId());

        params["output_mode"] = "json_rows";
        return url + "?" + Sideview.utils.dictToString(params);
    },


    


    convertJSONResults: function(results) {
        if (!results) return {};
        var uniqueId = 1;
        var converted = {
            "name" : "__top",
            "id": "id" + uniqueId++,
            "children": []
        };
        // for bookkeeping
        var conversionMap = {};
        
        var rows   = results.rows;
        var fields = results.fields;

        var t = [
                    ["cisco_cdr","cucm_cdr","110137"],
                    ["cisco_cdr","cucm_cmr","148001"],
                    ["main","access_combined","4428"]
                ]
        
        
        var row, fieldValue, index;
        
        for (var i=0,len=rows.length;i<len;i++) {
            
            row = rows[i];
            var insertion = converted;
            var insertionMap = conversionMap;

            for (var j=0,rowLen=row.length;j<rowLen-1;j++) {
                var fieldName = fields[j];
                var fieldValue = row[j];
                if (!insertionMap.hasOwnProperty(fieldValue)) {
                    insertionMap[fieldValue] = {};
                    if (!insertion.hasOwnProperty("children")) {
                        insertion.children = [];
                    }
                    index = insertion.children.length;
                    insertion.children.push({
                        "field": fieldName,
                        "name": fieldValue,
                        "id" : "id" + uniqueId++,
                    });
                    insertion = insertion.children[index];
                    insertionMap = insertionMap[fieldValue];
                } 
                else {

                    for (var k=0,kLen=insertion.children.length;k<kLen;k++) {
                        if (insertion.children[k].name == fieldValue) {
                            insertion = insertion.children[k];
                            break;
                        }
                    }
                    insertionMap = insertionMap[fieldValue];
                }
                if (j==rowLen-2) {
                    insertion.size = row[j+1];
                }

            }
            
        }
        return converted
    },



    renderResults: function(json) {
        results = this.convertJSONResults(json);
        if(!results || results.length==0) {
            this.container.html('No content available.');
            return;
        }

        node = root = results;
        var nodes = this.treemap.nodes(root);
 
        var children = nodes.filter(function(d) {
            return !d.children;
        });
        var parents = nodes.filter(function(d) {
            return d.children;
        });
 
        // create parent cells
        var parentCells = this.chart.selectAll("g.cell.parent")
            .data(parents, function(d) {
                return "p-" + d.id;
            });
        var parentEnterTransition = parentCells.enter()
            .append("g")
            .attr("class", "cell parent")
            .on("click", function(d) {
                this.zoom(d);
            }.bind(this));

        parentEnterTransition.append("rect")
            .attr("width", function(d) {
                return Math.max(0.01, d.dx);
            })
            .attr("style",function(d) {
                if (d.name=="__top") return "display:none";
                else return "";
            })
            .attr("height",this.headerHeight)
            .style("fill", this.headerColor);
        
        parentEnterTransition.append('foreignObject')
            .attr("style",function(d) {
                if (d.name=="__top") return "display:none";
                else return "";
            })
            .attr("class", "foreignObject")
            .append("xhtml:body")
            .attr("class", "labelbody")
            .append("div")
            .attr("class", "label");

        // update transition
        var parentUpdateTransition = parentCells.transition().duration(this.transitionDuration);
        parentUpdateTransition.select(".cell")
            .attr("transform", function(d) {
                return "translate(" + d.dx + "," + d.y + ")";
            });
        parentUpdateTransition.select("rect")
            .attr("width", function(d) {
                return Math.max(0.01, d.dx);
            })
            .attr("height", this.headerHeight)
            .style("fill", this.headerColor);
        parentUpdateTransition.select(".foreignObject")
            .attr("width", function(d) {
                return Math.max(0.01, d.dx);
            })
            .attr("height", this.headerHeight)
            .select(".labelbody .label")
            .text(function(d) {
                return d.name;
            });
        // remove transition
        parentCells.exit()
            .remove();
 
        // create children cells
        var childrenCells = this.chart.selectAll("g.cell.child")
            .data(children, function(d) {
                return "c-" + d.id;
            });
        // enter transition
        var moduleReference = this;
        var childEnterTransition = childrenCells.enter()
            .append("g")
            .attr("class", "cell child")
            .on("click", function(d) {
                if (moduleReference.selectedNode) {
                    // yes this is crazy to select everything just to clear
                    // the outline, but i had massive troubles using a saved
                    // reference.   TODO - storm this castle again.
                    d3.selectAll("g")
                        .attr("filter", "")
                        .select(".background")
                        .style("stroke", "#FFFFFF");
                    
                }
                moduleReference.selectedNode = d.id;
                moduleReference.highlightNode(this);
                
                moduleReference.onChildClick(d);
            })
            .on("mouseover", function(d) {
                this.parentNode.appendChild(this); // workaround for bringing elements to the front (ie z-index)

                moduleReference.highlightNode(this);
                
            })
            .on("mouseout", function(d) {
                if (moduleReference.selectedNode && moduleReference.selectedNode==d.id) return;
                moduleReference.unHighlightNode(this);
            });
        childEnterTransition.append("rect")
            .classed("background", true)
            .style("fill", function(d) {
                return color(d.parent.name);
            });
        childEnterTransition.append('foreignObject')
            .attr("class", "foreignObject")
            .attr("width", function(d) {
                return Math.max(0.01, d.dx);
            })
            .attr("height", function(d) {
                return Math.max(0.01, d.dy);
            })
            .append("xhtml:body")
            .attr("class", "labelbody")
            .append("div")
            .attr("class", "label")
            .text(function(d) {
                return d.name;
            });
        
        
        if ($.browser.msie) {
            childEnterTransition.selectAll(".foreignObject .labelbody .label")
                .style("display", "none");
        } else {
            childEnterTransition.selectAll(".foreignObject")
                .style("display", "none");
        }
 
        // update transition
        var childUpdateTransition = childrenCells.transition().duration(this.transitionDuration);
        childUpdateTransition.select(".cell")
            .attr("transform", function(d) {
                return "translate(" + d.x  + "," + d.y + ")";
            });
        childUpdateTransition.select("rect")
            .attr("width", function(d) {
                return Math.max(0.01, d.dx);
            })
            .attr("height", function(d) {
                return d.dy;
            })
            .style("fill", function(d) {
                return color(d.parent.name);
            });
        childUpdateTransition.select(".foreignObject")
            .attr("width", function(d) {
                return Math.max(0.01, d.dx);
            })
            .attr("height", function(d) {
                return Math.max(0.01, d.dy);
            })
            .select(".labelbody .label")
            .text(function(d) {
                return d.name;
            });
        // exit transition
        childrenCells.exit()
            .remove();


        function size(d) {
            return d.size;
        }


        function count(d) {
            return 1;
        }


        d3.select("select").on("change", function() {
            this.treemap.value(this.value == "size" ? size : count)
                .nodes(root);
            this.zoom(node);
            node.exit().remove()
        });
 
        this.zoom(node);
    }, 

    highlightNode: function(d) {
        d3.select(d)
            .attr("filter", "url(#outerDropShadow)")
            .select(".background")
            .style("stroke", "#000000");
    },

    unHighlightNode: function(d) {
        d3.select(d)
            .attr("filter", "")
            .select(".background")
            .style("stroke", "#FFFFFF")
    },

    onChildClick: function(d) {
        // TODO - walk up through the parents and get a searchterm for 
        // each of them. 
        var selectedFilters = [];
        this.activeRect = d;
        var walker = d;
        while (walker.hasOwnProperty("parent")) {
            selectedFilters.push({
                "field" : walker.field,
                "value" : walker.name
            });
            walker =walker.parent;
        }
        if (d.hasOwnProperty("parent")) {
            this.zoom(d.parent);
        }

        this.selectedFilters = selectedFilters;
        this.pushContextToChildren();
    },

    isReadyForContextPush: function($super) {
        if (!this.selectedFilters) alert('Error - TreeMap doesnt have any selectedFilters property at all.');
        else if (this.selectedFilters.length>0 || this.getParam("default")) {
            return $super();
        } 
        return Splunk.Module.CANCEL;
    },

    
    getModifiedContext: function() {
        var name = this.getParam("name");
        var searchTerms = Sideview.utils.getSearchTermsFromFilters(this.selectedFilters);
        var context = this.getContext();
        var f
        for (var i=0,len=this.selectedFilters.length;i<len;i++) {
            f = this.selectedFilters[i];
            context.set(name + "." + f.field, Sideview.utils.escapeForSearchLanguage(f.value));
            context.set(name + "." + f.field + ".rawValue", f.value);
        }
        context.set(name + ".searchTerms", searchTerms.join(" "));
        context.set(name+ ".filters", JSON.stringify(this.selectedFilters));
        return context;
    },  

    renderStackedHeaders: function(d) {
        this.stackedHeaderDiv.html("");
        while (d.parent && (d.parent.name !=d.name)) {
            d = d.parent;
            var header = $("<div>")
                .addClass("stackedHeader")
                .addClass("label")
                .width(this.chartWidth-4)
            if (d.name=="__top") {
                header.text("back to top")
            } else {
                header.text(d.field +"=" + d.name);
            }
            header.node = d;
            header.click(function() {
                this.zoom(d);
            }.bind(this))
            this.stackedHeaderDiv.prepend(header);
        }
    },


    zoom: function(d) {
        this.treemap
            .padding([this.headerHeight/(this.chartHeight/d.dy), 0, 0, 0])
            .nodes(d);

        this.renderStackedHeaders(d);

        // moving the next two lines above treemap layout messes up padding of zoom result
        var kx = this.chartWidth  / d.dx;
        var ky = this.chartHeight / d.dy;
        var level = d;

        this.xscale.domain([d.x, d.x + d.dx]);
        this.yscale.domain([d.y, d.y + d.dy]);

        if (node != level) {
            if ($.browser.msie) {
                this.chart.selectAll(".cell.child .foreignObject .labelbody .label")
                    .style("display", "none");
            } else {
                this.chart.selectAll(".cell.child .foreignObject")
                    .style("display", "none");
            }
        }

        var zoomTransition = this.chart.selectAll("g.cell").transition().duration(this.transitionDuration)
            .attr("transform", function(d) {
                return "translate(" + this.xscale(d.x) + "," + this.yscale(d.y) + ")";
            }.bind(this))
            .each("end", function(d, i) {
                if (!i && (level !== self.root)) {
                    this.chart.selectAll(".cell.child")
                        .filter(function(d) {
                            return d.parent === self.node; // only get the children for selected group
                        })
                        .select(".foreignObject .labelbody .label")
                        .style("color", function(d) {
                            return idealTextColor(color(d.parent.name));
                        });

                    if ($.browser.msie) {
                        this.chart.selectAll(".cell.child")
                            .filter(function(d) {
                                return d.parent === self.node; // only get the children for selected group
                            })
                            .select(".foreignObject .labelbody .label")
                            .style("display", "")
                    } else {
                        this.chart.selectAll(".cell.child")
                            .filter(function(d) {
                                return d.parent === self.node; // only get the children for selected group
                            })
                            .select(".foreignObject")
                            .style("display", "")
                    }
                }
            }.bind(this));

        zoomTransition.select(".foreignObject")
            .attr("width", function(d) {
                return Math.max(0.01, kx * d.dx);
            })
            .attr("height", function(d) {
                return d.children ? this.headerHeight: Math.max(0.01, ky * d.dy);
            }.bind(this))
            .select(".labelbody .label")
            .text(function(d) {
                return d.name;
            });

        // update the width/height of the rects
        zoomTransition.select("rect")
            .attr("width", function(d) {
                return Math.max(0.01, kx * d.dx);
            })
            .attr("height", function(d) {
                return d.children ? this.headerHeight : Math.max(0.01, ky * d.dy);
            }.bind(this))
            .style("fill", function(d) {
                return d.children ? this.headerColor : color(d.parent.name);
            }.bind(this));

        node = d;

        if (d3.event) {
            d3.event.stopPropagation();
        }
    }, 

    //and another one
    textHeight: function(d) {
        var ky = this.chartHeight / d.dy;
        yscale.domain([d.y, d.y + d.dy]);
        return (ky * d.dy) / this.headerHeight;
    }
})



var color = d3.scale.category10();
function getRGBComponents (color) {
    var r = color.substring(1, 3);
    var g = color.substring(3, 5);
    var b = color.substring(5, 7);
    return {
        R: parseInt(r, 16),
        G: parseInt(g, 16),
        B: parseInt(b, 16)
    };
}


function idealTextColor (bgColor) {
    var nThreshold = 105;
    var components = getRGBComponents(bgColor);
    var bgDelta = (components.R * 0.299) + (components.G * 0.587) + (components.B * 0.114);
    return ((255 - bgDelta) < nThreshold) ? "#000000" : "#ffffff";
}