import { useEffect, useMemo, useState, useRef } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English", native: "English", speech: "en-IN" },
  { code: "hi", label: "Hindi", native: "हिंदी", speech: "hi-IN" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ", speech: "pa-Guru-IN" },
  { code: "bn", label: "Bengali", native: "বাংলা", speech: "bn-IN" },
  { code: "mr", label: "Marathi", native: "मराठी", speech: "mr-IN" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી", speech: "gu-IN" },
  { code: "ta", label: "Tamil", native: "தமிழ்", speech: "ta-IN" },
  { code: "te", label: "Telugu", native: "తెలుగు", speech: "te-IN" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ", speech: "kn-IN" },
  { code: "or", label: "Odia", native: "ଓଡ଼ିଆ", speech: "or-IN" },
  { code: "as", label: "Assamese", native: "অসমীয়া", speech: "as-IN" },
  { code: "ml", label: "Malayalam", native: "മലയാളം", speech: "ml-IN" },
  { code: "ur", label: "Urdu", native: "اردو", speech: "ur-IN" },
  { code: "bho", label: "Bhojpuri", native: "भोजपुरी", speech: "hi-IN" },
];


function App() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [location, setLocation] = useState(null);
  const [weather, setWeather] = useState(null);
  const [weatherRisk, setWeatherRisk] = useState("");
  const [scans, setScans] = useState([]);
  const [selectedScan, setSelectedScan] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [language, setLanguage] = useState("en");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const recognitionRef = useRef(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  const refreshScans = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch("https://krishisetu-pd8r.onrender.com/scans", { cache: "no-store" });
      if (!response.ok) throw new Error("History request failed");
      const data = await response.json();
      setScans(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Scan history error:", err);
      setError(language === "hi" ? "फसल जांच इतिहास नहीं मिल पाया।" : "Could not load scan history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    refreshScans();
  }, []);

  const resetCurrentScan = () => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setAnalysis("");
    setVoiceText("");
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setError("");
    setSelectedScan(null);
  };

  const clearAllHistory = async () => {
    if (!scans.length) return;
    const message = language === "hi"
      ? `क्या आप सभी ${scans.length} सेव की गई फसल जांच हटाना चाहते हैं? यह वापस नहीं आएंगी।`
      : `Clear all ${scans.length} saved crop scans? This cannot be undone.`;
    if (!window.confirm(message)) return;

    setHistoryLoading(true);
    setError("");
    try {
      const response = await fetch("https://krishisetu-pd8r.onrender.com/scans", { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.detail || "Could not clear history");
      setScans([]);
      setSelectedScan(null);
      resetCurrentScan();
    } catch (err) {
      console.error("Clear history error:", err);
      setError(err.message || "Could not clear history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistoryScan = (scan) => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setSelectedScan(scan);
  };

  const speakText = (text, speechLocale) => {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(true);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLocale || selectedLanguage.speech;
    utterance.rate = 0.88;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  // Keep the local weather-risk message in the selected language.
  useEffect(() => {
    if (weather) setWeatherRisk(calculateWeatherRisk(weather));
  }, [language, weather]);

  const getSection = (name) => {
    if (!analysis) return "";

    const parts = analysis.split(/\n(?=[A-Z_]+:)/);
    const section = parts.find((part) => part.startsWith(`${name}:`));

    return section ? section.replace(`${name}:`, "").trim() : "";
  };

  const calculateWeatherRisk = (data) => {
    const humidity = Number(data?.current?.relative_humidity_2m ?? 0);
    const rain = Number(data?.current?.rain ?? 0);
    const temperature = Number(data?.current?.temperature_2m ?? 0);

    if (humidity >= 85) {
      return language === "hi"
        ? "⚠️ फंगल रोग का उच्च जोखिम"
        : "⚠️ High fungal disease risk";
    }

    if (rain > 2) {
      return language === "hi"
        ? "🌧️ मिट्टी में नमी ज्यादा है — फसल पर नजर रखें"
        : "🌧️ Wet conditions — monitor crops";
    }

    if (temperature >= 35) {
      return language === "hi"
        ? "🌡️ गर्मी से फसल पर तनाव का जोखिम"
        : "🌡️ Heat stress risk";
    }

    return language === "hi"
      ? "✅ मौसम की स्थिति अनुकूल है"
      : "✅ Weather conditions look favorable";
  };

  const getLocation = () => {
    setError("");

    if (!navigator.geolocation) {
      setError("Location is not supported by this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        setLocation({ lat, lon });

        try {
          // Fetch weather directly from the browser so the shared Render
          // server IP does not hit Open-Meteo's rate limit.
          const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m&timezone=auto`,
            { cache: "no-store" }
          );

          if (!response.ok) throw new Error(`Weather request failed (${response.status})`);

          const data = await response.json();
          setWeather(data);
          setWeatherRisk(calculateWeatherRisk(data));
        } catch (err) {
          console.error("Direct weather error:", err);
          setWeather(null);
          setWeatherRisk(
            language === "hi"
              ? "मौसम की जानकारी अभी उपलब्ध नहीं है"
              : "Weather data unavailable"
          );
        }
      },
      () => {
        setError("Please allow location access to get local weather insights.");
      }
    );
  };

  const selectedLanguage = LANGUAGE_OPTIONS.find((item) => item.code === language) || LANGUAGE_OPTIONS[0];

  const speakAnalysis = () => {
    if (!analysis) return;

    if (!window.speechSynthesis) {
      setError(language === "hi" ? "इस डिवाइस में आवाज़ सुनाने की सुविधा उपलब्ध नहीं है।" : "Voice playback is not supported on this device.");
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(analysis);
    utterance.lang = selectedLanguage.speech;
    utterance.rate = 0.88;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const toggleVoiceInput = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError(
        language === "hi"
          ? "इस ब्राउज़र में voice input उपलब्ध नहीं है। Chrome का उपयोग करें।"
          : "Voice input is not supported in this browser. Please use Chrome."
      );
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = selectedLanguage.speech;
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      setIsListening(true);
      setError("");
    };

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setVoiceText(transcript);
    };

    recognition.onerror = (event) => {
      console.error("Voice input error:", event.error);
      setIsListening(false);
      setError(
        language === "hi"
          ? "आवाज़ समझ नहीं आई। कृपया दोबारा कोशिश करें।"
          : "I couldn't understand the voice input. Please try again."
      );
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  };

  const openCamera = async () => {
    setError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(language === "hi"
        ? "इस डिवाइस/ब्राउज़र में कैमरा उपलब्ध नहीं है। Chrome में खोलें।"
        : "Camera access is not supported here. Please use Chrome.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (err) {
      console.error("Camera error:", err);
      setError(language === "hi"
        ? "कैमरा की अनुमति नहीं मिली। ब्राउज़र में Camera → Allow करें।"
        : "Camera permission was denied. Allow Camera access in the browser and try again.");
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const capturedFile = new File([blob], `krishisetu-${Date.now()}.jpg`, { type: "image/jpeg" });
      handleFileChange({ target: { files: [capturedFile] } });
      stopCamera();
    }, "image/jpeg", 0.92);
  };

  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith("image/")) {
      setError("Please select a JPG, PNG or WEBP image.");
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setError("Image size must be less than 5MB.");
      return;
    }

    setFile(selectedFile);
    setError("");
    setAnalysis("");

    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(selectedFile));
  };

  const analyzeCrop = async () => {
    if (!file) return;

    setLoading(true);
    setError("");
    setAnalysis("");

    const formData = new FormData();
    formData.append("file", file);

    const lat = location?.lat ?? 28.6100;
    const lon = location?.lon ?? 77.2100;

    formData.append("lat", lat);
    formData.append("lon", lon);
    formData.append("language", language);
    formData.append("farmer_note", voiceText);
    // Send browser-fetched weather to the backend so Gemini can use it
    // without making another Open-Meteo request from Render.
    formData.append("weather_json", weather ? JSON.stringify(weather) : "");

    try {
      let lastError = null;

      // Gemini free-tier limits can briefly return 429/503. Retry once after
      // the short quota window instead of immediately showing a hard error.
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetch(
          "https://krishisetu-pd8r.onrender.com/analyze-crop",
          {
            method: "POST",
            body: formData,
          }
        );

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          setAnalysis(data.analysis || "No analysis returned.");
          await refreshScans();
          return;
        }

        const detail = String(data?.detail || "Crop analysis failed");
        lastError = new Error(detail);
        const temporaryGeminiIssue =
          response.status === 429 ||
          response.status === 503 ||
          /RESOURCE_EXHAUSTED|429|QUOTA|temporarily|high demand|unavailable/i.test(detail);

        if (!temporaryGeminiIssue || attempt === 1) break;

        setError(
          language === "hi"
            ? "AI सेवा अभी व्यस्त है। KrishiSetu अपने-आप दोबारा कोशिश करेगा…"
            : "AI service is busy right now. KrishiSetu will retry automatically…"
        );
        await new Promise((resolve) => setTimeout(resolve, 60000));
        setError("");
      }

      throw lastError || new Error("Crop analysis failed");
    } catch (err) {
      console.error(err);
      setError(err.message || "Something went wrong while analyzing the crop.");
    } finally {
      setLoading(false);
    }
  };

  const calculateRiskScore = (scan) => {
    let score = 0;

    const disease = String(scan?.disease_level || scan?.disease_risk || "").toLowerCase();
    const health = String(scan?.health_level || scan?.health || "").toLowerCase();
    const weatherText = String(scan?.weather_risk || "").toLowerCase();

    // 100-point agricultural risk model:
    // Disease 40 + crop health 20 + humidity 15 + rain 10 + temperature 10 + wind 5.
    if (disease.includes("high")) score += 40;
    else if (disease.includes("medium") || disease.includes("moderate")) score += 25;
    else if (disease.includes("low")) score += 10;
    else if (weatherText.includes("high") || weatherText.includes("उच्च")) score += 15;

    if (
      health.includes("poor") ||
      health.includes("unhealthy") ||
      health.includes("damaged") ||
      health.includes("diseased")
    ) score += 20;
    else if (health.includes("moderate") || health.includes("medium")) score += 10;
    else if (!health.includes("healthy")) score += 8;

    const humidity = Number(scan?.weather?.current?.relative_humidity_2m ?? 0);
    const rain = Number(scan?.weather?.current?.rain ?? 0);
    const temperature = Number(scan?.weather?.current?.temperature_2m ?? 0);
    const wind = Number(scan?.weather?.current?.wind_speed_10m ?? 0);

    if (humidity >= 90) score += 15;
    else if (humidity >= 80) score += 10;
    else if (humidity >= 70) score += 5;

    if (rain > 5) score += 10;
    else if (rain > 2) score += 6;

    if (temperature >= 35) score += 10;
    else if (temperature >= 32) score += 5;

    if (wind >= 30) score += 5;
    else if (wind >= 20) score += 3;

    const finalScore = Math.min(100, Math.max(0, Math.round(score)));

    if (finalScore >= 60) return { score: finalScore, level: "High", emoji: "🔴" };
    if (finalScore >= 30) return { score: finalScore, level: "Medium", emoji: "🟡" };
    return { score: finalScore, level: "Low", emoji: "🟢" };
  };

  const scoredScans = useMemo(
    () => scans.map((scan) => ({ ...scan, risk: calculateRiskScore(scan) })),
    [scans]
  );

  const highRiskCount = useMemo(
    () => scoredScans.filter((scan) => scan.risk.level === "High").length,
    [scoredScans]
  );

  const getHealthStatus = (scan) => {
    const text = String(scan?.health_level || scan?.health || scan?.analysis || "").toLowerCase();
    if (
      text.includes("healthy") ||
      text.includes("स्वस्थ") ||
      text.includes("ठीक") ||
      text.includes("अच्छा") ||
      text.includes("सुदृढ़") ||
      text.includes("good health") ||
      text.includes("no visible signs") ||
      text.includes("कोई स्पष्ट रोग नहीं")
    ) return "healthy";

    if (
      text.includes("poor") ||
      text.includes("unhealthy") ||
      text.includes("damaged") ||
      text.includes("diseased") ||
      text.includes("खराब") ||
      text.includes("बीमार") ||
      text.includes("क्षतिग्रस्त") ||
      text.includes("रोगग्रस्त")
    ) return "poor";

    if (
      text.includes("moderate") ||
      text.includes("medium") ||
      text.includes("मध्यम") ||
      text.includes("औसत")
    ) return "moderate";

    return "unknown";
  };

  const healthyCount = useMemo(
    () => scans.filter((scan) => getHealthStatus(scan) === "healthy").length,
    [scans]
  );

  const riskScans = useMemo(
    () =>
      scoredScans
        .filter((scan) => scan.latitude != null && scan.longitude != null)
        .slice(0, 12),
    [scoredScans]
  );

  // Group nearby observations into regional hotspots. A 0.1° grid is roughly 10–11 km,
  // giving us a simple scalable prototype without needing a separate GIS service.
  const regionalHotspots = useMemo(() => {
    const groups = new Map();

    scoredScans.forEach((scan) => {
      if (scan.latitude == null || scan.longitude == null) return;
      const lat = Number(scan.latitude);
      const lon = Number(scan.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const key = `${Math.round(lat * 10) / 10}|${Math.round(lon * 10) / 10}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(scan);
    });

    return Array.from(groups.values())
      .map((items) => {
        const avgRisk = Math.round(items.reduce((sum, item) => sum + item.risk.score, 0) / items.length);
        const high = items.filter((item) => item.risk.level === "High").length;
        const medium = items.filter((item) => item.risk.level === "Medium").length;
        const lat = items.reduce((sum, item) => sum + Number(item.latitude), 0) / items.length;
        const lon = items.reduce((sum, item) => sum + Number(item.longitude), 0) / items.length;
        const level = avgRisk >= 60 ? "High" : avgRisk >= 30 ? "Medium" : "Low";

        return { id: `${lat}-${lon}`, lat, lon, count: items.length, high, medium, avgRisk, level };
      })
      .sort((a, b) => b.count - a.count || b.avgRisk - a.avgRisk);
  }, [scoredScans]);

  const activeHotspots = useMemo(
    () => regionalHotspots.filter((spot) => spot.count >= 2 && spot.level !== "Low"),
    [regionalHotspots]
  );

  const overallRisk = useMemo(() => {
    if (!scoredScans.length) return { score: 0, level: "Low", emoji: "🟢" };
    const average = Math.round(scoredScans.reduce((sum, item) => sum + item.risk.score, 0) / scoredScans.length);
    if (average >= 60) return { score: average, level: "High", emoji: "🔴" };
    if (average >= 30) return { score: average, level: "Medium", emoji: "🟡" };
    return { score: average, level: "Low", emoji: "🟢" };
  }, [scoredScans]);

  // Automatically request the farmer's live location once when the dashboard opens.
  useEffect(() => {
    getLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const initMap = async () => {
      try {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        if (!apiKey || !mapRef.current) return;

        setOptions({
          key: apiKey,
          v: "weekly",
        });

        const { Map } = await importLibrary("maps");
        const { AdvancedMarkerElement } = await importLibrary("marker");

        const hasLiveLocation = Boolean(location);
        const firstScan = riskScans[0];
        const center = hasLiveLocation
          ? { lat: Number(location.lat), lng: Number(location.lon) }
          : firstScan
            ? { lat: Number(firstScan.latitude), lng: Number(firstScan.longitude) }
            : { lat: 20.5937, lng: 78.9629 };

        const map = new Map(mapRef.current, {
          center,
          zoom: hasLiveLocation ? 12 : riskScans.length ? 6 : 5,
          mapId: "DEMO_MAP_ID",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });

        mapInstanceRef.current = map;

        // Live farmer location marker.
        if (hasLiveLocation) {
          const liveMarker = document.createElement("div");
          liveMarker.className = "live-location-marker";
          liveMarker.innerHTML = '<span></span>';

          new AdvancedMarkerElement({
            map,
            position: center,
            title: "Your live location",
            content: liveMarker,
          });
        }

        // Saved crop observation markers.
        riskScans.forEach((scan) => {
          const risk = scan.risk;
          const markerContent = document.createElement("div");
          markerContent.className = `risk-marker ${risk.level.toLowerCase()}`;
          markerContent.textContent =
            risk.level === "High" ? "!" : risk.level === "Medium" ? "•" : "✓";

          new AdvancedMarkerElement({
            map,
            position: { lat: Number(scan.latitude), lng: Number(scan.longitude) },
            title: `${scan.crop_name || "Crop observation"} — ${risk.level} Risk (${risk.score}/100)`,
            content: markerContent,
          });
        });

        // Regional hotspot markers: larger rings show areas with repeated non-low-risk observations.
        regionalHotspots.filter((spot) => spot.count >= 2).forEach((spot) => {
          const hotspotContent = document.createElement("div");
          hotspotContent.className = `hotspot-marker ${spot.level.toLowerCase()}`;
          hotspotContent.innerHTML = `<span>${spot.count}</span>`;
          new AdvancedMarkerElement({
            map,
            position: { lat: spot.lat, lng: spot.lon },
            title: `Regional hotspot — ${spot.count} scans, ${spot.avgRisk}/100 average risk`,
            content: hotspotContent,
          });
        });
      } catch (error) {
        console.error("Google Maps error:", error);
      }
    };

    initMap();
  }, [riskScans, regionalHotspots, location]);

  return (
    <div className="app">
      <style>{`
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: #f4f8f5;
          font-family: Inter, "Segoe UI", Arial, sans-serif;
          color: #17362a;
        }
        button, input { font-family: inherit; }

        .app {
          min-height: 100vh;
          background:
            radial-gradient(circle at 8% 15%, rgba(106, 178, 103, .08), transparent 24%),
            radial-gradient(circle at 92% 42%, rgba(86, 160, 112, .07), transparent 24%),
            #f5f8f5;
        }

        .topbar {
          height: 82px;
          background: linear-gradient(110deg, #124d32, #17613b 55%, #0f482e);
          color: white;
          position: relative;
          overflow: hidden;
        }

        .topbar::before,
        .topbar::after {
          content: "";
          position: absolute;
          width: 150px;
          height: 150px;
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 50%;
        }
        .topbar::before { left: -70px; top: -95px; }
        .topbar::after { right: -55px; bottom: -110px; }

        .topbar-inner {
          max-width: 1240px;
          height: 100%;
          margin: 0 auto;
          padding: 0 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .brand {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 11px;
          text-align: left;
        }

        .brand-mark {
          width: 36px;
          height: 36px;
          border-radius: 11px;
          display: grid;
          place-items: center;
          background: rgba(255,255,255,.10);
          font-size: 20px;
          flex: 0 0 36px;
        }
        .brand h1 {
          margin: 0;
          font-size: 25px;
          line-height: 1.1;
          letter-spacing: -.5px;
          font-weight: 750;
        }
        .brand p {
          margin: 4px 0 0;
          font-size: 12px;
          opacity: .78;
        }
        .language-switcher {
          position: absolute;
          left: 28px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px;
          border-radius: 12px;
          background: rgba(255,255,255,.10);
          border: 1px solid rgba(255,255,255,.12);
        }

        .language-btn {
          border: 0;
          border-radius: 9px;
          padding: 7px 10px;
          background: transparent;
          color: rgba(255,255,255,.78);
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }

        .language-select {
          border: 1px solid rgba(255,255,255,.25);
          background: rgba(255,255,255,.12);
          color: white;
          border-radius: 10px;
          padding: 9px 34px 9px 10px;
          font-weight: 700;
          outline: none;
          cursor: pointer;
        }
        .language-select option { color: #17362a; background: white; }
        .language-icon { font-size: 16px; }
        .voice-playback {
          margin-top: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 14px;
          background: #eef8ef;
          border: 1px solid #d4ead6;
        }
        .listen-btn {
          border: 0;
          border-radius: 12px;
          padding: 11px 16px;
          background: #17613b;
          color: white;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
        }
        .listen-btn.listening { background: #b13a32; }

        .language-btn.active {
          background: white;
          color: #155b35;
        }

        .top-status {
          position: absolute;
          right: 28px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          gap: 9px;
          font-size: 13px;
          opacity: .94;
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #8be28e;
          box-shadow: 0 0 0 5px rgba(139,226,142,.12);
        }

        .shell {
          max-width: 1240px;
          margin: 0 auto;
          padding: 24px 28px 44px;
        }

        .hero {
          min-height: 272px;
          display: grid;
          grid-template-columns: 245px 1fr 245px;
          align-items: center;
          gap: 20px;
          padding: 22px 30px;
          border-radius: 24px;
          background: linear-gradient(135deg, #e9f5e8 0%, #f7fbf5 52%, #e7f2dc 100%);
          border: 1px solid #dcebdd;
          box-shadow: 0 12px 35px rgba(35, 83, 48, .07);
        }

        .art {
          display: grid;
          place-items: center;
        }
        .plant-svg { width: 225px; height: 195px; }
        .farm-svg { width: 235px; height: 175px; }

        .hero-center {
          text-align: center;
          padding: 5px 0;
        }
        .hero-kicker {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 46px;
          height: 46px;
          border-radius: 15px;
          background: white;
          box-shadow: 0 7px 18px rgba(48, 99, 55, .10);
          font-size: 24px;
          margin-bottom: 10px;
        }
        .hero h2 {
          margin: 0;
          font-size: clamp(32px, 4vw, 46px);
          line-height: 1.05;
          letter-spacing: -1.4px;
          color: #093d2e;
        }
        .hero-description {
          max-width: 600px;
          margin: 13px auto 0;
          color: #5b6e67;
          font-size: 16px;
          line-height: 1.55;
        }
        .badges {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 9px;
          margin-top: 20px;
        }
        .badge {
          padding: 9px 13px;
          border-radius: 11px;
          font-size: 13px;
          font-weight: 700;
          color: #28463a;
          border: 1px solid rgba(0,0,0,.035);
        }
        .badge.green { background: #d9f3df; }
        .badge.blue { background: #dceefc; }
        .badge.yellow { background: #fff0c9; }

        .location-btn {
          width: 100%;
          margin-top: 16px;
          height: 52px;
          border: 0;
          border-radius: 14px;
          background: linear-gradient(100deg, #1d6b37, #16582e);
          color: white;
          font-size: 16px;
          font-weight: 750;
          cursor: pointer;
          box-shadow: 0 8px 18px rgba(21, 91, 47, .16);
          transition: transform .15s ease, box-shadow .15s ease;
        }
        .location-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 22px rgba(21, 91, 47, .22);
        }

        .location-text {
          text-align: center;
          color: #66766f;
          font-size: 13px;
          margin: 12px 0 2px;
        }

        .alert {
          margin: 12px 0 0;
          padding: 11px 14px;
          border-radius: 11px;
          text-align: center;
          background: #fff0f0;
          color: #b42323;
          border: 1px solid #f2d0d0;
          font-size: 13px;
          font-weight: 600;
        }

        .card {
          background: rgba(255,255,255,.96);
          border: 1px solid #e3ebe4;
          border-radius: 20px;
          box-shadow: 0 9px 28px rgba(31, 63, 43, .055);
        }

        .weather {
          margin-top: 16px;
          padding: 20px 22px;
        }
        .section-title {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          margin: 0 0 17px;
          color: #153f31;
          font-size: 19px;
        }
        .weather-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
        }
        .weather-item {
          min-height: 72px;
          padding: 12px 14px;
          border-radius: 14px;
          background: #f8fbf8;
          border: 1px solid #e6eee7;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .weather-icon {
          width: 36px;
          height: 36px;
          border-radius: 11px;
          display: grid;
          place-items: center;
          background: white;
          font-size: 19px;
          flex: 0 0 36px;
        }
        .weather-item strong {
          display: block;
          font-size: 12px;
          color: #738079;
          font-weight: 650;
          margin-bottom: 4px;
        }
        .weather-item span {
          display: block;
          font-size: 15px;
          color: #19392d;
          font-weight: 750;
        }
        .weather-risk {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 11px;
          text-align: center;
          background: #f4f8e9;
          color: #5c6e24;
          font-size: 13px;
          font-weight: 750;
        }

        .voice-card {
          margin-top: 16px;
          padding: 20px 22px;
        }
        .voice-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .voice-head h3 {
          margin: 0;
          color: #123d2e;
          font-size: 19px;
        }
        .voice-head p {
          margin: 5px 0 0;
          color: #738079;
          font-size: 12px;
          line-height: 1.45;
        }
        .voice-btn {
          flex: 0 0 auto;
          border: 0;
          border-radius: 12px;
          padding: 11px 15px;
          background: #e5f4e8;
          color: #24643a;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
        }
        .voice-btn.listening {
          background: #fff0ee;
          color: #b23b31;
          animation: voicePulse 1.2s ease-in-out infinite;
        }
        @keyframes voicePulse {
          50% { transform: scale(1.03); }
        }
        .voice-transcript {
          margin-top: 13px;
          padding: 12px 14px;
          border-radius: 12px;
          background: #f8fbf8;
          border: 1px solid #e3ece4;
        }
        .voice-transcript span {
          color: #7a857f;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .5px;
        }
        .voice-transcript p {
          margin: 5px 0 0;
          color: #294238;
          font-size: 13px;
          line-height: 1.45;
          font-weight: 650;
        }

        .upload {
          margin-top: 16px;
          padding: 23px;
        }
        .upload-head {
          text-align: center;
        }
        .upload-head h3 {
          margin: 0;
          color: #123d2e;
          font-size: 21px;
        }
        .upload-head p {
          margin: 6px 0 16px;
          color: #738079;
          font-size: 13px;
        }
        .upload-choice-box { min-height: 150px; }
        .preview-box { min-height: 190px; }
        .photo-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
        .photo-action { min-height: 58px; border: 1px solid #c7dccb; border-radius: 13px; background: #f8fcf9; display: flex; align-items: center; justify-content: center; gap: 9px; color: #286b3b; font-weight: 750; font-size: 14px; cursor: pointer; transition: transform .12s ease, background .12s ease, border-color .12s ease; }
        .photo-action:hover { transform: translateY(-1px); background: #eef8f0; border-color: #72a87c; }
        .photo-action-icon { font-size: 22px; }

        .upload-box {
          min-height: 174px;
          border: 1.8px dashed #78aa82;
          border-radius: 15px;
          background: #fbfefb;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background .15s ease, border-color .15s ease;
          overflow: hidden;
        }
        .upload-box:hover {
          background: #f5fbf6;
          border-color: #4d9360;
        }
        .upload-empty {
          text-align: center;
        }
        .upload-icon {
          width: 48px;
          height: 48px;
          margin: 0 auto 9px;
          border-radius: 14px;
          background: #e7f3e9;
          display: grid;
          place-items: center;
          color: #4d8d5b;
          font-size: 23px;
        }
        .upload-empty strong {
          display: inline;
          color: #2d7141;
          font-size: 14px;
        }
        .upload-empty .or {
          color: #5e6d66;
          font-size: 14px;
        }
        .upload-formats {
          display: block;
          color: #87918c;
          font-size: 12px;
          margin-top: 6px;
        }
        .preview-wrap {
          width: 100%;
          text-align: center;
          padding: 10px;
        }
        .preview {
          max-width: 100%;
          width: auto;
          height: 150px;
          object-fit: contain;
          display: block;
          margin: 0 auto 6px;
          border-radius: 11px;
        }
        .change-image {
          color: #2f7442;
          font-size: 12px;
          font-weight: 700;
        }
        .file-name {
          margin: 8px 0 0;
          text-align: center;
          color: #697771;
          font-size: 12px;
        }
        .analyze-btn {
          width: 100%;
          height: 49px;
          margin-top: 13px;
          border: 0;
          border-radius: 13px;
          background: linear-gradient(100deg, #73ad7e, #57976a);
          color: white;
          font-size: 16px;
          font-weight: 750;
          cursor: pointer;
          box-shadow: 0 6px 15px rgba(72, 132, 84, .14);
        }
        .analyze-btn:disabled {
          cursor: not-allowed;
          opacity: .55;
          box-shadow: none;
        }

        .analysis-card {
          margin-top: 18px;
          padding: 22px;
        }
        .analysis-head {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-bottom: 16px;
        }
        .analysis-head-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: #e7f4ea;
          display: grid;
          place-items: center;
          font-size: 21px;
          flex: 0 0 42px;
        }
        .analysis-head h3 {
          margin: 0;
          font-size: 20px;
          color: #123d2e;
        }
        .analysis-head p {
          margin: 3px 0 0;
          color: #7b8781;
          font-size: 12px;
        }
        .analysis-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 11px;
        }
        .analysis-item {
          min-height: 100px;
          padding: 14px;
          border-radius: 14px;
          background: #fbfdfb;
          border: 1px solid #e3ece4;
          display: flex;
          gap: 11px;
          align-items: flex-start;
        }
        .analysis-icon {
          width: 37px;
          height: 37px;
          border-radius: 10px;
          background: #eef7ef;
          display: grid;
          place-items: center;
          font-size: 18px;
          flex: 0 0 37px;
        }
        .analysis-label {
          display: block;
          margin-bottom: 5px;
          color: #7a857f;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .55px;
        }
        .analysis-value {
          margin: 0;
          color: #294238;
          font-size: 14px;
          line-height: 1.45;
          font-weight: 650;
        }
        .action {
          margin-top: 11px;
          padding: 15px;
          border-radius: 14px;
          background: linear-gradient(135deg, #eef9ef, #f5fbf5);
          border: 1px solid #dbeedc;
          display: flex;
          gap: 11px;
          align-items: flex-start;
        }
        .action-icon {
          width: 39px;
          height: 39px;
          border-radius: 11px;
          background: #dff1e1;
          display: grid;
          place-items: center;
          font-size: 19px;
          flex: 0 0 39px;
        }
        .action-text {
          margin: 0;
          color: #2b4739;
          font-size: 14px;
          line-height: 1.5;
        }

        .dashboard-kicker { color: #4f8066; font-size: 10px; font-weight: 900; letter-spacing: .12em; margin-bottom: 4px; }
        .dashboard-hero-heading { align-items: flex-start; }
        .dashboard-hero-heading h3 { font-size: 24px; margin-bottom: 4px; }
        .overall-pill { display: flex; align-items: center; gap: 9px; padding: 10px 14px; border-radius: 15px; border: 1px solid #e4ece5; background: #f7fbf8; min-width: 105px; }
        .overall-pill > span { font-size: 22px; }
        .overall-pill b { display: block; font-size: 17px; color: #173a2d; }
        .overall-pill small { display: block; font-size: 10px; color: #728078; margin-top: 2px; }
        .overall-pill.high { background: #fff4f2; border-color: #f1d5d0; }
        .overall-pill.medium { background: #fff9e9; border-color: #f1e1ad; }
        .overall-pill.low { background: #effaf2; border-color: #d5ead9; }
        .stat.purple .stat-icon { background: #eee9fb; }
        .dashboard-insights { display: grid; grid-template-columns: repeat(3, 1fr); gap: 11px; margin-top: 12px; }
        .dashboard-insight { display: flex; gap: 10px; padding: 13px; border-radius: 14px; background: #f8fbf8; border: 1px solid #e4ece5; }
        .insight-icon { width: 34px; height: 34px; flex: 0 0 34px; border-radius: 10px; display: grid; place-items: center; background: white; font-size: 17px; }
        .dashboard-insight b { display: block; color: #254b3b; font-size: 12px; margin-bottom: 3px; }
        .dashboard-insight p { margin: 0; color: #718078; font-size: 11px; line-height: 1.4; }

        .dashboard {
          margin-top: 18px;
          padding: 22px;
        }
        .dashboard-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 15px;
        }
        .dashboard-heading h3 {
          margin: 0;
          color: #123d2e;
          font-size: 20px;
        }
        .dashboard-heading span {
          color: #7a867f;
          font-size: 12px;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 11px;
        }
        .stat {
          padding: 15px;
          border-radius: 14px;
          border: 1px solid #e3ece4;
          background: #fbfdfb;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .stat-icon {
          width: 43px;
          height: 43px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          font-size: 20px;
          flex: 0 0 43px;
        }
        .stat.green .stat-icon { background: #def4e2; }
        .stat.red .stat-icon { background: #fff0ee; }
        .stat.blue .stat-icon { background: #e6f1fb; }
        .stat.risk-index .stat-icon { background: #fff2d6; }

        .risk-marker.medium {
          background: #e6a817;
        }
        .stat-number {
          display: block;
          color: #173a2d;
          font-size: 23px;
          font-weight: 800;
          line-height: 1;
        }
        .stat-label {
          display: block;
          margin-top: 4px;
          color: #7a857f;
          font-size: 11px;
        }

        .hotspot {
          margin-top: 18px;
          padding: 22px;
        }
        .hotspot-grid {
          display: grid;
          grid-template-columns: 1.05fr .95fr;
          gap: 16px;
          align-items: stretch;
        }
        .hotspot-map {
          position: relative;
          min-height: 360px;
          overflow: hidden;
          border-radius: 17px;
          border: 1px solid #dce9df;
          background: #e8f0e8;
        }

        .google-map {
          width: 100%;
          height: 360px;
          min-height: 360px;
          border-radius: 17px;
        }

        .live-location-marker {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(37, 99, 235, 0.20);
          border: 2px solid rgba(37, 99, 235, 0.75);
          display: grid;
          place-items: center;
          box-shadow: 0 0 0 8px rgba(37, 99, 235, 0.10);
        }
        .live-location-marker span {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #2563eb;
          border: 2px solid #fff;
        }
        .hotspot-map::before {
          content: "";
          position: absolute;
          inset: 22px;
          border: 1px dashed #b9d5bf;
          border-radius: 46% 54% 52% 48% / 42% 45% 55% 58%;
          transform: rotate(-7deg);
        }
        .map-title {
          position: absolute;
          top: 14px;
          left: 15px;
          padding: 6px 9px;
          border-radius: 9px;
          background: rgba(255,255,255,.82);
          color: #315343;
          font-size: 11px;
          font-weight: 750;
          z-index: 2;
        }
        .map-dot {
          position: absolute;
          width: 15px;
          height: 15px;
          border-radius: 50%;
          background: #e74c3c;
          border: 3px solid white;
          box-shadow: 0 3px 10px rgba(150, 54, 44, .25);
          z-index: 3;
        }
        .map-dot.low {
          background: #2e9b55;
          box-shadow: 0 3px 10px rgba(46, 155, 85, .22);
        }
        .map-dot.one { left: 31%; top: 44%; }
        .map-dot.two { left: 57%; top: 31%; }
        .map-dot.three { left: 69%; top: 57%; }
        .map-dot.four { left: 45%; top: 67%; }
        .risk-marker {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          color: white;
          font-size: 17px;
          font-weight: 900;
          border: 3px solid white;
          box-shadow: 0 3px 12px rgba(0,0,0,.28);
          transform: translateY(-2px);
        }

        .risk-marker.high {
          background: #e74c3c;
        }

        .risk-marker.medium {
          background: #e6a817;
        }

        .risk-marker.low {
          background: #2e9b55;
        }

        .hotspot-side {
          display: grid;
          gap: 9px;
        }
        .hotspot-summary {
          padding: 12px 13px;
          border-radius: 13px;
          background: #f8fbf8;
          border: 1px solid #e5eee6;
        }
        .hotspot-summary strong {
          display: block;
          color: #24483a;
          font-size: 13px;
        }
        .hotspot-summary span {
          display: block;
          margin-top: 4px;
          color: #7b877f;
          font-size: 11px;
        }
        .hotspot-legend {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          margin-top: 11px;
          color: #738079;
          font-size: 11px;
        }
        .legend-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 5px;
          background: #e74c3c;
        }
        .legend-dot.green { background: #2e9b55; }

        .history {
          margin-top: 18px;
          padding: 22px;
        }
        .history-list {
          display: grid;
          gap: 9px;
        }
        .history-item {
          padding: 13px 14px;
          border-radius: 13px;
          border: 1px solid #e5ece6;
          background: #fbfdfb;
        }
        .history-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .history-name {
          min-width: 0;
          color: #294438;
          font-size: 13px;
          font-weight: 750;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .health-pill {
          flex: 0 0 auto;
          padding: 4px 9px;
          border-radius: 99px;
          background: #e5f5e7;
          color: #2b6a3a;
          font-size: 10px;
          font-weight: 800;
        }
        .history-location {
          margin: 6px 0 0;
          color: #849089;
          font-size: 11px;
        }
        .history-analysis {
          margin: 5px 0 0;
          color: #66756e;
          font-size: 11px;
          line-height: 1.4;
        }
        .history-heading {
          align-items: center;
        }
        .history-actions {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .history-btn, .reset-btn {
          border: 1px solid #dbe6dd;
          background: white;
          color: #2c6240;
          border-radius: 10px;
          padding: 8px 11px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }
        .history-btn:disabled { opacity: .5; cursor: not-allowed; }
        .history-btn.danger { color: #b34444; border-color: #f0d8d8; background: #fffafa; }
        .history-tip {
          margin: -4px 0 12px;
          padding: 9px 11px;
          border-radius: 10px;
          background: #f3f8f3;
          color: #61746a;
          font-size: 11px;
        }
        .history-item {
          width: 100%;
          text-align: left;
          font: inherit;
          cursor: pointer;
          transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease;
        }
        .history-item:hover {
          transform: translateY(-1px);
          border-color: #a9cdb0;
          box-shadow: 0 5px 16px rgba(36, 88, 51, .07);
        }
        .history-open {
          display: inline-block;
          margin-top: 8px;
          color: #2f7b48;
          font-size: 10px;
          font-weight: 850;
        }
        .reset-btn {
          width: 100%;
          margin-top: 9px;
          color: #6a766f;
          background: #f7faf7;
        }

        .hotspot-stat .stat-icon { font-size: 22px; }
        .hotspot-alert { border: 1px solid rgba(180, 65, 65, .16); }
        .hotspot-marker { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: 13px; background: rgba(255,255,255,.95); border: 4px solid #555; box-shadow: 0 5px 16px rgba(0,0,0,.18); }
        .hotspot-marker span { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: rgba(255,255,255,.9); }
        .hotspot-marker.high { border-color: #c94b4b; color: #9b2525; }
        .hotspot-marker.medium { border-color: #d7a23b; color: #8b6411; }
        .hotspot-marker.low { border-color: #4e9a67; color: #27643b; }
        .history-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(11, 35, 24, .45);
          backdrop-filter: blur(4px);
        }
        .history-modal {
          width: min(760px, 100%);
          max-height: 88vh;
          overflow: auto;
          padding: 22px;
          border-radius: 20px;
          background: white;
          box-shadow: 0 24px 70px rgba(12, 47, 28, .25);
        }
        .modal-head {
          display: flex;
          justify-content: space-between;
          gap: 15px;
          align-items: flex-start;
        }
        .modal-kicker { color: #6c8176; font-size: 11px; font-weight: 800; }
        .modal-head h3 { margin: 5px 0 0; color: #173d2d; font-size: 21px; }
        .modal-close {
          border: 0; width: 34px; height: 34px; border-radius: 50%;
          background: #f1f5f2; color: #496156; cursor: pointer; font-size: 15px;
        }
        .modal-meta { margin-top: 10px; color: #829088; font-size: 11px; }
        .full-analysis {
          margin-top: 15px; padding: 17px; border-radius: 14px;
          background: #f8fbf8; border: 1px solid #e2ebe3;
          color: #2c453a; font-size: 14px; line-height: 1.65;
          white-space: pre-wrap; overflow-wrap: anywhere;
        }
        .modal-actions { display: flex; gap: 9px; flex-wrap: wrap; margin-top: 13px; }

        .features {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 11px;
          margin-top: 18px;
        }
        .feature {
          padding: 15px;
          border-radius: 15px;
          background: white;
          border: 1px solid #e4ebe5;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 7px 20px rgba(31, 63, 43, .04);
        }
        .feature-icon {
          width: 45px;
          height: 45px;
          border-radius: 13px;
          display: grid;
          place-items: center;
          font-size: 21px;
          flex: 0 0 45px;
        }
        .feature:nth-child(1) .feature-icon { background: #dff4e3; }
        .feature:nth-child(2) .feature-icon { background: #e2f0fc; }
        .feature:nth-child(3) .feature-icon { background: #fff1cf; }
        .feature strong {
          display: block;
          color: #213e33;
          font-size: 13px;
        }
        .feature p {
          margin: 4px 0 0;
          color: #7c8782;
          font-size: 11px;
          line-height: 1.35;
        }

        .footer {
          text-align: center;
          padding: 25px 0 4px;
          color: #7c8881;
          font-size: 11px;
        }

        @media (max-width: 900px) {
          .photo-actions { grid-template-columns: 1fr; }
          .hero {
            grid-template-columns: 1fr;
            min-height: auto;
            padding: 25px 20px;
          }
          .art { display: none; }
          .weather-grid { grid-template-columns: repeat(2, 1fr); }
          .features { grid-template-columns: 1fr; }
        }

        @media (max-width: 600px) {
          .topbar { height: 72px; }
          .topbar-inner { padding: 0 16px; }
          .brand h1 { font-size: 20px; }
          .brand p, .top-status { display: none; }
          .language-switcher { left: 12px; }
          .language-select { padding: 7px 24px 7px 8px; font-size: 11px; max-width: 170px; }
          .shell { padding: 15px 14px 30px; }
          .hero h2 { font-size: 32px; }
          .hero-description { font-size: 14px; }
          .badges { gap: 7px; }
          .badge { font-size: 11px; padding: 8px 10px; }
          .weather-grid,
          .analysis-grid,
          .stats,
          .dashboard-insights { grid-template-columns: 1fr; }
          .dashboard-hero-heading { flex-direction: column; }
          .overall-pill { width: 100%; }
          .hotspot-grid { grid-template-columns: 1fr; }
          .hotspot-map, .google-map { min-height: 300px; height: 300px; }
          .upload, .weather, .analysis-card, .dashboard, .hotspot, .history { padding: 17px; }
          .location-btn { height: 48px; font-size: 14px; }
          .voice-head { align-items: stretch; flex-direction: column; }
          .voice-btn { width: 100%; }
          .history-heading { align-items: stretch; }
          .history-actions { justify-content: stretch; }
          .history-actions .history-btn { flex: 1; }
          .history-modal { padding: 17px; max-height: 92vh; }
          .modal-actions .history-btn, .modal-actions .listen-btn { width: 100%; }
        }

        .camera-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.72); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 9999; }
        .camera-modal { width: min(680px, 100%); background: white; border-radius: 24px; padding: 20px; box-shadow: 0 24px 80px rgba(0,0,0,.3); }
        .camera-preview-wrap { position: relative; width: 100%; aspect-ratio: 16/10; background: #111; border-radius: 18px; overflow: hidden; margin-top: 12px; }
        .camera-preview { width: 100%; height: 100%; object-fit: cover; display: block; }
        .camera-frame { position: absolute; inset: 12% 10%; border: 2px dashed rgba(255,255,255,.85); border-radius: 18px; pointer-events: none; }
        .camera-tip { text-align: center; color: #667; margin: 12px 0; }
        .camera-controls { display: flex; gap: 12px; justify-content: center; align-items: center; }
        .camera-capture-btn { border: 0; border-radius: 999px; padding: 13px 22px; background: #1f8f55; color: white; font-weight: 800; cursor: pointer; font-size: 16px; }
        @media (max-width: 600px) { .camera-modal { padding: 14px; border-radius: 18px; } .camera-preview-wrap { aspect-ratio: 3/4; } .camera-controls { flex-direction: column; } .camera-capture-btn, .camera-controls .history-btn { width: 100%; } }
      `}</style>

      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark">🌾</div>
            <div>
              <h1>KrishiSetu AI</h1>
              <p>{language === "hi" ? "हर किसान के लिए स्मार्ट फसल जानकारी" : "Smart crop intelligence for every farmer"}</p>
            </div>
          </div>

          <div className="language-switcher" aria-label="Indian language selector">
            <span className="language-icon">🌐</span>
            <select
              className="language-select"
              value={language}
              onChange={(event) => {
                window.speechSynthesis?.cancel();
                setIsSpeaking(false);
                setLanguage(event.target.value);
              }}
            >
              {LANGUAGE_OPTIONS.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.native} — {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="top-status">
            <span className="status-dot"></span>
            <span>{language === "hi" ? "स्वस्थ फसलें • बेहतर कल" : "Healthy Crops • Brighter Tomorrow"}</span>
          </div>
        </div>
      </header>

      <main className="shell">
        <section className="hero">
          <div className="art">
            <svg className="plant-svg" viewBox="0 0 280 240">
              <circle cx="140" cy="118" r="103" fill="#dcefdc" />
              <path d="M140 190 C137 150 137 110 143 62" stroke="#2f7d32" strokeWidth="9" fill="none" strokeLinecap="round" />
              <path d="M143 92 C104 87 78 64 76 36 C111 39 136 58 143 92Z" fill="#4caf50" />
              <path d="M140 119 C176 114 198 91 200 61 C165 66 145 86 140 119Z" fill="#43a047" />
              <path d="M141 68 C114 58 101 39 104 18 C130 22 144 43 141 68Z" fill="#66bb6a" />
              <path d="M139 148 C108 144 86 128 81 104 C111 107 132 123 139 148Z" fill="#81c784" />
              <ellipse cx="140" cy="193" rx="82" ry="22" fill="#8b5a25" />
              <ellipse cx="110" cy="187" rx="15" ry="7" fill="#70451c" />
              <ellipse cx="169" cy="191" rx="14" ry="6" fill="#70451c" />
              <path d="M49 73 L54 84 L66 87 L54 91 L49 103 L45 91 L33 87 L45 84Z" fill="#67a94b" />
              <path d="M213 64 L217 76 L230 79 L217 83 L213 95 L209 83 L197 79 L209 76Z" fill="#ffc107" />
            </svg>
          </div>

          <div className="hero-center">
            <div className="hero-kicker">🌱</div>
            <h2>{language === "hi" ? "आपका AI फसल डॉक्टर" : "Your AI Crop Doctor"}</h2>
            <p className="hero-description">
              {language === "hi"
                ? "अपनी फसल की फोटो अपलोड करें और AI से दिखाई देने वाली समस्याओं की पहचान तथा आसान सलाह पाएं।"
                : "Upload a photo of your crop and let AI identify visible health problems and provide simple advice."}
            </p>

            <div className="badges">
              <span className="badge green">🌿 {language === "hi" ? "रोग पहचान" : "Detect Disease"}</span>
              <span className="badge blue">☁️ {language === "hi" ? "मौसम जानकारी" : "Weather Insight"}</span>
              <span className="badge yellow">💡 {language === "hi" ? "व्यावहारिक सलाह" : "Practical Advice"}</span>
            </div>
          </div>

          <div className="art">
            <svg className="farm-svg" viewBox="0 0 320 225">
              <rect width="320" height="225" rx="25" fill="#e5f1dc" />
              <circle cx="244" cy="65" r="42" fill="#ffe6a0" />
              <path d="M0 115 Q55 73 113 108 T225 96 T320 80 V225 H0Z" fill="#b8d88c" />
              <path d="M0 142 Q70 98 140 132 T320 120 V225 H0Z" fill="#78b64b" />
              <path d="M0 170 Q75 127 150 163 T320 148 V225 H0Z" fill="#4f9c3d" />
              <path d="M0 194 Q80 155 152 190 T320 174 V225 H0Z" fill="#2e7d32" />
              <rect x="225" y="97" width="50" height="37" fill="#fff1d9" />
              <path d="M217 97 L250 69 L283 97Z" fill="#d4773e" />
              <rect x="243" y="112" width="12" height="22" fill="#8d6e63" />
              <rect x="231" y="104" width="10" height="10" fill="#8fc8d8" />
              <path d="M31 180 Q58 163 84 180 M94 193 Q120 173 149 193 M159 180 Q186 159 213 180 M222 197 Q250 174 281 197" stroke="#d9eea2" strokeWidth="4" fill="none" />
              <path d="M247 57 Q258 47 270 56 M266 64 Q277 54 289 63" stroke="#557c72" strokeWidth="3" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        </section>

        <button className="location-btn" onClick={getLocation}>
          {language === "hi" ? "📍 मेरी लोकेशन पहचानें" : "📍 Detect My Location"}
        </button>

        {location && (
          <p className="location-text">
            📍 Location detected — Latitude: {location.lat.toFixed(4)},
            &nbsp;Longitude: {location.lon.toFixed(4)}
          </p>
        )}

        {error && !analysis && <p className="alert">{error}</p>}

        {location && weather && (
          <section className="card weather">
            <h3 className="section-title">🌦️ {language === "hi" ? "वर्तमान मौसम" : "Current Weather"}</h3>

            <div className="weather-grid">
              <div className="weather-item">
                <span className="weather-icon">🌡️</span>
                <div>
                  <strong>{language === "hi" ? "तापमान" : "Temperature"}</strong>
                  <span>{weather.current?.temperature_2m ?? "--"}°C</span>
                </div>
              </div>

              <div className="weather-item">
                <span className="weather-icon">💧</span>
                <div>
                  <strong>{language === "hi" ? "नमी" : "Humidity"}</strong>
                  <span>{weather.current?.relative_humidity_2m ?? "--"}%</span>
                </div>
              </div>

              <div className="weather-item">
                <span className="weather-icon">💨</span>
                <div>
                  <strong>{language === "hi" ? "हवा की गति" : "Wind Speed"}</strong>
                  <span>{weather.current?.wind_speed_10m ?? "--"} km/h</span>
                </div>
              </div>

              <div className="weather-item">
                <span className="weather-icon">🌧️</span>
                <div>
                  <strong>{language === "hi" ? "बारिश" : "Rain"}</strong>
                  <span>{weather.current?.rain ?? "--"} mm</span>
                </div>
              </div>
            </div>

            <div className="weather-risk">{weatherRisk}</div>
          </section>
        )}

        <section className="card voice-card">
          <div className="voice-head">
            <div>
              <h3>🎙️ {language === "hi" ? "किसान की आवाज़" : "Farmer Voice Input"}</h3>
              <p>
                {language === "hi"
                  ? "अपनी फसल की समस्या बोलकर बताएं। AI इसे फोटो के साथ समझेगा।"
                  : "Describe your crop problem by voice. AI will use it with the crop photo."}
              </p>
            </div>
            <button
              type="button"
              className={`voice-btn ${isListening ? "listening" : ""}`}
              onClick={toggleVoiceInput}
            >
              {isListening
                ? (language === "hi" ? "⏹️ सुनना बंद करें" : "⏹️ Stop Listening")
                : (language === "hi" ? "🎙️ बोलें" : "🎙️ Speak")}
            </button>
          </div>

          {voiceText && (
            <div className="voice-transcript">
              <span>{language === "hi" ? "आपने कहा:" : "You said:"}</span>
              <p>{voiceText}</p>
            </div>
          )}
        </section>

        <section className="card upload">
          <div className="upload-head">
            <h3>🖼️ {language === "hi" ? "फसल की फोटो अपलोड करें" : "Upload Crop Photo"}</h3>
            <p>{language === "hi" ? "पौधे या पत्ते की साफ फोटो चुनें" : "Choose a clear image of your plant or leaf"}</p>
          </div>

          <div className={`upload-box ${preview ? "preview-box" : "upload-choice-box"}`}>
            {preview ? (
              <div className="preview-wrap">
                <img src={preview} alt="Selected crop" className="preview" />
                <span className="change-image">{language === "hi" ? "नीचे से फोटो बदलें" : "Use the buttons below to change photo"}</span>
              </div>
            ) : (
              <div className="upload-empty">
                <div className="upload-icon">📷</div>
                <strong>{language === "hi" ? "फसल की फोटो लें" : "Take a crop photo"}</strong>
                <span className="upload-formats">{language === "hi" ? "कैमरा से तुरंत फोटो लें या गैलरी से चुनें" : "Take a photo with camera or choose from gallery"}</span>
              </div>
            )}
          </div>

          <div className="photo-actions">
            <button type="button" className="photo-action camera-action" onClick={openCamera}>
              <span className="photo-action-icon">📷</span>
              <span>{language === "hi" ? "कैमरा से फोटो लें" : "Take Photo"}</span>
            </button>
            <label className="photo-action gallery-action">
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} style={{ display: "none" }} />
              <span className="photo-action-icon">🖼️</span>
              <span>{language === "hi" ? "गैलरी से चुनें" : "Choose from Gallery"}</span>
            </label>
          </div>

          {file && <p className="file-name">Selected: {file.name}</p>}

          <button
            className="analyze-btn"
            onClick={analyzeCrop}
            disabled={!file || loading}
          >
            {loading ? (language === "hi" ? "⏳ विश्लेषण हो रहा है..." : "⏳ Analyzing...") : (language === "hi" ? "🔍  फसल का विश्लेषण करें" : "🔍  Analyze Crop")}
          </button>

          {(file || analysis || voiceText) && (
            <button type="button" className="reset-btn" onClick={resetCurrentScan}>
              ♻️ {language === "hi" ? "नई जांच के लिए रीसेट करें" : "Reset for New Scan"}
            </button>
          )}

          {error && analysis && <p className="alert">{error}</p>}
        </section>

        {analysis && (
          <section className="card analysis-card">
            <div className="analysis-head">
              <div className="analysis-head-icon">🤖</div>
              <div>
                <h3>AI Crop Analysis</h3>
                <p>{language === "hi" ? "KrishiSetu AI से आपकी फसल की व्यक्तिगत जानकारी" : "Personalized crop insights from KrishiSetu AI"}</p>
              </div>
            </div>

            <div className="analysis-grid">
              <div className="analysis-item">
                <div className="analysis-icon">🌾</div>
                <div>
                  <span className="analysis-label">{language === "hi" ? "पहचानी गई फसल" : "Crop Identified"}</span>
                  <p className="analysis-value">{getSection("CROP") || "—"}</p>
                </div>
              </div>

              <div className="analysis-item">
                <div className="analysis-icon">🌱</div>
                <div>
                  <span className="analysis-label">{language === "hi" ? "फसल का स्वास्थ्य" : "Crop Health"}</span>
                  <p className="analysis-value">{getSection("HEALTH") || "—"}</p>
                </div>
              </div>

              <div className="analysis-item">
                <div className="analysis-icon">⚠️</div>
                <div>
                  <span className="analysis-label">{language === "hi" ? "जोखिम और रोग" : "Risk & Disease"}</span>
                  <p className="analysis-value">{getSection("DISEASE_RISK") || "—"}</p>
                </div>
              </div>

              <div className="analysis-item">
                <div className="analysis-icon">🌦️</div>
                <div>
                  <span className="analysis-label">{language === "hi" ? "मौसम जोखिम" : "Weather Risk"}</span>
                  <p className="analysis-value">
                    {getSection("WEATHER_RISK") || weatherRisk || "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="action">
              <div className="action-icon">👨‍🌾</div>
              <div>
                <span className="analysis-label">{language === "hi" ? "अनुशंसित कार्रवाई" : "Recommended Action"}</span>
                <p className="action-text">{getSection("ACTION") || "—"}</p>
              </div>
            </div>

            <div className="voice-playback">
              <div>
                <strong>🔊 {language === "hi" ? "किसान के लिए जवाब सुनें" : "Listen to the AI advice"}</strong>
                <div style={{ marginTop: 4, color: "#557065", fontSize: 13 }}>
                  {selectedLanguage.native} • {language === "hi" ? "पढ़ने की जरूरत नहीं — सुनकर समझें" : "Hear the result instead of reading it"}
                </div>
              </div>
              <button type="button" className={`listen-btn ${isSpeaking ? "listening" : ""}`} onClick={speakAnalysis}>
                {isSpeaking ? (language === "hi" ? "⏹️ बंद करें" : "⏹️ Stop") : (language === "hi" ? "🔊 सुनें" : "🔊 Listen")}
              </button>
            </div>
          </section>
        )}

        {scans.length > 0 && (
          <>
            <section className="card dashboard">
              <div className="dashboard-heading dashboard-hero-heading">
                <div>
                  <div className="dashboard-kicker">🌾 {language === "hi" ? "किसान डैशबोर्ड" : "FARMER DASHBOARD"}</div>
                  <h3>{language === "hi" ? "आपकी फसल की स्थिति" : "Your Crop Health Overview"}</h3>
                  <span>{language === "hi" ? "आपकी सेव की गई जांच से ताज़ा जानकारी" : "Fresh insights from your saved crop observations"}</span>
                </div>
                <div className={`overall-pill ${overallRisk.level.toLowerCase()}`}>
                  <span>{overallRisk.emoji}</span>
                  <div><b>{overallRisk.score}/100</b><small>{language === "hi" ? `${overallRisk.level === "High" ? "उच्च" : overallRisk.level === "Medium" ? "मध्यम" : "कम"} जोखिम` : `${overallRisk.level} Risk`}</small></div>
                </div>
              </div>

              <div className="stats">
                <div className="stat green">
                  <div className="stat-icon">📋</div>
                  <div>
                    <span className="stat-number">{scans.length}</span>
                    <span className="stat-label">{language === "hi" ? "कुल जांच" : "Total Scans"}</span>
                  </div>
                </div>

                <div className="stat red">
                  <div className="stat-icon">⚠️</div>
                  <div>
                    <span className="stat-number">{highRiskCount}</span>
                    <span className="stat-label">{language === "hi" ? "उच्च जोखिम" : "High Risk"}</span>
                  </div>
                </div>

                <div className="stat blue">
                  <div className="stat-icon">🌱</div>
                  <div>
                    <span className="stat-number">{healthyCount}</span>
                    <span className="stat-label">{language === "hi" ? "स्वस्थ फसलें" : "Healthy Crops"}</span>
                  </div>
                </div>

                <div className="stat risk-index">
                  <div className="stat-icon">{overallRisk.emoji}</div>
                  <div>
                    <span className="stat-number">{overallRisk.score}/100</span>
                    <span className="stat-label">{overallRisk.level} Risk Index</span>
                  </div>
                </div>

                <div className="stat hotspot-stat">
                  <div className="stat-icon">📍</div>
                  <div>
                    <span className="stat-number">{activeHotspots.length}</span>
                    <span className="stat-label">{language === "hi" ? "रीजनल हॉटस्पॉट" : "Regional Hotspots"}</span>
                  </div>
                </div>

                <div className="stat purple">
                  <div className="stat-icon">🌱</div>
                  <div>
                    <span className="stat-number">{scans.length ? Math.round((healthyCount / scans.length) * 100) : 0}%</span>
                    <span className="stat-label">{language === "hi" ? "स्वस्थ जांच" : "Healthy Observations"}</span>
                  </div>
                </div>
              </div>

              <div className="dashboard-insights">
                <div className="dashboard-insight">
                  <span className="insight-icon">🌦️</span>
                  <div><b>{language === "hi" ? "मौसम संकेत" : "Weather Signal"}</b><p>{weatherRisk || (language === "hi" ? "मौसम डेटा उपलब्ध नहीं" : "Weather data unavailable")}</p></div>
                </div>
                <div className="dashboard-insight">
                  <span className="insight-icon">⚡</span>
                  <div><b>{language === "hi" ? "अभी क्या करें" : "What to do now"}</b><p>{highRiskCount > 0 ? (language === "hi" ? `${highRiskCount} जांच पर तुरंत ध्यान दें।` : `${highRiskCount} high-risk scan${highRiskCount > 1 ? "s" : ""} need attention.`) : (language === "hi" ? "अभी कोई उच्च जोखिम जांच नहीं है।" : "No high-risk scans right now.")}</p></div>
                </div>
                <div className="dashboard-insight">
                  <span className="insight-icon">📍</span>
                  <div><b>{language === "hi" ? "क्षेत्रीय स्थिति" : "Regional Status"}</b><p>{activeHotspots.length > 0 ? (language === "hi" ? "एक क्षेत्र में दोहराया जोखिम मिला।" : "Repeated risk detected in a local area.") : (language === "hi" ? "अभी कोई क्षेत्रीय हॉटस्पॉट नहीं।" : "No regional hotspot detected yet.")}</p></div>
                </div>
              </div>
            </section>

            <section className="card hotspot">
              <div className="dashboard-heading">
                <h3>🗺️ {language === "hi" ? "कृषि जोखिम क्षेत्र" : "Agricultural Risk Zones"}</h3>
                <span>{language === "hi" ? "सेव की गई फसल जांच के आधार पर" : "Based on saved crop observations"}</span>
              </div>

              <div className="hotspot-grid">
                <div className="hotspot-map">
                  <div className="map-title">📍 {language === "hi" ? "फसल जांच हॉटस्पॉट" : "Observation hotspots"}</div>
                  <div ref={mapRef} className="google-map"></div>
                </div>

                <div className="hotspot-side">
                  <div className="hotspot-summary">
                    <strong>🔴 {language === "hi" ? "उच्च जोखिम वाली जांच" : "High-risk observations"}</strong>
                    <span>{highRiskCount} {language === "hi" ? "जांच को ध्यान चाहिए" : "scans need closer attention"}</span>
                  </div>
                  <div className="hotspot-summary">
                    <strong>🟢 {language === "hi" ? "स्वस्थ फसल जांच" : "Healthy observations"}</strong>
                    <span>{healthyCount} {language === "hi" ? "जांच में स्वस्थ फसल दिखी" : "saved scans show healthy crop conditions"}</span>
                  </div>
                  <div className="hotspot-summary hotspot-alert">
                    <strong>📍 {language === "hi" ? "रीजनल हॉटस्पॉट" : "Regional hotspots"}</strong>
                    <span>
                      {activeHotspots.length
                        ? (language === "hi"
                          ? `${activeHotspots[0].count} जांच एक ही क्षेत्र में हैं — औसत जोखिम ${activeHotspots[0].avgRisk}/100।`
                          : `${activeHotspots[0].count} scans are clustered in one area — average risk ${activeHotspots[0].avgRisk}/100.`)
                        : (language === "hi"
                          ? "अभी कोई दोहराया हुआ उच्च/मध्यम जोखिम क्षेत्र नहीं मिला।"
                          : "No repeated high/medium-risk area detected yet.")}
                    </span>
                  </div>
                  <div className="hotspot-summary">
                    <strong>🧠 {language === "hi" ? "स्मार्ट जोखिम इंजन" : "Smart Risk Engine"}</strong>
                    <span>{language === "hi" ? "रोग + पौधे का स्वास्थ्य + नमी + बारिश + तापमान + हवा से 0–100 स्कोर बनता है।" : "Disease + crop health + humidity + rain + temperature + wind create a 0–100 score."}</span>
                  </div>
                </div>
              </div>

              <div className="hotspot-legend">
                <span><i className="legend-dot"></i> Higher risk</span>
                <span><i className="legend-dot green"></i> Lower risk / healthy</span>
              </div>
            </section>

            <section className="card history">
              <div className="dashboard-heading history-heading">
                <div>
                  <h3>🕘 {language === "hi" ? "हाल की फसल जांच" : "Recent Scan History"}</h3>
                  <span>{language === "hi" ? `${scans.length} जांच सेव हैं` : `${scans.length} saved observations`}</span>
                </div>
                <div className="history-actions">
                  <button type="button" className="history-btn" onClick={refreshScans} disabled={historyLoading}>
                    {historyLoading ? "⏳" : "↻"} {language === "hi" ? "फिर से जांचें" : "Refresh"}
                  </button>
                  <button type="button" className="history-btn danger" onClick={clearAllHistory} disabled={historyLoading || scans.length === 0}>
                    🗑️ {language === "hi" ? "सब साफ करें" : "Clear All"}
                  </button>
                </div>
              </div>

              <div className="history-tip">
                👆 {language === "hi" ? "किसी भी जांच पर क्लिक करके पूरा AI जवाब दोबारा देखें और सुनें।" : "Tap any scan to reopen the complete AI answer and listen again."}
              </div>

              <div className="history-list">
                {scans.slice(0, 10).map((scan) => (
                  <button className="history-item" key={scan.id} type="button" onClick={() => openHistoryScan(scan)}>
                    <div className="history-top">
                      <span className="history-name">🌾 {scan.crop_name || scan.filename || "Crop Scan"}</span>
                      <span className="health-pill">{scan.health || "Analyzed"}</span>
                    </div>
                    <p className="history-location">
                      📍 {scan.latitude?.toFixed?.(4) ?? scan.latitude},{" "}
                      {scan.longitude?.toFixed?.(4) ?? scan.longitude}
                    </p>
                    <p className="history-analysis">
                      {scan.analysis ? scan.analysis.substring(0, 145) + "..." : "AI analysis saved successfully."}
                    </p>
                    <span className="history-open">🔎 {language === "hi" ? "पूरा जवाब देखें" : "View full answer"}</span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {cameraOpen && (
          <div className="camera-modal-backdrop" onClick={stopCamera}>
            <section className="camera-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <span className="modal-kicker">📷 {language === "hi" ? "कैमरा" : "Camera"}</span>
                  <h3>{language === "hi" ? "फसल की फोटो लें" : "Take Crop Photo"}</h3>
                </div>
                <button type="button" className="modal-close" onClick={stopCamera}>✕</button>
              </div>
              <div className="camera-preview-wrap">
                <video ref={videoRef} className="camera-preview" autoPlay playsInline muted />
                <div className="camera-frame"></div>
              </div>
              <p className="camera-tip">
                {language === "hi" ? "पत्ते/फसल को फ्रेम के बीच में रखें और साफ फोटो लें।" : "Keep the crop or leaf in the center and take a clear photo."}
              </p>
              <div className="camera-controls">
                <button type="button" className="camera-capture-btn" onClick={capturePhoto}>📸 {language === "hi" ? "फोटो लें" : "Capture Photo"}</button>
                <button type="button" className="history-btn" onClick={stopCamera}>{language === "hi" ? "बंद करें" : "Cancel"}</button>
              </div>
            </section>
          </div>
        )}

        {selectedScan && (
          <div className="history-modal-backdrop" onClick={() => setSelectedScan(null)}>
            <section className="history-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <span className="modal-kicker">🌾 {language === "hi" ? "सेव की गई जांच" : "Saved Crop Scan"}</span>
                  <h3>{selectedScan.crop_name || selectedScan.filename || "Crop Scan"}</h3>
                </div>
                <button type="button" className="modal-close" onClick={() => setSelectedScan(null)}>✕</button>
              </div>

              <div className="modal-meta">
                📍 {selectedScan.latitude?.toFixed?.(4) ?? selectedScan.latitude}, {selectedScan.longitude?.toFixed?.(4) ?? selectedScan.longitude}
              </div>

              <div className="full-analysis">
                {selectedScan.analysis || "No saved analysis available."}
              </div>

              <div className="modal-actions">
                <button type="button" className="listen-btn" onClick={() => {
                  if (isSpeaking) { window.speechSynthesis?.cancel(); setIsSpeaking(false); }
                  else speakText(selectedScan.analysis, selectedScan.speech_locale || selectedLanguage.speech);
                }}>
                  {isSpeaking ? "⏹️ Stop" : "🔊 " + (language === "hi" ? "जवाब सुनें" : "Listen to Answer")}
                </button>
                <button type="button" className="history-btn" onClick={() => {
                  setAnalysis(selectedScan.analysis || "");
                  setSelectedScan(null);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}>
                  📌 {language === "hi" ? "मुख्य जवाब में खोलें" : "Open in Main Answer"}
                </button>
              </div>
            </section>
          </div>
        )}

        <section className="features">
          <div className="feature">
            <div className="feature-icon">🌿</div>
            <div>
              <strong>{language === "hi" ? "AI आधारित विश्लेषण" : "AI Powered Analysis"}</strong>
              <p>{language === "hi" ? "फसल के दिखाई देने वाले स्वास्थ्य संबंधी समस्याएं पहचानें" : "Detect visible crop health problems"}</p>
            </div>
          </div>

          <div className="feature">
            <div className="feature-icon">☁️</div>
            <div>
              <strong>{language === "hi" ? "मौसम आधारित जानकारी" : "Weather Based Insights"}</strong>
              <p>{language === "hi" ? "लोकेशन के अनुसार जोखिम अपडेट पाएं" : "Get location-specific risk updates"}</p>
            </div>
          </div>

          <div className="feature">
            <div className="feature-icon">💡</div>
            <div>
              <strong>{language === "hi" ? "किसान के लिए आसान" : "Farmer Friendly"}</strong>
              <p>{language === "hi" ? "सरल और व्यावहारिक सलाह" : "Simple and practical recommendations"}</p>
            </div>
          </div>
        </section>

        <footer className="footer">
          {language === "hi" ? "KrishiSetu AI • भारतीय कृषि के लिए बनाया गया 🇮🇳" : "KrishiSetu AI • Built for Indian Agriculture 🇮🇳"}
        </footer>
      </main>
    </div>
  );
}

export default App;
