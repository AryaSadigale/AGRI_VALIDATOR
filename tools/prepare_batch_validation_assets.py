from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import sys
from typing import Dict, List

import joblib
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from expert_engine import validate_prediction_with_experts

DATA_PATH = ROOT / "data" / "validation_data.csv"
MODELS_DIR = ROOT / "models"
OUTPUT_DIR = ROOT / "outputs" / "batch_validation_pack_20260425"

PREFERRED_STATES = ["Maharashtra", "Karnataka", "Andhra Pradesh", "Telangana"]
STATE_QUOTAS = {
    "Low": {
        "Maharashtra": 35,
        "Telangana": 25,
        "Karnataka": 25,
        "Andhra Pradesh": 15,
    },
    "Medium": {
        "Maharashtra": 40,
        "Karnataka": 30,
        "Andhra Pradesh": 20,
        "Telangana": 10,
    },
    "High": {
        "Maharashtra": 50,
        "Karnataka": 25,
        "Andhra Pradesh": 15,
        "Telangana": 10,
    },
}


def safe_encode(encoder, value: str) -> int:
    if value in encoder.classes_:
        return int(encoder.transform([value])[0])

    normalized = str(value).strip().lower()
    for known_value in encoder.classes_:
        if str(known_value).strip().lower() == normalized:
            return int(encoder.transform([known_value])[0])
    return -1


def load_assets():
    model = joblib.load(MODELS_DIR / "xgb_calibrated.pkl")
    le_state = joblib.load(MODELS_DIR / "state_enc.pkl")
    le_dist = joblib.load(MODELS_DIR / "dist_enc.pkl")
    le_crop = joblib.load(MODELS_DIR / "crop_enc.pkl")
    le_season = joblib.load(MODELS_DIR / "season_enc.pkl")
    le_risk = joblib.load(MODELS_DIR / "risk_enc.pkl")
    return model, le_state, le_dist, le_crop, le_season, le_risk


def score_quality(row: pd.Series) -> float:
    score = 0.0

    if row["Expected_RDI"] > 0:
        score += 1.25
    if row["Season"] != "Total":
        score += 0.75
    if row["Agreement_Level"] in {"partial_conflict", "ai_expert_consensus"}:
        score += 0.40
    if 0.05 <= row["Area"] <= 5:
        score += 0.30
    if 0.05 <= row["Production"] <= 10:
        score += 0.20
    if 300 <= row["Yield"] <= 4000:
        score += 0.25
    if row["Expected_Status"] != "REJECTED":
        score += 0.15

    return round(score, 3)


def predict_outputs(df: pd.DataFrame) -> pd.DataFrame:
    model, le_state, le_dist, le_crop, le_season, le_risk = load_assets()

    rows: List[Dict[str, object]] = []
    for _, row in df.iterrows():
        encoded = np.array([[
            safe_encode(le_state, row["State"]),
            safe_encode(le_dist, row["District"]),
            safe_encode(le_crop, row["Crop"]),
            safe_encode(le_season, row["Season"]),
            float(row["Area"]),
            float(row["Production"]),
            float(row["Yield"]),
        ]])

        if (encoded[:, :4] < 0).any():
            continue

        proba = model.predict_proba(encoded)[0]
        pred = int(np.argmax(proba))
        pcs = float(np.max(proba))
        ai_risk = le_risk.inverse_transform([pred])[0]

        validation = validate_prediction_with_experts(
            {
                "State": row["State"],
                "District": row["District"],
                "Crop": row["Crop"],
                "Season": row["Season"],
                "Area": float(row["Area"]),
                "Production": float(row["Production"]),
                "Yield": float(row["Yield"]),
            },
            ai_risk,
            pcs,
        )

        rows.append(
            {
                "State": row["State"],
                "District": row["District"],
                "Crop": row["Crop"],
                "Season": row["Season"],
                "Area": round(float(row["Area"]), 2),
                "Production": round(float(row["Production"]), 2),
                "Yield": round(float(row["Yield"]), 2),
                "Expected_AI_Risk": ai_risk,
                "Expected_Expert_Risk": validation["expert_risk"],
                "Expected_Final_Risk": validation["final_risk"],
                "Expected_PCS": round(pcs, 3),
                "Expected_EAS": round(float(validation["eas"]), 3),
                "Expected_RDI": round(float(validation["rdi"]), 3),
                "Expected_TRI": round(float(validation["tri"]), 2),
                "Expected_Status": validation["validation_status"],
                "Expected_Decision": validation["final_decision"],
                "Agreement_Level": validation["expert_consensus"]["agreement_level"],
                "AI_Expert_Agreement": round(
                    float(validation["expert_consensus"]["ai_expert_agreement"]), 3
                ),
                "Expert_Source_Agreement": round(
                    float(validation["expert_consensus"]["expert_source_agreement"]), 3
                ),
                "Confidence_Band": validation["confidence_band"],
            }
        )

    out = pd.DataFrame(rows)
    out["Quality_Score"] = out.apply(score_quality, axis=1)
    return out


def select_diverse_rows(candidates: pd.DataFrame, target: int) -> pd.DataFrame:
    ordered = candidates.sort_values(
        ["Quality_Score", "Expected_RDI", "Expected_TRI", "District"],
        ascending=[False, False, False, True],
    )
    crop_groups = {
        crop: group.to_dict("records")
        for crop, group in ordered.groupby("Crop", sort=True)
    }

    selected: List[Dict[str, object]] = []
    used_rows = set()
    while len(selected) < target and crop_groups:
        empty_crops: List[str] = []
        progress = False
        for crop in sorted(crop_groups, key=lambda value: (-len(crop_groups[value]), value)):
            while crop_groups[crop]:
                record = crop_groups[crop].pop(0)
                key = (
                    record["State"],
                    record["District"],
                    record["Crop"],
                    record["Season"],
                    record["Area"],
                    record["Production"],
                    record["Yield"],
                )
                if key in used_rows:
                    continue
                selected.append(record)
                used_rows.add(key)
                progress = True
                break

            if not crop_groups[crop]:
                empty_crops.append(crop)

            if len(selected) >= target:
                break

        for crop in empty_crops:
            crop_groups.pop(crop, None)

        if not progress:
            break

    if len(selected) < target:
        filler = ordered.loc[
            ~ordered.apply(
                lambda record: (
                    record["State"],
                    record["District"],
                    record["Crop"],
                    record["Season"],
                    record["Area"],
                    record["Production"],
                    record["Yield"],
                )
                in used_rows,
                axis=1,
            )
        ]
        for _, record in filler.head(target - len(selected)).iterrows():
            selected.append(record.to_dict())

    return pd.DataFrame(selected).head(target)


def curate_batch_pack(predicted: pd.DataFrame) -> pd.DataFrame:
    selected_groups: List[pd.DataFrame] = []

    for risk, state_quotas in STATE_QUOTAS.items():
        for state, quota in state_quotas.items():
            subset = predicted[
                (predicted["Expected_Final_Risk"] == risk)
                & (predicted["State"] == state)
            ].copy()
            if len(subset) < quota:
                raise RuntimeError(
                    f"Not enough rows for {risk} / {state}. Needed {quota}, found {len(subset)}."
                )
            selected_groups.append(select_diverse_rows(subset, quota))

    selected = pd.concat(selected_groups, ignore_index=True)

    by_risk = {
        risk: selected[selected["Expected_Final_Risk"] == risk]
        .sort_values(["State", "Crop", "District", "Season"])
        .reset_index(drop=True)
        for risk in ["Low", "Medium", "High"]
    }

    interleaved: List[Dict[str, object]] = []
    risk_rows = {
        risk: group.to_dict("records")
        for risk, group in by_risk.items()
    }

    for index in range(max(len(rows) for rows in risk_rows.values())):
        for risk in ["Low", "Medium", "High"]:
            if index < len(risk_rows[risk]):
                interleaved.append(risk_rows[risk][index])

    final_df = pd.DataFrame(interleaved).reset_index(drop=True)
    final_df.insert(0, "Batch_Case_ID", [f"CASE-{i:03d}" for i in range(1, len(final_df) + 1)])
    final_df.insert(1, "Upload_Row", [i + 2 for i in range(len(final_df))])
    return final_df


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    raw = pd.read_csv(DATA_PATH)
    raw = raw[raw["State"].isin(PREFERRED_STATES)].copy()
    for column in ["Area", "Production", "Yield"]:
        raw[column] = pd.to_numeric(raw[column], errors="coerce")
    raw = raw[(raw["Area"] > 0) & (raw["Production"] > 0) & (raw["Yield"] > 0)].copy()

    predicted = predict_outputs(raw)
    curated = curate_batch_pack(predicted)

    upload_ready = curated[
        ["State", "District", "Crop", "Season", "Area", "Production", "Yield"]
    ].copy()

    reference = curated[
        [
            "Batch_Case_ID",
            "Upload_Row",
            "State",
            "District",
            "Crop",
            "Season",
            "Area",
            "Production",
            "Yield",
            "Expected_AI_Risk",
            "Expected_Expert_Risk",
            "Expected_Final_Risk",
            "Expected_PCS",
            "Expected_EAS",
            "Expected_RDI",
            "Expected_TRI",
            "Expected_Status",
            "Expected_Decision",
            "Agreement_Level",
            "AI_Expert_Agreement",
            "Expert_Source_Agreement",
            "Confidence_Band",
        ]
    ].copy()

    upload_ready.to_csv(OUTPUT_DIR / "batch_upload_ready.csv", index=False)
    reference.to_csv(OUTPUT_DIR / "batch_reference_outputs.csv", index=False)

    summary = {
        "total_rows": int(len(reference)),
        "state_distribution": reference["State"].value_counts().sort_index().to_dict(),
        "risk_distribution": reference["Expected_Final_Risk"].value_counts().sort_index().to_dict(),
        "status_distribution": reference["Expected_Status"].value_counts().sort_index().to_dict(),
        "season_distribution": reference["Season"].value_counts().sort_index().to_dict(),
        "average_rdi": round(float(reference["Expected_RDI"].mean()), 3),
        "average_tri": round(float(reference["Expected_TRI"].mean()), 2),
    }

    pd.Series(summary).to_json(OUTPUT_DIR / "batch_metadata.json", indent=2)
    print(f"Prepared batch assets in: {OUTPUT_DIR}")
    print(reference["Expected_Final_Risk"].value_counts().sort_index().to_string())
    print(reference["State"].value_counts().sort_index().to_string())


if __name__ == "__main__":
    main()
