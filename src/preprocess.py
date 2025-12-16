import pandas as pd
import json

# 設定檔案路徑
CSV_FILE = 'data/AB_NYC_2019.csv'
OUTPUT_JSON_FILE = 'processed_data.json'
MAX_ROWS = 1000  # <--- 新增：設定最大輸出筆數為 200

def preprocess_airbnb_data(df):
    """
    對 Airbnb 數據進行清理和轉換。
    """
    print("--- 開始資料前處理 ---")
    initial_rows = len(df)

    # ... (欄位類型轉換和缺失值處理邏輯保持不變) ...
    numeric_cols = ['latitude', 'longitude', 'price', 'minimum_nights', 'number_of_reviews']
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    df.dropna(subset=numeric_cols + ['name', 'host_name', 'neighbourhood_group', 'room_type'], inplace=True)
    df = df[(df['price'] >= 1) & (df['price'] <= 1000)]
    
    # 僅保留視覺化所需的欄位
    selected_cols = [
        'id', 'name', 'host_id', 'latitude', 'longitude', 'price',
        'minimum_nights', 'number_of_reviews', 'neighbourhood_group', 'room_type'
    ]
    df_processed = df[selected_cols]

    print(f"總共處理了 {initial_rows} 筆，最終清理後剩餘 {len(df_processed)} 筆資料。")
    return df_processed

def main():
    try:
        # 載入 CSV 檔案，使用正確的編碼
        df = pd.read_csv(CSV_FILE, encoding='latin-1') 
    except FileNotFoundError:
        print(f"錯誤：找不到檔案 {CSV_FILE}。請確認檔案路徑。")
        return

    # 執行前處理
    processed_df = preprocess_airbnb_data(df)
    
    # *** 關鍵修改：限制輸出數據量 ***
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