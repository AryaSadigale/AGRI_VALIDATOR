from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import transformers

# Suppress noisy model load reports
transformers.utils.logging.set_verbosity_error()

model = SentenceTransformer("all-MiniLM-L6-v2")

# Example ICAR reference advisory (you can expand later)
ICAR_REFERENCE = """
Maintain optimal irrigation during Kharif season.
Apply balanced fertilizer based on soil health.
Monitor pest and disease regularly.
"""

def compute_similarity(llm_text):
    emb1 = model.encode([llm_text])
    emb2 = model.encode([ICAR_REFERENCE])

    score = cosine_similarity(emb1, emb2)[0][0]
    return float(score)


def rule_validation(llm_text, ai_risk):

    llm_text = llm_text.lower()

    violations = 0

    # Simple ICAR-style rules
    if ai_risk == "Low" and "emergency" in llm_text:
        violations += 1

    if ai_risk == "High" and "no action" in llm_text:
        violations += 1

    if violations == 0:
        return 1.0
    else:
        return 0.0


def data_consistency(ai_risk, llm_text):

    llm_text = llm_text.lower()

    if ai_risk == "High" and ("urgent" in llm_text or "increase irrigation" in llm_text or "high risk" in llm_text):
        return 1.0

    if ai_risk == "Medium" and ("watch closely" in llm_text or "monitor" in llm_text or "early corrective" in llm_text):
        return 1.0

    if ai_risk == "Low" and ("normal management" in llm_text or "safe" in llm_text):
        return 1.0

    return 0.7   # partial match default


def validate_llm(llm_text, ai_risk):

    rcs = rule_validation(llm_text, ai_risk)
    ass = compute_similarity(llm_text)
    dcs = data_consistency(ai_risk, llm_text)

    lts = (0.4 * rcs + 0.4 * ass + 0.2 * dcs) * 100

    if lts >= 80:
        status = "APPROVED"
    elif lts >= 60:
        status = "REVIEW REQUIRED"
    else:
        status = "REJECTED"

    return {
        "RCS": round(rcs, 3),
        "ASS": round(ass, 3),
        "DCS": round(dcs, 3),
        "LTS": round(lts, 2),
        "LLM_Status": status
    }
