import os

import requests


GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


def _clean_risk(risk):
    risk = (risk or "Medium").strip().capitalize()
    return risk if risk in {"Low", "Medium", "High"} else "Medium"


def _risk_profile(risk):
    profiles = {
        "Low": {
            "status": "Safe",
            "summary": "The crop condition looks stable. Continue normal management and keep checking the field regularly.",
            "observations": "Yield and risk signals are acceptable, so no emergency action is needed right now.",
            "actions": [
                "Continue normal management with balanced irrigation and fertilizer.",
                "Inspect the field once or twice a week for pests, weeds, and water stress.",
                "Maintain clean drainage and avoid over-irrigation.",
                "Prepare for timely harvest and keep records of inputs and yield.",
            ],
            "guidance": "Stay steady. Do not make sudden high-cost changes unless field symptoms appear.",
        },
        "Medium": {
            "status": "Watch Closely",
            "summary": "The crop needs attention. The situation is manageable, but it can become high risk if stress increases.",
            "observations": "Some yield or crop-condition signals are moderate, so water, nutrient, and pest management should be tightened.",
            "actions": [
                "Monitor the crop every 2 to 3 days, especially leaves, flowering, and pod or grain filling.",
                "Use split-dose fertilization and correct any visible nutrient deficiency.",
                "Keep irrigation regular, but avoid waterlogging.",
                "Scout for pests and diseases early and use integrated pest management if symptoms appear.",
            ],
            "guidance": "Act early but calmly. If the crop worsens, contact the local agriculture officer before spending heavily.",
        },
        "High": {
            "status": "High Risk",
            "summary": "The crop is under elevated risk and needs quick corrective action.",
            "observations": "Yield or crop-condition signals are weak, so delay can reduce production further.",
            "actions": [
                "Consult the local agriculture officer as soon as possible for field-level inspection.",
                "Check soil moisture immediately and increase irrigation through drip or sprinklers if moisture stress is present.",
                "Apply balanced NPK and micronutrient foliar spray based on local recommendation or soil-test results.",
                "Inspect for pest and disease pressure and start integrated pest management quickly.",
                "Do soil testing if not done recently, especially before adding expensive inputs.",
            ],
            "guidance": "Prioritize crop recovery and avoid risky extra investment until the field is inspected.",
        },
    }
    return profiles[_clean_risk(risk)]


def _build_fallback_advisory(data, ai_risk, expert_risk="Unknown"):
    ai_risk = _clean_risk(ai_risk)
    expert_risk = _clean_risk(expert_risk)
    profile = _risk_profile(ai_risk)
    agreement = (
        "AI and expert risk ratings agree."
        if ai_risk == expert_risk
        else "AI and expert risk ratings differ. Prioritize ICAR/expert guidance for field action."
    )
    actions = "\n".join(f"- {action}" for action in profile["actions"])

    return f"""Risk Summary:
Current Field Status: {profile["status"]}
AI Risk: {ai_risk} | Expert Risk: {expert_risk}
{agreement}
Crop: {data.get("Crop", "Unknown")} | Season: {data.get("Season", "Unknown")} | Location: {data.get("District", "Unknown")}, {data.get("State", "Unknown")}
Area: {data.get("Area", "N/A")} ha | Production: {data.get("Production", "N/A")} tonnes | Yield: {data.get("Yield", "N/A")} tonnes/hectare

Key Observations:
{profile["summary"]} {profile["observations"]}

Recommended Actions:
{actions}

Farmer Guidance:
{profile["guidance"]}"""


def _build_prompt(data, ai_risk, expert_risk):
    return f"""
You are a practical local agriculture officer from {data['State']}, India.
Give a farmer-friendly crop advisory for this exact field.

Farm data:
State: {data['State']}
District: {data['District']}
Crop: {data['Crop']}
Season: {data['Season']}
Area: {data['Area']} ha
Production: {data['Production']} tonnes
Yield: {data['Yield']} tonnes/hectare
AI Risk: {ai_risk}
Expert Risk: {expert_risk}

Rules:
- Use simple English.
- Align recommendations with the risk level.
- For Low risk, advise steady normal management and monitoring.
- For Medium risk, advise close monitoring and early corrective action.
- For High risk, advise urgent corrective action and agriculture officer consultation.
- If AI and Expert risk differ, clearly tell the farmer to prioritize ICAR/expert guidance.

Return only this format:

Risk Summary:
Current Field Status: Safe / Watch Closely / High Risk
AI Risk: ...
Expert Risk: ...
AI and expert agreement sentence.

Key Observations:
Short explanation using crop, season, location, and yield.

Recommended Actions:
- 4 to 6 practical bullet points.

Farmer Guidance:
Short final guidance.
"""


def generate_advisory(data, ai_risk, expert_risk="Unknown"):
    ai_risk = _clean_risk(ai_risk)
    expert_risk = _clean_risk(expert_risk)

    if not GROQ_API_KEY:
        return _build_fallback_advisory(data, ai_risk, expert_risk)

    try:
        response = requests.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a practical agriculture advisor who gives risk-aligned farming advice in simple English.",
                    },
                    {
                        "role": "user",
                        "content": _build_prompt(data, ai_risk, expert_risk),
                    },
                ],
                "temperature": 0.55,
                "max_tokens": 1000,
            },
            timeout=40,
        )
        result = response.json()
        choices = result.get("choices") or []
        if choices:
            advisory = choices[0].get("message", {}).get("content", "").strip()
            if advisory:
                return advisory

    except Exception:
        pass

    return _build_fallback_advisory(data, ai_risk, expert_risk)
