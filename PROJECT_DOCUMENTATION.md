# AgriValidator AI Platform — Complete Project Documentation

## 1. Project Overview

**AgriValidator AI** is an AI-powered agricultural crop risk recommendation and validation platform. It combines Machine Learning (XGBoost), a Rule-Based Expert System, and LLM-powered advisory (Groq/Llama) to predict crop risk levels, validate predictions through a multi-layered trust scoring system, and provide actionable farming guidance.

The platform features role-based access with two separate dashboards:
- **Farmer Portal** — Submit crop data, receive AI risk assessments, view advisory, request loans
- **Agriculture Officer Portal** — Review predictions, monitor AI model performance, approve/reject loan requests, access audit logs

### Key Capabilities
- AI crop risk prediction (Low / Medium / High)
- Multi-model validation (AI + Expert System + LLM)
- Trust Reliability Index (TRI) composite scoring
- LLM-generated structured agricultural advisory
- Officer review workflow for flagged predictions
- Loan request and approval system
- Batch CSV processing
- Geographic risk mapping by state
- Full audit logging

---

## 2. Technology Stack

### Backend
- **Python 3.10.11**
- **FastAPI** — REST API framework (v0.135.1)
- **Uvicorn** — ASGI server (v0.41.0)
- **XGBoost** — Calibrated ML model for risk prediction (v3.2.0)
- **scikit-learn** — Model training, label encoding, calibration (v1.7.2)
- **sentence-transformers** — LLM output validation via semantic similarity (v5.2.3, model: `all-MiniLM-L6-v2`)
- **Groq API** — LLM advisory generation (Llama 3.3 70B Versatile)
- **Pandas / NumPy** — Data processing
- **joblib** — Model serialization

### Frontend
- **Vanilla HTML/CSS/JavaScript** — No framework, two Single Page Applications (SPAs)
- **Chart.js 4.4.7** — Data visualization (doughnut, bar, line charts)
- **Google Fonts** — Inter + Poppins typography

### Database & Auth
- **Supabase** — Backend-as-a-Service
  - **Supabase Auth** — JWT-based authentication (email/password)
  - **Supabase PostgreSQL** — Cloud-hosted database
  - Backend uses **service_role key** (bypasses RLS, full DB access)
  - Frontend uses **anon key** (for auth operations only)

### Infrastructure
- **Local development server**: `uvicorn app:app --reload --host 127.0.0.1 --port 8000`
- **Static file serving**: FastAPI `StaticFiles` mount at root `/`
- **Virtual environment**: `.\venv\`

---

## 3. Project File Structure

```
agri-recommendation-validator/
│
├── app.py                  # FastAPI backend — all API endpoints
├── database.py             # Supabase database operations (CRUD layer)
├── supabase_config.py      # Supabase client initialization
├── gemini_llm.py           # Groq LLM advisory generation
├── llm_validator.py        # LLM output validation (RCS, ASS, DCS, LTS)
├── .env                    # Environment variables (Supabase keys)
│
├── landing.html            # Public landing page
├── login.html              # Login/Register page (shared)
├── supabase-client.js      # Shared Supabase auth client module
│
├── farmer.html             # Farmer dashboard SPA (HTML)
├── farmer.css              # Farmer dashboard styles
├── farmer.js               # Farmer dashboard logic
│
├── index.html              # Officer dashboard SPA (HTML)
├── styles.css              # Officer dashboard styles
├── app.js                  # Officer dashboard logic
│
├── models/                 # Serialized ML models
│   ├── xgb_calibrated.pkl  # Calibrated XGBoost classifier (primary)
│   ├── xgb.pkl             # Raw XGBoost model
│   ├── rf.pkl              # Random Forest model (unused, reference)
│   ├── state_enc.pkl       # LabelEncoder — State
│   ├── dist_enc.pkl        # LabelEncoder — District
│   ├── crop_enc.pkl        # LabelEncoder — Crop
│   ├── season_enc.pkl      # LabelEncoder — Season
│   └── risk_enc.pkl        # LabelEncoder — Risk Level
│
├── train_models.py         # Model training script
├── evaluate_model.py       # Model evaluation script
├── split_data.py           # Dataset splitting script
├── add_risk.py             # Risk column generation script
├── list_models.py          # Utility to list model files
│
├── migration_loans.sql     # SQL migration for loan_requests table
├── requirements.txt        # Python dependencies
├── audit_log.csv           # Local batch audit log
├── decision_report.csv     # Latest batch validation report
├── validated_results.csv   # Historical validation results
└── uploads/                # Uploaded CSV files for batch processing
```

---

## 4. Database Schema (Supabase PostgreSQL)

### 4.1 `profiles`
Auto-created via Supabase Auth trigger when a user registers.

| Column   | Type | Description            |
|----------|------|------------------------|
| id       | UUID (PK) | Matches auth.users.id |
| name     | TEXT | User's full name       |
| email    | TEXT | User's email           |
| role     | TEXT | `farmer` or `officer`  |

### 4.2 `prediction_history`
Stores every prediction (single + batch).

| Column            | Type      | Description                              |
|-------------------|-----------|------------------------------------------|
| id                | SERIAL PK | Auto-increment ID                        |
| user_id           | UUID      | FK to auth.users (nullable for system)   |
| timestamp         | TIMESTAMPTZ | When prediction was made               |
| state             | TEXT      | Indian state name                        |
| district          | TEXT      | District name                            |
| crop              | TEXT      | Crop name                                |
| season            | TEXT      | Kharif / Rabi / Zaid                     |
| area              | FLOAT     | Cultivated area in hectares              |
| production        | FLOAT     | Total production in tonnes               |
| yield_val         | FLOAT     | Crop yield in tonnes/hectare             |
| ai_risk           | TEXT      | XGBoost prediction: Low/Medium/High      |
| expert_risk       | TEXT      | Expert system prediction: Low/Medium/High|
| pcs               | FLOAT     | Prediction Confidence Score (0-1)        |
| eas               | FLOAT     | Expert Agreement Score (0-1)             |
| rdi               | FLOAT     | Risk Deviation Index (0-1)               |
| tri               | FLOAT     | Trust Reliability Index (0-100)          |
| validation_status | TEXT      | APPROVED / REVIEW REQUIRED / REJECTED    |
| confidence_band   | TEXT      | Very High / High / Moderate / Low        |
| llm_advisory      | TEXT      | Full LLM advisory text                   |
| llm_trust_score   | FLOAT     | LLM Trust Score (LTS)                    |
| llm_status        | TEXT      | LLM validation: APPROVED/REVIEW/REJECTED/SKIPPED |
| decision_action   | TEXT      | AUTO_FORWARD / SEND_TO_OFFICER / BLOCK   |
| source            | TEXT      | `single` or `batch`                      |

### 4.3 `officer_reviews`
Stores officer review decisions for predictions.

| Column        | Type      | Description                    |
|---------------|-----------|--------------------------------|
| id            | SERIAL PK | Auto-increment ID              |
| prediction_id | INTEGER  | FK to prediction_history.id    |
| officer_id    | UUID     | FK to auth.users               |
| officer_name  | TEXT     | Officer's display name         |
| decision      | TEXT     | APPROVED or REJECTED           |
| comments      | TEXT     | Officer's comments             |
| timestamp     | TIMESTAMPTZ | When review was submitted   |

### 4.4 `loan_requests`
Stores farmer loan requests tied to predictions.

| Column         | Type      | Description                          |
|----------------|-----------|--------------------------------------|
| id             | SERIAL PK | Auto-increment ID                    |
| prediction_id  | INTEGER   | FK to prediction_history.id          |
| user_id        | UUID      | FK to auth.users (the farmer)        |
| status         | TEXT      | PENDING / APPROVED / REJECTED        |
| officer_name   | TEXT      | Reviewing officer's name             |
| officer_reason | TEXT      | Officer's reason for decision        |
| officer_id     | UUID      | FK to auth.users (the officer)       |
| created_at     | TIMESTAMPTZ | When loan was requested            |
| updated_at     | TIMESTAMPTZ | Last status update                 |

### 4.5 `system_logs`
Audit log for all platform activity.

| Column     | Type      | Description                           |
|------------|-----------|---------------------------------------|
| id         | SERIAL PK | Auto-increment ID                     |
| timestamp  | TIMESTAMPTZ | When event occurred                 |
| event_type | TEXT      | SYSTEM/AUTH/PREDICTION/BATCH/REVIEW/LOAN/ERROR |
| message    | TEXT      | Human-readable event description      |
| details    | TEXT      | Additional metadata                   |
| user_id    | UUID      | Who triggered the event (nullable)    |

---

## 5. System Architecture

### 5.1 High-Level Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                             │
│                                                                    │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌───────────────┐  │
│  │ Landing  │   │  Login   │   │  Farmer  │   │   Officer     │  │
│  │  Page    │──▶│  Page    │──▶│  SPA     │   │   SPA         │  │
│  └──────────┘   └────┬─────┘   └────┬─────┘   └──────┬────────┘  │
│                      │              │                  │           │
│                ┌─────▼──────────────▼──────────────────▼────────┐  │
│                │          supabase-client.js                    │  │
│                │  (Supabase Auth + authFetch() with JWT tokens) │  │
│                └───────────────────┬────────────────────────────┘  │
└────────────────────────────────────┼──────────────────────────────┘
                                     │ HTTP + Bearer Token
                                     ▼
┌────────────────────────────────────────────────────────────────────┐
│                    FastAPI BACKEND (app.py)                         │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Auth Helper  │  │ Static File  │  │ API Endpoints            │ │
│  │ get_current  │  │ Serving      │  │ /predict, /batch-validate│ │
│  │ _user()      │  │ (HTML/CSS/JS)│  │ /api/officer-review      │ │
│  └──────┬───────┘  └──────────────┘  │ /api/loan-request ...    │ │
│         │                             └────────────┬─────────────┘ │
│         │                                          │               │
│  ┌──────▼──────────────────────────────────────────▼─────────────┐ │
│  │                    PREDICTION PIPELINE                        │ │
│  │                                                               │ │
│  │  ┌─────────────┐   ┌──────────────┐   ┌───────────────────┐  │ │
│  │  │  XGBoost    │   │ Expert System│   │ Groq LLM Advisory │  │ │
│  │  │ Calibrated  │   │ (Rule-Based) │   │ (Llama 3.3 70B)   │  │ │
│  │  │ Model       │   │              │   │                   │  │ │
│  │  └──────┬──────┘   └──────┬───────┘   └────────┬──────────┘  │ │
│  │         │                 │                     │             │ │
│  │         ▼                 ▼                     ▼             │ │
│  │  ┌────────────────────────────────────────────────────────┐   │ │
│  │  │          TRUST SCORE CALCULATION                       │   │ │
│  │  │  PCS (AI Confidence) + EAS (Agreement) → TRI Score    │   │ │
│  │  │  RCS + ASS + DCS → LTS Score (LLM Validation)         │   │ │
│  │  └───────────────────────┬────────────────────────────────┘   │ │
│  │                          │                                    │ │
│  │                          ▼                                    │ │
│  │              STATUS ASSIGNMENT + ROUTING                      │ │
│  │    TRI ≥ 80 → APPROVED  |  60-80 → REVIEW REQUIRED           │ │
│  │    TRI < 60 → REJECTED  |  High Risk → always REVIEW         │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │             database.py (Data Access Layer)                │    │
│  └────────────────────────┬───────────────────────────────────┘    │
└───────────────────────────┼────────────────────────────────────────┘
                            │ Supabase Python Client (service_role key)
                            ▼
┌────────────────────────────────────────────────────────────────────┐
│                  SUPABASE CLOUD                                    │
│                                                                    │
│  ┌──────────────────┐     ┌──────────────────────────────────────┐ │
│  │  Supabase Auth   │     │  PostgreSQL Database                 │ │
│  │  (JWT tokens,    │     │  • profiles                          │ │
│  │   user mgmt)     │     │  • prediction_history                │ │
│  └──────────────────┘     │  • officer_reviews                   │ │
│                           │  • loan_requests                     │ │
│                           │  • system_logs                       │ │
│                           └──────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

### 5.2 Authentication Architecture

```
REGISTRATION FLOW:
  Browser → POST /api/register → Backend (service_role) → supabase.auth.admin.create_user()
         → Auto email_confirm: true (no verification email)
         → Profile auto-created in `profiles` table via DB trigger
         → Frontend auto-login via supabase.auth.signInWithPassword()
         → JWT stored in browser → Redirect to role-based dashboard

LOGIN FLOW:
  Browser → Supabase JS Client → supabase.auth.signInWithPassword()
         → JWT access_token stored in session
         → Role extracted from user_metadata → Redirect to dashboard

API REQUEST FLOW:
  Browser → authFetch(url) → Attaches "Authorization: Bearer <JWT>"
         → FastAPI endpoint → get_current_user(authorization)
         → supabase.auth.get_user(token) validates JWT
         → Returns {id, email, name, role} → Endpoint logic with user context
```

**Key Design Decisions:**
- Backend uses `service_role` key → bypasses Row Level Security → full CRUD
- Frontend uses `anon` key → only for authentication operations
- All data access goes through backend API → never direct DB from frontend
- Farmers see only their own data; Officers see all data (filtered in `database.py`)

---

## 6. Prediction Pipeline (Core Algorithm)

### 6.1 Complete Prediction Flow

```
INPUT DATA
  ├── State, District, Crop, Season (categorical)
  └── Area (ha), Production (tonnes), Yield (tonnes/ha) (numerical)
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  STEP 1: XGBoost Calibrated Model Prediction        │
│                                                     │
│  • Label-encode categorical features                │
│  • Build feature vector: [state, dist, crop,        │
│    season, area, production, yield]                  │
│  • model.predict_proba(X) → probability array       │
│  • ai_risk = class with highest probability         │
│  • PCS = max probability (Prediction Confidence)    │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  STEP 2: Expert System Validation                   │
│                                                     │
│  Rule-based yield thresholds per crop:              │
│                                                     │
│  Rice:   yield < 2200 → High                        │
│          yield < 3000 → Medium                      │
│          yield ≥ 3000 → Low                         │
│                                                     │
│  Wheat:  yield < 2500 → High                        │
│          yield < 3500 → Medium                      │
│          yield ≥ 3500 → Low                         │
│                                                     │
│  Other:  yield < 2000 → High                        │
│          yield < 3000 → Medium                      │
│          yield ≥ 3000 → Low                         │
│                                                     │
│  Output: expert_risk (Low/Medium/High)              │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  STEP 3: Trust Score Calculation                    │
│                                                     │
│  Risk Map: Low=1, Medium=2, High=3                  │
│                                                     │
│  EAS = 1 - (|ai_val - expert_val| / 2)             │
│    Expert Agreement Score: 1.0 = full agreement     │
│                                                     │
│  RDI = |ai_val - expert_val| / 2                    │
│    Risk Deviation Index: 0.0 = no deviation         │
│                                                     │
│  TRI = (PCS × 0.6 + EAS × 0.4) × 100              │
│    Trust Reliability Index: composite trust score   │
│    PCS weighted 60%, EAS weighted 40%               │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  STEP 4: Status Assignment                          │
│                                                     │
│  TRI ≥ 80  → APPROVED                              │
│  TRI 60-79 → REVIEW REQUIRED                       │
│  TRI < 60  → REJECTED                              │
│                                                     │
│  OVERRIDE: If ai_risk == "High" → REVIEW REQUIRED  │
│  (High risk predictions are never auto-approved)    │
│                                                     │
│  Confidence Bands:                                  │
│    TRI ≥ 90 → Very High Reliability                 │
│    TRI ≥ 80 → High Reliability                      │
│    TRI ≥ 65 → Moderate Reliability                  │
│    TRI < 65 → Low Reliability                       │
│                                                     │
│  Decision Actions:                                  │
│    APPROVED        → AUTO_FORWARD                   │
│    REVIEW REQUIRED → SEND_TO_OFFICER                │
│    REJECTED        → BLOCK_AI_OUTPUT                │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  STEP 5: LLM Advisory Generation (Single only)     │
│                                                     │
│  Provider: Groq API (Llama 3.3 70B Versatile)      │
│  Temperature: 0.7 | Max Tokens: 1024               │
│                                                     │
│  Prompt includes: all input data + AI risk level    │
│  Output sections:                                   │
│    • Risk Level                                     │
│    • Reason                                         │
│    • Key Observations                               │
│    • Recommended Actions                            │
│    • Farmer Guidance                                │
│                                                     │
│  NOTE: Batch predictions skip LLM (LLM_Status =    │
│  "SKIPPED") for performance reasons.                │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  STEP 6: LLM Validation (llm_validator.py)          │
│                                                     │
│  Three sub-scores validate LLM advisory quality:    │
│                                                     │
│  RCS (Rule Compliance Score):                       │
│    Checks for ICAR rule violations                  │
│    e.g. "emergency" for Low risk = violation         │
│    e.g. "no action" for High risk = violation        │
│    No violations → 1.0, else → 0.0                  │
│                                                     │
│  ASS (Advisory Similarity Score):                   │
│    Cosine similarity between LLM output and         │
│    ICAR reference text using sentence-transformers  │
│    Model: all-MiniLM-L6-v2                          │
│    Range: 0.0 – 1.0                                 │
│                                                     │
│  DCS (Data Consistency Score):                      │
│    Checks if advisory matches risk context          │
│    High risk + "increase irrigation" → 1.0          │
│    Low risk + "normal management" → 1.0             │
│    Default partial match → 0.7                      │
│                                                     │
│  LTS = (0.4 × RCS + 0.4 × ASS + 0.2 × DCS) × 100 │
│    LLM Trust Score                                  │
│                                                     │
│  LTS ≥ 80 → APPROVED                               │
│  LTS 60-79 → REVIEW REQUIRED                       │
│  LTS < 60 → REJECTED                               │
└─────────────────────────────────────────────────────┘
```

### 6.2 Score Summary

| Score | Full Name                  | Formula                                | Range   | Weight in TRI |
|-------|----------------------------|----------------------------------------|---------|---------------|
| PCS   | Prediction Confidence Score | max(predict_proba)                    | 0 – 1   | 60%           |
| EAS   | Expert Agreement Score      | 1 - (\|ai - expert\| / 2)            | 0 – 1   | 40%           |
| RDI   | Risk Deviation Index        | \|ai - expert\| / 2                   | 0 – 1   | —             |
| TRI   | Trust Reliability Index     | (PCS × 0.6 + EAS × 0.4) × 100        | 0 – 100 | —             |
| RCS   | Rule Compliance Score       | ICAR rule check                        | 0 or 1  | 40% of LTS    |
| ASS   | Advisory Similarity Score   | cosine_similarity(LLM, ICAR_ref)       | 0 – 1   | 40% of LTS    |
| DCS   | Data Consistency Score      | Context match check                    | 0 – 1   | 20% of LTS    |
| LTS   | LLM Trust Score             | (0.4×RCS + 0.4×ASS + 0.2×DCS) × 100   | 0 – 100 | —             |

---

## 7. API Endpoints Reference

### 7.1 Page Routes

| Method | Path                | Response        | Description             |
|--------|---------------------|-----------------|-------------------------|
| GET    | `/`                 | landing.html    | Public landing page     |
| GET    | `/login`            | login.html      | Login/Register page     |
| GET    | `/farmer/dashboard` | farmer.html     | Farmer SPA              |
| GET    | `/officer/dashboard`| index.html      | Officer SPA             |

### 7.2 Authentication

| Method | Path            | Auth | Description                              |
|--------|-----------------|------|------------------------------------------|
| POST   | `/api/register` | No   | Create user via admin API (no email verify) |
| GET    | `/api/me`       | Yes  | Get current user profile from JWT        |

**POST /api/register** — Request body:
```json
{ "email": "string", "password": "string", "name": "string", "role": "farmer|officer" }
```

### 7.3 Prediction

| Method | Path              | Auth | Description                                  |
|--------|-------------------|------|----------------------------------------------|
| POST   | `/predict`        | Yes  | Single prediction — runs full pipeline       |
| POST   | `/batch-validate` | Yes  | Batch CSV upload — skip LLM, return summary  |

**POST /predict** — Request body:
```json
{
  "State": "Maharashtra", "District": "Pune", "Crop": "Rice",
  "Season": "Kharif", "Area": 100.0, "Production": 250.0, "Yield": 2500.0
}
```

**POST /batch-validate** — Multipart form upload (CSV file with columns: State, District, Crop, Season, Area, Production, Yield)

### 7.4 Data & Analytics

| Method | Path                              | Auth | Role    | Description                         |
|--------|-----------------------------------|------|---------|-------------------------------------|
| GET    | `/api/model-metrics`              | Yes  | Both    | TRI trend, risk/decision distribution |
| GET    | `/api/feature-importance`         | No   | Officer | XGBoost feature importances         |
| GET    | `/api/risk-heatmap`               | Yes  | Both    | Risk aggregated by state            |
| GET    | `/api/decision-transparency/{id}` | No   | Both    | Full prediction record by ID        |
| GET    | `/api/system-metrics`             | Yes  | Both    | Total predictions, throughput, LLM rate |
| GET    | `/api/insights`                   | Yes  | Both    | AI-generated data insights          |
| GET    | `/api/prediction-history`         | Yes  | Both    | Paginated prediction list           |

**Data Scoping**: Farmers see only their own data; Officers see all data.

### 7.5 Officer Review

| Method | Path                   | Auth | Description                        |
|--------|------------------------|------|------------------------------------|
| POST   | `/api/officer-review`  | Yes  | Submit approval/rejection decision |
| GET    | `/api/officer-reviews` | No   | List predictions for review        |

**POST /api/officer-review** — Request body:
```json
{ "prediction_id": 1, "officer_name": "Dr. Singh", "decision": "APPROVED", "comments": "Looks good" }
```

### 7.6 Loan System

| Method | Path                 | Auth | Description                     |
|--------|----------------------|------|---------------------------------|
| POST   | `/api/loan-request`  | Yes  | Farmer requests a loan          |
| GET    | `/api/loan-requests` | Yes  | All loan requests (officer view)|
| POST   | `/api/loan-decision` | Yes  | Officer approves/rejects loan   |
| GET    | `/api/my-loans`      | Yes  | Farmer's own loan requests      |

### 7.7 Audit & Reports

| Method | Path               | Auth | Description                    |
|--------|--------------------|------|--------------------------------|
| GET    | `/api/audit-logs`  | No   | Paginated system activity logs |
| GET    | `/audit-summary`   | No   | Latest batch run summary       |
| GET    | `/download-report` | No   | Download last batch CSV report |

---

## 8. User Flows & Workflows

### 8.1 Farmer — Crop Prediction Flow

```
1. Farmer logs in → Redirected to /farmer/dashboard
2. Navigates to "Crop Prediction" page
3. Fills form: State, District, Crop, Season, Area, Production, Yield
4. Clicks "Validate Prediction"
5. Frontend → POST /predict (with JWT)
6. Backend runs full pipeline:
   a. XGBoost predicts risk + PCS
   b. Expert system calculates expert_risk
   c. EAS, RDI, TRI computed
   d. Status assigned (APPROVED/REVIEW/REJECTED)
   e. Groq LLM generates advisory
   f. LLM validator computes RCS, ASS, DCS, LTS
   g. Prediction stored in Supabase
7. Results displayed:
   - AI Risk vs Expert Risk
   - PCS, EAS, RDI, TRI with animated bars
   - Status badge (color-coded)
   - Confidence band
   - Comparison bar chart
8. If Low/Medium risk → "Request Loan" button appears
9. Farmer navigates to "AI Advisory" page to see structured advisory + LLM metrics
```

### 8.2 Farmer — Loan Request Flow

```
1. After a Low or Medium risk prediction, farmer clicks "Request Loan"
2. Frontend → POST /api/loan-request { prediction_id }
3. Backend checks for duplicate requests
4. Creates loan_requests row with status=PENDING
5. Farmer views loan status under "My Loans" page
6. Officer reviews and decides (APPROVED/REJECTED + reason)
7. Farmer sees updated status + officer name + reason in "My Loans"
```

### 8.3 Officer — Prediction Review Flow

```
1. Officer logs in → Redirected to /officer/dashboard
2. Navigates to "Officer Review" page
3. Sees list of ALL unreviewed predictions (all statuses)
   - Each card shows: Prediction ID, farmer name/email, timestamp,
     State, District, Crop, Season, AI Risk, Expert Risk, TRI, status badge
4. Officer enters name, comments, selects Approve/Reject
5. Frontend → POST /api/officer-review
6. Backend stores review in officer_reviews table
7. Backend updates prediction_history.validation_status to match decision
8. Card fades out and list refreshes
9. Farmer sees officer decision in their Request History (officer name + decision + comments)
```

### 8.4 Officer — Loan Review Flow

```
1. Officer navigates to "Loan Requests" page
2. Sees all loan requests with farmer info, crop, risk, TRI, status
3. Clicks "Review" on a loan request
4. Full prediction detail panel opens (all parameters in a table)
5. Officer Decision Panel shows: Approve/Reject radio, name, reason textarea
6. Officer submits decision
7. Frontend → POST /api/loan-decision
8. Backend updates loan_requests row with decision + officer info
9. Table refreshes with updated status
```

### 8.5 Officer — Batch Validation Flow

```
1. Officer navigates to "Batch Validation" page
2. Uploads CSV file (drag-drop or click)
3. Frontend → POST /batch-validate (multipart)
4. Backend processes each row:
   - XGBoost prediction + Expert system + TRI calculation
   - LLM skipped for batch (performance)
   - Each prediction stored individually in Supabase
5. Summary returned: records processed, approved, review, rejected
6. decision_report.csv generated for download
7. Audit entry logged to audit_log.csv + system_logs table
```

---

## 9. Frontend Architecture

### 9.1 Shared Auth Module (`supabase-client.js`)

Used by all pages (landing, login, farmer, officer). Provides:
- `getSupabaseSession()` — Returns current JWT session
- `getSupabaseUser()` — Returns `{id, email, name, role, accessToken}`
- `getAccessToken()` — Returns JWT for API calls
- `authFetch(url, options)` — `fetch()` wrapper that auto-attaches Bearer token
- `supabaseSignOut()` — Signs out and redirects to `/login`

### 9.2 Farmer Dashboard SPA (`farmer.html` + `farmer.css` + `farmer.js`)

**Navigation Pages:**
| Page      | Content                                          |
|-----------|--------------------------------------------------|
| Dashboard | KPI cards, Validation pie chart, Risk bar chart, AI Insights |
| Crop Prediction | Input form, results with trust scores, charts |
| AI Advisory | Formatted LLM advisory text + LLM validation metrics (RCS, ASS, DCS, LTS) |
| Request History | Paginated table with officer review column |
| My Loans  | Table of all loan requests with status tracking |
| Reports   | Download batch report link                       |

**Session Guard:** On load, `checkSession()` verifies farmer role; redirects to `/login` if invalid.

### 9.3 Officer Dashboard SPA (`index.html` + `styles.css` + `app.js`)

**Navigation Pages:**
| Page             | Content                                                |
|------------------|--------------------------------------------------------|
| Dashboard        | KPI cards (5), Decision pie, Risk bar, Insights panel  |
| Single Prediction| Same input form as farmer, full result display         |
| Batch Validation | CSV upload with drag-drop, batch result summary        |
| Validation Results| Paginated prediction history table (all users)        |
| Officer Review   | Card-based review interface for unreviewed predictions |
| AI Model Monitor | TRI trend line chart, Risk bar, Decision pie           |
| Loan Requests    | Table of all loans + detailed review panel             |
| Risk Map         | State-based risk card grid with tooltips               |
| Reports          | Report download                                        |
| Audit Logs       | Paginated system event log table                       |
| Settings         | Placeholder for configuration options                  |

**Session Guard:** On load, `checkOfficerSession()` verifies officer role; redirects to `/login` if invalid.

**System Widget:** Bottom-left widget shows total predictions, avg response time, LLM success rate; auto-refreshes every 30 seconds.

---

## 10. Security Model

### 10.1 Authentication
- Supabase Auth handles user management + JWT generation
- Registration uses `admin.create_user()` with `email_confirm: true` (no email verification needed)
- Passwords require minimum 6 characters
- JWTs are automatically refreshed by Supabase JS client

### 10.2 Authorization
- **Role-based routing**: Login page reads `user_metadata.role` and redirects accordingly
- **Session guards**: Each SPA checks role on load; unauthorized users are redirected
- **Data scoping**: Backend filters queries by `user_id` for farmers; officers see all

### 10.3 API Security
- All data-mutating endpoints require JWT (`Authorization: Bearer`)
- Backend validates JWT via `supabase.auth.get_user(token)`
- Backend uses `service_role` key (full DB access, bypasses RLS)
- RLS is enabled on tables with permissive policies (since backend bypasses anyway)

### 10.4 Sensitive Data
- Supabase URL + keys stored in `.env` (not committed)
- Groq API key in `gemini_llm.py` (should be moved to `.env` in production)
- Frontend only has the `anon` key (safe for client-side use)

---

## 11. Deployment & Setup Guide

### 11.1 Prerequisites
- Python 3.10+
- Supabase account with project set up
- Groq API key

### 11.2 Supabase Setup

1. Create a Supabase project
2. In SQL Editor, create the required tables:
   - `profiles` (with auto-trigger from auth.users)
   - `prediction_history`
   - `officer_reviews`
   - `system_logs`
   - `loan_requests` (use `migration_loans.sql`)
3. Copy the Project URL, anon key, and service_role key

### 11.3 Environment Setup

```bash
# Clone/download the project
cd agri-recommendation-validator

# Create virtual environment
python -m venv venv

# Activate (Windows)
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 11.4 Environment Variables (`.env`)

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 11.5 Running the Server

```bash
.\venv\Scripts\python.exe -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

Then open `http://127.0.0.1:8000` in the browser.

### 11.6 First-Time Usage
1. Visit `http://127.0.0.1:8000` → Landing page
2. Click "Get Started" → Login page
3. Switch to "Register" tab
4. Create a farmer account and an officer account
5. Farmer: Submit predictions, view advisory, request loans
6. Officer: Review predictions, monitor model, approve loans

---

## 12. ML Model Details

### 12.1 Training Pipeline

| Script          | Purpose                                              |
|-----------------|------------------------------------------------------|
| `split_data.py` | Split agricultural dataset into train/test sets      |
| `add_risk.py`   | Generate risk labels based on yield thresholds       |
| `train_models.py`| Train XGBoost + Random Forest, calibrate, save .pkl |
| `evaluate_model.py`| Evaluate model accuracy and generate metrics     |

### 12.2 Model Architecture
- **Algorithm**: XGBoost (Gradient Boosted Trees)
- **Calibration**: CalibratedClassifierCV (for reliable probability estimates)
- **Features** (7): State, District, Crop, Season (label-encoded), Area, Production, Yield (numerical)
- **Target**: Risk Level (Low / Medium / High)
- **Output**: Probability distribution over 3 classes → PCS = max probability

### 12.3 Serialized Artifacts (`models/` directory)
- `xgb_calibrated.pkl` — Primary model used in production
- `state_enc.pkl`, `dist_enc.pkl`, `crop_enc.pkl`, `season_enc.pkl` — Label encoders for categorical inputs
- `risk_enc.pkl` — Label encoder for risk class inverse transform

---

## 13. Key Design Decisions

1. **Multi-layered validation**: AI alone is not trusted — Expert System and LLM advisory cross-validate to build confidence
2. **TRI composite score**: Combines model confidence (PCS) with expert agreement (EAS) for nuanced trust assessment
3. **High risk override**: Predictions classified as "High Risk" are never auto-approved, always requiring officer review
4. **Batch LLM skip**: LLM advisory is skipped for batch processing to avoid API rate limits and latency
5. **Service role backend**: Backend uses privileged Supabase key for simplicity; frontend never touches the DB directly
6. **SPA architecture**: Two separate SPAs (not a shared app) for clean role separation and simpler maintenance
7. **Loan-prediction linkage**: Loans are tied to specific predictions, ensuring risk data is always available for officer review
