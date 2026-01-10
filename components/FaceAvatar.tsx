"use client";
import React, { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export default function FaceAvatar() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // アバター画像の設定（好きな画像URLに差し替え可能）
  const avatarImg = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    avatarImg.current = new Image();
    avatarImg.current.src = "https://fonts.gstatic.com/s/i/googlematerialicons/face/v12/24px.svg"; // 仮のアバター
    
    setupFaceMesh();
  }, []);

  const setupFaceMesh = async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: "GPU"
      },
      outputFaceBlendshapes: true,
      runningMode: "VIDEO",
      numFaces: 1
    });

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener("loadeddata", () => {
          setIsLoaded(true);
          predict(faceLandmarker);
        });
      }
    }
  };

  const predict = (faceLandmarker: FaceLandmarker) => {
    if (!videoRef.current || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const results = faceLandmarker.detectForVideo(videoRef.current, performance.now());

    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      const landmarks = results.faceLandmarks[0];
      
      // おでこの中心付近（点10）を基準にアバターを描画
      const x = landmarks[10].x * canvasRef.current.width;
      const y = landmarks[10].y * canvasRef.current.height;
      
      // 顔のサイズを計算（顎からおでこの距離）
      const faceSize = Math.abs(landmarks[152].y - landmarks[10].y) * canvasRef.current.height * 1.5;

      if (avatarImg.current) {
        ctx.drawImage(
          avatarImg.current,
          x - faceSize / 2, 
          y - faceSize / 3, 
          faceSize, 
          faceSize
        );
      }
    }

    requestAnimationFrame(() => predict(faceLandmarker));
  };

  return (
    <div className="relative flex flex-col items-center">
      <h2 className="text-xl font-bold mb-4">Next.js AI アバター</h2>
      <div className="relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="rounded-lg w-[640px] h-[480px] bg-black"
        />
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="absolute top-0 left-0 w-full h-full"
        />
      </div>
      {!isLoaded && <p className="mt-2 text-blue-500">AI起動中...</p>}
    </div>
  );
}