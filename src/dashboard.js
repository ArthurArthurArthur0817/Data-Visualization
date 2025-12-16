// =======================================================
// 全域變數宣告與設定
// =======================================================
let fullData = []; // 儲存所有載入的數據
let filteredData = []; // 儲存經過篩選的數據
let nycGeoJson; // 儲存 GeoJSON 數據
let currentNeighbourhoodGroup = null; // 用於儲存當前篩選的行政區名稱

// 繪圖尺寸與邊距
const mapWidth = 600;
const mapHeight = 500;
const barWidth = 400; 
const barHeight = 300;
const BAR_MARGIN = { top: 20, right: 30, bottom: 60, left: 60 };

let projection; // 地圖投影物件
// 價格顏色比例尺 (從黃色到紅色)
const priceColorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 1000]); 

// D3 選擇器
const priceMinInput = d3.select("#price-min");
const priceMaxInput = d3.select("#price-max");
const priceMinSpan = d3.select("#min-price");
const priceMaxSpan = d3.select("#max-price");
const mapSvg = d3.select("#map-svg"); // 確保 setupMap/setupBarChart 已經在 HTML 載入後創建了這些 SVG
const barSvg = d3.select("#bar-svg"); 

// =======================================================
// 輔助與工具函式
// =======================================================

// Tooltip 容器 (在 index.html 中應有 id="tooltip" 的 div)
const tooltip = d3.select("body").select("#tooltip");

function showTooltip(event, d) {
    tooltip.transition().duration(200).style("opacity", 1);
    tooltip.html(`
        <strong>${d.name}</strong><br>
        行政區: ${d.neighbourhood_group}<br>
        價格: $${d.price}<br>
        評論數: ${d.number_of_reviews}
    `)
    .style("left", (event.pageX + 10) + "px")
    .style("top", (event.pageY - 28) + "px");
}

function hideTooltip() {
    tooltip.transition().duration(500).style("opacity", 0);
}

function setupMap() {
    d3.select("#map-container")
        .append("svg")
        .attr("width", mapWidth)
        .attr("height", mapHeight)
        .attr("id", "map-svg");
}

function setupBarChart() {
    d3.select("#barchart-container")
        .append("svg")
        .attr("width", barWidth)
        .attr("height", barHeight)
        .attr("id", "bar-svg");
}

// =======================================================
// 核心：繪製與更新 (updateVisualization)
// =======================================================

function updateVisualization() {
    // 1. 取得篩選值
    const minPrice = +priceMinInput.property("value");
    const maxPrice = +priceMaxInput.property("value");
    const selectedRoomTypes = [];
    d3.selectAll(".room-filter:checked").each(function() {
        selectedRoomTypes.push(this.value);
    });

    // 2. 數據篩選 (價格、房型、行政區)
    filteredData = fullData.filter(d => {
        if (!(d.price >= minPrice && d.price <= maxPrice && selectedRoomTypes.includes(d.room_type))) {
            return false;
        }
        if (currentNeighbourhoodGroup && d.neighbourhood_group !== currentNeighbourhoodGroup) {
            return false;
        }
        return true;
    });

    drawMapView(filteredData);
    drawBarChart(fullData); 
}

// --- 繪製地圖（包含 GeoJSON 底圖） ---
function drawMapView(data) {
    const mapSvg = d3.select("#map-svg");

    // 1. 計算顏色編碼所需的數據 (用於 GeoJSON 底圖顏色)
    const boroughCounts = d3.rollup(fullData, v => v.length, d => d.neighbourhood_group);
    const maxCount = d3.max(Array.from(boroughCounts.values()));
    const colorScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxCount]);

    // 2. 繪製行政區邊界 (Basemap)
    if (nycGeoJson && projection) {
        const path = d3.geoPath().projection(projection);

        mapSvg.selectAll(".borough")
            .data(nycGeoJson.features, d => d.properties.name) // <--- 使用 d.properties.name 作為 Key
            .join(
                enter => enter.append("path")
                    .attr("class", "borough")
                    .attr("d", path)
                    .attr("stroke", "#333") 
                    .attr("stroke-width", 0.5)
                    .on("click", boroughClicked) // 點擊互動
                    .lower(), 
                update => update
                    .attr("d", path)
                    .attr("fill", d => { 
                        const name = d.properties.name; // <--- 從 GeoJSON 獲取名稱
                        return boroughCounts.has(name) ? colorScale(boroughCounts.get(name)) : "#eee";
                    })
                    // 根據 currentNeighbourhoodGroup 高亮邊框
                    .attr("stroke-width", d => (currentNeighbourhoodGroup === d.properties.name ? 2 : 0.5)), 
                exit => exit.remove()
            );
    }

    // 3. 繪製房源散點
    mapSvg.selectAll(".listing-point")
        .data(data, d => d.id) 
        .join(
            enter => enter.append("circle")
                .attr("class", "listing-point")
                .attr("cx", d => projection([d.longitude, d.latitude])[0])
                .attr("cy", d => projection([d.longitude, d.latitude])[1])
                .attr("r", 3)
                .attr("fill", d => priceColorScale(d.price))
                .on("mouseover", showTooltip)
                .on("mouseout", hideTooltip),
            update => update.attr("cx", d => projection([d.longitude, d.latitude])[0]).attr("cy", d => projection([d.longitude, d.latitude])[1]),
            exit => exit.remove()
        );
}

// --- 繪製長條圖 ---
function drawBarChart(data) {
    const barSvg = d3.select("#bar-svg");
    barSvg.html(""); 

    const groups = d3.rollup(data, v => v.length, d => d.neighbourhood_group);
    const sortedGroups = Array.from(groups, ([name, count]) => ({name, count}))
                            .sort((a, b) => d3.descending(a.count, b.count));
    
    // 比例尺與軸線
    const xScale = d3.scaleBand()
        .domain(sortedGroups.map(d => d.name))
        .range([0, barWidth - BAR_MARGIN.left - BAR_MARGIN.right])
        .padding(0.1);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(sortedGroups, d => d.count)])
        .range([barHeight - BAR_MARGIN.top - BAR_MARGIN.bottom, 0]);

    const g = barSvg.append("g")
        .attr("transform", `translate(${BAR_MARGIN.left},${BAR_MARGIN.top})`);

    // 繪製軸線
    g.append("g")
        .attr("transform", `translate(0, ${barHeight - BAR_MARGIN.top - BAR_MARGIN.bottom})`)
        .call(d3.axisBottom(xScale))
        .selectAll("text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end");

    g.append("g").call(d3.axisLeft(yScale).ticks(5));

    // 繪製長條
    g.selectAll(".bar")
        .data(sortedGroups)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => xScale(d.name))
        .attr("y", d => yScale(d.count))
        .attr("width", xScale.bandwidth())
        .attr("height", d => barHeight - BAR_MARGIN.top - BAR_MARGIN.bottom - yScale(d.count))
        .attr("fill", d => (d.name === currentNeighbourhoodGroup ? "orange" : "steelblue"))
        .on("click", barClicked);
}


// --- 互動函式 ---

function handleGroupClick(newGroup) {
    // 協調視圖的點擊邏輯
    if (newGroup === currentNeighbourhoodGroup) {
        currentNeighbourhoodGroup = null; 
    } else {
        currentNeighbourhoodGroup = newGroup; 
    }
    updateVisualization();
}

function barClicked(event, d) {
    handleGroupClick(d.name);
}

function boroughClicked(event, d) {
    const name = d.properties.name; // <--- 關鍵修正：從 GeoJSON 獲取名稱
    handleGroupClick(name);
}


// =======================================================
// 資料載入與初始化 (設定事件監聽！)
// =======================================================

// 必須先呼叫 setup 函式來創建 SVG 元素
setupMap();
setupBarChart();

Promise.all([
    d3.json("processed_data.json"),        
    d3.json("data/nyc_boroughs.geojson")     
]).then(([data, geoJson]) => {
    fullData = data;
    nycGeoJson = geoJson; 

    // 數據轉換
    fullData.forEach(d => {
        d.price = +d.price;
        d.latitude = +d.latitude;
        d.longitude = +d.longitude;
        d.number_of_reviews = +d.number_of_reviews;
    });

    // 1. 設定地圖投影
    projection = d3.geoMercator()
        .fitExtent([[10, 10], [mapWidth - 10, mapHeight - 10]], nycGeoJson); 

    // 2. 初始化滑桿範圍和顏色比例尺
    const priceMax = d3.max(fullData, d => d.price);
    const priceMin = d3.min(fullData, d => d.price);
    priceColorScale.domain([priceMin, priceMax]); 

    // 初始化滑桿值和顯示文字
    priceMinInput.attr("max", priceMax).attr("value", priceMin);
    priceMaxInput.attr("max", priceMax).attr("value", priceMax);
    priceMinSpan.text(priceMin);
    priceMaxSpan.text(priceMax);

    // 3. 初始繪圖
    updateVisualization();

    // 4. 設定事件監聽 (修復滑桿無反應問題)
    d3.selectAll("#control-panel input").on("input", () => {
        const minVal = +priceMinInput.property("value");
        const maxVal = +priceMaxInput.property("value");

        // 確保 Min 不超過 Max
        if (minVal > maxVal) { priceMaxInput.property("value", minVal); }

        priceMinSpan.text(priceMinInput.property("value"));
        priceMaxSpan.text(priceMaxInput.property("value"));
        
        // 每次輸入變化時都重新篩選並繪圖
        updateVisualization(); 
    });

}).catch(error => {
    console.error("資料載入錯誤:", error);
    d3.select("#main-map-view").append("p").text("錯誤：無法載入數據或地圖檔案。請檢查 processed_data.json 和 data/nyc_boroughs.geojson 是否存在。");
});