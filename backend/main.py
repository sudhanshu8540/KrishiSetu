import os
import asyncio
import httpx
import firebase_admin
from firebase_admin import firestore
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from dotenv import load_dotenv

load_dotenv()

# Firebase / Firestore
import base64
import json

firebase_b64 = os.getenv("FIREBASE_SERVICE_ACCOUNT_B64")

if firebase_b64:
    firebase_json = json.loads(base64.b64decode(firebase_b64).decode("utf-8"))
    cred = firebase_admin.credentials.Certificate(firebase_json)
    firebase_admin.initialize_app(cred)
else:
    firebase_admin.initialize_app()

db = firestore.client()

# Gemini
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Primary model + automatic fallbacks. All of these are current Gemini Flash
# models and support image input. If a model is temporarily overloaded (503),
# KrishiSetu automatically tries the next one.
GEMINI_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
]


def get_section(text, name):
    parts = text.split("\n")
    for i, line in enumerate(parts):
        if line.strip().startswith(name + ":"):
            values = []
            for next_line in parts[i + 1:]:
                stripped = next_line.strip()
                if stripped and ":" in stripped and stripped.split(":")[0].isupper():
                    break
                if stripped:
                    values.append(stripped)
            return " ".join(values)
    return ""


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    # Public demo frontend + local development.
    # KrishiSetu does not use cookie/session authentication,
    # so wildcard CORS is safe for this prototype and avoids
    # Render preview/domain mismatch issues.
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def get_weather(lat: float, lon: float):
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        "&current=temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m"
    )

    async with httpx.AsyncClient(timeout=15) as http_client:
        response = await http_client.get(url)
        response.raise_for_status()
        return response.json()


def _is_temporary_gemini_error(error):
    text = str(error).upper()
    return (
        "503" in text
        or "UNAVAILABLE" in text
        or "SERVICE UNAVAILABLE" in text
        or "OVERLOADED" in text
        or "HIGH DEMAND" in text
    )


def generate_with_retry(contents, attempts_per_model=2):
    """Generate Gemini content with retry + model fallback.

    503/high-demand errors are temporary, so we retry the current model and
    then fall back through the remaining Flash models. Other errors are raised
    immediately because changing models will not normally fix them.
    """
    last_error = None

    for model_index, model_name in enumerate(GEMINI_MODELS):
        for attempt in range(attempts_per_model):
            try:
                print(f"Gemini attempt: {model_name} ({attempt + 1}/{attempts_per_model})")
                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                )
                print(f"Gemini success: {model_name}")
                return response
            except Exception as error:
                last_error = error

                if not _is_temporary_gemini_error(error):
                    raise

                if attempt < attempts_per_model - 1:
                    wait_seconds = 2 ** attempt
                    print(
                        f"Gemini {model_name} temporarily unavailable. "
                        f"Retrying in {wait_seconds}s..."
                    )
                    import time
                    time.sleep(wait_seconds)

        if model_index < len(GEMINI_MODELS) - 1:
            next_model = GEMINI_MODELS[model_index + 1]
            print(
                f"Gemini {model_name} is unavailable. "
                f"Falling back to {next_model}..."
            )

    raise last_error


@app.get("/")
def home():
    return {"message": "KrishiSetu Backend is running! 🌾"}


@app.get("/gemini-test")
def gemini_test():
    try:
        response = generate_with_retry(
            "Say hello to KrishiSetu in one short sentence."
        )
        return {"message": response.text}
    except Exception as error:
        raise HTTPException(status_code=503, detail=str(error))


@app.post("/analyze-crop")
async def analyze_crop(
    file: UploadFile = File(...),
    lat: float = 28.6100,
    lon: float = 77.2100,
    language: str = Form("en"),
    farmer_note: str = Form(""),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a valid crop image."
        )

    image_data = await file.read()

    if not image_data:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")

    if len(image_data) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Image size must be less than 5MB."
        )

    language_aliases = {
        "en": ("English", "en-IN"),
        "hi": ("Hindi", "hi-IN"),
        "pa": ("Punjabi", "pa-Guru-IN"),
        "bn": ("Bengali", "bn-IN"),
        "mr": ("Marathi", "mr-IN"),
        "gu": ("Gujarati", "gu-IN"),
        "ta": ("Tamil", "ta-IN"),
        "te": ("Telugu", "te-IN"),
        "kn": ("Kannada", "kn-IN"),
        "or": ("Odia", "or-IN"),
        "as": ("Assamese", "as-IN"),
        "ml": ("Malayalam", "ml-IN"),
        "ur": ("Urdu", "ur-IN"),
        "bho": ("Bhojpuri", "hi-IN"),
    }
    selected_language = language.strip().lower()
    if selected_language not in language_aliases:
        selected_language = "en"
    selected_language_name, speech_locale = language_aliases[selected_language]

    try:
        weather_data = await get_weather(lat, lon)
    except Exception as error:
        print("Weather error:", error)
        weather_data = {
            "current": {},
            "weather_error": "Live weather data unavailable"
        }

    farmer_note = farmer_note.strip()[:1000]

    language_instruction = f"""
Write ALL farmer-facing explanatory content in simple, natural {selected_language_name}.
Use the normal script used by speakers of that language. Keep words easy enough for a farmer.
Do not mix English into the explanation unless a crop/disease name has no natural local equivalent.
For Bhojpuri, use simple Bhojpuri written in Devanagari.

IMPORTANT:
- Keep these five section headings EXACTLY in English for app parsing:
  CROP:
  HEALTH:
  DISEASE_RISK:
  WEATHER_RISK:
  ACTION:
- Only the content after those headings should be in {selected_language_name}.
- ACTION must contain 3 short, practical steps.
- Do not output JSON, markdown tables, or extra headings.
"""

    prompt = f"""
Analyze this crop image for a farmer.

{language_instruction}

Return the analysis in exactly these sections:

CROP:
Name of the crop or plant.

HEALTH:
Give the crop health level and a short explanation in the selected language.

DISEASE_RISK:
Mention the most likely disease or risk in the selected language. If none is visible, clearly say that no obvious disease was detected in the selected language.

WEATHER_RISK:
Explain how the current weather may affect the crop.

ACTION:
Give 3 simple and practical actions for the farmer.

Current weather data:
{weather_data}

Farmer's voice note:
{farmer_note if farmer_note else "No voice note provided."}

Use the weather information when it is relevant.
Use the farmer's voice note as additional context, but do not assume it is medically/agronomically correct.
If the image is unclear, clearly say so.
"""

    try:
        response = await asyncio.to_thread(
            generate_with_retry,
            [
                prompt,
                genai.types.Part.from_bytes(
                    data=image_data,
                    mime_type=file.content_type,
                ),
            ],
        )
    except Exception as error:
        print("Gemini error:", error)
        raise HTTPException(
            status_code=503,
            detail=(
                "AI service is temporarily busy. KrishiSetu tried multiple "
                "Gemini models, but none responded. Please try again shortly."
            )
        )

    crop_name = get_section(response.text, "CROP")
    health = get_section(response.text, "HEALTH")
    disease_risk = get_section(response.text, "DISEASE_RISK")
    weather_risk = get_section(response.text, "WEATHER_RISK")
    action = get_section(response.text, "ACTION")

    normalized_text = response.text.lower()
    if any(word in normalized_text for word in ["high", "उच्च", "ज्यादा", "अधिक"]):
        disease_level = "high"
    elif any(word in normalized_text for word in ["medium", "moderate", "मध्यम"]):
        disease_level = "medium"
    elif any(word in normalized_text for word in ["low", "कम"]):
        disease_level = "low"
    else:
        disease_level = "unknown"

    if any(word in normalized_text for word in ["poor", "unhealthy", "damaged", "diseased", "खराब", "अस्वस्थ", "रोगग्रस्त"]):
        health_level = "poor"
    elif any(word in normalized_text for word in ["healthy", "स्वस्थ", "अच्छा", "अच्छी"]):
        health_level = "healthy"
    elif any(word in normalized_text for word in ["moderate", "medium", "मध्यम"]):
        health_level = "moderate"
    else:
        health_level = "unknown"

    db.collection("crop_scans").add({
        "filename": file.filename,
        "analysis": response.text,
        "latitude": lat,
        "longitude": lon,
        "weather": weather_data,
        "crop_name": crop_name,
        "health": health,
        "disease_risk": disease_risk,
        "weather_risk": weather_risk,
        "action": action,
        "language": selected_language,
        "farmer_note": farmer_note,
        "health_level": health_level,
        "disease_level": disease_level,
        "speech_locale": speech_locale,
    })

    return {
        "filename": file.filename,
        "analysis": response.text,
        "language": selected_language,
        "crop_name": crop_name,
        "health": health,
        "disease_risk": disease_risk,
        "weather_risk": weather_risk,
        "action": action,
        "health_level": health_level,
        "disease_level": disease_level,
        "speech_locale": speech_locale,
    }


@app.get("/weather")
async def weather(lat: float, lon: float):
    try:
        return await get_weather(lat, lon)
    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"Weather service unavailable: {error}"
        )


@app.get("/scans")
async def get_scans():
    docs = db.collection("crop_scans").stream()

    scans = []

    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        scans.append(data)

    return scans


@app.delete("/scans")
async def clear_scans():
    """Delete all saved crop observations from Firestore."""
    try:
        docs = list(db.collection("crop_scans").stream())
        deleted = 0
        for doc in docs:
            doc.reference.delete()
            deleted += 1
        return {"message": "Scan history cleared", "deleted": deleted}
    except Exception as error:
        print("Clear scans error:", error)
        raise HTTPException(status_code=500, detail="Could not clear scan history.")
