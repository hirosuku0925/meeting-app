import './style.css'
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm';
import { FaceMesh } from '@mediapipe/face_mesh';

// --- 設定 ---
const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 360;

// --- 3Dシーンのセットアップ ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, CANVAS_WIDTH / CANVAS_HEIGHT, 0.1, 20.0);
camera.position.set(0, 1.4, 1.5); // 顔の正面にカメラを配置

// 💡 確実に要素を取得するために ! を使用
const canvas = document.querySelector('#local-canvas') as HTMLCanvasElement;
if (!canvas) throw new Error('Canvas element not found');

const renderer = new THREE.WebGLRenderer({ 
  canvas: canvas, 
  alpha: true, 
  antialias: true 
});
renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT);
renderer.setPixelRatio(window.devicePixelRatio);

// ライトの設定
const light = new THREE.DirectionalLight(0xffffff, Math.PI);
light.position.set(1, 1, 1).normalize();
scene.add(light);

// --- VRMモデルの読み込み ---
let currentVrm: VRM | null = null;
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

// publicフォルダに「キツネの顔.vrm」を置いている前提
loader.load(
  '/キツネの顔.vrm', 
  (gltf) => {
    const vrm = gltf.userData.vrm as VRM;
    currentVrm = vrm;
    scene.add(vrm.scene);
    vrm.scene.rotation.y = Math.PI; // ユーザーに向き合わせる
    console.log('VRM model loaded');
  },
  (progress) => console.log('Loading VRM...', (progress.loaded / progress.total * 100), '%'),
  (error) => console.error('VRM load error:', error)
);

// --- MediaPipe FaceMesh 設定 ---
const video = document.querySelector('#hidden-video') as HTMLVideoElement;
if (!video) throw new Error('Video element not found');

const faceMesh = new FaceMesh({ 
  locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` 
});
faceMesh.setOptions({ 
  maxNumFaces: 1, 
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

// AI解析結果をVRMに反映
faceMesh.onResults((res) => {
  if (currentVrm && res.multiFaceLandmarks?.[0]) {
    const s = res.multiFaceLandmarks[0];

    // 1. 首の回転連動 (Head Rotation)
    const head = currentVrm.humanoid.getRawBoneNode('head');
    if (head) {
      // 左右 (Yaw), 上下 (Pitch), 傾き (Roll) を計算
      head.rotation.y = (s[234].x - s[454].x) * 0.5;
      head.rotation.x = (s[10].y - s[152].y) * 0.5;
      head.rotation.z = Math.atan2(s[263].y - s[33].y, s[263].x - s[33].x);
    }

    // 2. まばたき連動 (Blink)
    if (currentVrm.expressionManager) {
      const eyeScore = Math.abs(s[159].y - s[145].y);
      const blink = eyeScore < 0.012 ? 1.0 : 0.0;
      currentVrm.expressionManager.setValue('blink', blink);
    }

    // 3. 口パク連動 (Mouth - "aa")
    if (currentVrm.expressionManager) {
      const mouthScore = Math.abs(s[13].y - s[14].y);
      // 距離に応じて口の開き具合を0.0〜1.0で調整
      currentVrm.expressionManager.setValue('aa', Math.min(mouthScore * 12, 1.0));
    }

    // モデルの内部状態を更新
    currentVrm.update(1/30);
  }
  // 3Dレンダリング
  renderer.render(scene, camera);
});

// --- カメラ起動 & ループ開始 ---
const startCamera = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } 
    });
    video.srcObject = stream;
    
    video.onloadedmetadata = () => {
      video.play();
      const loop = async () => {
        // ビデオが有効な時だけAIに送る
        if (video.readyState >= 2) {
          await faceMesh.send({ image: video });
        }
        requestAnimationFrame(loop);
      };
      loop();
    };
  } catch (err) {
    console.error("Camera error:", err);
    alert("カメラの起動に失敗しました。カメラの使用を許可してください。");
  }
};

startCamera();