import { DataManager } from './modules/DataManager.js';
import { MapView } from './modules/MapView.js';
import { Charts } from './modules/Charts.js';

// Application State
const state = {
    priceMin: 0,
    priceMax: 1000,
    roomTypes: ['Entire home/apt', 'Private room', 'Shared room'],
    selectedNeighborhoods: [],
    maxDistance: 3000,
    distanceEnabled: false,
    chartGrouping: 'borough' // 'borough' or 'neighborhood'
};

// UI Elements
const priceMinInput = document.getElementById("price-min");
const priceMaxInput = document.getElementById("price-max");
const priceMinSpan = document.getElementById("min-price");
const priceMaxSpan = document.getElementById("max-price");
const distanceInput = document.getElementById("distance-slider");
const distanceSpan = document.getElementById("distance-val");
const distanceEnable = document.getElementById("distance-enable");
const neighborhoodContainer = document.getElementById("neighborhood-list-container");
const chartGroupingSelect = document.getElementById("chart-grouping-select");
const showSubwayCheck = document.getElementById("show-subway-check");

// Initialize Modules
const dataManager = new DataManager();
const mapView = new MapView("#map-container");
const charts = new Charts("#barchart-container", "#scatterplot-container");

// Sync Checkbox with Initial State immediately (to override browser caching)
if (distanceEnable) {
    distanceEnable.checked = state.distanceEnabled;
}

async function init() {
    try {
        const { data, subwayGeoJson } = await dataManager.loadData();

        // Init Views
        mapView.init(null, data, subwayGeoJson);
        charts.init();

        // Populate Neighborhood Checkboxes (Grouped)
        updateNeighborhoodCheckboxes();

        // Setup Events
        setupEventListeners();

        // Initial Draw
        updateVisualization();

        // Init distance slider
        const maxDist = 3000;
        distanceInput.max = maxDist;
        distanceInput.value = maxDist;
        state.maxDistance = maxDist;
        distanceSpan.innerText = maxDist;

        // Init distance toggle UI state
        const distanceContainer = document.getElementById('distance-control-container');
        if (distanceContainer && !state.distanceEnabled) {
            distanceContainer.style.opacity = "0.5";
            distanceContainer.style.pointerEvents = "none";
        }

    } catch (err) {
        console.error("Init failed:", err);
        const mapContainer = document.getElementById("map-container");
        mapContainer.innerHTML = `
            <div style="color: red; padding: 20px; text-align: center; border: 1px solid red; background: #ffe6e6;">
                <h3>初始化錯誤</h3>
                <p>${err.message}</p>
                <p>請檢查網路連線或稍後再試 (Code: ${err.code || 'Unknown'})</p>
            </div>
        `;
    }
}

function updateVisualization() {
    dataManager.filterData(state);
    const filtered = dataManager.filteredData;

    mapView.update(filtered, null);
    charts.updateBarChart(filtered, null, state.chartGrouping);
    charts.updateScatterPlot(filtered);
}

function updateNeighborhoodCheckboxes() {
    // Get hierarchical data: { "New York": ["Midtown", ...], "Jersey City": [...] }
    const hierarchy = dataManager.getNeighborhoodHierarchy();

    neighborhoodContainer.innerHTML = '';

    Object.keys(hierarchy).sort().forEach(region => {
        const regionDetails = document.createElement('details');
        regionDetails.className = 'region-group';
        regionDetails.open = false; // Default closed as requested

        // Header with Checkbox for Region (Summary)
        const summary = document.createElement('summary');
        summary.className = 'region-header';
        summary.style.cursor = 'pointer';
        summary.style.listStyle = 'none'; // Optional: hide default marker if we want custom or none

        const regionCheck = document.createElement('input');
        regionCheck.type = 'checkbox';
        regionCheck.checked = true; // Default select all
        regionCheck.dataset.region = region;
        // Stop propagation to prevent toggling details when checking box
        regionCheck.addEventListener('click', (e) => e.stopPropagation());

        const regionLabel = document.createElement('span');
        regionLabel.textContent = ` ${region} (${hierarchy[region].length})`; // Add count
        regionLabel.style.fontWeight = "bold";

        summary.appendChild(regionCheck);
        summary.appendChild(regionLabel);
        regionDetails.appendChild(summary);

        // Neighborhood Items Container
        const itemsDiv = document.createElement('div');
        itemsDiv.className = 'neighborhood-items';

        hierarchy[region].forEach(neigh => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'neighborhood-item';

            const neighCheck = document.createElement('input');
            neighCheck.type = 'checkbox';
            neighCheck.value = neigh;
            neighCheck.checked = true;
            neighCheck.dataset.parent = region;

            const neighLabel = document.createElement('span');
            neighLabel.textContent = neigh;

            itemDiv.appendChild(neighCheck);
            itemDiv.appendChild(neighLabel);
            itemsDiv.appendChild(itemDiv);

            // Event Listener for Neighborhood Check
            neighCheck.addEventListener('change', () => {
                updateStateFromCheckboxes();
                updateVisualization();
            });
        });

        // Event Listener for Region Check (Select All/None)
        regionCheck.addEventListener('change', (e) => {
            const checked = e.target.checked;
            itemsDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.checked = checked;
            });
            updateStateFromCheckboxes();
            updateVisualization();
        });

        regionDetails.appendChild(itemsDiv);
        neighborhoodContainer.appendChild(regionDetails);
    });

    updateStateFromCheckboxes(); // Init state
}

function updateStateFromCheckboxes() {
    const selected = [];
    neighborhoodContainer.querySelectorAll('.neighborhood-items input[type="checkbox"]:checked').forEach(cb => {
        selected.push(cb.value);
    });
    // If all unchecked, maybe we should prevent that? Or just show nothing.
    state.selectedNeighborhoods = selected;
}

function setupEventListeners() {
    // Price
    const updatePrice = () => {
        const min = +priceMinInput.value;
        const max = +priceMaxInput.value;
        if (min > max) return;
        state.priceMin = min;
        state.priceMax = max;
        priceMinSpan.textContent = min;
        priceMaxSpan.textContent = max;
        updateVisualization();
    };
    priceMinInput.addEventListener("input", updatePrice);
    priceMaxInput.addEventListener("input", updatePrice);

    // Distance Slider
    distanceInput.addEventListener("input", (e) => {
        state.maxDistance = +e.target.value;
        distanceSpan.innerText = state.maxDistance;
        if (state.distanceEnabled) updateVisualization();
    });

    // Distance Toggle
    if (distanceEnable) {
        distanceEnable.addEventListener("change", (e) => {
            state.distanceEnabled = e.target.checked;
            const container = document.getElementById('distance-control-container');
            if (container) {
                if (state.distanceEnabled) {
                    container.style.opacity = "1";
                    container.style.pointerEvents = "auto";
                } else {
                    container.style.opacity = "0.5";
                    container.style.pointerEvents = "none";
                }
            }
            updateVisualization();
        });
    }

    // Room Type
    document.querySelectorAll(".room-filter").forEach(cb => {
        cb.addEventListener("change", () => {
            const checked = Array.from(document.querySelectorAll(".room-filter:checked")).map(c => c.value);
            state.roomTypes = checked;
            updateVisualization();
        });
    });

    // Chart Grouping
    if (chartGroupingSelect) {
        chartGroupingSelect.addEventListener("change", (e) => {
            state.chartGrouping = e.target.value;
            updateVisualization();
        });
    }

    // Subway Toggle
    if (showSubwayCheck) {
        showSubwayCheck.addEventListener("change", (e) => {
            mapView.toggleSubway(e.target.checked);
        });
    }

    // Legacy Interactions
    mapView.onBoroughClick = (boroughName) => {
        // Auto-check the region checkbox
        const checkbox = document.querySelector(`input[data-region="${boroughName}"]`);
        if (checkbox) {
            // Toggle specific region only? 
            // For simplicity, maybe just nothing or scroll to it.
            // User didn't ask for this specifically, but let's leave valid logic or empty.
        }
    };

    charts.onBarClick = (boroughName) => {
        // Same as above
    };

    charts.onScatterSelection = (neighborhoods) => {
        if (!neighborhoods) {
            // Reset filter
            if (state.selectedNeighborhoods.length > 0) {
                // Logic to revert to "All" or previous state? 
                // Simple approach: Clear specific neighborhood filters but keep other state
                // Actually state.selectedNeighborhoods is the UI filter.
                // Maybe we should just update checkbox UI to match selection?
                // But that destroys user's manual detailed selection.
                // Let's notify user or just apply. 
                // User asked to "filter finely".
                // Let's just update the checkboxes.
                const allChecks = document.querySelectorAll('.neighborhood-items input[type="checkbox"]');
                allChecks.forEach(cb => cb.checked = true); // Reset to all
                updateStateFromCheckboxes();
                updateVisualization();
            }
        } else {
            // Apply selection
            const allChecks = document.querySelectorAll('.neighborhood-items input[type="checkbox"]');
            allChecks.forEach(cb => {
                cb.checked = neighborhoods.includes(cb.value);
            });
            updateStateFromCheckboxes();
            updateVisualization();
        }
    };

    // Hexbin Radius Slider
    const hexRadiusInput = document.getElementById("hex-radius");
    if (hexRadiusInput) {
        hexRadiusInput.addEventListener("input", (e) => {
            const r = +e.target.value;
            mapView.updateHexRadius(r);
        });
    }
}

// Start
init();
