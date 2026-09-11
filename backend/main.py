import os
import asyncio
import time
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
    # Current stable models. 2.5 Flash-Lite was returning 404 for this project,
    # so do not use it as a fallback.
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-3.5-flash",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
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


# Weather cache: browser location + analysis can otherwise hit Open-Meteo twice
# within seconds. Keep a successful result for 15 minutes and reuse the last
# successful result for up to 6 hours if the upstream API is temporarily 429.
WEATHER_CACHE_TTL = 15 * 60
WEATHER_STALE_TTL = 6 * 60 * 60
weather_cache = {}
weather_lock = asyncio.Lock()


async def get_weather(lat: float, lon: float):
    # Round coordinates so tiny GPS changes do not create a new API request.
    key = (round(lat, 2), round(lon, 2))
    now = time.time()

    cached = weather_cache.get(key)
    if cached and now - cached["time"] < WEATHER_CACHE_TTL:
        print(f"Weather cache hit: {key}")
        return cached["data"]

    # Only one request at a time. This prevents duplicate calls when the
    # frontend asks for weather and /analyze-crop asks for it simultaneously.
    async with weather_lock:
        now = time.time()
        cached = weather_cache.get(key)
        if cached and now - cached["time"] < WEATHER_CACHE_TTL:
            print(f"Weather cache hit after lock: {key}")
            return cached["data"]

        url = (
            "https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lon}"
            "&current=temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m"
            "&timezone=auto"
        )

        last_error = None
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=15) as http_client:
                    response = await http_client.get(url)
                    response.raise_for_status()
                    data = response.json()

                weather_cache[key] = {"time": time.time(), "data": data}
                print(f"Weather fetched successfully: {key}")
                return data

            except httpx.HTTPStatusError as error:
                last_error = error
                status = error.response.status_code
                if status != 429 and status < 500:
                    break
                if attempt < 2:
                    wait_seconds = 2 * (attempt + 1)
                    print(
                        f"Open-Meteo returned {status}. "
                        f"Retrying in {wait_seconds}s..."
                    )
                    await asyncio.sleep(wait_seconds)

            except Exception as error:
                last_error = error
                if attempt < 2:
                    await asyncio.sleep(2 * (attempt + 1))

        # If Open-Meteo is temporarily rate-limited, stale-but-real weather is
        # much better for the farmer dashboard than deleting the weather cards.
        cached = weather_cache.get(key)
        if cached and time.time() - cached["time"] < WEATHER_STALE_TTL:
            print(f"Using stale weather cache after upstream failure: {key}")
            return cached["data"]

        raise last_error


def _is_temporary_gemini_error(error):
    text = str(error).upper()
    return (
        "503" in text
        or "UNAVAILABLE" in text
        or "SERVICE UNAVAILABLE" in text
        or "OVERLOADED" in text
        or "HIGH DEMAND" in text
        or "429" in text
        or "RESOURCE_EXHAUSTED" in text
        or "RATE LIMIT" in text
        or "QUOTA" in text
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
    weather_json: str = Form(""),
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

    # Prefer weather supplied by the browser. This avoids Open-Meteo
    # rate-limiting the shared Render server IP during the crop analysis.
    try:
        weather_data = json.loads(weather_json) if weather_json.strip() else await get_weather(lat, lon)
        if not isinstance(weather_data, dict):
            raise ValueError("Invalid weather payload")
    except Exception as error:
        print("Weather error:", error)
        weather_data = {
            "current": {},
            "weather_error": "Live weather data unavailable"
        }

    farmer_note = farmer_note.strip()[:1000]

    language_instruction = f"""
LANGUAGE IS A HARD REQUIREMENT.
The selected farmer-facing language is: {selected_language_name}.

If the selected language is English:
- Write EVERY explanatory sentence in English only.
- NEVER use Hindi, Devanagari, Hinglish, or any other Indian-language script in the answer.
- Even if the image, farmer voice note, crop name, or context is in Hindi, translate/summarize it into English.
- Crop and disease names may remain in standard English/scientific terminology.

If the selected language is not English:
- Write all explanatory content in the selected language and its normal script.
- For Bhojpuri, use simple Bhojpuri written in Devanagari.

IMPORTANT:
- Keep these five section headings EXACTLY in English for app parsing:
  CROP:
  HEALTH:
  DISEASE_RISK:
  WEATHER_RISK:
  ACTION:
- Only the content after those headings should be in the selected language.
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
