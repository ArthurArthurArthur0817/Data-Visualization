import pandas as pd
import json
import math

# 設定檔案路徑
CSV_FILE = 'data/AB_NYC_2019.csv'
SUBWAY_GEOJSON = 'data/nyc_subway.geojson'
OUTPUT_JSON_FILE = 'processed_data.json'
MAX_ROWS = 2000  # 增加數據量以利展示

def haversine_distance(lat1, lon1, lat2, lon2):
    """
    計算兩點間的 Haversine 距離 (單位：公尺)
    """
    R = 6371000  # 地球半徑 (公尺)
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
    """載入地鐵站座標列表 [(lat, lon), ...]"""
    try:
        with open(SUBWAY_GEOJSON, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        stations = []
        for feature in data['features']:
            # GeoJSON coordinates are [lon, lat]
            lon, lat = feature['geometry']['coordinates']
            stations.append((lat, lon))
        return stations
    except FileNotFoundError:
        print(f"警告：找不到地鐵數據 {SUBWAY_GEOJSON}，將略過距離計算。")
        return []

def get_min_distance(row, stations):
    """計算房源到最近地鐵站的距離"""
    if not stations:
        return 0
    
    lat = row['latitude']
    lon = row['longitude']
    
    # 簡單的線性搜尋 (對於 500站 * 2000房源 = 1M 次計算，Python 還撐得住)
    min_dist = float('inf')
    for s_lat, s_lon in stations:
        dist = haversine_distance(lat, lon, s_lat, s_lon)
        if dist < min_dist:
            min_dist = dist
    return int(min_dist)

def preprocess_airbnb_data(df):
    """
    對 Airbnb 數據進行清理和轉換。
    """
    print("--- 開始資料前處理 ---")
    initial_rows = len(df)

    # 數值轉換
    numeric_cols = ['latitude', 'longitude', 'price', 'minimum_nights', 'number_of_reviews']
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    
    # 移除缺失值
    df.dropna(subset=numeric_cols + ['name', 'neighbourhood_group', 'neighbourhood', 'room_type'], inplace=True)
    
    # 價格過濾 (合理範圍)
    df = df[(df['price'] >= 10) & (df['price'] <= 1000)]
    
    # 載入地鐵站並計算距離
    print("正在下載並計算地鐵站距離 (這可能需要一點時間)...")
    stations = load_subway_stations()

    # 僅保留視覺化所需的欄位 (包含 neighbourhood)
    selected_cols = [
        'id', 'name', 'host_id', 'latitude', 'longitude', 'price',
        'minimum_nights', 'number_of_reviews', 'neighbourhood_group', 'neighbourhood', 'room_type'
    ]
    df_processed = df[selected_cols].copy()

    # 優化：先篩選出要輸出的量，再算距離，大幅節省時間
    if stations:
        # 先隨機取樣如果數據過多
        if len(df_processed) > MAX_ROWS * 2:
             df_processed = df_processed.sample(n=MAX_ROWS * 2, random_state=42)
        
        print(f"正在為 {len(df_processed)} 筆資料計算最近捷運距離...")
        df_processed['dist_to_subway'] = df_processed.apply(lambda row: get_min_distance(row, stations), axis=1)
    else:
        df_processed['dist_to_subway'] = 0

    print(f"總共處理了 {initial_rows} 筆，最終清理後剩餘 {len(df_processed)} 筆資料。")
    return df_processed

def main():
    try:
        # 載入 CSV 檔案
        df = pd.read_csv(CSV_FILE, encoding='latin-1') 
    except FileNotFoundError:
        print(f"錯誤：找不到檔案 {CSV_FILE}。請確認檔案路徑。")
        return

    # 執行前處理
    processed_df = preprocess_airbnb_data(df)
    
    # 輸出限制
    if len(processed_df) > MAX_ROWS:
        output_df = processed_df.head(MAX_ROWS)
        print(f"限制輸出數據為前 {MAX_ROWS} 筆。")
    else:
        output_df = processed_df
        
    # 輸出為 JSON 檔案
    output_df.to_json(
        OUTPUT_JSON_FILE,
        orient='records',
        indent=4
    )
    print(f"\n資料處理完成，已儲存 {len(output_df)} 筆數據至 {OUTPUT_JSON_FILE}")

if __name__ == "__main__":
    main()