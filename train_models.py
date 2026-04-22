import pandas as pd
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestClassifier
from xgboost import XGBClassifier
import joblib
from sklearn.calibration import CalibratedClassifierCV

# Load training data
df = pd.read_csv("data/train_data.csv")

# Create encoders
le_state = LabelEncoder()
le_crop = LabelEncoder()
le_dist = LabelEncoder()
le_season = LabelEncoder()
le_risk = LabelEncoder()

# Encode categorical columns
df["State"] = le_state.fit_transform(df["State"])
df["Crop"] = le_crop.fit_transform(df["Crop"])
df["District"] = le_dist.fit_transform(df["District"])
df["Season"] = le_season.fit_transform(df["Season"])

# Target
y = le_risk.fit_transform(df["Risk"])

# Features
X = df.drop("Risk", axis=1)

# Models
model1 = XGBClassifier(eval_metric="mlogloss")
model2 = RandomForestClassifier(n_estimators=200, random_state=42)

# Train
model1.fit(X, y)
model2.fit(X, y)


# Save models
# Note: Using joblib for the calibrated wrapper, but saving base XGB separately for robustness
model1.save_model("models/xgb.json") # Recommended for cross-version compatibility
joblib.dump(model1, "models/xgb.pkl")
joblib.dump(model2, "models/rf.pkl")

# Save encoders
joblib.dump(le_state, "models/state_enc.pkl")
joblib.dump(le_crop, "models/crop_enc.pkl")
joblib.dump(le_dist, "models/dist_enc.pkl")
joblib.dump(le_season, "models/season_enc.pkl")
joblib.dump(le_risk, "models/risk_enc.pkl")


calibrated_model = CalibratedClassifierCV(model1, method='sigmoid')
calibrated_model.fit(X, y)

joblib.dump(calibrated_model, "models/xgb_calibrated.pkl")

print("Models trained and saved successfully.")
