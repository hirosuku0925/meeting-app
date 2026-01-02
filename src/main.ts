import './style.css'
import { Peer } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

// --- デザイン復元版 ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; overflow: hidden; background: #f0f2f5;">
    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333; margin-bottom: 20px;">マルチ会議室 (自動開始版)</h1>
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; padding: 10px; width: 100%;">
        <div id="local-container" style="text-align: center;">
          <p style="font-size: 12px; color: #666; margin-bottom: 5px;">自分 (3Dアバター)</p>
          <canvas id="local-canvas" width="480" height="360" style="width: 280px; border: 3px solid #646cff; border-radius: 15px; background: #222; box-shadow: 0 8px 16px rgba(0,0,0,0.2);"></canvas>
        </div>
      </div>
      <div class="card" style="width: 100%; max-width: 550px; margin-top: 20px; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
        <div style="background: #f8f9fa; padding: 15px; border-radius: 12px; margin-bottom: 15px;">
          <label style="font-size: 11px; font-weight: bold; color: #646cff;">👤 アバター切替</label>
          <input type="file" id="vrm-upload" accept=".vrm" style="width: 100%; font-size: 10px; margin-top: 5px;">
        </div>
        <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 15px;">
          <button id="hangup-btn" style="background-color: #f44336; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">再読み込み</button>
        </div>
        <p id="status" style="font-size: 11px; color: #1976D2; font-weight: bold; text-align:center;">準備中...</p>
      </div>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 480 / 360, 0.1, 20);
camera.position.set(0, 1.45, 0.8);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(480, 360);
scene.add(new THREE.DirectionalLight(0xffffff, 1.0));
scene.add(new THREE.AmbientLight(0xffffff, 0.7));

let currentVrm: any = null;
const loader = new GLTFLoader();
loader.register((parser: any) => new VRMLoaderPlugin(parser));

// --- 最初からきつねを読み込む ---
loader.load('/fox_face.vrm', (gltf: any) => {
  currentVrm = gltf.userData.vrm;
  scene.add(currentVrm.scene);
  currentVrm.scene.rotation.y = Math.PI;
  statusEl.innerText = "アバター準備完了！";
});

const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (currentVrm && res.multiFaceLandmarks?.[0]) {
    const landmarks = res.multiFaceLandmarks[0];
    const head = currentVrm.humanoid.getRawBoneNode('head');
    if (head) {
      head.rotation.set((landmarks[1].y - 0.5) * 1.5, (landmarks[1].x - 0.5) * -1.5, 0, 'XYZ');
    }
  }
  renderer.render(scene, camera);
});

// --- 【ここがポイント】ページを開いたら自動でカメラ開始 ---
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.play();
    const loop = async () => {
      await faceMesh.send({ image: video });
      requestAnimationFrame(loop);
    };
    loop();
  } catch (err) {
    statusEl.innerText = "カメラを許可してください";
  }
}

// 実行！
startCamera();

const peer = new Peer();
peer.on('open', (id) => { console.log("My ID:", id); });
document.querySelector('#hangup-btn')?.addEventListener('click', () => window.location.reload());