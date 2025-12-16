export class MapView {
    constructor(containerId, width, height) {
        this.containerId = containerId;
        // Width/Height are handled by CSS now
        this.map = null;
        this.svg = null;
        this.g = null;
        this.hexbin = d3.hexbin().radius(40); // Hexagon radius

        this.onBoroughClick = null; // Callback (might need adaptation for Leaflet)
        this.showSubway = false;

        // Data references
        this.data = [];
        this.filteredData = [];
        this.subwayData = [];

        // Visual scales
        this.priceColorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 500]);
        this.hexColorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([50, 300]); // Aggregated average price
        this.hexRadiusScale = d3.scaleSqrt().range([15, 38]); // Count -> Radius

        // Layer Groups
        this.subwayLayerGroup = L.layerGroup();
    }

    init(geoJson, data, subwayGeoJson) {
        // Note: geoJson (boroughs) is not used for basemap anymore, but could be an overlay
        this.data = data;

        // 1. Initialize Leaflet Map
        // Center NYC: 40.7128, -74.0060
        this.map = L.map(this.containerId.replace("#", "")).setView([40.73, -73.935], 11);

        // 2. Base Layers
        // 2. Base Layers
        const cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19,
            className: 'light-tiles' // Added for brightness control
        });

        const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19,
            className: 'dark-tiles' // User can tune brightness in CSS
        });

        const esriStreet = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri'
        });

        // Use Carto Light by default
        cartoLight.addTo(this.map);

        // 4. Prepare Subway Data
        if (subwayGeoJson) {
            this.subwayData = subwayGeoJson.features.map(f => {
                const [lon, lat] = f.geometry.coordinates;

                // Filter out New Jersey stations (HBLR, PATH in NJ)
                // Threshold: West of Hudson (-74.015) AND North of Battery Park (40.70)
                // Brooklyn Bay Ridge is West (-74.02) but South (40.63), so it stays.
                if (lon < -74.015 && lat > 40.70) {
                    return null;
                }

                // Parse line count to determine importance
                const props = f.properties || {};
                const desc = props.description || "";

                // 1. Parse NAME
                // Regex matches: <span class="atr-name">NAME</span>:</strong> <span class="atr-value">Real Name</span>
                // Use non-greedy match to get content inside span
                const nameMatch = desc.match(/NAME.*?atr-value">([^<]+)<\/span>/);
                let cleanName = props.name || "Station"; // Fallback
                if (nameMatch && nameMatch[1]) {
                    cleanName = nameMatch[1];
                }
                f.properties.cleanName = cleanName;

                // 2. Parse LINE for Importance
                const lineMatch = desc.match(/LINE.*?atr-value">([^<]+)<\/span>/);
                let lineCount = 1;
                if (lineMatch && lineMatch[1]) {
                    // Count lines (e.g. B-D-F-M -> 4)
                    lineCount = lineMatch[1].split(/[-,\s]+/).length;
                }
                f.properties.lineCount = lineCount;
                return f;
            }).filter(f => f); // Removo filtered NJ stations
        }

        // Layer Control
        const baseMaps = {
            "簡潔明亮 Light": cartoLight,
            "深色模式 Dark": cartoDark,
            "經典街道 Informative": esriStreet
        };

        const overlayMaps = {
            "🚇 地鐵站 Subway": this.subwayLayerGroup
        };

        L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(this.map);

        setTimeout(() => {
            this.map.invalidateSize();
        }, 200);

        // 3. Initialize SVG Overlay for D3 (Hexbins & Points)
        L.svg({ clickable: true }).addTo(this.map);

        // We bind d3 to the overlay pane
        const overlay = d3.select(this.map.getPanes().overlayPane).select("svg");

        // Leaflet's L.svg() creates an <svg> element, but NOT a <g> by default.
        // We need to check if it exists or append it.
        if (overlay.select("g").empty()) {
            this.g = overlay.append("g").attr("class", "leaflet-zoom-hide");
        } else {
            this.g = overlay.select("g").attr("class", "leaflet-zoom-hide");
        }

        this.svg = overlay;

        this.svg = overlay;

        // 4. Prepare Subway Data
        // Subway layer is already prepared in the 'Base Layers' section above
        // and added to the Layer Control. No need to call initSubwayLayer().

        // 5. Tooltip
        this.tooltip = d3.select("body").append("div")
            .attr("id", "tooltip")
            .style("opacity", 0)
            .style("position", "absolute")
            .style("background-color", "white")
            .style("border", "1px solid #ddd")
            .style("padding", "10px")
            .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)")
            .style("pointer-events", "none")
            .style("z-index", "2000");

        // 6. Events
        this.map.on("zoomend", () => this.updateView());
        this.map.on("moveend", () => this.updateView());
    }

    // Old manual methods removed in favor of Layer Control
    // initSubwayLayer() {}
    // toggleSubway(show) {}

    update(data, selectedBorough) {
        this.filteredData = data;

        // Dynamic Color Scale Update
        if (data && data.length > 0) {
            // Filter out zero or negative prices
            const validPrices = data.map(d => d.price).filter(p => p > 0);

            let minPrice = 0;
            let maxPrice = 500;

            if (validPrices.length > 0) {
                // Sort for quantile
                validPrices.sort((a, b) => a - b);

                // Use 10th percentile as min
                const p10 = d3.quantile(validPrices, 0.1);
                minPrice = p10 !== undefined ? p10 : d3.min(validPrices);

                // Use 90th percentile as max
                const p90 = d3.quantile(validPrices, 0.9);
                maxPrice = p90 !== undefined ? p90 : d3.max(validPrices);
            }

            // Should we force a minimum spread to avoid single-color if min==max?
            const upper = (maxPrice <= minPrice) ? minPrice + 100 : maxPrice;

            console.log(`[Map Color] Domain updated (10th-90th Percentile): ${minPrice.toFixed(1)} - ${upper.toFixed(1)} (based on ${validPrices.length} valid items)`);

            this.priceColorScale.domain([minPrice, upper]);
            this.hexColorScale.domain([minPrice, upper]);
        }

        this.updateView();
    }

    updateView() {
        if (!this.map) return;
        const zoom = this.map.getZoom();

        // --- 1. Subway Logic ---
        // If layer is visible (checked in control), we update its content
        if (this.map.hasLayer(this.subwayLayerGroup)) {
            this.subwayLayerGroup.clearLayers();

            this.subwayData.forEach(d => {
                // Smart Zoom Filter
                // Zoom < 13: Hide all (too cluttered)
                // Zoom 13-14: Show only hubs (lineCount > 1)
                // Zoom > 14: Show all

                let isVisible = false;
                if (zoom >= 14) isVisible = true; // Show all at street level
                else if (zoom >= 12 && d.properties.lineCount > 1) isVisible = true; // Show hubs at city level
                else if (zoom >= 11 && d.properties.lineCount >= 4) isVisible = true; // Show major hubs at summary level

                if (isVisible) {
                    const [lon, lat] = d.geometry.coordinates;
                    L.circleMarker([lat, lon], {
                        radius: zoom >= 15 ? 5 : 3, // Larger when zoomed in
                        fillColor: "#ffffff",
                        color: "#333",
                        weight: 1.5,
                        opacity: 1,
                        fillOpacity: 1
                    }).bindTooltip(`<strong>🚇 ${d.properties.cleanName}</strong><br>Lines: ${d.properties.lineCount}`, {
                        direction: 'top',
                        offset: [0, -5],
                        className: 'subway-tooltip'
                    }).addTo(this.subwayLayerGroup);
                }
            });
        }

        // --- 2. Main Data Logic ---
        // Clean up previous
        this.g.selectAll("*").remove();

        // Project function
        const projectPoint = function (lat, lon) {
            const point = this.map.latLngToLayerPoint(new L.LatLng(lat, lon));
            this.point = point;
            return [point.x, point.y];
        }.bind(this);

        // Filter data points within view bounds to improve performance
        const bounds = this.map.getBounds();
        const visibleData = this.filteredData.filter(d => bounds.contains([d.latitude, d.longitude]));

        if (zoom < 16) {
            // --- HEXBIN MODE ---
            this.drawHexbins(visibleData, projectPoint);
        } else {
            // --- POINTS MODE ---
            this.drawPoints(visibleData, projectPoint);
        }
    }

    drawHexbins(data, projectPoint) {
        // Generate bins
        const points = data.map(d => projectPoint(d.latitude, d.longitude));
        const bins = this.hexbin(points);

        // Aggregate values
        // We need to map back which origin data points are in which bin to calc avg price
        // d3-hexbin puts element in bin array, but 'points' array generated above loses original data ref
        // So we need a trick or just carry values. 
        // Improved: carry data object in projection
        const pointsWithData = data.map(d => {
            const p = projectPoint(d.latitude, d.longitude);
            p.data = d;
            return p;
        });
        const binsWithData = this.hexbin(pointsWithData);

        // Calc extent for dynamic scaling
        const maxCount = d3.max(binsWithData, d => d.length);
        this.hexRadiusScale.domain([0, maxCount]);

        this.g.selectAll(".hex")
            .data(binsWithData)
            .enter().append("path")
            .attr("class", "hex")
            .attr("d", d => this.hexbin.hexagon(this.hexRadiusScale(d.length)))
            .attr("transform", d => `translate(${d.x},${d.y})`)
            .attr("fill", d => {
                const avgPrice = d3.mean(d, p => p.data.price);
                return this.hexColorScale(avgPrice);
            })
            .attr("opacity", () => {
                const zoom = this.map.getZoom();
                // Opaque at zoom 11, confusingly transparent at 14?
                // User said: "zoom in to a point I want it semi-transparent"
                // Let's say: 11-13: 0.8
                // 14-15: 0.4 (semi-transparent to see context)
                if (zoom >= 14) return 0.4;
                return 0.8;
            })
            .attr("stroke", "#fff")
            .attr("stroke-width", 0.5)
            .style("pointer-events", "auto") // Fix interaction
            .style("cursor", "pointer")      // 
            .on("mouseover", (e, d) => {
                const avgPrice = d3.mean(d, p => p.data.price);
                this.tooltip.transition().duration(200).style("opacity", 1);
                this.tooltip.html(`
                    <strong>區域統計</strong><br>
                    房源數: ${d.length}<br>
                    平均價格: $${Math.round(avgPrice)}
                `)
                    .style("left", (e.pageX + 10) + "px")
                    .style("top", (e.pageY - 28) + "px");
            })
            .on("mouseout", () => {
                this.tooltip.transition().duration(500).style("opacity", 0);
            })
            .on("click", (e, d) => {
                // Zoom in on click
                const latLng = this.map.layerPointToLatLng([d.x, d.y]);
                this.map.flyTo(latLng, this.map.getZoom() + 2);
            });
    }

    drawPoints(data, projectPoint) {
        this.g.selectAll(".listing-point")
            .data(data)
            .enter().append("circle")
            .attr("class", "listing-point")
            .attr("cx", d => projectPoint(d.latitude, d.longitude)[0])
            .attr("cy", d => projectPoint(d.latitude, d.longitude)[1])
            .attr("r", 4)
            .attr("fill", d => this.priceColorScale(d.price))
            .attr("opacity", 0.9)
            .attr("stroke", "#fff")
            .attr("stroke-width", 0.5)
            .style("pointer-events", "auto") // Fix interaction
            .style("cursor", "pointer")      // 
            .on("mouseover", (e, d) => {
                this.tooltip.transition().duration(200).style("opacity", 1);
                this.tooltip.html(`
                    <strong>${d.name}</strong><br>
                    區域: ${d.neighbourhood}<br>
                    價格: $${d.price}<br>
                    評價數: ${d.number_of_reviews}<br>
                    距地鐵: ${d.dist_to_subway}m
                `)
                    .style("left", (e.pageX + 10) + "px")
                    .style("top", (e.pageY - 28) + "px");
            })
            .on("mouseout", () => {
                this.tooltip.transition().duration(500).style("opacity", 0);
            });
    }

    updateHexRadius(radius) {
        this.hexbin.radius(radius);
        this.hexRadiusScale.range([radius * 0.3, radius * 0.95]);
        this.updateView();
    }
}
