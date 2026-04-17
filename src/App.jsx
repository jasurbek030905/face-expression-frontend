import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL = "https://face-expression-backend-2.onrender.com";
const API_URL = `${API_BASE_URL}/detect-emotion`;

function getEmotionColor(value) {
  if (value === "happy") return "#22c55e";
  if (value === "sad") return "#60a5fa";
  if (value === "angry") return "#f87171";
  if (value === "surprise") return "#fbbf24";
  if (value === "no face") return "#cbd5e1";
  if (value === "waiting") return "#a78bfa";
  return "#22c55e";
}

function getEmotionEmoji(value) {
  if (value === "happy") return "😊";
  if (value === "sad") return "😔";
  if (value === "angry") return "😠";
  if (value === "surprise") return "😮";
  if (value === "no face") return "🫥";
  if (value === "waiting") return "🤖";
  return "🙂";
}

function getSmoothedEmotion(history) {
  if (!history.length) return "waiting";
  const counts = {};
  for (const item of history) counts[item] = (counts[item] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function getAssistantMessage(emotion, confidence) {
  const percent = Math.round(confidence * 100);

  switch (emotion) {
    case "happy":
      return {
        title: "Positive mood detected",
        text: `The model currently sees a happy expression with about ${percent}% confidence.`,
        tip: "This is a strong frame to save for your project demo.",
      };
    case "sad":
      return {
        title: "Low-energy expression detected",
        text: `The current expression looks sad with about ${percent}% confidence.`,
        tip: "Try brighter light and keep your face more centered for a cleaner read.",
      };
    case "angry":
      return {
        title: "Tense expression detected",
        text: `The model is leaning toward an angry expression with about ${percent}% confidence.`,
        tip: "Stay still for one more second so the next prediction becomes more stable.",
      };
    case "surprise":
      return {
        title: "Surprised expression detected",
        text: `The model sees surprise with about ${percent}% confidence.`,
        tip: "Open eyes and mouth clearly if you want the result to stand out more.",
      };
    case "no face":
      return {
        title: "No face found",
        text: "The system cannot find a face in the current frame.",
        tip: "Move closer to the camera and keep your whole face inside the frame.",
      };
    case "waiting":
      return {
        title: "System waiting",
        text: "Start the camera to begin live emotion detection.",
        tip: "The browser captures a frame and sends it to the backend automatically.",
      };
    default:
      return {
        title: "Live analysis running",
        text: `The model currently predicts ${emotion} with about ${percent}% confidence.`,
        tip: "Keep your face centered and your lighting consistent for more reliable results.",
      };
  }
}

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const inFlightRef = useRef(false);
  const emotionHistoryRef = useRef([]);

  const [isStarting, setIsStarting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [emotion, setEmotion] = useState("waiting");
  const [confidence, setConfidence] = useState(0);
  const [backendReady, setBackendReady] = useState(false);

  const assistant = useMemo(
    () => getAssistantMessage(emotion, confidence),
    [emotion, confidence]
  );

  const recentEmotions = [...emotionHistoryRef.current].slice(-4).reverse();

  const warmUpBackend = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/`, { method: "GET" });
      setBackendReady(response.ok);
    } catch {
      setBackendReady(false);
    }
  };

  const startCamera = async () => {
    setError("");
    setIsStarting(true);

    try {
      await warmUpBackend();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      await new Promise((resolve) => {
        video.onloadedmetadata = () => resolve();
      });

      await video.play();

      setIsRunning(true);
      setStatus("Camera started");
      startDetectionLoop();
    } catch (err) {
      setError(err?.message || "Could not start camera");
      setStatus("Camera error");
    } finally {
      setIsStarting(false);
    }
  };

  const stopCamera = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    inFlightRef.current = false;
    emotionHistoryRef.current = [];
    setIsRunning(false);
    setStatus("Camera stopped");
    setError("");
    setEmotion("waiting");
    setConfidence(0);
  };

  const captureAndSendFrame = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;
    if (inFlightRef.current) return;
    if (video.readyState < 2) return;
    if (!video.videoWidth || !video.videoHeight) return;

    inFlightRef.current = true;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      inFlightRef.current = false;
      return;
    }

    canvas.width = 320;
    canvas.height = 240;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9)
      );

      if (!blob) {
        inFlightRef.current = false;
        return;
      }

      const formData = new FormData();
      formData.append("file", blob, "frame.jpg");

      setStatus("Detecting emotion...");
      setError("");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(API_URL, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error("Backend request failed");
      }

      const data = await response.json();
      const nextEmotion = data.emotion || "unknown";
      const nextConfidence = Number(data.confidence || 0);

      emotionHistoryRef.current.push(nextEmotion);
      if (emotionHistoryRef.current.length > 3) {
        emotionHistoryRef.current.shift();
      }

      const smoothedEmotion = getSmoothedEmotion(emotionHistoryRef.current);

      setEmotion(smoothedEmotion);
      setConfidence(nextConfidence);
      setStatus("Detection running");
      setBackendReady(true);
    } catch (err) {
      if (err.name === "AbortError") {
        setError("Backend timed out");
      } else {
        setError(err?.message || "Failed to detect emotion");
      }
      setStatus("Backend error");
      setBackendReady(false);
    } finally {
      inFlightRef.current = false;
    }
  };

  const startDetectionLoop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    captureAndSendFrame();

    intervalRef.current = setInterval(() => {
      if (!inFlightRef.current) {
        captureAndSendFrame();
      }
    }, 1000);
  };

  const saveSnapshot = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = `emotion-snapshot-${Date.now()}.png`;
    link.click();
  };

  useEffect(() => {
    const styleTag = document.createElement("style");
    styleTag.innerHTML = `
      * { box-sizing: border-box; }
      html, body, #root { margin: 0; min-height: 100%; }
      body {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        background: #020617;
      }
      @media (max-width: 980px) {
        .app-grid { grid-template-columns: 1fr !important; }
        .app-main-title { font-size: 34px !important; }
        .app-shell { padding: 16px !important; }
      }
      @media (max-width: 640px) {
        .app-main-title { font-size: 28px !important; }
        .app-hero { padding: 18px !important; }
        .app-card { padding: 16px !important; border-radius: 20px !important; }
        .app-video-shell { border-radius: 18px !important; }
        .app-button-row { width: 100%; }
        .app-button-row button { flex: 1 1 100%; width: 100%; }
      }
    `;
    document.head.appendChild(styleTag);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      document.head.removeChild(styleTag);
    };
  }, []);

  return (
    <div style={styles.page}>
      <div className="app-shell" style={styles.wrapper}>
        <div className="app-hero" style={styles.hero}>
          <div style={styles.heroTop}>
            <div>
              <div style={styles.badge}>AI Emotion Detection Assistant</div>
              <h1 className="app-main-title" style={styles.title}>
                Real-Time Face Expression Detector
              </h1>
              <p style={styles.subtitle}>
                A responsive AI web app that uses your camera feed and a Python backend
                to detect facial emotion in real time.
              </p>
            </div>

            <div style={styles.statusCluster}>
              <div style={styles.liveBadge(backendReady)}>
                {backendReady ? "Backend Online" : "Backend Warming Up"}
              </div>
              <div style={styles.statusBadge}>{status}</div>
            </div>
          </div>

          <div className="app-button-row" style={styles.buttonRow}>
            <button
              style={styles.primaryButton}
              onClick={startCamera}
              disabled={isStarting || isRunning}
            >
              {isStarting ? "Starting..." : "Start Camera"}
            </button>
            <button
              style={styles.secondaryButton}
              onClick={stopCamera}
              disabled={!isRunning}
            >
              Stop Camera
            </button>
            <button
              style={styles.secondaryButton}
              onClick={saveSnapshot}
              disabled={!isRunning}
            >
              Save Snapshot
            </button>
          </div>
        </div>

        <div className="app-grid" style={styles.grid}>
          <div className="app-card" style={styles.videoCard}>
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.sectionLabel}>Live Preview</div>
                <h2 style={styles.cardTitle}>Camera Feed</h2>
              </div>
              <div style={styles.emotionMini(getEmotionColor(emotion))}>
                {getEmotionEmoji(emotion)} {emotion}
              </div>
            </div>

            <div className="app-video-shell" style={styles.videoShell}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={styles.mainVideo}
              />
              {!isRunning && <div style={styles.videoOverlay}>Press Start Camera to begin</div>}
            </div>

            <canvas ref={canvasRef} style={{ display: "none" }} />
            {error && <div style={styles.errorBox}>{error}</div>}
          </div>

          <div style={styles.sidePanel}>
            <div className="app-card" style={styles.infoCardStrong}>
              <div style={styles.detectTopRow}>
                <div>
                  <div style={styles.sectionLabel}>Current Result</div>
                  <h2 style={styles.cardTitle}>Detected Emotion</h2>
                </div>
                <div style={styles.emojiBubble(getEmotionColor(emotion))}>{getEmotionEmoji(emotion)}</div>
              </div>

              <div style={{ ...styles.emotionBox, color: getEmotionColor(emotion) }}>
                {emotion}
              </div>

              <div style={styles.confidenceRow}>
                <span>Confidence</span>
                <strong>{Math.round(confidence * 100)}%</strong>
              </div>

              <div style={styles.progressTrack}>
                <div
                  style={{
                    ...styles.progressFill(getEmotionColor(emotion)),
                    width: `${Math.round(confidence * 100)}%`,
                  }}
                />
              </div>

              <div style={styles.historyWrap}>
                <div style={styles.sectionLabel}>Recent detections</div>
                <div style={styles.historyList}>
                  {recentEmotions.length ? (
                    recentEmotions.map((item, index) => (
                      <span key={`${item}-${index}`} style={styles.historyChip}>
                        {item}
                      </span>
                    ))
                  ) : (
                    <span style={styles.historyEmpty}>No detections yet</span>
                  )}
                </div>
              </div>
            </div>

            <div className="app-card" style={styles.assistantCard}>
              <div style={styles.assistantHeader}>
                <div style={styles.assistantDot} />
                <span>Emotion Assistant</span>
              </div>
              <h3 style={styles.assistantTitle}>{assistant.title}</h3>
              <p style={styles.assistantText}>{assistant.text}</p>
              <div style={styles.tipBox}>
                <div style={styles.sectionLabel}>Tip</div>
                <p style={styles.tipText}>{assistant.tip}</p>
              </div>
            </div>

            <div className="app-card" style={styles.infoCard}>
              <div style={styles.sectionLabel}>System Flow</div>
              <h2 style={styles.cardTitle}>How it works</h2>
              <ul style={styles.noteList}>
                <li>Browser opens the webcam.</li>
                <li>A frame is captured every 1 second.</li>
                <li>The frame is sent to the FastAPI backend.</li>
                <li>The backend returns the strongest emotion.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, rgba(14,165,233,0.18), transparent 26%), radial-gradient(circle at top right, rgba(168,85,247,0.14), transparent 24%), linear-gradient(180deg, #020617 0%, #0f172a 100%)",
    color: "#ffffff",
    width: "100%",
  },
  wrapper: {
    maxWidth: 1400,
    margin: "0 auto",
    padding: "24px",
  },
  hero: {
    marginBottom: 24,
    padding: 24,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    borderRadius: 28,
    backdropFilter: "blur(18px)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
  },
  heroTop: {
    display: "flex",
    gap: 20,
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  badge: {
    display: "inline-block",
    padding: "8px 14px",
    borderRadius: 999,
    background: "rgba(34,197,94,0.14)",
    color: "#86efac",
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 14,
    letterSpacing: "0.02em",
  },
  title: {
    fontSize: "clamp(38px, 6vw, 64px)",
    margin: 0,
    lineHeight: 1.04,
    letterSpacing: "-0.03em",
  },
  subtitle: {
    color: "#cbd5e1",
    fontSize: 18,
    lineHeight: 1.8,
    maxWidth: 760,
    margin: "14px 0 0 0",
  },
  statusCluster: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  liveBadge: (ready) => ({
    padding: "10px 14px",
    borderRadius: 999,
    background: ready ? "rgba(34,197,94,0.15)" : "rgba(251,191,36,0.16)",
    color: ready ? "#86efac" : "#fde68a",
    fontSize: 13,
    fontWeight: 700,
  }),
  statusBadge: {
    padding: "10px 14px",
    borderRadius: 999,
    background: "rgba(56,189,248,0.16)",
    color: "#7dd3fc",
    fontSize: 13,
    fontWeight: 700,
  },
  buttonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 20,
  },
  primaryButton: {
    padding: "14px 18px",
    borderRadius: 16,
    border: "none",
    background: "linear-gradient(135deg, #22c55e, #16a34a)",
    color: "#04130a",
    fontWeight: 800,
    fontSize: 15,
    cursor: "pointer",
    boxShadow: "0 12px 30px rgba(34,197,94,0.28)",
  },
  secondaryButton: {
    padding: "14px 18px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.55fr) minmax(320px, 0.95fr)",
    gap: 20,
    alignItems: "start",
  },
  videoCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 28,
    padding: 20,
    boxShadow: "0 18px 45px rgba(0,0,0,0.22)",
  },
  infoCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 24,
    padding: 20,
    boxShadow: "0 18px 45px rgba(0,0,0,0.18)",
  },
  infoCardStrong: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
    borderRadius: 24,
    padding: 20,
    boxShadow: "0 18px 45px rgba(0,0,0,0.22)",
  },
  assistantCard: {
    border: "1px solid rgba(125,211,252,0.16)",
    background: "linear-gradient(180deg, rgba(14,165,233,0.16), rgba(30,41,59,0.45))",
    borderRadius: 24,
    padding: 20,
    boxShadow: "0 18px 45px rgba(0,0,0,0.22)",
  },
  sidePanel: {
    display: "grid",
    gap: 20,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  detectTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    marginBottom: 10,
  },
  sectionLabel: {
    display: "block",
    fontSize: 12,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 800,
    marginBottom: 6,
  },
  cardTitle: {
    margin: 0,
    fontSize: 24,
    lineHeight: 1.2,
  },
  emotionMini: (color) => ({
    padding: "10px 14px",
    borderRadius: 999,
    background: `${color}22`,
    color,
    fontWeight: 800,
    textTransform: "capitalize",
    fontSize: 13,
  }),
  emojiBubble: (color) => ({
    width: 56,
    height: 56,
    borderRadius: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 26,
    background: `${color}22`,
    border: `1px solid ${color}55`,
  }),
  videoShell: {
    position: "relative",
    width: "100%",
    minHeight: 360,
    aspectRatio: "4 / 3",
    borderRadius: 24,
    overflow: "hidden",
    background: "#020617",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  mainVideo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    background: "#000",
  },
  videoOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(2,6,23,0.65)",
    color: "#e2e8f0",
    fontWeight: 700,
    textAlign: "center",
    padding: 20,
  },
  errorBox: {
    marginTop: 14,
    padding: "12px 14px",
    background: "rgba(239,68,68,0.12)",
    color: "#fecaca",
    borderRadius: 14,
    border: "1px solid rgba(248,113,113,0.18)",
  },
  emotionBox: {
    fontSize: "clamp(34px, 5vw, 48px)",
    fontWeight: 900,
    marginBottom: 16,
    textTransform: "capitalize",
    letterSpacing: "-0.03em",
  },
  confidenceRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
    color: "#e2e8f0",
    fontSize: 15,
  },
  progressTrack: {
    width: "100%",
    height: 12,
    borderRadius: 999,
    background: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  progressFill: (color) => ({
    height: "100%",
    borderRadius: 999,
    background: `linear-gradient(90deg, ${color}, #38bdf8)`,
  }),
  historyWrap: {
    marginTop: 20,
  },
  historyList: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 8,
  },
  historyChip: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(148,163,184,0.16)",
    color: "#e2e8f0",
    fontSize: 12,
    textTransform: "capitalize",
    fontWeight: 700,
  },
  historyEmpty: {
    color: "#94a3b8",
    fontSize: 13,
  },
  assistantHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "#e2e8f0",
    fontWeight: 800,
    marginBottom: 12,
  },
  assistantDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "#22c55e",
    boxShadow: "0 0 12px rgba(34,197,94,0.6)",
  },
  assistantTitle: {
    margin: "0 0 10px 0",
    fontSize: 26,
    lineHeight: 1.2,
  },
  assistantText: {
    margin: 0,
    color: "#dbeafe",
    lineHeight: 1.7,
    fontSize: 15,
  },
  tipBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 18,
    background: "rgba(15,23,42,0.45)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  tipText: {
    margin: "6px 0 0 0",
    color: "#cbd5e1",
    lineHeight: 1.65,
    fontSize: 14,
  },
  noteList: {
    margin: 0,
    paddingLeft: 18,
    color: "#cbd5e1",
    lineHeight: 1.9,
    fontSize: 15,
  },
};