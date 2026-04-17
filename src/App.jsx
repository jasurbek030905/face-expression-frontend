// FIXED VERSION (responsive without window.innerWidth)
import React, { useEffect, useRef, useState } from "react";

const API_URL = "https://face-expression-backend-2.onrender.com/detect-emotion";

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const inFlightRef = useRef(false);

  const [isRunning, setIsRunning] = useState(false);
  const [emotion, setEmotion] = useState("waiting");
  const [confidence, setConfidence] = useState(0);

  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoRef.current.srcObject = stream;
    await videoRef.current.play();
    setIsRunning(true);
    startLoop();
  };

  const stopCamera = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const tracks = videoRef.current?.srcObject?.getTracks() || [];
    tracks.forEach(t => t.stop());
    setIsRunning(false);
  };

  const capture = async () => {
    if (inFlightRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    inFlightRef.current = true;

    const ctx = canvas.getContext("2d");
    canvas.width = 320;
    canvas.height = 240;
    ctx.drawImage(video, 0, 0, 320, 240);

    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg"));

    const form = new FormData();
    form.append("file", blob, "frame.jpg");

    try {
      const res = await fetch(API_URL, { method: "POST", body: form });
      const data = await res.json();
      setEmotion(data.emotion);
      setConfidence(data.confidence);
    } catch {}

    inFlightRef.current = false;
  };

  const startLoop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(capture, 1000);
  };

  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      body { margin:0; background:#020617; font-family:Arial; color:white }

      .container {
        max-width:1200px;
        margin:auto;
        padding:20px;
      }

      .grid {
        display:grid;
        grid-template-columns:1.5fr 1fr;
        gap:20px;
      }

      @media(max-width:900px){
        .grid{ grid-template-columns:1fr }
      }

      .card {
        background:#111827;
        padding:16px;
        border-radius:16px;
      }

      video {
        width:100%;
        border-radius:16px;
      }

      button {
        padding:12px;
        border:none;
        border-radius:10px;
        margin:5px;
        cursor:pointer;
      }

      .primary{ background:#22c55e; }
      .secondary{ background:#334155; color:white }
    `;

    document.head.appendChild(style);
  }, []);

  return (
    <div className="container">
      <h1>Emotion Detector</h1>

      <div>
        <button className="primary" onClick={startCamera} disabled={isRunning}>Start</button>
        <button className="secondary" onClick={stopCamera}>Stop</button>
      </div>

      <div className="grid">
        <div className="card">
          <video ref={videoRef} autoPlay muted />
          <canvas ref={canvasRef} style={{display:"none"}} />
        </div>

        <div className="card">
          <h2>{emotion}</h2>
          <p>{Math.round(confidence * 100)}%</p>
        </div>
      </div>
    </div>
  );
}
