import React, { useEffect, useRef, useState } from "react";


const API_URL = "https://face-expression-backend-2.onrender.com/detect-emotion";

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const inFlightRef = useRef(false);
  const historyRef = useRef([]);

  const [isStarting, setIsStarting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [emotion, setEmotion] = useState("Waiting");
  const [confidence, setConfidence] = useState(0);

  const startCamera = async () => {
    setError("");
    setIsStarting(true);

    try {
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

    setIsRunning(false);
    setStatus("Camera stopped");
    setEmotion("Waiting");
    setConfidence(0);
  };
  const getEmotionColor = (value) => {
  if (value === "happy") return "#86efac";
  if (value === "sad") return "#93c5fd";
  if (value === "angry") return "#fca5a5";
  if (value === "surprise") return "#fcd34d";
  if (value === "no face") return "#cbd5e1";
  return "#86efac";
};
    const captureAndSendFrame = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (inFlightRef.current) return;
inFlightRef.current = true;
    if (!video || !canvas) return;
    if (video.readyState < 2) return;
    if (!video.videoWidth || !video.videoHeight) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9)
      );

      if (!blob) return;

      const formData = new FormData();
      formData.append("file", blob, "frame.jpg");

      setStatus("Detecting emotion...");

      const response = await fetch(API_URL, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Backend request failed");
      }

      const data = await response.json();
      const nextEmotion = data.emotion || "unknown";
      const nextConfidence = Number(data.confidence || 0);

      historyRef.current.push(nextEmotion);
      if (historyRef.current.length > 5) {
         historyRef.current.shift();
      }

      const counts = {};
      for (const item of historyRef.current) {
        counts[item] = (counts[item] || 0) + 1;
      }

      const smoothedEmotion = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

      setEmotion(smoothedEmotion);
      setConfidence(nextConfidence);
      setStatus("Detection running");
      setEmotion(data.emotion || "unknown");
      setConfidence(Number(data.confidence || 0));
      setStatus("Detection running");
    } catch (err) {
      setError(err?.message || "Failed to detect emotion");
      setStatus("Backend error");
    } finally {
      inFlightRef.current = false;
    }
    };

  const startDetectionLoop = () => {
    intervalRef.current = setInterval(captureAndSendFrame, 1000);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    captureAndSendFrame();
    intervalRef.current = setInterval(captureAndSendFrame, 1500);
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
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.wrapper}>
        <div style={styles.hero}>
          <div>
            <div style={styles.badge}>Frontend + Python Backend</div>
            <h1 style={styles.title}>Real-Time Face Expression Detector</h1>
            <p style={styles.subtitle}>
              Webcam video runs in the browser, while emotion prediction is handled
              by the Python FER backend.
            </p>
          </div>

          <div style={styles.buttonRow}>
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

        <div style={styles.grid}>
          <div style={styles.videoCard}>
            <div style={styles.cardHeader}>
              <span>Live Camera Feed</span>
              <span style={styles.statusPill}>{status}</span>
            </div>

            <div style={styles.videoShell}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={styles.mainVideo}
              />
            </div>

            <canvas ref={canvasRef} style={{ display: "none" }} />

            {error && <div style={styles.errorBox}>{error}</div>}
          </div>

          <div style={styles.sidePanel}>
            <div style={styles.infoCard}>
              <h2 style={styles.cardTitle}>Detected Emotion</h2>
              <div style={{ ...styles.emotionBox, color: getEmotionColor(emotion) }}>{emotion}</div>

              <div style={styles.confidenceRow}>
                <span>Confidence</span>
                <strong>{Math.round(confidence * 100)}%</strong>
              </div>

              <div style={styles.progressTrack}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: `${Math.round(confidence * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div style={styles.infoCard}>
              <h2 style={styles.cardTitle}>How it works</h2>
              <ul style={styles.noteList}>
                <li>Browser opens the webcam.</li>
                <li>A frame is captured every 1.5 seconds.</li>
                <li>The frame is sent to FastAPI backend.</li>
                <li>Python FER returns the top emotion.</li>
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
    background: "linear-gradient(180deg, #020617 0%, #0f172a 100%)",
    color: "#ffffff",
    fontFamily: "Inter, Arial, sans-serif",
    padding: "24px",
  },
  wrapper: {
    maxWidth: "1240px",
    margin: "0 auto",
  },
  hero: {
    display: "grid",
    gap: "20px",
    marginBottom: "24px",
    padding: "28px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: "28px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
  },
  badge: {
    display: "inline-block",
    padding: "8px 14px",
    borderRadius: "999px",
    background: "rgba(34,197,94,0.15)",
    color: "#86efac",
    fontSize: "13px",
    marginBottom: "14px",
  },
  title: {
    fontSize: "clamp(32px, 5vw, 58px)",
    margin: 0,
    lineHeight: 1.05,
  },
  subtitle: {
    color: "#cbd5e1",
    fontSize: "18px",
    lineHeight: 1.7,
    maxWidth: "760px",
    margin: "14px 0 0 0",
  },
  buttonRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
  },
  primaryButton: {
    padding: "14px 20px",
    borderRadius: "16px",
    border: "none",
    background: "#22c55e",
    color: "#052e16",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "14px 20px",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.04)",
    color: "#ffffff",
    fontWeight: 600,
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 2fr) minmax(320px, 1fr)",
    gap: "20px",
  },
  videoCard: {
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: "28px",
    padding: "18px",
  },
  sidePanel: {
    display: "grid",
    gap: "20px",
  },
  infoCard: {
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: "24px",
    padding: "20px",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "14px",
    color: "#e2e8f0",
    fontWeight: 600,
  },
  statusPill: {
    fontSize: "12px",
    color: "#7dd3fc",
    background: "rgba(56,189,248,0.15)",
    borderRadius: "999px",
    padding: "7px 12px",
  },
  videoShell: {
    position: "relative",
    width: "100%",
    aspectRatio: "4 / 3",
    borderRadius: "24px",
    overflow: "hidden",
    background: "#000",
    border: "1px solid rgba(34,197,94,0.2)",
  },
  mainVideo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    background: "#000",
  },
  errorBox: {
    marginTop: "14px",
    padding: "12px 14px",
    background: "rgba(239,68,68,0.12)",
    color: "#fecaca",
    borderRadius: "14px",
  },
  cardTitle: {
    marginTop: 0,
    marginBottom: "16px",
    fontSize: "22px",
  },
  emotionBox: {
    fontSize: "36px",
    fontWeight: 800,
    marginBottom: "16px",
    color: "#86efac",
    textTransform: "capitalize",
  },
  confidenceRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "10px",
    color: "#e2e8f0",
  },
  progressTrack: {
    width: "100%",
    height: "12px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: "999px",
    background: "linear-gradient(90deg, #22c55e 0%, #38bdf8 100%)",
  },
  noteList: {
    margin: 0,
    paddingLeft: "18px",
    color: "#cbd5e1",
    lineHeight: 1.8,
  },
};