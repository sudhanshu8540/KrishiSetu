# 🌾 KrishiSetu AI

> AI-powered agricultural intelligence for Indian farmers

KrishiSetu AI is an AI-powered crop health assistant designed to help farmers identify visible crop health problems, understand local weather risks, and receive simple, practical recommendations.

Farmers can upload a crop image or capture one using their camera. KrishiSetu AI combines Gemini vision analysis, weather intelligence, location context, and a risk-scoring engine to provide actionable crop insights.

---

## 🚜 Problem

Farmers often face difficulty identifying crop diseases and understanding how weather conditions may increase agricultural risks.

Common challenges include:

- Early identification of visible crop problems
- Understanding disease risk from weather conditions
- Getting simple and actionable farming advice
- Accessing agricultural insights in local languages
- Understanding regional crop-risk patterns

---

## 💡 Solution

KrishiSetu AI provides a simple farmer-friendly workflow:

**📸 Crop Image → 🤖 Gemini AI → 🌦️ Weather Context → 📊 Risk Engine → 👨‍🌾 Actionable Advice**

The system analyzes the uploaded crop image, combines the result with local weather conditions, calculates an agricultural risk score, and presents practical recommendations.

---

## ✨ Key Features

### 🤖 AI Crop Analysis
Uses Google Gemini to analyze crop images and identify:

- Crop type
- Crop health
- Visible disease indicators
- Disease risk
- Weather-related risk
- Practical actions for the farmer

### 🌦️ Weather Intelligence
Uses location-based weather information including:

- Temperature
- Humidity
- Rain
- Wind speed
- Weather-based fungal/heat/wet-condition risk

### 📊 Agricultural Risk Engine

KrishiSetu AI calculates a 100-point agricultural risk score using:

- Disease risk — 40 points
- Crop health — 20 points
- Humidity — 15 points
- Rain — 10 points
- Temperature — 10 points
- Wind — 5 points

Risk levels:

| Score | Risk |
|---|---|
| 0–29 | 🟢 Low |
| 30–59 | 🟡 Medium |
| 60–100 | 🔴 High |

### 📍 Regional Risk Zones

Saved crop observations are grouped geographically to identify areas with repeated non-low-risk observations.

The dashboard displays:

- High-risk observations
- Healthy observations
- Regional hotspots
- Average regional risk
- Observation locations on Google Maps

### 🗣️ Multilingual & Voice Support

The application supports multiple Indian languages and browser-based voice interaction.

Supported languages include:

English, Hindi, Punjabi, Bengali, Marathi, Gujarati, Tamil, Telugu, Kannada, Odia, Assamese, Malayalam, Urdu and Bhojpuri.

### 📷 Camera + Gallery

Farmers can:

- Upload an existing crop image
- Capture a new crop photo using the device camera

### 💾 Scan History

Crop observations are stored so farmers can:

- Review previous scans
- Reopen complete AI analysis
- Listen to previous recommendations
- Clear scan history

---

## 🏗️ Technology Stack

### Frontend
- React
- Vite
- JavaScript
- Responsive CSS

### AI
- Google Gemini API
- Gemini vision-based crop analysis

### Backend
- Python
- FastAPI
- Firebase Admin SDK

### Database
- Firebase Firestore

### Maps
- Google Maps JavaScript API

### Weather
- Open-Meteo API

### Deployment
- Render
- GitHub

---

## 🔄 System Architecture

```text
                    ┌─────────────────────┐
                    │      Farmer         │
                    │ Image / Camera /    │
                    │ Voice / Location    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   React Frontend    │
                    │       Vite          │
                    └──────────┬──────────┘
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
                 ▼                           ▼
        ┌─────────────────┐       ┌─────────────────┐
        │   Weather API   │       │  FastAPI Backend│
        │   Open-Meteo    │       │                 │
        └─────────────────┘       └────────┬────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │   Google Gemini │
                                  │   AI Analysis   │
                                  └────────┬────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │ Agricultural    │
                                  │ Risk Engine     │
                                  └────────┬────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │   Firestore     │
                                  │ Scan History    │
                                  └────────┬────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │ Farmer Dashboard│
                                  │ Risk Zones/Map  │
                                  └─────────────────┘


                                  ---

## 🌐 Live Demo

**Frontend:**  
https://krishisetu-1-kxxh.onrender.com

**Backend API:**  
https://krishisetu-pd8r.onrender.com

**GitHub Repository:**  
https://github.com/sudhanshu8540/KrishiSetu

---

## 🚀 Future Scope

KrishiSetu AI can be extended with:

- 🛰️ Satellite-based crop monitoring using Google Earth Engine
- 🌱 Large-scale regional crop-risk mapping
- 📡 Early warning systems for disease and weather risks
- 🗺️ Village and district-level agricultural intelligence
- 📱 Progressive Web App / low-connectivity support
- 🧑‍🌾 Integration with agricultural experts and advisory services
- 📊 Long-term crop health and seasonal trend analysis

---

## 💻 Local Development

### 1. Clone the repository

```bash
git clone https://github.com/sudhanshu8540/KrishiSetu.git
cd KrishiSetu