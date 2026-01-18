"use client";
import React, { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as THREE from 'three';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import VRMFaceSync from '../src/vrm-face-sync';

export default function FaceAvatar() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showCamera, setShowCamera] = useState(true);
  
  const sceneRef = useRef<THREE.Scene | null>(null);
  const vrmRef = useRef<any>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const frmSyncRef = useRef<VRMFaceSync | null>(null);

  // VRMアバターと顔認識の表情マッピング
  const expressionMap: { [key: string]: string } = {
    'mouthSmileLeft': 'smile',
    'mouthSmileRight': 'smile',
    'eyeWideLeft': 'surprised',
    'eyeWideRight': 'surprised',
    'eyeSquintLeft': 'sadness',
    'eyeSquintRight': 'sadness',
    'mouthFunnel': 'surprised'
  };

  useEffect(() => {
    setupVRMScene();
    setupFaceLandmarker();
  }, []);

  const setupVRMScene = async () => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    // GLTFLoaderを動的インポート
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 1);
    containerRef.current.appendChild(renderer.domElement);

    camera.position.set(0, 1, 2);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    sceneRef.current = scene;

    // VRMモデルのロード（VRoid作成のVRMファイルを指定）
    try {
      const loader = new GLTFLoader();
      loader.register((ext: any) => new VRMLoaderPlugin(ext));
      
      // ここにVRoidで作成したVRMファイルのURLを指定
      const model = await loader.loadAsync('/vroid-avatar.vrm');
      vrmRef.current = model.userData.vrm;
      frmSyncRef.current = new VRMFaceSync(vrmRef.current);
      frmSyncRef.current.setSmoothingFactor(0.7); // スムージング設定
      scene.add(model.scene);
    } catch (e) {
      console.log('VRMファイルが見つかりません。URLを確認してください。', e);
    }

    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();
  };

  const setupFaceLandmarker = async () => {
    try {
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

      faceLandmarkerRef.current = faceLandmarker;

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener("loadeddata", () => {
            setIsLoaded(true);
            detect();
          });
        }
      }
    } catch (e) {
      console.error('顔認識セットアップエラー:', e);
    }
  };

  const detect = () => {
    if (!videoRef.current || !faceLandmarkerRef.current || !canvasRef.current) return;

    const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, performance.now());

    const ctx = canvasRef.current.getContext("2d");
    if (ctx && showCamera) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    }

    // VRMの表情を顔の表現に基づいて更新
    if (frmSyncRef.current && results.faceBlendshapes && results.faceBlendshapes.length > 0) {
      frmSyncRef.current.applyBlendshapes(results.faceBlendshapes[0] as any);
    }

    requestAnimationFrame(detect);
  };

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full"></div>
      
      {/* カメラ入力（非表示、顔認識用） */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
      />

      {/* 顔認識可視化キャンバス（デバッグ用） */}
      <canvas
        ref={canvasRef}
        width={320}
        height={240}
        style={{
          display: showCamera ? 'block' : 'none',
          position: 'absolute',
          bottom: 10,
          right: 10,
          border: '2px solid #4facfe',
          borderRadius: '8px',
          zIndex: 10
        }}
      />

      {/* コントロールボタン */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        display: 'flex',
        gap: '10px',
        zIndex: 20
      }}>
        <button
          onClick={() => setShowCamera(!showCamera)}
          style={{
            background: showCamera ? '#4facfe' : '#333',
            color: 'white',
            border: 'none',
            padding: '10px 15px',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          {showCamera ? 'カメラ隠す' : 'カメラ表示'}
        </button>
      </div>

      {!isLoaded && <p style={{ position: 'absolute', top: '50%', left: '50%', color: '#4facfe' }}>アバター読み込み中...</p>}
    </div>
  );
}