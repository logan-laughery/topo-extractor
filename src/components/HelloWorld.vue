<template>
  <div class="hello">
    <!-- <div id="the-viewer"> 
      <div id="viewer" class="pdfViewer"></div> 
    </div>  -->
    <div class="canvas-holder">
      <canvas id="the-canvas"></canvas>

      <div
        v-for="(measure, i) in measures"
        :style="measure.style" :key="i"
        @click="getPositionClick($event, measure)"
      >
        {{measure.layerName}}
      </div>
    </div>
    <h1>Rendering PDF: {{renderingPdf}}</h1>
    <h1>{{ msg }}</h1>
    <input v-model="searchPhrase"/>
    <button @click="search">Search</button>

    <div v-for="(xrefNode, i) in xrefNodes" :key="i">
      <span :title="xrefNode.path">
        {{xrefNode.textContent}}
        <button
          v-if="xrefNode.expandable && !xrefNode.expanded"
          @click="expand(xrefNode, i)"
        >
          Expand
        </button>
      </span>
    </div>
    <!-- <div v-for="layer in layers" :key="layer.key">
      <span>
        {{layer.name}} - {{layer.visible}}
        <button
          @click="toggleOptionalConfig(layer)"
        >
          Toggle Visibility
        </button>
      </span>
    </div> -->
    <p>
      For a guide and recipes on how to configure / customize this project,<br>
      check out the
      <a href="https://cli.vuejs.org" target="_blank" rel="noopener">vue-cli documentation</a>.
    </p>
    <h3>Installed CLI Plugins</h3>
    <ul>
      <li><a href="https://github.com/vuejs/vue-cli/tree/dev/packages/%40vue/cli-plugin-babel" target="_blank" rel="noopener">babel</a></li>
      <li><a href="https://github.com/vuejs/vue-cli/tree/dev/packages/%40vue/cli-plugin-eslint" target="_blank" rel="noopener">eslint</a></li>
    </ul>
    <h3>Essential Links</h3>
    <ul>
      <li><a href="https://vuejs.org" target="_blank" rel="noopener">Core Docs</a></li>
      <li><a href="https://forum.vuejs.org" target="_blank" rel="noopener">Forum</a></li>
      <li><a href="https://chat.vuejs.org" target="_blank" rel="noopener">Community Chat</a></li>
      <li><a href="https://twitter.com/vuejs" target="_blank" rel="noopener">Twitter</a></li>
      <li><a href="https://news.vuejs.org" target="_blank" rel="noopener">News</a></li>
    </ul>
    <h3>Ecosystem</h3>
    <ul>
      <li><a href="https://router.vuejs.org" target="_blank" rel="noopener">vue-router</a></li>
      <li><a href="https://vuex.vuejs.org" target="_blank" rel="noopener">vuex</a></li>
      <li><a href="https://github.com/vuejs/vue-devtools#vue-devtools" target="_blank" rel="noopener">vue-devtools</a></li>
      <li><a href="https://vue-loader.vuejs.org" target="_blank" rel="noopener">vue-loader</a></li>
      <li><a href="https://github.com/vuejs/awesome-vue" target="_blank" rel="noopener">awesome-vue</a></li>
    </ul>
  </div>
</template>

<script>
import * as pdfjsLib from 'pdfjs-dist'
import * as modifiedPdfLib from './pdf';
import proj4 from 'proj4';

pdfjsLib.GlobalWorkerOptions.workerSrc ="https://cdn.jsdelivr.net/npm/pdfjs-dist@2.12.313/build/pdf.worker.min.js";

function toText(node) {
  var name = node.name;
  var obj = node.obj;
  var description = '';
  if (modifiedPdfLib.isDict(obj)) {
    description = name + ' (dict)';
  } else if (modifiedPdfLib.isArray(obj)) {
    description = name + ' (array)';
  } else if (modifiedPdfLib.isStream(obj)) {
    description = name + ' (stream)';
  } else if (modifiedPdfLib.isName(obj)) {
    description = name + ' = /' + obj.name;
  } else if (modifiedPdfLib.isNum(obj)) {
    description = name + ' = ' + obj;
  } else if (modifiedPdfLib.isBool(obj)) {
    description = name + ' = ' + obj;
  } else if (modifiedPdfLib.isString(obj)) {
    if (obj.startsWith('\u00FE\u00FF')) {
      // Text encoded as UTF-16BE bytes, see §7.9.2.2 "Text String Type" of PDF 32000-1:2008
      // https://wwwimages2.adobe.com/content/dam/Adobe/en/devnet/pdf/pdfs/PDF32000_2008.pdf#G6.1957385
      var decoded = '';
      for (var i = 2; i < obj.length; i += 2) {
        decoded += String.fromCharCode(obj.charCodeAt(i) << 8 | obj.charCodeAt(i + 1));
      }
      obj = decoded;
    }
    description = name + ' = ' + JSON.stringify(obj) + '';
  } else {
    console.log(obj);
    throw new Error('Unknown obj');
  }

  if (node.ref) {
    description += ' [id: ' + node.ref.num + ', gen: ' + node.ref.gen + ']';
  }
  return description;
}

function Node(obj, name, depth, ref) {
  this.obj = obj;
  this.name = name;
  this.depth = depth;
  this.ref = ref;
}

Node.prototype = {
  get children() {
    var depth = this.depth + 1;
    var obj = this.obj;
    var children = [];
    if (modifiedPdfLib.isDict(obj) || modifiedPdfLib.isStream(obj)) {
      var map;
      if (modifiedPdfLib.isDict(obj)) {
        map = obj.map;
      } else {
        map = obj.dict.map;
      }
      for (var key in map) {
        var value = map[key];
        children.push(new Node(value, key, depth));
      }
    } else if (modifiedPdfLib.isArray(obj)) {
      for (var i = 0, ii = obj.length; i < ii; i++) {
        const nextValue = obj[i];
        children.push(new Node(nextValue, i, depth));
      }
    }
    return children;
  }
};

// function addChildren(node, nextNodes) {
//   var children = node.children;
//   for (var i = children.length - 1; i >= 0; i--) {
//     nextNodes.push(children[i]);
//   }
// }

export default {
  name: 'HelloWorld',
  data() {
    return {
      renderingPdf: true,
      pdf: null,
      pdfDoc: null,
      page: null,
      content: null,
      canvas: null,
      viewport: null,
      xref: null,
      root: null,
      layers: [],
      xrefNodes: [],
      searchableNodes: [],
      measures: [],
      visibleLayers: {
        'Map Frame': true,
        'Terrain': true,
        'Contours': true
      }
    };
  },
  async mounted() {
    var url = 'https://prd-tnm.s3.amazonaws.com/StagedProducts/Maps/USTopo/PDF/WI/WI_Prairie_du_Chien_20181119_TM_geo.pdf';
    console.log('Going to load pdf');

    // Asynchronous download of PDF
    var loadingTask = pdfjsLib.getDocument(url);
    console.log(pdfjsLib);
    const consoleLogger = console.log;

    const pdf = await loadingTask.promise;
    const uintarray = await pdf.saveDocument();
    consoleLogger(modifiedPdfLib);
    const pdfDoc = new modifiedPdfLib.PDFDocument(null, uintarray);
    pdfDoc.parseStartXRef();
    pdfDoc.parse();
    this.xref = pdfDoc.xref;

    this.pdfDoc = pdfDoc;
    this.pdf = pdf;
    consoleLogger('PDF loaded', pdf);
    consoleLogger('XRef loaded', this.xref);
      
    // Fetch the first page
    var pageNumber = 1;
    const page = await pdf.getPage(pageNumber);

    // page.parseStartXRef();
    // page.parse();

    this.xref = pdfDoc.xref;
    this.root = this.xref.trailer;

    consoleLogger('Page loaded', page);
    
    var scale = 1; // should really be 96 as 1 inch = 96px;
    var viewport = page.getViewport({scale: scale});

    // Prepare canvas using PDF page dimensions
    var canvas = document.getElementById('the-canvas');
    var context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    this.context = context;
    this.canvas = canvas;
    this.viewport = viewport;
    this.page = page;
    this.optionalConfig = await pdf.getOptionalContentConfig();

    this.optionalConfig._groups.forEach((value, key) => {
      const visible = this.visibleLayers[value.name] || false;
      this.layers.push({
        key,
        name: value.name,
        visible,
      });
      this.optionalConfig.setVisibility(key, visible);
    });

    //   if (value.name === 'Barcode') {
    //     consoleLogger(`Setting ${value.name} to be hidden`);
    //     optionalConfig.setVisibility(key, false);
    //   }
    // });
    // consoleLogger(optionalConfig._groups);

    // // Render PDF page into canvas context
    var renderContext = {
      canvasContext: context,
      viewport: viewport,
      optionalContentConfigPromise: Promise.resolve(this.optionalConfig)
    };
    var renderTask = page.render(renderContext);

    await renderTask.promise;
    
    consoleLogger('Page finished rendering');

    this.renderingPdf = false;

    const node = [new Node(this.root, 'Trailer', 0)];
    this.searchableNodes.push(new Node(this.root, 'Trailer', 0));
    this.walk(node, '');
    this.measures = this.getMeasures();
    consoleLogger(this.measures);
  },
  methods: {
    getPositionClick(event, measure) {
      event.preventDefault();
      console.log(event);
      console.log(proj4);

      // const rect = event.target.getBoundingClientRect();
      // const x = event.clientX - rect.left; //x position within the element.
      // const y = event.clientY - rect.top;

      // "PROJCS["GCS North American 1983 UTM Zone 15N (Calculated)",GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",-93.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]"
      // ~px on pdf
      // left: 257px;
      // top: 174px;

      // EPSG:4326 WGS 84
      // lat: 43.124
      // lon: -91.25

      // EPSG:3857 WGS 84 / Pseudo-Mercator
      // Y: 5330865.00
      // X: -10157903.53
      // const result = proj4(measure.measure.gcs.map.WKT, proj4.defs('EPSG:4326'), [x, y]);
      // const result2 = proj4(measure.measure.gcs.map.WKT).inverse([x, y]);
      const result = proj4(measure.measure.gcs.map.WKT).inverse([43.124, -91.25]);
      const result2 = proj4(measure.measure.gcs.map.WKT).forward([43.124, -91.25]);
      //const result = proj4(measure.measure.gcs.map.WKT).forward([x, y]);
      //const result2 = proj4(measure.measure.gcs.map.WKT).inverse([x, y]);

      console.log(result);
      console.log(result2);
      // console.log(result);
      // console.log(result2);
      // console.log(result3);
      // console.log(result4);
    },
    expand({node, path}, i) {
      console.log('would expand here', node);
      if (node.expanded) {
        return;
      }

      this.xrefNodes[i].expanded = true;

      const children = node.children.reverse();
      this.walk(children, path + ' -> ');
    },
    visit(node, parentpath) {
      var obj = node.obj;

      var description = toText(node);

      const readableNode = {
        node,
        textContent: description,
        path: parentpath + node.name
      };

      if (modifiedPdfLib.isDict(obj) || modifiedPdfLib.isStream(obj) || modifiedPdfLib.isArray(obj)) {
        readableNode.expandable = true;
      }

      this.xrefNodes.push(readableNode);

      console.log(readableNode.path);
    },
    walk(nodesToVisit, parentpath) {
      while (nodesToVisit.length) {
        var currentNode = nodesToVisit.pop();
        if (currentNode.depth > 20) {
          throw new Error('Max depth exceeded.');
        }

        if (modifiedPdfLib.isRef(currentNode.obj)) {
          var fetched = this.xref.fetch(currentNode.obj);
          currentNode = new Node(fetched, currentNode.name, currentNode.depth, currentNode.obj);
        }

        this.visit(currentNode, parentpath, {});
      }
    },
    // Say we pass in something like Trailer.Root.Pages.Kids.0.VP.1.Measure
    traverser(nodesToVisit, search, index) {
      const splitSearch = search.split('.');
      console.log(index, nodesToVisit);
      const [matchingNode] = nodesToVisit.map(currentNode => {
        if (currentNode.depth > 20) {
          throw new Error('Max depth exceeded.');
        }

        if (modifiedPdfLib.isRef(currentNode.obj)) {
          var fetched = this.xref.fetch(currentNode.obj);

          return new Node(fetched, currentNode.name, currentNode.depth, currentNode.obj);
        }

        return currentNode;
      }).filter(currentNode => {
          return splitSearch[index] === `${currentNode.name}`;
      });
      
      const lastIndex = splitSearch.length == (index + 1);

      if (matchingNode && lastIndex) {
        return matchingNode;
      } else if (matchingNode) {
        const matchingChild = this.traverser(matchingNode.children, search, index + 1);

        return matchingChild;
      }

      throw new Error('Path not found');
    },
    search() {
      const result = this.traverser(this.searchableNodes, this.searchPhrase, 0);
      console.log(result);
    },
    getMeasures() {
      const vp = this.traverser(this.searchableNodes, 'Trailer.Root.Pages.Kids.0.VP', 0);
      const vpChildren = vp.children;

      const measureLayers = vpChildren.map((vpChild, i) => {
        const basePath = 'Trailer.Root.Pages.Kids.0.VP.' + i;
        const vpLayerName = this.traverser(this.searchableNodes, basePath + '.Name', 0);
        const vpLayerBbox = this.traverser(this.searchableNodes, basePath + '.BBox', 0);
        const vpLayerMeasureBounds = this.traverser(this.searchableNodes, basePath + '.Measure.Bounds', 0);
        const vpLayerMeasureGcs = this.traverser(this.searchableNodes, basePath + '.Measure.GCS', 0);
        const vpLayerMeasureGpts = this.traverser(this.searchableNodes, basePath + '.Measure.GPTS', 0);
        const vpLayerMeasureLpts = this.traverser(this.searchableNodes, basePath + '.Measure.LPTS', 0);

        const totalHeight = 2088;
        const [x1, y1, x2, y2] = vpLayerBbox.obj;

        // left: 257px;
        // top: 174px;

        // should be:
        // lat: 43.124
        // lon: 91.25


        return {
          // layerName: vpLayerName.obj,
          layerName: vpLayerName.obj.replace('ÿþ', '').replaceAll('\u0000', ''),
          bbox: vpLayerBbox.obj,
          style: {
            width: x2 - x1 + 'px',
            height: y1 - y2 + 'px',
            position: 'absolute',
            left: x1 + 'px',
            'top': totalHeight - y1 + 'px',
            'border-color': 'black',
            'border-width': '1px',
            'border-style': 'solid'
          },
          measure: {
            bounds: vpLayerMeasureBounds.obj,
            gcs: vpLayerMeasureGcs.obj,
            gpts: vpLayerMeasureGpts.obj,
            lpts: vpLayerMeasureLpts.obj,
          }
        }
      });

      return measureLayers;
    },
    async toggleOptionalConfig(upatedLayer) {
      const pdf = this.pdf;
      console.log('Set Visibility', pdf);

      this.layers.forEach((layer, i) => {
        if (layer.key === upatedLayer.key) {
          this.layers[i].visible = !upatedLayer.visible;
        }

        this.optionalConfig.setVisibility(layer.key, layer.visible);
      });

      // Render PDF page into canvas context
      var renderContext = {
        canvasContext: this.context,
        viewport: this.viewport,
        optionalContentConfigPromise: Promise.resolve(this.optionalConfig)
      };


      this.renderingPdf = true;

      await this.page.render(renderContext).promise;

      this.renderingPdf = false;
    },
  },
  props: {
    msg: String
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
h3 {
  margin: 40px 0 0;
}
ul {
  list-style-type: none;
  padding: 0;
}
li {
  display: inline-block;
  margin: 0 10px;
}
a {
  color: #42b983;
}
#the-viewer {
  position: absolute;
}
#the-canvas {
  position: absolute;
  left: 0;
  top: 0;
}
</style>
