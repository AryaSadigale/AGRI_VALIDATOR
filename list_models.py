import os

from google import genai

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise RuntimeError("Set GOOGLE_API_KEY before listing Gemini models.")

client = genai.Client(api_key=api_key)

models = client.models.list()

for m in models:
    print(m.name)
