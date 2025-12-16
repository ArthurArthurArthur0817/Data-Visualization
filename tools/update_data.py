import pandas as pd
import json
import math
import os
import glob
import gzip

# --- Configuration ---
RAW_DIR = 'data/raw'
SUBWAY_GEOJSON = 'data/nyc_subway.geojson'
OUTPUT_JSON_FILE = 'processed_data.json'
MAX_ROWS = 25000 

# --- Distance Logic ---
def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2)**2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def load_subway_stations():
    try:
        with open(SUBWAY_GEOJSON, 'r', encoding='utf-8') as f:
            data = json.load(f)
        stations = []
        for feature in data['features']:
            lon, lat = feature['geometry']['coordinates']
            stations.append((lat, lon))
        return stations
    except FileNotFoundError:
        print("Subway file not found!")
        return []

def get_min_distance(row, stations):
    if not stations: return 0
    lat, lon = row['latitude'], row['longitude']
    min_dist = float('inf')
    for s_lat, s_lon in stations:
        dist = haversine_distance(lat, lon, s_lat, s_lon)
        if dist < min_dist: min_dist = dist
    return int(min_dist)

# --- Main Logic ---
def main():
    # 1. Find Files
    # Look for both .csv and .csv.gz in data/raw
    files = glob.glob(os.path.join(RAW_DIR, '*.csv.gz')) + glob.glob(os.path.join(RAW_DIR, '*.csv'))
    
    if not files:
        print(f"No files found in {RAW_DIR}")
        return

    print(f"Found {len(files)} files: {[os.path.basename(f) for f in files]}")

    # 2. Load & Merge
    dfs = []
    for f in files:
        print(f"Loading {f}...")
        try:
            # Determine Group based on filename
            fname = os.path.basename(f).lower()
            forced_group = None
            if 'jersey' in fname:
                forced_group = 'Jersey City'
            elif 'newark' in fname:
                forced_group = 'Newark'
            
            # Load Data
            if f.endswith('.gz'):
                with gzip.open(f, 'rt', encoding='utf-8') as gf:
                    temp_df = pd.read_csv(gf, low_memory=False)
            else:
                temp_df = pd.read_csv(f, low_memory=False)
            
            # Apply Group Logic
            if forced_group:
                temp_df['neighbourhood_group'] = forced_group
            else:
                # For NYC files, use 'neighbourhood_group_cleansed'
                if 'neighbourhood_group_cleansed' in temp_df.columns:
                     temp_df.rename(columns={'neighbourhood_group_cleansed': 'neighbourhood_group'}, inplace=True)
                
                if 'neighbourhood_group' not in temp_df.columns:
                    temp_df['neighbourhood_group'] = 'New York'

            # Fix Neighborhood Column: Use 'neighbourhood_cleansed' instead of 'neighbourhood'
            if 'neighbourhood_cleansed' in temp_df.columns:
                temp_df['neighbourhood'] = temp_df['neighbourhood_cleansed']

            dfs.append(temp_df)
        except Exception as e:
            print(f"Error loading {f}: {e}")
    
    if not dfs: return
    df = pd.concat(dfs, ignore_index=True)
    print(f"Combined total rows: {len(df)}")
    
    # 3. Process
    print("Processing...")
    
    # Clean Price
    if df['price'].dtype == object:
        df['price'] = df['price'].replace('[\$,]', '', regex=True)
    
    df['price'] = pd.to_numeric(df['price'], errors='coerce')
    
    # Clean columns
    numeric_cols = ['latitude', 'longitude', 'minimum_nights', 'number_of_reviews', 'review_scores_rating']
    if 'review_scores_rating' not in df.columns:
        df['review_scores_rating'] = None # Create if missing

    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    # Filter valid
    df.dropna(subset=['latitude', 'longitude', 'name', 'price'], inplace=True)
    df = df[(df['price'] >= 10) & (df['price'] <= 1000)]
    
    # Fill Missing
    df['neighbourhood_group'].fillna('Unknown', inplace=True)
    df['neighbourhood'].fillna('Unknown', inplace=True)
    df['review_scores_rating'].fillna(0, inplace=True) # Fill missing ratings with 0
        
    cols = ['id', 'name', 'latitude', 'longitude', 'price', 
            'minimum_nights', 'number_of_reviews', 'neighbourhood_group', 'neighbourhood', 'room_type', 'review_scores_rating']
            
    # Ensure all cols exist
    for c in cols:
        if c not in df.columns: df[c] = 'Unknown' if c == 'neighbourhood' else 0
        
    df_processed = df[cols].copy()
    
    # Sample if too huge
    if len(df_processed) > MAX_ROWS:
        print(f"Sampling {MAX_ROWS} from {len(df_processed)} rows...")
        df_processed = df_processed.sample(n=MAX_ROWS, random_state=42)
    
    # 4. Subway Distance
    print("Calculating distances (this may take a while)...")
    stations = load_subway_stations()
    if stations:
        df_processed['dist_to_subway'] = df_processed.apply(lambda row: get_min_distance(row, stations), axis=1)
    else:
        df_processed['dist_to_subway'] = 0

    # 5. Output
    print(f"Saving {len(df_processed)} rows to {OUTPUT_JSON_FILE}...")
    df_processed.to_json(OUTPUT_JSON_FILE, orient='records', indent=None)
    print("Done!")

if __name__ == "__main__":
    main()
