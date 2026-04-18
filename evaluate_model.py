import pandas as pd
import joblib
from sklearn.metrics import roc_auc_score

df = pd.read_csv("data/validation_data.csv")

model = joblib.load("models/xgb_calibrated.pkl")
le_risk = joblib.load("models/risk_enc.pkl")

y_true = le_risk.transform(df["Risk"])
X = df.drop("Risk", axis=1)

proba = model.predict_proba(X)

auc = roc_auc_score(y_true, proba, multi_class='ovr')

print("Validation ROC-AUC Score:", round(auc, 3))
