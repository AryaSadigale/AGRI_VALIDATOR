from __future__ import annotations

import csv
from dataclasses import asdict, dataclass
from pathlib import Path
from statistics import median
from typing import Any, Dict, List


RISK_VALUE = {"Low": 1, "Medium": 2, "High": 3}
VALUE_RISK = {1: "Low", 2: "Medium", 3: "High"}

# Conservative agronomic benchmark bands, kg/ha. Used when a source is broad
# and cannot provide a precise state-crop median for a specific input.
CROP_BENCHMARKS = {
    "rice": {"high_below": 1800, "medium_below": 2800},
    "wheat": {"high_below": 2000, "medium_below": 3200},
    "maize": {"high_below": 1200, "medium_below": 2500},
    "jowar": {"high_below": 700, "medium_below": 1400},
    "bajra": {"high_below": 600, "medium_below": 1200},
    "ragi": {"high_below": 700, "medium_below": 1400},
    "small millets": {"high_below": 500, "medium_below": 1000},
    "shree anna /nutri cereals": {"high_below": 600, "medium_below": 1200},
    "nutri/coarse cereals": {"high_below": 700, "medium_below": 1400},
    "cereals": {"high_below": 1200, "medium_below": 2400},
    "barley": {"high_below": 1200, "medium_below": 2200},
    "gram": {"high_below": 800, "medium_below": 1800},
    "tur": {"high_below": 750, "medium_below": 1400},
    "moong": {"high_below": 450, "medium_below": 850},
    "urad": {"high_below": 500, "medium_below": 950},
    "lentil": {"high_below": 600, "medium_below": 1100},
    "other pulses": {"high_below": 500, "medium_below": 1000},
    "total pulses": {"high_below": 550, "medium_below": 1100},
    "total food grains": {"high_below": 1000, "medium_below": 2200},
}

RAINFED_SENSITIVE_STATES = {
    "andhra pradesh",
    "bihar",
    "jharkhand",
    "karnataka",
    "madhya pradesh",
    "maharashtra",
    "rajasthan",
    "telangana",
    "uttarakhand",
}

RAINFED_SENSITIVE_CROPS = {
    "jowar",
    "bajra",
    "ragi",
    "small millets",
    "shree anna /nutri cereals",
    "nutri/coarse cereals",
    "tur",
    "moong",
    "urad",
    "gram",
    "lentil",
    "other pulses",
    "total pulses",
}


@dataclass
class ExpertOpinion:
    source_id: str
    source_name: str
    source_type: str
    risk: str
    confidence: float
    applicable: bool
    matched_rules: List[str]
    advisory: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _clean_key(value: Any) -> str:
    return _clean_text(value).lower()


def _yield_kg_per_ha(value: Any) -> float:
    """Treat small values as tonnes/ha and dataset-scale values as kg/ha."""
    try:
        y = float(value)
    except (TypeError, ValueError):
        return 0.0
    return y * 1000 if 0 < y < 50 else y


def _risk_from_bands(yield_kg: float, high_below: float, medium_below: float) -> str:
    if yield_kg < high_below:
        return "High"
    if yield_kg < medium_below:
        return "Medium"
    return "Low"


def _risk_from_reference_yield(yield_kg: float, reference: float) -> str:
    if yield_kg < reference * 0.75:
        return "High"
    if yield_kg < reference * 1.10:
        return "Medium"
    return "Low"


def _risk_label(score: float) -> str:
    if score >= 2.45:
        return "High"
    if score >= 1.65:
        return "Medium"
    return "Low"


def _normalized_risk_distance(left: int, right: int) -> float:
    return abs(left - right) / 2


def _risk_advisory(risk: str, crop: str) -> str:
    if risk == "High":
        return (
            f"{crop} is in a high-risk band. Check soil moisture, pest/disease signs, and nutrient stress immediately. "
            "Use local officer guidance before adding expensive inputs."
        )
    if risk == "Medium":
        return (
            f"{crop} needs close monitoring. Improve irrigation discipline, remove weeds, and correct visible nutrient stress early."
        )
    return (
        f"{crop} is currently in a safer band. Continue normal management, weekly scouting, and timely harvest planning."
    )


def _load_reference_yields() -> Dict[tuple, float]:
    path = Path(__file__).resolve().parent / "data" / "des_data.csv"
    buckets: Dict[tuple, List[float]] = {}
    if not path.exists():
        return {}

    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            state = _clean_key(row.get("State"))
            crop = _clean_key(row.get("Crop"))
            season = _clean_key(row.get("Season"))
            y = _yield_kg_per_ha(row.get("Yield"))
            if not state or not crop or y <= 0:
                continue
            keys = [
                (state, crop, season),
                (state, crop, ""),
                ("", crop, season),
                ("", crop, ""),
            ]
            for key in keys:
                buckets.setdefault(key, []).append(y)

    return {key: median(values) for key, values in buckets.items() if values}


REFERENCE_YIELDS = _load_reference_yields()


def _lookup_reference_yield(state: str, crop: str, season: str) -> tuple[float | None, str]:
    keys = [
        (_clean_key(state), _clean_key(crop), _clean_key(season)),
        (_clean_key(state), _clean_key(crop), ""),
        ("", _clean_key(crop), _clean_key(season)),
        ("", _clean_key(crop), ""),
    ]
    labels = [
        "state + crop + season median",
        "state + crop median",
        "all-India crop + season median",
        "all-India crop median",
    ]
    for key, label in zip(keys, labels):
        if key in REFERENCE_YIELDS:
            return REFERENCE_YIELDS[key], label
    return None, "fallback benchmark"


def icar_advisory_expert(data: Dict[str, Any]) -> ExpertOpinion:
    crop = _clean_key(data.get("Crop"))
    season = _clean_text(data.get("Season"))
    yield_kg = _yield_kg_per_ha(data.get("Yield"))
    bands = CROP_BENCHMARKS.get(crop, {"high_below": 700, "medium_below": 1400})
    high_below = bands["high_below"] * (1.10 if season.lower() == "kharif" else 1.0)
    medium_below = bands["medium_below"] * (1.10 if season.lower() == "kharif" else 1.0)
    risk = _risk_from_bands(yield_kg, high_below, medium_below)
    return ExpertOpinion(
        source_id="icar_kharif_2025",
        source_name="ICAR Kharif Agro-Advisories 2025",
        source_type="national_advisory",
        risk=risk,
        confidence=0.72,
        applicable=True,
        matched_rules=[
            f"Yield normalized to {yield_kg:.1f} kg/ha.",
            f"{season or 'Season'} benchmark band: High below {high_below:.0f}, Medium below {medium_below:.0f} kg/ha.",
        ],
        advisory=_risk_advisory(risk, data.get("Crop") or "Crop"),
    )


def des_state_yield_expert(data: Dict[str, Any]) -> ExpertOpinion:
    crop = _clean_key(data.get("Crop"))
    crop_raw = data.get("Crop") or "Crop"
    yield_kg = _yield_kg_per_ha(data.get("Yield"))
    reference, label = _lookup_reference_yield(data.get("State"), data.get("Crop"), data.get("Season"))

    if reference:
        risk = _risk_from_reference_yield(yield_kg, reference)
        matched = [
            f"Matched {label}: {reference:.1f} kg/ha.",
            f"Observed yield normalized to {yield_kg:.1f} kg/ha.",
            "Risk bands: High below 75% of reference, Medium below 110% of reference, Low above that.",
        ]
        confidence = 0.90 if "state" in label else 0.80
    else:
        fallback = CROP_BENCHMARKS.get(crop, {"high_below": 700, "medium_below": 1400})
        risk = _risk_from_bands(yield_kg, fallback["high_below"], fallback["medium_below"])
        matched = [
            "No exact APY reference found for this state/crop/season.",
            f"Used all-crop fallback band: High below {fallback['high_below']}, Medium below {fallback['medium_below']} kg/ha.",
        ]
        confidence = 0.65

    return ExpertOpinion(
        source_id="des_agricultural_statistics_glance_2024",
        source_name="DES Agricultural Statistics/APY State-Crop Benchmark",
        source_type="state_crop_statistics",
        risk=risk,
        confidence=confidence,
        applicable=True,
        matched_rules=matched,
        advisory=_risk_advisory(risk, crop_raw),
    )


def crida_rainfed_regions_expert(data: Dict[str, Any]) -> ExpertOpinion:
    crop = _clean_key(data.get("Crop"))
    crop_raw = data.get("Crop") or "Crop"
    state = _clean_key(data.get("State"))
    season = _clean_key(data.get("Season"))
    yield_kg = _yield_kg_per_ha(data.get("Yield"))
    bands = CROP_BENCHMARKS.get(crop, {"high_below": 700, "medium_below": 1400})

    high_below = bands["high_below"]
    medium_below = bands["medium_below"]
    if state in RAINFED_SENSITIVE_STATES and crop in RAINFED_SENSITIVE_CROPS and season == "kharif":
        high_below *= 1.15
        medium_below *= 1.15
        context = "Rainfed-sensitive state/crop/season matched; thresholds tightened by 15%."
        confidence = 0.86
    elif crop in RAINFED_SENSITIVE_CROPS:
        context = "Rainfed-sensitive crop matched under national CRIDA rainfed contingency guidance."
        confidence = 0.78
    else:
        context = "General CRIDA rainfed contingency guidance used for national crop-risk cross-check."
        confidence = 0.70

    risk = _risk_from_bands(yield_kg, high_below, medium_below)
    advisory = (
        f"{_risk_advisory(risk, crop_raw)} CRIDA rainfed planning recommends contingency thinking for dry spells, "
        "delayed rainfall, excess rain, and mid-season crop stress."
    )
    return ExpertOpinion(
        source_id="crida_rainfed_regions_india",
        source_name="ICAR-CRIDA Crop and Contingency Planning for Rainfed Regions of India",
        source_type="national_contingency",
        risk=risk,
        confidence=confidence,
        applicable=True,
        matched_rules=[
            context,
            f"Observed yield normalized to {yield_kg:.1f} kg/ha.",
            f"Contingency band used: High below {high_below:.0f}, Medium below {medium_below:.0f} kg/ha.",
        ],
        advisory=advisory,
    )


def evaluate_expert_sources(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [
        icar_advisory_expert(data).to_dict(),
        des_state_yield_expert(data).to_dict(),
        crida_rainfed_regions_expert(data).to_dict(),
    ]


def _aggregate_expert_risk(experts: List[Dict[str, Any]]) -> str:
    usable = [e for e in experts if e.get("applicable") and e.get("confidence", 0) > 0]
    if not usable:
        return "Medium"
    total_weight = sum(float(e["confidence"]) for e in usable)
    weighted = sum(RISK_VALUE[e["risk"]] * float(e["confidence"]) for e in usable) / total_weight
    return _risk_label(weighted)


def _agreement_level(ai_risk: str, expert_risk: str, experts: List[Dict[str, Any]]) -> str:
    applicable = [e for e in experts if e.get("applicable")]
    expert_values = [RISK_VALUE.get(e.get("risk"), 2) for e in applicable]
    values = [RISK_VALUE.get(ai_risk, 2), RISK_VALUE.get(expert_risk, 2), *expert_values]
    if max(values) - min(values) >= 2:
        return "major_conflict"
    if ai_risk == expert_risk and all(e.get("risk") == expert_risk for e in applicable):
        return "strong_agreement"
    if ai_risk == expert_risk:
        return "ai_expert_consensus"
    return "partial_conflict"


def validate_prediction_with_experts(data: Dict[str, Any], ai_risk: str, pcs: float) -> Dict[str, Any]:
    experts = evaluate_expert_sources(data)
    expert_risk = _aggregate_expert_risk(experts)
    ai_val = RISK_VALUE.get(ai_risk, 2)
    expert_val = RISK_VALUE.get(expert_risk, 2)
    agreement = _agreement_level(ai_risk, expert_risk, experts)

    high_votes = sum(1 for e in experts if e.get("applicable") and e.get("risk") == "High")
    medium_votes = sum(1 for e in experts if e.get("applicable") and e.get("risk") == "Medium")
    low_votes = sum(1 for e in experts if e.get("applicable") and e.get("risk") == "Low")
    applicable_count = sum(1 for e in experts if e.get("applicable"))
    dominant_vote_count = max(low_votes, medium_votes, high_votes) if applicable_count else 0
    expert_source_agreement = (
        dominant_vote_count / applicable_count if applicable_count else 0.0
    )
    ai_expert_gap = _normalized_risk_distance(ai_val, expert_val)

    final_score = (ai_val * 0.40) + (expert_val * 0.60)
    final_risk = _risk_label(final_score)
    if ai_risk == "High" or high_votes >= 2:
        final_risk = "High"
    elif agreement == "major_conflict":
        final_risk = "Medium"
    final_val = RISK_VALUE.get(final_risk, 2)
    ai_final_gap = _normalized_risk_distance(ai_val, final_val)

    agreement_penalty = {
        "strong_agreement": 0.0,
        "ai_expert_consensus": 0.08,
        "partial_conflict": 0.18,
        "major_conflict": 0.32,
    }.get(agreement, 0.18)
    rdi = min(
        1.0,
        (0.50 * ai_expert_gap)
        + (0.20 * ai_final_gap)
        + (0.30 * (1 - expert_source_agreement))
        + agreement_penalty,
    )
    eas = max(0.0, 1 - rdi)
    tri = (float(pcs) * 0.55 + eas * 0.45) * 100

    if final_risk == "Low" and agreement in {"strong_agreement", "ai_expert_consensus"} and tri >= 80:
        status = "APPROVED"
        decision_action = "AUTO_FORWARD"
        final_decision = "SAFE TO PROCEED"
    elif agreement == "major_conflict" and (rdi >= 0.75 or tri < 70):
        status = "REJECTED"
        decision_action = "BLOCK_AI_OUTPUT"
        final_decision = "DO NOT AUTO-USE RESULT"
    else:
        status = "REVIEW REQUIRED"
        decision_action = "SEND_TO_OFFICER"
        final_decision = "SEND TO AGRICULTURE OFFICER"

    if tri >= 90:
        confidence_band = "Very High Reliability"
    elif tri >= 80:
        confidence_band = "High Reliability"
    elif tri >= 65:
        confidence_band = "Moderate Reliability"
    else:
        confidence_band = "Low Reliability"

    reason = (
        f"AI predicted {ai_risk}. Expert consensus is {expert_risk} from {applicable_count} applicable source(s): "
        f"{low_votes} Low, {medium_votes} Medium, {high_votes} High. Agreement level: {agreement.replace('_', ' ')}. "
        f"AI/expert agreement score: {(1 - ai_expert_gap) * 100:.0f}%. "
        f"Expert source agreement: {expert_source_agreement * 100:.0f}%. "
        f"Risk deviation index: {rdi:.3f}."
    )
    if final_risk == "High":
        farmer_explanation = (
            "Your crop is in a high-risk condition. Do not depend only on the AI result. Please contact the local agriculture officer, "
            "check soil moisture, pest/disease symptoms, and take corrective action quickly."
        )
    elif final_risk == "Medium":
        farmer_explanation = (
            "Your crop needs close monitoring. The result is not fully clear or the risk is moderate, so an agriculture officer should review it before major decisions."
        )
    else:
        farmer_explanation = (
            "Your crop looks comparatively safe. Continue normal field care, irrigation discipline, pest scouting, and timely harvest planning."
        )

    expert_advisory = format_expert_advisory(experts, expert_risk, final_risk, reason, farmer_explanation)
    return {
        "expert_validations": experts,
        "expert_consensus": {
            "expert_risk": expert_risk,
            "applicable_sources": applicable_count,
            "low_votes": low_votes,
            "medium_votes": medium_votes,
            "high_votes": high_votes,
            "agreement_level": agreement,
            "ai_expert_gap": round(ai_expert_gap, 3),
            "ai_expert_agreement": round(1 - ai_expert_gap, 3),
            "expert_source_agreement": round(expert_source_agreement, 3),
            "final_gap": round(ai_final_gap, 3),
        },
        "expert_risk": expert_risk,
        "final_risk": final_risk,
        "final_decision": final_decision,
        "final_decision_reason": reason,
        "farmer_explanation": farmer_explanation,
        "expert_advisory": expert_advisory,
        "eas": eas,
        "rdi": rdi,
        "tri": tri,
        "validation_status": status,
        "decision_action": decision_action,
        "confidence_band": confidence_band,
    }


def format_expert_advisory(
    experts: List[Dict[str, Any]],
    expert_risk: str,
    final_risk: str,
    reason: str,
    farmer_explanation: str,
) -> str:
    lines = [
        "Multi-Expert Validation Summary:",
        f"Expert consensus risk: {expert_risk}",
        f"Final risk: {final_risk}",
        f"Decision reason: {reason}",
        "",
        "Expert source opinions:",
    ]
    for expert in experts:
        label = expert["risk"] if expert.get("applicable") else "Not applicable"
        lines.append(f"- {expert['source_name']}: {label} (confidence {expert.get('confidence', 0):.2f})")
        if expert.get("matched_rules"):
            lines.append(f"  Evidence: {expert['matched_rules'][0]}")
        lines.append(f"  Advice: {expert.get('advisory', '')}")
    lines.extend(["", "Farmer explanation:", farmer_explanation])
    return "\n".join(lines)
