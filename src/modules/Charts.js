export class Charts {
    constructor(barContainerId, scatterContainerId, barWidth = 400, barHeight = 300) {
        this.barContainerId = barContainerId;
        this.scatterContainerId = scatterContainerId;
        this.width = barWidth;
        this.height = barHeight;
        this.margin = { top: 20, right: 30, bottom: 85, left: 60 };

        this.onBarClick = null; // Callback
        this.onScatterClick = null; // Callback for scatter plot interactions
    }

    init() {
        this.initBarChart();
        this.initScatterPlot();
    }

    initBarChart() {
        this.barSvg = d3.select(this.barContainerId)
            .append("svg")
            .attr("viewBox", `0 0 ${this.width} ${this.height}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .style("width", "100%")
            .style("height", "auto")
            .attr("id", "bar-svg");
    }

    initScatterPlot() {
        this.scatterSvg = d3.select(this.scatterContainerId)
            .append("svg")
            .attr("viewBox", `0 0 ${this.width} ${this.height}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .style("width", "100%")
            .style("height", "auto")
            .attr("id", "scatter-svg");
    }

    updateBarChart(data, selectedBorough, grouping = 'borough') {
        this.barSvg.html(""); // Clear

        let groups;
        let xLabel = "";

        if (grouping === 'neighborhood') {
            // Group by Neighborhood
            const rolled = d3.rollup(data, v => v.length, d => d.neighbourhood);
            groups = Array.from(rolled, ([name, count]) => ({ name, count }))
                .sort((a, b) => d3.descending(a.count, b.count))
                .slice(0, 10); // Top 10 only
            xLabel = "Top 10 熱門街區";
        } else {
            // Default: Borough
            const rolled = d3.rollup(data, v => v.length, d => d.neighbourhood_group);
            groups = Array.from(rolled, ([name, count]) => ({ name, count }))
                .sort((a, b) => d3.descending(a.count, b.count));
            xLabel = "行政區";
        }

        // 比例尺與軸線
        const xScale = d3.scaleBand()
            .domain(groups.map(d => d.name))
            .range([this.margin.left, this.width - this.margin.right])
            .padding(0.1);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(groups, d => d.count) || 0])
            .range([this.height - this.margin.bottom, this.margin.top]);

        // Draw Axes
        this.barSvg.append("g")
            .attr("transform", `translate(0, ${this.height - this.margin.bottom})`)
            .call(d3.axisBottom(xScale))
            .selectAll("text")
            .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("dy", ".15em")
            .attr("transform", "rotate(-35)")
            .style("font-size", "13px") // Increased font size
            .style("font-weight", 500);

        this.barSvg.append("g")
            .attr("transform", `translate(${this.margin.left},0)`)
            .call(d3.axisLeft(yScale).ticks(5));

        // Add X Label
        this.barSvg.append("text")
            .attr("x", this.width / 2)
            .attr("y", this.height - 5)
            .style("text-anchor", "middle")
            .style("font-size", "12px")
            .text(xLabel);

        // Draw Bars
        this.barSvg.selectAll(".bar")
            .data(groups)
            .enter().append("rect")
            .attr("class", "bar")
            .attr("x", d => xScale(d.name))
            .attr("y", d => yScale(d.count))
            .attr("width", xScale.bandwidth())
            .attr("height", d => this.height - this.margin.bottom - yScale(d.count))
            .attr("fill", d => (d.name === selectedBorough ? "orange" : "steelblue"))
            .on("click", (e, d) => {
                if (grouping === 'borough' && this.onBarClick) this.onBarClick(d.name);
                // Neighborhood click filtering implementation omitted for simplicity, but could be added
            });
    }

    updateScatterPlot(data) {
        this.scatterSvg.html(""); // Clear previous content

        // Bubble Chart:
        // X: Average Price
        // Y: Average Rating
        // Size: Count (Number of Listings)
        // Color: Region (Borough)

        if (!data || data.length === 0) return;

        // 1. Group Data by Neighborhood
        const metrics = d3.rollup(data,
            v => ({
                count: v.length,
                avgPrice: d3.mean(v, d => d.price),
                avgRating: d3.mean(v, d => d.review_scores_rating),
                region: v[0].neighbourhood_group,
                rawRatings: v.map(d => d.review_scores_rating)
            }),
            d => d.neighbourhood
        );

        const plotData = Array.from(metrics, ([name, value]) => ({
            name, ...value
        })).filter(d => d.avgRating > 0 && d.avgPrice > 0 && d.name !== "Neighborhood highlights"); // Filter valid

        if (plotData.length === 0) return;

        const width = this.width;
        const height = this.height;

        // Domains
        const xMin = d3.min(plotData, d => d.avgPrice) || 0;
        const xMax = d3.max(plotData, d => d.avgPrice) || 500;

        // Fix Rating Scale: Check if data is 0-5 or 0-100
        const ratingMax = d3.max(plotData, d => d.avgRating);
        const isFiveScale = ratingMax <= 5;
        const yDomainMax = isFiveScale ? 5 : 100;
        const yMin = d3.min(plotData, d => d.avgRating) || (isFiveScale ? 3.5 : 80);
        const rMax = d3.max(plotData, d => d.count);

        const xScale = d3.scaleLinear().domain([xMin * 0.9, xMax * 1.1]).range([this.margin.left, width - this.margin.right]);
        const yScale = d3.scaleLinear().domain([yMin * 0.9, yDomainMax]).range([height - this.margin.bottom, this.margin.top]);
        const rScale = d3.scaleSqrt().domain([0, rMax]).range([3, 20]);
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

        // Gridlines
        const makeXGrid = () => d3.axisBottom(xScale).ticks(5);
        const makeYGrid = () => d3.axisLeft(yScale).ticks(5);

        this.scatterSvg.append("g")
            .attr("class", "grid")
            .attr("transform", `translate(0,${height - this.margin.bottom})`)
            .attr("opacity", 0.1)
            .call(makeXGrid().tickSize(-height + this.margin.top + this.margin.bottom).tickFormat(""));

        this.scatterSvg.append("g")
            .attr("class", "grid")
            .attr("transform", `translate(${this.margin.left},0)`)
            .attr("opacity", 0.1)
            .call(makeYGrid().tickSize(-width + this.margin.left + this.margin.right).tickFormat(""));

        // Axes
        this.scatterSvg.append("g")
            .attr("transform", `translate(0, ${height - this.margin.bottom})`)
            .call(d3.axisBottom(xScale).ticks(5).tickFormat(d => `$${d}`))
            .selectAll("text")
            .style("font-size", "12px");

        this.scatterSvg.append("g")
            .attr("transform", `translate(${this.margin.left},0)`)
            .call(d3.axisLeft(yScale).ticks(5))
            .selectAll("text")
            .style("font-size", "12px");

        // Labels
        this.scatterSvg.append("text")
            .attr("x", width / 2)
            .attr("y", height - 5)
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .style("font-weight", "bold")
            .text("平均價格 (Avg Price)");

        this.scatterSvg.append("text")
            .attr("transform", "rotate(-90)")
            .attr("x", -height / 2)
            .attr("y", 15)
            .style("text-anchor", "middle")
            .style("font-size", "14px")
            .style("font-weight", "bold")
            .text("平均評分 (Avg Rating)");

        // Bubbles
        const bubbles = this.scatterSvg.append("g")
            .selectAll("circle")
            .data(plotData)
            .enter().append("circle")
            .attr("cx", d => xScale(d.avgPrice))
            .attr("cy", d => yScale(d.avgRating))
            .attr("r", d => rScale(d.count))
            .attr("fill", d => colorScale(d.region))
            .attr("opacity", 0.7)
            .attr("stroke", "white")
            .attr("stroke-width", 1.5)
            .style("cursor", "pointer");



        // Rich Info Card Interaction
        // Instead of a simple tooltip, let's create a "Magnified Detail Window" inside the chart area
        let infoCard = d3.select(this.scatterContainerId).select(".info-card");
        if (infoCard.empty()) {
            infoCard = d3.select(this.scatterContainerId)
                .append("div")
                .attr("class", "info-card")
                .style("position", "absolute")
                .style("top", "10px")
                .style("right", "10px")
                .style("background", "rgba(255, 255, 255, 0.95)")
                .style("border", "1px solid #ddd")
                .style("padding", "15px")
                .style("border-radius", "8px")
                .style("box-shadow", "0 4px 12px rgba(0,0,0,0.15)")
                .style("width", "200px")
                .style("pointer-events", "none")
                .style("opacity", 0)
                .style("transition", "opacity 0.2s");
        }

        bubbles.on("mouseover", (e, d) => {
            d3.select(e.currentTarget)
                .attr("stroke", "#333")
                .attr("stroke-width", 2)
                .attr("opacity", 1)
                .raise(); // Bring to front

            infoCard.style("opacity", 1)
                .html(`
                    <h4 style="margin: 0 0 5px 0; font-size: 1.1em; border-bottom: 2px solid ${colorScale(d.region)}">${d.name}</h4>
                    <div style="font-size: 0.9em; color: #555;">
                        <p style="margin: 3px 0;"><strong>📍 區域:</strong> ${d.region}</p>
                        <p style="margin: 3px 0;"><strong>💰 平均價格:</strong> $${Math.round(d.avgPrice)}</p>
                        <p style="margin: 3px 0;"><strong>⭐ 平均評分:</strong> ${d.avgRating.toFixed(2)}</p>
                        <p style="margin: 3px 0;"><strong>🏠 房源數量:</strong> ${d.count}</p>
                    </div>
                `);
        })
            .on("mouseout", (e, d) => {
                d3.select(e.currentTarget)
                    .attr("stroke", "white")
                    .attr("stroke-width", 1.5)
                    .attr("opacity", 0.7);

                // Keep card visible? No, user asked for hover zoom window generally implies temporary.
                // Or maybe they want to click to lock? 
                // Let's stick to hover for now, but make it persistent if brushed? No.
                infoCard.style("opacity", 0);
            });



        // Brush Interaction
        const brush = d3.brush()
            .extent([[this.margin.left, this.margin.top], [width - this.margin.right, height - this.margin.bottom]])
            .on("end", (event) => {
                if (!event.selection) return;
                if (!this.onScatterSelection) return;

                const [[x0, y0], [x1, y1]] = event.selection;
                // Find neighborhoods inside selection
                const selected = plotData.filter(d => {
                    const x = xScale(d.avgPrice);
                    const y = yScale(d.avgRating);
                    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
                });

                this.onScatterSelection(selected.map(d => d.name));

                // Clear brush after selection? Or keep it?
                // Keeping it allows refinement. User can click out to clear.
            });

        this.scatterSvg.append("g")
            .attr("class", "brush")
            .call(brush);

        // Double click to clear/reset
        this.scatterSvg.on("dblclick", () => {
            if (this.onScatterSelection) this.onScatterSelection(null); // Reset
            this.scatterSvg.select(".brush").call(brush.move, null);
        });
    }

    update(data, selectedBorough) {
        this.updateBarChart(data, selectedBorough);
        this.updateScatterPlot(data);
    }
}
