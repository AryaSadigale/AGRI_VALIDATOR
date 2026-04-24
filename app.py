from fastapi import FastAPI, Query, Request, Header
from pydantic import BaseModel
import joblib
import numpy as np
from fastapi.middleware.cors import CORSMiddleware
from gemini_llm import generate_advisory
from llm_validator import validate_llm
import pandas as pd
from fastapi import UploadFile, File
import os
from datetime import datetime
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from typing import Optional, List, Dict, Any
from PyPDF2 import PdfReader
from io import StringIO
import csv
import re
from database import (
    store_prediction, store_predictions_bulk, get_prediction_history, get_prediction_by_id,
    get_model_metrics, get_risk_by_state, get_system_metrics, get_insights,
    store_officer_review, get_officer_reviews, store_system_log, get_audit_logs,
    store_expert_validations,
    get_user_profile,
    create_loan_request, get_all_loan_requests, submit_loan_decision, get_farmer_loans
)
from expert_engine import validate_prediction_with_experts
from supabase_config import supabase

app = FastAPI(title="Agri Recommendation Validator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load models & encoders (Note: models were retrained for environment compatibility)
model = joblib.load("models/xgb_calibrated.pkl")
le_state = joblib.load("models/state_enc.pkl")
le_crop = joblib.load("models/crop_enc.pkl")
le_dist = joblib.load("models/dist_enc.pkl")
le_season = joblib.load("models/season_enc.pkl")
le_risk = joblib.load("models/risk_enc.pkl")

# Expert rules held in-memory, refreshable from PDF upload
expert_rules: List[Dict[str, Any]] = []

# Load Location Data for dynamic dropdowns
location_data: Dict[str, List[str]] = {}
try:
    _base_dir = os.path.dirname(os.path.abspath(__file__))
    _csv_path = os.path.join(_base_dir, "data", "train_data.csv")
    if os.path.exists(_csv_path):
        _df_loc = pd.read_csv(_csv_path)
        for state in _df_loc["State"].unique():
            location_data[state] = sorted(_df_loc[_df_loc["State"] == state]["District"].unique().tolist())
        print(f"Loaded location data: {len(location_data)} states, {sum(len(d) for d in location_data.values())} districts")
        del _df_loc
    else:
        print(f"Warning: Location data file not found at {_csv_path}")
except Exception as e:
    print(f"Error loading location data: {e}")


def load_default_icar_rules():
    icar_path = "icar.pdf"
    if os.path.isfile(icar_path):
        try:
            text = extract_text_from_pdf(icar_path)
            parsed = parse_expert_rules(text)
            if parsed:
                expert_rules.clear()
                expert_rules.extend(parsed)
                store_system_log("RULES", "Loaded expert rules from icar.pdf", f"Rules={len(parsed)}")
            else:
                store_system_log("RULES", "icar.pdf found but no rules parsed", "Check PDF rule format")
        except Exception as e:
            store_system_log("RULES", "Failed to load icar.pdf", str(e))


def extract_text_from_pdf(path: str) -> str:
    try:
        reader = PdfReader(path)
        text = []
        for page in reader.pages:
            page_text = page.extract_text() or ""
            text.append(page_text)
        return "\n".join(text)
    except Exception as e:
        raise RuntimeError(f"Failed to read PDF: {e}")


def parse_expert_rules(text: str) -> List[Dict[str, Any]]:
    rules = []
    # Rule example patterns:
    # If Crop is Rice and Yield < 1800 then High
    # Rice: Low <1800 Medium <2800 High >=2800
    lines = [l.strip() for l in text.splitlines() if l.strip()]

    for line in lines:
        m = re.search(r"if\s+crop\s+is\s+(\w+)\s+and\s+yield\s*([<>=]+)\s*(\d+(?:\.\d+)?)\s*then\s+(low|medium|high)", line, re.IGNORECASE)
        if m:
            crop, op, value, risk = m.groups()
            rules.append({"crop": crop.lower(), "op": op, "yield": float(value), "risk": risk.capitalize()})
            continue

        m2 = re.search(r"(\w+):\s*Low\s*<\s*(\d+(?:\.\d+)?)\s*Medium\s*<\s*(\d+(?:\.\d+)?)\s*High", line, re.IGNORECASE)
        if m2:
            crop, low, med = m2.groups()
            rules.append({"crop": crop.lower(), "bound_low": float(low), "bound_med": float(med)})
            continue

    return rules


# Load ICAR default expert rules at service startup (if available)
load_default_icar_rules()


# Log startup
store_system_log("SYSTEM", "Application started", "All models loaded successfully")


def evaluate_expert_rules(data: Dict[str, Any]) -> Optional[str]:
    if not expert_rules:
        return None

    crop = data.get("Crop", "").lower()
    y = data.get("Yield", 0)

    # First apply explicit predicate rules
    for r in expert_rules:
        if r.get("crop") == crop and "op" in r and "yield" in r:
            expr = f"{y} {r['op']} {r['yield']}"
            try:
                if eval(expr):
                    return r["risk"]
            except Exception:
                pass

    # Then apply bound rules as fallback
    for r in expert_rules:
        if r.get("crop") == crop and "bound_low" in r and "bound_med" in r:
            if y < r["bound_low"]:
                return "High"
            elif y < r["bound_med"]:
                return "Medium"
            else:
                return "Low"

    return None


def get_expert_rule_explanation(data: Dict[str, Any]) -> str:
    crop = data.get("Crop", "").lower()
    y = data.get("Yield", 0)
    season = data.get("Season", "Unknown")
    state = data.get("State", "Unknown")
    district = data.get("District", "Unknown")
    area = data.get("Area", 0)
    production = data.get("Production", 0)

    matched_rule = None
    matched_type = None

    # explicit rule format has higher precedence
    for r in expert_rules:
        if r.get("crop") == crop and "op" in r and "yield" in r:
            try:
                if eval(f"{y} {r['op']} {r['yield']}"):
                    matched_rule = r
                    matched_type = "explicit"
                    break
            except Exception:
                continue

    # bound rule fallback
    if not matched_rule:
        for r in expert_rules:
            if r.get("crop") == crop and "bound_low" in r and "bound_med" in r:
                matched_rule = r
                matched_type = "bound"
                break

    expert_risk = expert_system(data)

    if matched_rule and matched_type == "explicit":
        return (
            f"ICAR Expert Insight for {crop.capitalize()} ({district}, {state}, {season}):\n"
            f"Observed yield = {y:.2f} t/ha, expected rule threshold: yield {matched_rule['op']} {matched_rule['yield']} => {matched_rule['risk']} risk.\n"
            f"Expert verdict: {matched_rule['risk']} risk.\n"
            f"Suggested actions: "
            f"{_generate_tips_for_risk(matched_rule['risk'], crop, season, y)}"
        )

    if matched_rule and matched_type == "bound":
        if y < matched_rule["bound_low"]:
            advice = "High"
        elif y < matched_rule["bound_med"]:
            advice = "Medium"
        else:
            advice = "Low"
        return (
            f"ICAR Benchmark for {crop.capitalize()} (district: {district}, state: {state}, season: {season}):\n"
            f"Yield {y:.2f} t/ha falls in {advice} risk based on bounds (High < {matched_rule['bound_low']}, Medium < {matched_rule['bound_med']}).\n"
            f"Expert verdict: {advice} risk.\n"
            f"Suggested actions: { _generate_tips_for_risk(advice, crop, season, y)}"
        )

    # fallback with standardized guidance using the system's risk
    return (
        f"ICAR fallback advisory for {crop.capitalize()} ({district}, {state}, {season}):\n"
        f"Area: {area} ha, Production: {production} t, Yield: {y:.2f} t/ha.\n"
        f"Derived expert risk: {expert_risk}.\n"
        f"Insights: { _generate_tips_for_risk(expert_risk, crop, season, y)}"
    )


def _generate_tips_for_risk(risk_level: str, crop: str, season: str, yield_val: float) -> str:
    risk_level = (risk_level or "Unknown").capitalize()
    crop_lower = crop.lower() if crop else "unknown"
    crop_note = f"For {crop.capitalize()} in {season} season, current yield is {yield_val:.2f} t/ha."

    crop_guidance = {
        "rice": {
            "high": "Focus on water management through alternate wetting and drying; check for blast and brown spot diseases.",
            "medium": "Keep uniform irrigation and top-dress with urea at tillering; monitor leaf color and pests.",
            "low": "Continue proper standing water depth and weed control; prepare for timely harvesting with good grain quality."
        },
        "wheat": {
            "high": "Improve irrigation scheduling and nitrogen application; scout for rust and aphids, and apply fungicide as needed.",
            "medium": "Ensure balanced phosphorus and potassium levels; protect from lodging and late-season moisture stress.",
            "low": "Maintain normal irrigation and weed control; schedule harvest for optimum moisture and avoid late rains."
        },
        "maize": {
            "high": "Check for moisture deficiency and nutrient gap; add zinc and boron where needed and use IPM for stem borer.",
            "medium": "Monitor for leaf disease and provide split fertilizer doses; manage weeds with mechanical weeding.",
            "low": "Follow standard hybrid maize best practice; apply through-flow irrigation, and plan grain drying after harvest."
        },
        "moong": {
            "high": "Use light irrigation with soil moisture monitoring; watch for yellow mosaic virus and thrips under high humidity.",
            "medium": "Apply balanced NPK in split doses and keep field clean from weeds; watch grain filling stage closely.",
            "low": "Maintain recommended spacing, protect from pod borer, and harvest when pods mature to prevent shattering."
        }
    }

    crop_specific = crop_guidance.get(crop_lower, {})
    specific_tip = crop_specific.get(risk_level.lower())

    if risk_level == "High":
        risk_tip = "This indicates elevated risk; act quickly with corrective field interventions."
    elif risk_level == "Medium":
        risk_tip = "This indicates moderate risk; monitor intensity and adjust nutrients and irrigation accordingly."
    elif risk_level == "Low":
        risk_tip = "This indicates good risk level; keep actions steady and prevent sudden decline." 
    else:
        risk_tip = "No direct risk tier available; follow standard crop management practices and consult local agronomist."

    if specific_tip:
        return f"{crop_note} {risk_tip} {specific_tip}"

    # Generic fallback with risk-specific suggestions
    if risk_level == "High":
        return (
            f"{crop_note} {risk_tip} Increase irrigation frequency with drip or sprinklers, apply balanced NPK and micronutrient foliar spray, implement integrated pest management, and conduct soil testing immediately."
        )
    if risk_level == "Medium":
        return (
            f"{crop_note} {risk_tip} Use split-dose fertilization, maintain proper weed control, and monitor growth stages carefully to avoid late-season stress."
        )
    return (
        f"{crop_note} {risk_tip} Continue good field sanitation, maintain optimal irrigation, and prepare for timely harvesting with quality assessment checks."
    )


# ==================== AUTH HELPER ====================

async def get_current_user(authorization: Optional[str] = Header(None)):
    """Extract user from Supabase JWT token."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.replace("Bearer ", "")
    try:
        user_resp = supabase.auth.get_user(token)
        if user_resp and user_resp.user:
            uid = str(user_resp.user.id)
            profile = get_user_profile(uid)
            metadata_role = user_resp.user.user_metadata.get("role") if user_resp.user.user_metadata else None
            metadata_name = user_resp.user.user_metadata.get("name") if user_resp.user.user_metadata else None
            return {
                "id": uid,
                "email": user_resp.user.email,
                "name": (profile and profile.get("name")) or metadata_name or "User",
                "role": (profile and profile.get("role")) or metadata_role or "farmer",
            }
    except Exception:
        pass
    return None


class InputData(BaseModel):
    State: str
    District: str
    Crop: str
    Season: str
    Area: float
    Production: float
    Yield: float


class OfficerReviewInput(BaseModel):
    prediction_id: int
    officer_name: str
    decision: str
    comments: str = ""


class RegisterInput(BaseModel):
    email: str
    password: str
    name: str
    role: str


class LoanRequestInput(BaseModel):
    prediction_id: int


class LoanDecisionInput(BaseModel):
    loan_id: int
    officer_name: str
    decision: str
    reason: str = ""


BATCH_REQUIRED_COLUMNS = ["State", "District", "Crop", "Season", "Area", "Production", "Yield"]
BATCH_COLUMN_ALIASES = {
    "state": "State",
    "district": "District",
    "crop": "Crop",
    "crop_type": "Crop",
    "season": "Season",
    "area": "Area",
    "area_ha": "Area",
    "cultivated_area": "Area",
    "production": "Production",
    "production_tonnes": "Production",
    "production_tons": "Production",
    "yield": "Yield",
    "yield_val": "Yield",
    "yield_kg_ha": "Yield",
    "yield_t_ha": "Yield",
    "yield_tonnes_hectare": "Yield",
    "risk": "Risk",
}


def safe_encode(encoder, value):
    if value in encoder.classes_:
        return encoder.transform([value])[0]

    normalized = str(value).strip().lower()
    for known_value in encoder.classes_:
        if str(known_value).strip().lower() == normalized:
            return encoder.transform([known_value])[0]

    return -1


def _normalize_batch_column_name(value: Any) -> str:
    return str(value or "").strip().lower().replace(" ", "_")


def _normalize_batch_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    rename_map = {}
    for column in df.columns:
        alias = BATCH_COLUMN_ALIASES.get(_normalize_batch_column_name(column))
        if alias:
            rename_map[column] = alias
    return df.rename(columns=rename_map)


def _clean_batch_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


def _clean_batch_number(value: Any) -> Optional[float]:
    try:
        if pd.isna(value):
            return None
        normalized = str(value).strip().replace(",", "")
        if not normalized:
            return None
        return float(normalized)
    except (TypeError, ValueError):
        return None


def _detect_csv_separator(sample_text: str) -> str:
    try:
        dialect = csv.Sniffer().sniff(sample_text, delimiters=",;\t|")
        return dialect.delimiter
    except Exception:
        candidates = {sep: sample_text.count(sep) for sep in [",", ";", "\t", "|"]}
        return max(candidates, key=candidates.get)


def _resolve_batch_header_row(lines: List[str], separator: str) -> int:
    for index, line in enumerate(lines[:25]):
        raw_headers = next(csv.reader([line], delimiter=separator), [])
        normalized_headers = {
            BATCH_COLUMN_ALIASES.get(_normalize_batch_column_name(value), value)
            for value in raw_headers
        }
        if set(BATCH_REQUIRED_COLUMNS).issubset(normalized_headers):
            return index
    return 0


def _read_batch_csv(file_path: str) -> pd.DataFrame:
    raw_bytes = open(file_path, "rb").read()
    decode_errors: List[str] = []

    for encoding in ["utf-8-sig", "utf-8", "cp1252", "latin1", "utf-16"]:
        try:
            text = raw_bytes.decode(encoding)
        except UnicodeDecodeError as exc:
            decode_errors.append(f"{encoding}: {exc}")
            continue

        sample = "\n".join(text.splitlines()[:10]) or text[:2048]
        separator = _detect_csv_separator(sample)
        header_row = _resolve_batch_header_row(text.splitlines(), separator)

        for sep in [separator, ",", ";", "\t", "|"]:
            try:
                df = pd.read_csv(
                    StringIO(text),
                    sep=sep,
                    skip_blank_lines=True,
                    header=header_row,
                )
            except Exception:
                continue

            if df.empty and len(text.strip()) > 0:
                continue

            df = _normalize_batch_dataframe(df)
            df.columns = df.columns.astype(str).str.strip()
            if set(BATCH_REQUIRED_COLUMNS).issubset(df.columns):
                return df

    detail = "; ".join(decode_errors[:3])
    raise ValueError(
        "Could not read the CSV file. Please use a plain CSV with headers: "
        "State, District, Crop, Season, Area, Production, Yield."
        + (f" Parse details: {detail}" if detail else "")
    )


@app.get("/")
def home():
    return FileResponse("landing.html")


@app.get("/login")
def login_page():
    return FileResponse("login.html")


@app.get("/farmer/dashboard")
def farmer_dashboard():
    return FileResponse("farmer.html")


@app.get("/officer/dashboard")
def officer_dashboard():
    # Agri officer portal uses the agriculture officer dashboard layout
    return FileResponse("index.html")


@app.get("/bank/dashboard")
def bank_dashboard():
    return FileResponse("bank_officer.html")


@app.get("/dashboard")
async def role_based_dashboard(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    if not user:
        return FileResponse("login.html")

    role = (user.get("role") or "farmer").lower()
    if role == "farmer":
        return FileResponse("farmer.html")
    if role == "bank_officer":
        return FileResponse("bank_officer.html")
    # All remaining officers use agri dashboard
    return FileResponse("index.html")


@app.post("/api/register")
def api_register(data: RegisterInput):
    """Register via Supabase Admin API — no email confirmation, no rate limits."""
    if data.role not in ('farmer', 'agrivalidator_officer', 'bank_officer'):
        return {"error": "Invalid role. Must be 'farmer', 'agrivalidator_officer', or 'bank_officer'."}
    if len(data.password) < 6:
        return {"error": "Password must be at least 6 characters."}
    if not data.email or '@' not in data.email:
        return {"error": "Invalid email address."}
    try:
        user_resp = supabase.auth.admin.create_user({
            "email": data.email,
            "password": data.password,
            "email_confirm": True,
            "user_metadata": {"name": data.name, "role": data.role}
        })
        if user_resp and user_resp.user:
            store_system_log("AUTH", f"New {data.role} registered: {data.email}")
            return {"success": True, "user": {
                "id": str(user_resp.user.id),
                "email": user_resp.user.email,
                "name": data.name,
                "role": data.role
            }}
        return {"error": "Registration failed. Please try again."}
    except Exception as e:
        msg = str(e)
        if "already been registered" in msg or "already exists" in msg:
            return {"error": "An account with this email already exists."}
        return {"error": f"Registration error: {msg}"}


@app.get("/api/me")
async def api_me(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    if not user:
        return {"error": "Not authenticated"}
    return {"user": user}


def expert_system(data):
    """Smarter expert system reflecting uploaded expert rules first, then fallback benchmarks."""
    # Try PDF-sourced expert rules first
    external_risk = evaluate_expert_rules(data)
    if external_risk:
        return external_risk

    crop = data["Crop"].lower()
    y = data["Yield"]
    season = data["Season"].lower()
    
    # Benchmarks for Indian crops (Yield in kg/ha, converted if needed)
    # Source: Indian Agricultural Statistics summaries
    benchmarks = {
        "rice": {"low_bound": 1800, "med_bound": 2800},
        "wheat": {"low_bound": 2000, "med_bound": 3200},
        "gram": {"low_bound": 800, "med_bound": 1800},
        "cotton": {"low_bound": 400, "med_bound": 700},
        "sugarcane": {"low_bound": 60000, "med_bound": 85000} # Higher scale
    }
    
    # Default for unknown crops
    b = benchmarks.get(crop, {"low_bound": 1500, "med_bound": 2500})
    
    # Season-specific adjustment (Kharif crops usually have higher rainfall dependency)
    seasonal_multiplier = 1.1 if season == "kharif" else 1.0
    low = b["low_bound"] * seasonal_multiplier
    med = b["med_bound"] * seasonal_multiplier

    if y < low:
        return "High"
    elif y < med:
        return "Medium"
    else:
        return "Low"


risk_map = {
    "Low": 1,
    "Medium": 2,
    "High": 3
}


@app.post("/predict")
async def predict(data: InputData, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    user_id = user["id"] if user else None
    try:
        state = safe_encode(le_state, data.State)
        dist = safe_encode(le_dist, data.District)
        crop = safe_encode(le_crop, data.Crop)
        season = safe_encode(le_season, data.Season)

        X = np.array([[state, dist, crop, season, data.Area, data.Production, data.Yield]])

        proba = model.predict_proba(X)[0]
        pred = np.argmax(proba)
        pcs = float(np.max(proba))

        ai_risk = le_risk.inverse_transform([pred])[0]
        validation = validate_prediction_with_experts(data.dict(), ai_risk, pcs)
        expert_risk = validation["expert_risk"]
        
        # Now passing expert_risk to advisory for better alignment focus
        llm_advisory = generate_advisory(data.dict(), ai_risk, expert_risk)
        llm_validation = validate_llm(llm_advisory, validation["final_risk"])

        eas = validation["eas"]
        rdi = validation["rdi"]
        tri = validation["tri"]
        status = validation["validation_status"]
        confidence_band = validation["confidence_band"]
        decision_action = validation["decision_action"]
        expert_advisory = validation["expert_advisory"]

        # Store prediction in Supabase with user_id
        pred_id = store_prediction({
            "state": data.State, "district": data.District,
            "crop": data.Crop, "season": data.Season,
            "area": data.Area, "production": data.Production, "yield_val": data.Yield,
            "ai_risk": ai_risk, "expert_risk": expert_risk,
            "pcs": round(pcs, 3), "eas": round(eas, 3), "rdi": round(rdi, 3), "tri": round(tri, 2),
            "validation_status": status, "confidence_band": confidence_band,
            "llm_advisory": llm_advisory,
            "expert_advisory": expert_advisory,
            "llm_trust_score": llm_validation.get("LTS"),
            "llm_status": llm_validation.get("LLM_Status"),
            "decision_action": decision_action,
            "final_risk": validation["final_risk"],
            "final_decision": validation["final_decision"],
            "final_decision_reason": validation["final_decision_reason"],
            "farmer_explanation": validation["farmer_explanation"],
            "expert_consensus": validation["expert_consensus"],
            "source": "single"
        }, user_id=user_id)
        store_expert_validations(pred_id, validation["expert_validations"])

        store_system_log(
            "PREDICTION",
            f"Single prediction completed: AI={ai_risk}, Final={validation['final_risk']}",
            f"ID={pred_id}, Decision={validation['final_decision']}",
            user_id=user_id,
        )

        return {
            "id": pred_id,
            "ai_risk": ai_risk,
            "expert_risk": expert_risk,
            "expert_validations": validation["expert_validations"],
            "expert_consensus": validation["expert_consensus"],
            "final_risk": validation["final_risk"],
            "final_decision": validation["final_decision"],
            "final_decision_reason": validation["final_decision_reason"],
            "farmer_explanation": validation["farmer_explanation"],
            "expert_advisory": expert_advisory,
            "pcs": round(pcs, 3),
            "eas": round(eas, 3),
            "rdi": round(rdi, 3),
            "tri": round(tri, 2),
            "validation_status": status,
            "confidence_band": confidence_band,
            "decision_action": decision_action,
            "llm_advisory": llm_advisory,
            "llm_validation": llm_validation
        }

    except Exception as e:
        store_system_log("ERROR", f"Prediction failed: {str(e)}")
        return {"error": str(e)}


@app.post("/batch-validate")
async def batch_validate(file: UploadFile = File(...), authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    user_id = user["id"] if user else None
    os.makedirs("uploads", exist_ok=True)
    accepted_seasons = sorted(le_season.classes_.tolist()) if hasattr(le_season, "classes_") else []

    if not file.filename or not file.filename.lower().endswith(".csv"):
        return {
            "error": "Please upload a CSV file.",
            "required_columns": BATCH_REQUIRED_COLUMNS,
            "accepted_seasons": accepted_seasons,
        }

    file_path = f"uploads/{file.filename}"
    with open(file_path, "wb") as f:
        f.write(await file.read())

    try:
        df = _read_batch_csv(file_path)
    except Exception as exc:
        return {
            "error": str(exc),
            "required_columns": BATCH_REQUIRED_COLUMNS,
            "accepted_seasons": accepted_seasons,
        }
    
    # LIMIT CHECK: Prevent timeouts and rate limits
    MAX_ROWS = 2000
    if len(df) > MAX_ROWS:
        return {"error": f"Dataset too large. Maximum {MAX_ROWS} rows allowed per batch."}

    df = df.drop(columns=["Risk"], errors="ignore")
    missing_columns = [col for col in BATCH_REQUIRED_COLUMNS if col not in df.columns]
    if missing_columns:
        return {
            "error": "Missing required batch columns.",
            "missing_columns": missing_columns,
            "required_columns": BATCH_REQUIRED_COLUMNS,
            "accepted_seasons": accepted_seasons,
        }

    results = []
    db_buffer = []
    expert_validation_buffer = []
    preview_rows = []
    row_errors = []

    for row_index, row in df.iterrows():
        try:
            data = {
                "State": _clean_batch_text(row["State"]),
                "District": _clean_batch_text(row["District"]),
                "Crop": _clean_batch_text(row["Crop"]),
                "Season": _clean_batch_text(row["Season"]),
                "Area": _clean_batch_number(row["Area"]),
                "Production": _clean_batch_number(row["Production"]),
                "Yield": _clean_batch_number(row["Yield"]),
            }
            row_number = int(row_index) + 2
            missing_fields = [
                key for key, value in data.items()
                if value in ("", None)
            ]
            if missing_fields:
                row_errors.append({
                    "row": row_number,
                    "error": f"Missing or invalid values in: {', '.join(missing_fields)}",
                })
                continue

            state = safe_encode(le_state, data["State"])
            dist = safe_encode(le_dist, data["District"])
            crop = safe_encode(le_crop, data["Crop"])
            season = safe_encode(le_season, data["Season"])

            unsupported_fields = []
            if state < 0:
                unsupported_fields.append(f"State '{data['State']}'")
            if dist < 0:
                unsupported_fields.append(f"District '{data['District']}'")
            if crop < 0:
                unsupported_fields.append(f"Crop '{data['Crop']}'")
            if season < 0:
                unsupported_fields.append(f"Season '{data['Season']}'")

            if unsupported_fields:
                row_errors.append({
                    "row": row_number,
                    "error": "Unsupported values in: " + ", ".join(unsupported_fields),
                })
                continue

            X = np.array([[state, dist, crop, season,
                        data["Area"], data["Production"], data["Yield"]]])

            proba = model.predict_proba(X)[0]
            pred = np.argmax(proba)

            ai_risk = le_risk.inverse_transform([pred])[0]
            pcs = float(np.max(proba))

            validation = validate_prediction_with_experts(data, ai_risk, pcs)
            expert_risk = validation["expert_risk"]
            expert_advisory = validation["expert_advisory"]
            eas = validation["eas"]
            rdi = validation["rdi"]
            tri = validation["tri"]
            status_val = validation["validation_status"]
            decision_action = validation["decision_action"]
            confidence_band = validation["confidence_band"]

            # Prepare for bulk insert
            db_row = {
                "state": data["State"], "district": data["District"],
                "crop": data["Crop"], "season": data["Season"],
                "area": data["Area"], "production": data["Production"], "yield_val": data["Yield"],
                "ai_risk": ai_risk, "expert_risk": expert_risk,
                "expert_advisory": expert_advisory,
                "pcs": round(pcs, 3), "eas": round(eas, 3), "rdi": round(rdi, 3), "tri": round(tri, 2),
                "validation_status": status_val, "confidence_band": confidence_band,
                "llm_advisory": None,
                "llm_trust_score": None,
                "llm_status": "SKIPPED",
                "decision_action": decision_action,
                "final_risk": validation["final_risk"],
                "final_decision": validation["final_decision"],
                "final_decision_reason": validation["final_decision_reason"],
                "farmer_explanation": validation["farmer_explanation"],
                "expert_consensus": validation["expert_consensus"],
                "source": "batch"
            }
            db_buffer.append(db_row)
            expert_validation_buffer.append(validation["expert_validations"])

            results.append({
                "State": data["State"], "District": data["District"], "Crop": data["Crop"],
                "AI_Risk": ai_risk, "Expert_Risk": expert_risk,
                "Final_Risk": validation["final_risk"], "Final_Decision": validation["final_decision"],
                "EAS": round(eas, 3), "RDI": round(rdi, 3), "TRI": round(tri, 2),
                "Validation_Status": status_val
            })
            preview_rows.append({
                "row": row_number,
                "state": data["State"],
                "district": data["District"],
                "crop": data["Crop"],
                "season": data["Season"],
                "ai_risk": ai_risk,
                "expert_risk": expert_risk,
                "final_risk": validation["final_risk"],
                "eas": round(eas, 3),
                "rdi": round(rdi, 3),
                "tri": round(tri, 2),
                "validation_status": status_val,
                "final_decision": validation["final_decision"],
            })

        except Exception as exc:
            row_errors.append({
                "row": int(row_index) + 2,
                "error": str(exc),
            })
            continue

    if not results:
        return {
            "error": "No valid rows were processed. Check the CSV columns and row values.",
            "required_columns": BATCH_REQUIRED_COLUMNS,
            "accepted_seasons": accepted_seasons,
            "sample_errors": row_errors[:5],
            "records_processed": 0,
            "skipped_rows": len(row_errors),
        }

    # PERFORM BULK INSERT
    if db_buffer:
        inserted_rows = store_predictions_bulk(db_buffer, user_id=user_id)
        for inserted, expert_validations in zip(inserted_rows, expert_validation_buffer):
            store_expert_validations(inserted.get("id"), expert_validations)

    output_path = "decision_report.csv"
    pd.DataFrame(results).to_csv(output_path, index=False)

    approved = sum(1 for r in results if r["Validation_Status"] == "APPROVED")
    review = sum(1 for r in results if r["Validation_Status"] == "REVIEW REQUIRED")
    rejected = sum(1 for r in results if r["Validation_Status"] == "REJECTED")
    avg_eas = round(sum(r["EAS"] for r in results) / len(results), 3)
    avg_rdi = round(sum(r["RDI"] for r in results) / len(results), 3)
    avg_tri = round(sum(r["TRI"] for r in results) / len(results), 2)
    risk_distribution = {
        "Low": sum(1 for r in results if r["Final_Risk"] == "Low"),
        "Medium": sum(1 for r in results if r["Final_Risk"] == "Medium"),
        "High": sum(1 for r in results if r["Final_Risk"] == "High"),
    }
    decision_distribution = {
        "APPROVED": approved,
        "REVIEW REQUIRED": review,
        "REJECTED": rejected,
    }

    store_system_log("BATCH", f"Batch validation: {len(results)} records processed",
                     f"File={file.filename}, Approved={approved}, Review={review}, Rejected={rejected}, Skipped={len(row_errors)}",
                     user_id=user_id)

    return {
        "message": f"Batch validation completed for {len(results)} records",
        "records_processed": len(results),
        "skipped_rows": len(row_errors),
        "approved": approved,
        "review_required": review,
        "rejected": rejected,
        "avg_eas": avg_eas,
        "avg_rdi": avg_rdi,
        "avg_tri": avg_tri,
        "required_columns": BATCH_REQUIRED_COLUMNS,
        "accepted_seasons": accepted_seasons,
        "risk_distribution": risk_distribution,
        "decision_distribution": decision_distribution,
        "results_preview": preview_rows[:10],
        "sample_errors": row_errors[:5],
    }


@app.post("/api/upload-expert-rules")
async def upload_expert_rules(file: UploadFile = File(...), authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    user_id = user["id"] if user else None
    os.makedirs("uploads", exist_ok=True)
    file_path = f"uploads/{file.filename}"

    if not file.filename.lower().endswith(".pdf"):
        return {"error": "Please upload a PDF file."}

    with open(file_path, "wb") as f:
        f.write(await file.read())

    text = extract_text_from_pdf(file_path)
    parsed = parse_expert_rules(text)

    if not parsed:
        return {"error": "No expert rules found in PDF. Use supported patterns like 'If Crop is Rice and Yield < 1800 then High' or 'Rice: Low <1800 Medium <2800 High'."}

    expert_rules.clear()
    expert_rules.extend(parsed)

    store_system_log("RULES", "Uploaded expert rules from PDF", f"Rules={len(parsed)}", user_id=user_id)

    return {"message": f"Expert rules uploaded and parsed: {len(parsed)} rules", "rules": expert_rules}


@app.get("/api/expert-rules")
def get_expert_rules():
    return {"rules": expert_rules}


@app.get("/audit-summary")
def audit_summary():
    df = pd.read_csv("audit_log.csv")
    latest = df.iloc[-1]
    return {
        "last_run_time": latest["timestamp"],
        "file": latest["filename"],
        "records": int(latest["records_processed"]),
        "approved": int(latest["approved"]),
        "review_required": int(latest["review_required"]),
        "rejected": int(latest["rejected"])
    }


@app.get("/download-report")
def download_report():
    return FileResponse("decision_report.csv", filename="decision_report.csv")


# ==================== NEW API ENDPOINTS ====================

@app.get("/api/model-metrics")
async def api_model_metrics(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    uid = user["id"] if user else None
    role = user["role"] if user else None
    return get_model_metrics(user_id=uid, user_role=role)


@app.get("/api/crops")
def api_crops():
    try:
        crops = le_crop.classes_.tolist() if hasattr(le_crop, 'classes_') else []
        return {"crops": sorted(crops)}
    except Exception as e:
        return {"crops": [], "error": str(e)}


@app.get("/api/states")
def api_states():
    return {"states": sorted(list(location_data.keys()))}


@app.get("/api/districts/{state}")
def api_districts(state: str):
    return {"districts": location_data.get(state, [])}


@app.get("/api/feature-importance")
def api_feature_importance():
    features = ["State", "District", "Crop Type", "Growing Season", "Cultivated Area (ha)", "Total Production (tonnes)", "Crop Yield (tonnes/ha)"]
    try:
        base_model = model
        if hasattr(model, 'calibrated_classifiers_'):
            base_model = model.calibrated_classifiers_[0].estimator
        if hasattr(base_model, 'feature_importances_'):
            importances = base_model.feature_importances_.tolist()
        else:
            importances = [0.08, 0.10, 0.15, 0.07, 0.18, 0.20, 0.22]
    except Exception:
        importances = [0.08, 0.10, 0.15, 0.07, 0.18, 0.20, 0.22]

    return {"features": features, "importances": importances}


@app.get("/api/risk-heatmap")
async def api_risk_heatmap(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    uid = user["id"] if user else None
    role = user["role"] if user else None
    return get_risk_by_state(user_id=uid, user_role=role)


@app.get("/api/decision-transparency/{pred_id}")
def api_decision_transparency(pred_id: int):
    pred = get_prediction_by_id(pred_id)
    if not pred:
        return {"error": "Prediction not found"}
    return pred


@app.get("/api/system-metrics")
async def api_system_metrics(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    uid = user["id"] if user else None
    role = user["role"] if user else None
    return get_system_metrics(user_id=uid, user_role=role)


@app.get("/api/insights")
async def api_insights(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    uid = user["id"] if user else None
    role = user["role"] if user else None
    return get_insights(user_id=uid, user_role=role)


@app.get("/api/prediction-history")
async def api_prediction_history(limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0), authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    uid = user["id"] if user else None
    role = user["role"] if user else None
    rows, total = get_prediction_history(limit, offset, user_id=uid, user_role=role)
    return {"data": rows, "total": total, "limit": limit, "offset": offset}


@app.post("/api/officer-review")
async def api_submit_officer_review(data: OfficerReviewInput, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    officer_id = user["id"] if user else None
    store_officer_review(data.dict(), officer_id=officer_id)
    store_system_log("REVIEW", f"Officer review submitted by {data.officer_name}",
                     f"Prediction={data.prediction_id}, Decision={data.decision}",
                     user_id=officer_id)
    return {"message": "Review submitted successfully"}


@app.get("/api/officer-reviews")
def api_officer_reviews(status: str = Query(None)):
    return get_officer_reviews(status)


@app.get("/api/audit-logs")
def api_audit_logs(limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
    rows, total = get_audit_logs(limit, offset)
    return {"data": rows, "total": total}


# ==================== LOAN ENDPOINTS ====================

@app.post("/api/loan-request")
async def api_loan_request(data: LoanRequestInput, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    if not user:
        return {"error": "Not authenticated"}
    result = create_loan_request(data.prediction_id, user["id"])
    if result.get("success"):
        store_system_log("LOAN", f"Loan requested by {user['name']}",
                         f"Prediction={data.prediction_id}", user_id=user["id"])
    return result


@app.get("/api/loan-requests")
async def api_loan_requests(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    return get_all_loan_requests()


@app.post("/api/loan-decision")
async def api_loan_decision(data: LoanDecisionInput, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    officer_id = user["id"] if user else None
    submit_loan_decision(data.loan_id, data.officer_name, data.decision, data.reason, officer_id)
    store_system_log("LOAN_DECISION", f"Loan {data.decision} by {data.officer_name}",
                     f"LoanID={data.loan_id}", user_id=officer_id)
    return {"message": f"Loan {data.decision} successfully"}


@app.get("/api/my-loans")
async def api_my_loans(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    if not user:
        return []
    return get_farmer_loans(user["id"])


# Mount static files at root AFTER all routes so CSS/JS/images are served as fallback
app.mount("/", StaticFiles(directory="."), name="static")
