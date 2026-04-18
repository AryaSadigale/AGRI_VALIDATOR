from supabase_config import supabase
import json

def check_db():
    print("Checking prediction_history table...")
    res = supabase.table("prediction_history").select("count", count="exact").limit(1).execute()
    print(f"Total rows in prediction_history: {res.count}")
    
    res_recent = supabase.table("prediction_history").select("*").order("id", desc=True).limit(5).execute()
    print("Recent 5 rows:")
    print(json.dumps(res_recent.data, indent=2))
    
    print("\nChecking profiles table...")
    res_profiles = supabase.table("profiles").select("*").limit(5).execute()
    print("Profiles:")
    print(json.dumps(res_profiles.data, indent=2))

if __name__ == "__main__":
    check_db()
