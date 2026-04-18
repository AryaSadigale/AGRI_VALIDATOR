from supabase_config import supabase
import json

def dump_data():
    # Get profiles to find Farmer 5
    profiles = supabase.table("profiles").select("*").eq("name", "Farmer 5").execute()
    if not profiles.data:
        print("Farmer 5 not found")
        return

    user_id = profiles.data[0]["id"]
    print(f"User ID for Farmer 5: {user_id}")

    # Get predictions for this user
    preds = supabase.table("prediction_history").select("*").eq("user_id", user_id).execute()
    data = preds.data or []
    print(f"Total predictions: {len(data)}")
    
    if data:
        # Show count of each status and risk
        status_counts = {}
        risk_counts = {}
        for r in data:
            s = r.get("validation_status")
            status_counts[s] = status_counts.get(s, 0) + 1
            risk = r.get("ai_risk")
            risk_counts[risk] = risk_counts.get(risk, 0) + 1
        
        print(f"Status counts: {status_counts}")
        print(f"Risk counts: {risk_counts}")
        
        # Check alignment values
        match = 0
        total = 0
        for r in data:
            ai = r.get("ai_risk")
            ex = r.get("expert_risk")
            if ai and ex:
                total += 1
                if ai == ex:
                    match += 1
        print(f"Alignment: {match}/{total}")

        # Check TRI
        tri_vals = [r.get("tri") for r in data if r.get("tri") is not None]
        print(f"TRI values count: {len(tri_vals)}")
        if tri_vals:
            print(f"Avg TRI: {sum(tri_vals)/len(tri_vals)}")


if __name__ == "__main__":
    dump_data()
