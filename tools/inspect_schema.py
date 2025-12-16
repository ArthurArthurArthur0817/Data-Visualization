import pandas as pd
import gzip

FILE = 'data/raw/jersey_city_listings.csv.gz'

try:
    with gzip.open(FILE, 'rt', encoding='utf-8') as f:
        df = pd.read_csv(f, nrows=5)
        print("Columns:", df.columns.tolist())
        print("\nFirst row sample:")
        print(df.iloc[0])
        print("\nPrice column sample:")
        print(df['price'].head())
except Exception as e:
    print(e)
