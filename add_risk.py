import pandas as pd

df = pd.read_csv("data/des_data.csv")

low = df["Yield"].quantile(0.25)
mid = df["Yield"].quantile(0.60)

def risk(y):
    if y <= low:
        return "High"
    elif y <= mid:
        return "Medium"
    else:
        return "Low"

df["Risk"] = df["Yield"].apply(risk)
df.to_csv("data/des_with_risk.csv", index=False)

print("Risk column added.")
