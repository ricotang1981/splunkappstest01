

Splunk.Module.SankeyChart = $.klass(Sideview.utils.getBaseClass(true), {

    initialize: function($super, container) {
        $super(container);
        
        this.formatNumber = d3.format(",.0f");
        this.color = d3.scale.category20();
        
    },
    requiresResults: function() {return true;},

    setupD3: function() {
        this.container.html("");
        var containerId = this.container.attr("id");
        var margin = {top: 1, right: 1, bottom: 6, left: 1};

        this.width = 960 - margin.left - margin.right,
        this.height = 500 - margin.top - margin.bottom;
        this.svg = d3.select("#" + containerId).append("svg")
            .attr("width", this.width + margin.left + margin.right)
            .attr("height", this.height + margin.top + margin.bottom)
          .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        this.sankey = d3.sankey()
            .nodeWidth(15)
            .nodePadding(10)
            .size([this.width, this.height]);
    },

    format: function(d) { 
        return this.formatNumber(d) + " TWh";
    },

    getTitleText: function(d) {
        return d.source.name + " -- " + d.target.name + "\n" + this.format(d.value); 
    },

    getOtherTitleText: function(d) {
        return d.name + "\n" + this.format(d.value);
    },

    getFillColor: function(d) {
        return d.color = this.color(d.name.replace(/ .*/, ""));
    },

    isOnLeftSide: function(d) {
        return d.x < this.width/2;
    },

    

    onContextChange: function() {
        this.setupD3();
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

    renderResults: function(results) {
        var translatedResults = this.translateResults(results);
        //var translatedResults = this.getMockResults();

        this.sankey
          .nodes(translatedResults.nodes)
          .links(translatedResults.links)
          .layout(32,this.width);

        var link = this.svg.append("g").selectAll(".link")
          .data(translatedResults.links)
        .enter().append("path")
          .attr("class", "link")
          .attr("d", this.sankey.link())
          .style("stroke-width", function(d) { return Math.max(1, d.dy); })
          .sort(function(a, b) { return b.dy - a.dy; });

        link.append("title")
          .text(this.getTitleText.bind(this));

        var node = this.svg.append("g").selectAll(".node")
          .data(translatedResults.nodes)
        .enter().append("g")
          .attr("class", "node")
          .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; })
        .call(d3.behavior.drag()
          .origin(function(d) { return d; })
          .on("dragstart", function() { this.parentNode.appendChild(this); })
          .on("drag", dragmove));

        node.append("rect")
          .attr("height", function(d) { return d.dy; })
          .attr("width", this.sankey.nodeWidth())
          .style("fill", this.getFillColor.bind(this))
          .style("stroke", function(d) { return d3.rgb(d.color).darker(2); })
        .append("title")
          .text(this.getOtherTitleText.bind(this));

        node.append("text")
          .attr("x", -6)
          .attr("y", function(d) { return d.dy / 2; })
          .attr("dy", ".35em")
          .attr("text-anchor", "end")
          .attr("transform", null)
          .text(function(d) { return d.name; })
        .filter(this.isOnLeftSide.bind(this))
          .attr("x", 6 + this.sankey.nodeWidth())
          .attr("text-anchor", "start");

        var moduleReference = this;
        function dragmove(d) {
            d3.select(this).attr("transform", "translate(" + d.x + "," + (d.y = Math.max(0, Math.min(moduleReference.height - d.dy, d3.event.y))) + ")");
            moduleReference.sankey.relayout();
            link.attr("d", moduleReference.sankey.link());
        }
    },

    translateResults: function(results) {
        var nodes = [];
        var links = [];
        var nodeNameToIndexMap = {};
        
        var row, val, link
        for (var i=0,len=results.rows.length;i<len;i++) {
            row = results.rows[i];
            for (var j=0;j<2;j++) {
                val = row[j];
                if (nodeNameToIndexMap.hasOwnProperty(val)) continue;
                else {
                    nodeNameToIndexMap[val] = nodes.length;
                    nodes.push({"name":val});
                }
            }
            links.push({
                "source" : nodeNameToIndexMap[row[0]],
                "target" : nodeNameToIndexMap[row[1]],
                "value" : row[2]
            });
        }
        return {
            "nodes" : nodes,
            "links" : links
        };

    },

    getMockResults: function() {
        return {"nodes":[
            {"name":"Agricultural 'waste'"},
            {"name":"Bio-conversion"},
            {"name":"Liquid"},
            {"name":"Losses"},
            {"name":"Solid"},
            {"name":"Gas"},
            {"name":"Biofuel imports"},
            {"name":"Biomass imports"},
            {"name":"Coal imports"},
            {"name":"Coal"},
            {"name":"Coal reserves"},
            {"name":"District heating"},
            {"name":"Industry"},
            {"name":"Heating and cooling - commercial"},
            {"name":"Heating and cooling - homes"},
            {"name":"Electricity grid"},
            {"name":"Over generation / exports"},
            {"name":"H2 conversion"},
            {"name":"Road transport"},
            {"name":"Agriculture"},
            {"name":"Rail transport"},
            {"name":"Lighting & appliances - commercial"},
            {"name":"Lighting & appliances - homes"},
            {"name":"Gas imports"},
            {"name":"Ngas"},
            {"name":"Gas reserves"},
            {"name":"Thermal generation"},
            {"name":"Geothermal"},
            {"name":"H2"},
            {"name":"Hydro"},
            {"name":"International shipping"},
            {"name":"Domestic aviation"},
            {"name":"International aviation"},
            {"name":"National navigation"},
            {"name":"Marine algae"},
            {"name":"Nuclear"},
            {"name":"Oil imports"},
            {"name":"Oil"},
            {"name":"Oil reserves"},
            {"name":"Other waste"},
            {"name":"Pumped heat"},
            {"name":"Solar PV"},
            {"name":"Solar Thermal"},
            {"name":"Solar"},
            {"name":"Tidal"},
            {"name":"UK land based bioenergy"},
            {"name":"Wave"},
            {"name":"Wind"}
            ],
        "links":[
            {"source":0,"target":1,"value":124.729},
            {"source":1,"target":2,"value":0.597},
            {"source":1,"target":3,"value":26.862},
            {"source":1,"target":4,"value":280.322},
            {"source":1,"target":5,"value":81.144},
            {"source":6,"target":2,"value":35},
            {"source":7,"target":4,"value":35},
            {"source":8,"target":9,"value":11.606},
            {"source":10,"target":9,"value":63.965},
            {"source":9,"target":4,"value":75.571},
            {"source":11,"target":12,"value":10.639},
            {"source":11,"target":13,"value":22.505},
            {"source":11,"target":14,"value":46.184},
            {"source":15,"target":16,"value":104.453},
            {"source":15,"target":14,"value":113.726},
            {"source":15,"target":17,"value":27.14},
            {"source":15,"target":12,"value":342.165},
            {"source":15,"target":18,"value":37.797},
            {"source":15,"target":19,"value":4.412},
            {"source":15,"target":13,"value":40.858},
            {"source":15,"target":3,"value":56.691},
            {"source":15,"target":20,"value":7.863},
            {"source":15,"target":21,"value":90.008},
            {"source":15,"target":22,"value":93.494},
            {"source":23,"target":24,"value":40.719},
            {"source":25,"target":24,"value":82.233},
            {"source":5,"target":13,"value":0.129},
            {"source":5,"target":3,"value":1.401},
            {"source":5,"target":26,"value":151.891},
            {"source":5,"target":19,"value":2.096},
            {"source":5,"target":12,"value":48.58},
            {"source":27,"target":15,"value":7.013},
            {"source":17,"target":28,"value":20.897},
            {"source":17,"target":3,"value":6.242},
            {"source":28,"target":18,"value":20.897},
            {"source":29,"target":15,"value":6.995},
            {"source":2,"target":12,"value":121.066},
            {"source":2,"target":30,"value":128.69},
            {"source":2,"target":18,"value":135.835},
            {"source":2,"target":31,"value":14.458},
            {"source":2,"target":32,"value":206.267},
            {"source":2,"target":19,"value":3.64},
            {"source":2,"target":33,"value":33.218},
            {"source":2,"target":20,"value":4.413},
            {"source":34,"target":1,"value":4.375},
            {"source":24,"target":5,"value":122.952},
            {"source":35,"target":26,"value":839.978},
            {"source":36,"target":37,"value":504.287},
            {"source":38,"target":37,"value":107.703},
            {"source":37,"target":2,"value":611.99},
            {"source":39,"target":4,"value":56.587},
            {"source":39,"target":1,"value":77.81},
            {"source":40,"target":14,"value":193.026},
            {"source":40,"target":13,"value":70.672},
            {"source":41,"target":15,"value":59.901},
            {"source":42,"target":14,"value":19.263},
            {"source":43,"target":42,"value":19.263},
            {"source":43,"target":41,"value":59.901},
            {"source":4,"target":19,"value":0.882},
            {"source":4,"target":26,"value":400.12},
            {"source":4,"target":12,"value":46.477},
            {"source":26,"target":15,"value":525.531},
            {"source":26,"target":3,"value":787.129},
            {"source":26,"target":11,"value":79.329},
            {"source":44,"target":15,"value":9.452},
            {"source":45,"target":1,"value":182.01},
            {"source":46,"target":15,"value":19.013},
            {"source":47,"target":15,"value":289.366}
        ]}

    }

    



})


 