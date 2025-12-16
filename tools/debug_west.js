const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data/nyc_subway.geojson', 'utf8'));
const westStations = data.features.filter(f => f.geometry.coordinates[0] < -74.02);
console.log("Count:", westStations.length);
westStations.forEach(f => {
    const props = f.properties;
    const desc = props.description || "";
    const nameMatch = desc.match(/NAME.*?atr-value">([^<]+)<\/span>/);
    const name = nameMatch ? nameMatch[1] : props.name;
    console.log(name, f.geometry.coordinates);
});
