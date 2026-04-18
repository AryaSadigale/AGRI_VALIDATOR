from database import get_model_metrics
import json

def test():
    user_id = 'f149d452-d8bc-4167-a79f-56626fb34fb5'
    role = 'farmer'
    metrics = get_model_metrics(user_id=user_id, user_role=role)
    print(json.dumps(metrics, indent=2))

if __name__ == "__main__":
    test()
