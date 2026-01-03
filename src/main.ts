import './style.css'
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Peer } from 'peerjs'

// --- 1. UI構築 (クレジット更新) ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; flex-direction: column; align-items: center; background: #f0f2f5; padding: 20px; font-family: sans-serif; overflow-y: auto;">
    <h1 style="margin-bottom: 10px; color: #333;">V-Meeting: Gas Mask Edition</h1>
    
    <div style="position: relative; width: 480px; height: 360px; background: #000; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3); flex-shrink: 0;">
      <canvas id="final-canvas" style="width: 100%; height: 100%; object-fit: cover;"></canvas>
      <video id="hidden-video" style="display:none;" autoplay playsinline muted></video>
      <canvas id="vrm-canvas" style="display:none;"></canvas>
    </div>

    <div class="card" style="margin-top: 20px; background: white; padding: 20px; border-radius: 16px; width: 440px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
      <div style="background: #f8f9fa; padding: 12px; border-radius: 10px; margin-bottom: 15px;">
        <label style="font-size: 11px; font-weight: bold; color: #1976D2;">🏞 背景・モデル設定</label>
        <input type="file" id="bg-upload" accept="image/*" style="width: 100%; font-size: 11px; margin-top: 5px;">
        <p id="model-status" style="font-size: 10px; color: #666; margin-top: 5px;">モデル読み込み中...</p>
      </div>

      <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 15px;">
        <button id="mic-btn" style="background: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer;">🎤 ON</button>
        <button id="cam-btn" style="background: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer;">📷 ON</button>
        <button id="avatar-mode-btn" style="background: #646cff; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer;">👤 アバター: ON</button>
      </div>

      <div style="display: flex; gap: 8px; margin-bottom: 10px;">
        <input id="remote-id-input" placeholder="相手のIDを入力" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
        <button id="connect-btn" style="flex: 1; background: #646cff; color: white; border: none; border-radius: 5px; cursor: pointer;">入室</button>
      </div>
      <p id="status" style="font-size: 11px; color: #1976D2; font-weight: bold; text-align:center;">ID取得中...</p>

      <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee; text-align: center;">
        <p style="font-size: 8px; color: #999; line-height: 1.6;">
          <b>Credit:</b> "Gas mask and helmet" by <a href="https://sketchfab.com/Chenchanchong" target="_blank" style="color: #1976D2;">Chenchanchong</a><br>
          Licensed under <a href="http://creativecommons.org/licenses/by/4.0/" target="_blank" style="color: #1976D2;">CC BY 4.0</a>
        </p>
      </div>
    </div>
  </div>
`

// --- 2. 3D 設定 ---
const vrmCanvas = document.querySelector<HTMLCanvasElement>('#vrm-canvas')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 480 / 360, 0.1, 1000);
camera.position.set(0, 0.5, 4); // ヘルメットモデルに合わせて位置を調整

const renderer = new THREE.WebGLRenderer({ canvas: vrmCanvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0); 
renderer.setSize(480, 360);

const light = new THREE.DirectionalLight(0xffffff, 2.0);
light.position.set(1, 1, 2).normalize();
scene.add(light, new THREE.AmbientLight(0xffffff, 1.0));

let currentModel: THREE.Group | null = null;
let isAvatarMode = true;

const loader = new GLTFLoader();

// 💡 修正ポイント: GitHub Pagesのパスずれを回避するパス指定
const baseUrl = import.meta.env.BASE_URL || '/';
const modelPath = `${baseUrl}gas_mask_and_helmet.glb`.replace(/\/+/g, '/');

loader.load(modelPath, (gltf) => {
  currentModel = gltf.scene;
  currentModel.scale.set(1, 1, 1); 
  currentModel.position.set(0, 0, 0);
  scene.add(currentModel);
  document.getElementById('model-status')!.innerText = "モデル準備完了";
}, undefined, (e) => {
  console.error(e);
  document.getElementById('model-status')!.innerText = "読み込みエラー(パスを確認)";
});

// --- 3. 合成 & 通信 (基本ロジック) ---
const finalCanvas = document.querySelector<HTMLCanvasElement>('#final-canvas')!;
const finalCtx = finalCanvas.getContext('2d')!;
finalCanvas.width = 480; finalCanvas.height = 360;

function compose() {
  finalCtx.clearRect(0, 0, 480, 360);
  finalCtx.drawImage(video, 0, 0, 480, 360);
  if (currentModel && isAvatarMode) {
    currentModel.rotation.y += 0.005; // くるくる回す演出
    renderer.render(scene, camera);
    finalCtx.drawImage(vrmCanvas, 0, 0, 480, 360);
  }
  requestAnimationFrame(compose);
}
compose();

const peer = new Peer();
peer.on('open', (id) => document.getElementById('status')!.innerText = `あなたのID: ${id}`);

navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  video.srcObject = stream;
  video.play();
});

document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
});