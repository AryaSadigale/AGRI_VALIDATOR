import pandas as pd
from sklearn.model_selection import train_test_split

df = pd.read_csv("data/des_with_risk.csv")
train, val = train_test_split(df, test_size=0.2, random_state=42)

train.to_csv("data/train_data.csv", index=False)
val.to_csv("data/validation_data.csv", index=False)

print("Train and validation files created.")
