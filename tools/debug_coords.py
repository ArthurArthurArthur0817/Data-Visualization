import json

with open('data/nyc_subway.geojson', 'r', encoding='utf-8') as f:
    data = json.load(f)

si_count = 0
nj_count = 0
nj_stations = []

for feature in data['features']:
    lon, lat = feature['geometry']['coordinates']
    
    # Staten Island is roughly West of -74.06 (St George)
    if lon < -74.06:
        si_count += 1
    
    # NJ Gold Coast (Hoboken, Jersey City, Union City) is roughly -74.06 < lon < -74.01
    # Check bounds
    if -74.06 < lon < -74.01:
        nj_count += 1
        props = feature.get('properties', {})
        desc = props.get('description', '')
        # Try to extract name
        import re
        match = re.search(r'NAME.*?atr-value">([^<]+)</span>', desc)
        name = match.group(1) if match else props.get('name', 'Unknown')
        nj_stations.append(f"{name} ({lon}, {lat})")

print(f"Staten Island Candidates (lon < -74.06): {si_count}")
print(f"NJ Candidates (-74.06 < lon < -74.01): {nj_count}")
print("Sample NJ Stations:")
for s in nj_stations[:5]:
    print(s)
