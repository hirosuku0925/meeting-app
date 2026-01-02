import './style.css'
import { FaceMesh } from '@mediapipe/face_mesh'
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

// --- 画面の見た目（ボタンを復活させました） ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; overflow: hidden; background: #f0f2f5;">
    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333; margin-bottom: 20px;">きつね顔アバター会議</h1>
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; width: 100%;">
        <canvas id="local-canvas" width="480" height="360" style="width: 280px; border: 3px solid #646cff; border-radius: 15px; background: #222; box-shadow: 0 8px 16px rgba(0,0,0,0.2);"></canvas>
      </div>
      <div style="margin-top: 20px; display: flex; gap: 10px;">
        <button id="cam-btn" style="background-color: #4CAF50; color: white; padding: 10px 20px; border-radius: 8px; border:none; cursor: pointer;">📷 カメラ開始</button>
        <button id="hangup-btn" style="background-color: #f44336; color: white; padding: 10px 20px; border-radius: 8px; border:none; cursor: pointer;">退出</button>
      </div>
      <p id="status" style="margin-top:10px; font-size: 12px; color: #646cff;">モデル読み込み中...</p>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;

// --- 3D Scene 設定 ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 480 / 360, 0.1, 20);
camera.position.set(0, 1.45, 0.8); // 顔の高さに調整

// ライトを追加（これがないとモデルが真っ暗になります）
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1, 1, 1).normalize();
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.5));

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(480, 360);
renderer.setPixelRatio(window.devicePixelRatio);

let currentVrm: any = null;
const loader = new GLTFLoader();
loader.register((parser: any) => new VRMLoaderPlugin(parser));

// public/fox_face.vrm を読み込む
loader.load(
  '/fox_face.vrm',
  (gltf: any) => {
    const vrm = gltf.userData.vrm;
    scene.add(vrm.scene);
    currentVrm = vrm;
    vrm.scene.rotation.y = Math.PI; // 正面を向ける
    statusEl.innerText = "モデル準備完了！カメラを許可してください";
  },
  undefined,
  (error) => {
    console.error(error);
    statusEl.innerText = "モデルの読み込みに失敗しました";
  }
);

// --- AI追跡設定 ---
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (currentVrm && res.multiFaceLandmarks?.[0]) {
    const landmarks = res.multiFaceLandmarks[0];
    const head = currentVrm.humanoid.getRawBoneNode('head');
    if (head) {
      // 顔の向きを計算
      const yaw = (landmarks[1].x - 0.5) * -1.5; 
      const pitch = (landmarks[1].y - 0.5) * 1.5;
      head.rotation.set(pitch, yaw, 0, 'XYZ');
    }
  }
  renderer.render(scene, camera);
});

// --- カメラ起動 ---
document.querySelector('#cam-btn')?.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    statusEl.innerText = "カメラ起動中...";
    
    const loop = async () => {
      await faceMesh.send({ image: video });
      requestAnimationFrame(loop);
    };
    loop();
  } catch (err) {
    console.error(err);
    statusEl.innerText = "カメラの起動に失敗しました";
  }
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => window.location.reload());