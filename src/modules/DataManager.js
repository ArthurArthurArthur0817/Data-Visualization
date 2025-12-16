export class DataManager {
    constructor() {
        this.fullData = [];
        this.geoJson = null;
        this.filteredData = [];
        this.subscribers = [];
    }

    async loadData() {
        try {
            const [data, subwayGeoJson] = await Promise.all([
                d3.json(`processed_data.json?v=${Date.now()}`),
                d3.json("data/nyc_subway.geojson")
            ]);

            this.fullData = data.map(d => ({
                ...d,
                price: +d.price,
                latitude: +d.latitude,
                longitude: +d.longitude,
                number_of_reviews: +d.number_of_reviews,
                dist_to_subway: +d.dist_to_subway,
                review_scores_rating: +d.review_scores_rating || 0
            }));

            this.subwayGeoJson = subwayGeoJson;
            this.filteredData = [...this.fullData];

            return {
                data: this.fullData,
                subwayGeoJson: this.subwayGeoJson
            };
        } catch (error) {
            console.error("Data loading error:", error);
            throw error;
        }
    }

    getBounds() {
        const prices = this.fullData.map(d => d.price);
        const distances = this.fullData.map(d => d.dist_to_subway);
        return {
            priceMin: d3.min(prices),
            priceMax: d3.max(prices),
            distMax: d3.max(distances)
        };
    }

    filterData(criteria) {
        // criteria: { priceMin, priceMax, roomTypes[], selectedNeighborhoods[], maxDistance, distanceEnabled }
        this.filteredData = this.fullData.filter(d => {
            // Price Filter
            if (d.price > criteria.priceMax || d.price < criteria.priceMin) return false;

            // Room Type Filter
            if (criteria.roomTypes && criteria.roomTypes.length > 0 && !criteria.roomTypes.includes(d.room_type)) return false;

            // Neighborhood Filter (Multi-select)
            if (criteria.selectedNeighborhoods && criteria.selectedNeighborhoods.length > 0) {
                if (!criteria.selectedNeighborhoods.includes(d.neighbourhood)) return false;
            }

            // Subway Distance Filter (with Toggle)
            if (criteria.distanceEnabled) {
                if (criteria.maxDistance && d.dist_to_subway > criteria.maxDistance) return false;
            }

            return true;
        });

        this.notifySubscribers();
    }

    subscribe(callback) {
        this.subscribers.push(callback);
    }

    notifySubscribers() {
        this.subscribers.forEach(cb => cb(this.filteredData));
    }

    getNeighborhoodHierarchy() {
        // Returns { "Region Name": ["Neigh A", "Neigh B"], ... }
        const hierarchy = {};
        this.fullData.forEach(d => {
            const region = d.neighbourhood_group || "Other";
            const neigh = d.neighbourhood || "Unknown";

            if (!hierarchy[region]) {
                hierarchy[region] = new Set();
            }
            hierarchy[region].add(neigh);
        });

        // Convert Sets to sorted Arrays
        const sortedHierarchy = {};
        Object.keys(hierarchy).sort().forEach(region => {
            sortedHierarchy[region] = Array.from(hierarchy[region]).sort();
        });
        return sortedHierarchy;
    }
}
