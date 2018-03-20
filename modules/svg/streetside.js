import _throttle from 'lodash-es/throttle';
import { select as d3_select } from 'd3-selection';
import { svgPath, svgPointTransform } from './index';
import { services } from '../services';


export function svgStreetside(projection, context, dispatch) {
    var throttledRedraw = _throttle(function () { dispatch.call('change'); }, 1000);
    var minZoom = 12;
    var minMarkerZoom = 16;
    var minViewfieldZoom = 18;
    var layer = d3_select(null);
    var _streetside;


    function init() {
        if (svgStreetside.initialized) return;  // run once
        svgStreetside.enabled = false;
        svgStreetside.initialized = true;
        // console.log("svg: streetside initialized....");
    }


    function getService() {
        if (services.streetside && !_streetside) {
            _streetside = services.streetside;
            _streetside.event.on('loadedImages', throttledRedraw);
        } else if (!services.streetside && _streetside) {
            _streetside = null;
        }
        
        return _streetside;
    }


    function showLayer() {
        var service = getService();
        if (!service) return;

        service.loadViewer(context);
        editOn();

        layer
            .style('opacity', 0)
            .transition()
            .duration(250)
            .style('opacity', 1)
            .on('end', function () { dispatch.call('change'); });
    }


    function hideLayer() {
        var service = getService();
        if (service) {
            service.hideViewer();
        }

        throttledRedraw.cancel();

        layer
            .transition()
            .duration(250)
            .style('opacity', 0)
            .on('end', editOff);
    }


    function editOn() {
        layer.style('display', 'block');
    }


    function editOff() {
        layer.selectAll('.viewfield-group').remove();
        layer.style('display', 'none');
    }


    function click(d) {
        // console.log("svg: map was clicked with streetside on, here is the passed object: ", d);
        var service = getService();
        if (!service) return;

        service
            .selectImage(d)
            .updateViewer(d.key, context)
            .showViewer();

        context.map().centerEase(d.loc);
    }


    function mouseover(d) {
        var service = getService();
        if (service) service.setStyles(d);
    }


    function mouseout() {
        var service = getService();
        if (service) service.setStyles(null);
    }


    function transform(d) {
        var t = svgPointTransform(projection)(d);
        if (d.ca) {
            t += ' rotate(' + Math.floor(d.ca) + ',0,0)';
        }
        return t;
    }


    function update() {
        // console.log("svg: update called....");
        var viewer = d3_select('#photoviewer');
        var selected = viewer.empty() ? undefined : viewer.datum();

        var z = ~~context.map().zoom();
        var showMarkers = (z >= minMarkerZoom);
        var showViewfields = (z >= minViewfieldZoom);

        var service = getService();
        // gets the features from service cache
        var sequences = (service ? service.sequences(projection) : []);
        var images = (service && showMarkers ? service.images(projection) : []);
        var bubbles = (service && showMarkers ? service.bubbles(projection) : []);
        // console.log("     svg: update() bubbles", bubbles);
        // console.log("     svg: update() images", images);
        // var traces = layer.selectAll('.sequences').selectAll('.sequence')
        //     .data(sequences, function(d) { return d.properties.key; });

        // // exit
        // traces.exit()
        //     .remove();

        // // enter/update
        // traces = traces.enter()
        //     .append('path')
        //     .attr('class', 'sequence')
        //     .merge(traces)
        //     .attr('d', svgPath(projection).geojson);


        var groups = layer.selectAll('.markers').selectAll('.viewfield-group')
            .data(bubbles, function(d) { return d.key; });

        // exit
        groups.exit()
            .remove();

        // enter
        var groupsEnter = groups.enter()
            .append('g')
            .attr('class', 'viewfield-group')
            .on('mouseover', mouseover)
            .on('mouseout', mouseout)
            .on('click', click);

        groupsEnter
            .append('g')
            .attr('class', 'viewfield-scale');

        // update
        var markers = groups
            .merge(groupsEnter)
            .sort(function(a, b) {
                return (a === selected) ? 1
                    : (b === selected) ? -1
                    : b.loc[1] - a.loc[1];  // sort Y
            })
            .attr('transform', transform)
            .select('.viewfield-scale');


        markers.selectAll('circle')
            .data([0])
            .enter()
            .append('circle')
            .attr('dx', '0')
            .attr('dy', '0')
            .attr('r', '6');

        var viewfields = markers.selectAll('.viewfield')
            .data(showViewfields ? [0] : []);

        viewfields.exit()
            .remove();

        viewfields.enter()               // viewfields may or may not be drawn...
            .insert('path', 'circle')    // but if they are, draw below the circles
            .attr('class', 'viewfield')
            .attr('transform', 'scale(1.5,1.5),translate(-8, -13)')
            .attr('d', viewfieldPath);

        function viewfieldPath() {
            var d = this.parentNode.__data__;
            if (d.pano) {
                return 'M 8,13 m -10,0 a 10,10 0 1,0 20,0 a 10,10 0 1,0 -20,0';
            } else {
                return 'M 6,9 C 8,8.4 8,8.4 10,9 L 16,-2 C 12,-5 4,-5 0,-2 z';
            }
        }
    }


    function drawImages(selection) {
        // console.log("svg: drawImages called ....");
        var enabled = svgStreetside.enabled,
            service = getService();

        layer = selection.selectAll('.layer-streetside-images')
            .data(service ? [0] : []);

        layer.exit()
            .remove();

        var layerEnter = layer.enter()
            .append('g')
            .attr('class', 'layer-streetside-images')
            .style('display', enabled ? 'block' : 'none');

        // layerEnter
        //     .append('g')
        //     .attr('class', 'sequences');

        layerEnter
            .append('g')
            .attr('class', 'markers');

        layer = layerEnter
            .merge(layer);

        if (enabled) {
            if (service && ~~context.map().zoom() >= minZoom) {
                editOn();
                update();
                // console.log("svg: calling loadImages....");
                service.loadImages(projection);
            } else {
                editOff();
            }
        }
    }


    drawImages.enabled = function(_) {
        if (!arguments.length) return svgStreetside.enabled;
        svgStreetside.enabled = _;
        if (svgStreetside.enabled) {
            showLayer();
        } else {
            hideLayer();
        }
        dispatch.call('change');
        return this;
    };


    drawImages.supported = function() {
        return !!getService();
    };


    init();

    return drawImages;
}
