import React, { useEffect, useRef, useState } from "react";

const API_URL = "https://face-expression-backend-2.onrender.com/detect-emotion";

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const inFlightRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [emotion, setEmotion] = useState("waiting");
  const [confidence, setConfidence] = useState(0);

  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoRef.current.srcObject = stream;
    await videoRef.current.play();
    setRunning(true);
    loop();
  };

  const stopCamera = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    videoRef.current?.srcObject?.getTracks().forEach((t) => t.stop());
    setRunning(false);
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

    const blob = await new Promise((res) =>
      canvas.toBlob(res, "image/jpeg")
    );

    const form = new FormData();
    form.append("file", blob, "frame.jpg");

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      setEmotion(data.emotion);
      setConfidence(data.confidence);
    } catch {}

    inFlightRef.current = false;
  };

  const loop = () => {
    intervalRef.current = setInterval(capture, 1000);
  };

  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      body {
        margin:0;
        font-family: system-ui;
        background: linear-gradient(135deg, #020617, #0f172a);
        color:white;
      }

      .app {
        min-height:100vh;
        display:flex;
        flex-direction:column;
        padding:20px;
        gap:20px;
      }

      .header {
        display:flex;
        justify-content:space-between;
        flex-wrap:wrap;
        gap:10px;
      }

      .title {
        font-size:40px;
        font-weight:800;
      }

      .controls {
        display:flex;
        gap:10px;
        flex-wrap:wrap;
      }

      button {
        padding:12px 18px;
        border-radius:12px;
        border:none;
        cursor:pointer;
        font-weight:600;
      }

      .start { background:#22c55e; }
      .stop { background:#ef4444; color:white; }

      .main {
        display:grid;
        grid-template-columns:2fr 1fr;
        gap:20px;
        flex:1;
      }

      .card {
        background:rgba(255,255,255,0.05);
        border-radius:20px;
        padding:16px;
        backdrop-filter: blur(10px);
      }

      video {
        width:100%;
        border-radius:16px;
      }

      .emotion-box {
        font-size:48px;
        font-weight:800;
        text-transform:capitalize;
      }

      .progress {
        height:10px;
        background:#1e293b;
        border-radius:10px;
        margin-top:10px;
      }

      .bar {
        height:100%;
        background:#22c55e;
        border-radius:10px;
      }

      @media(max-width:900px){
        .main{
          grid-template-columns:1fr;
        }
        .title{
          font-size:28px;
        }
      }
    `;
    document.head.appendChild(style);
  }, []);

  return (
    <div className="app">
      <div className="header">
        <div className="title">Emotion Detector</div>

        <div className="controls">
          <button className="start" onClick={startCamera} disabled={running}>
            Start
          </button>
          <button className="stop" onClick={stopCamera}>
            Stop
          </button>
        </div>
      </div>

      <div className="main">
        <div className="card">
          <video ref={videoRef} autoPlay muted />
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>

        <div className="card">
          <div className="emotion-box">{emotion}</div>
          <div>{Math.round(confidence * 100)}%</div>

          <div className="progress">
            <div
              className="bar"
              style={{ width: `${confidence * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}