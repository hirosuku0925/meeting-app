import './style.css'
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Peer } from 'peerjs'

// --- 1. UI構築 (クレジットとボタン設定) ---
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
    <div id="video-grid" style="display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; justify-content: center;"></div>
  </div>
`

// --- 2. 3D 設定 ---
const vrmCanvas = document.querySelector<HTMLCanvasElement>('#vrm-canvas')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 480 / 360, 0.1, 1000);
camera.position.set(0, 0.5, 4); 

const renderer = new THREE.WebGLRenderer({ canvas: vrmCanvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0); 
renderer.setSize(480, 360);

const light = new THREE.DirectionalLight(0xffffff, 2.0);
light.position.set(1, 1, 2).normalize();
scene.add(light, new THREE.AmbientLight(0xffffff, 1.0));

let currentModel: THREE.Group | null = null;
let isAvatarMode = true;
let localStream: MediaStream;

const loader = new GLTFLoader();

// GitHub Pagesのパス問題を解決するベースパス
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
  document.getElementById('model-status')!.innerText = "読み込みエラー";
});

// --- 3. 映像合成ロジック ---
const finalCanvas = document.querySelector<HTMLCanvasElement>('#final-canvas')!;
const finalCtx = finalCanvas.getContext('2d')!;
finalCanvas.width = 480; finalCanvas.height = 360;

function compose() {
  finalCtx.clearRect(0, 0, 480, 360);
  finalCtx.drawImage(video, 0, 0, 480, 360);
  if (currentModel && isAvatarMode) {
    currentModel.rotation.y += 0.005;
    renderer.render(scene, camera);
    finalCtx.drawImage(vrmCanvas, 0, 0, 480, 360);
  }
  requestAnimationFrame(compose);
}
compose();

// --- 4. 通信設定 (PeerJS) ---
const peer = new Peer();
const processedStream = finalCanvas.captureStream(30);

peer.on('open', (id) => document.getElementById('status')!.innerText = `あなたのID: ${id}`);

peer.on('call', (call) => {
  call.answer(processedStream);
  call.on('stream', (remoteStream) => addRemoteVideo(remoteStream, call.peer));
});

function connectTo(id: string) {
  const call = peer.call(id, processedStream);
  call.on('stream', (remoteStream) => addRemoteVideo(remoteStream, id));
}

function addRemoteVideo(stream: MediaStream, remoteId: string) {
  if (document.getElementById(`remote-${remoteId}`)) return;
  const v = document.createElement('video');
  v.id = `remote-${remoteId}`;
  v.style.width = "200px"; v.style.borderRadius = "10px"; v.autoplay = true; v.playsInline = true;
  v.srcObject = stream;
  document.getElementById('video-grid')!.appendChild(v);
}

// --- 5. メインループ開始 ---
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localStream = stream;
  video.srcObject = stream;
  video.play();
  // マイク音声を配信ストリームに追加
  stream.getAudioTracks().forEach(track => processedStream.addTrack(track));
});

// --- 6. イベント設定 ---
document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  const btn = document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!;
  btn.style.background = isAvatarMode ? "#646cff" : "#555";
});

document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const id = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value.trim();
  if (id) connectTo(id);
});

document.querySelector('#mic-btn')?.addEventListener('click', () => {
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  document.querySelector<HTMLButtonElement>('#mic-btn')!.style.background = track.enabled ? "#4CAF50" : "#f44336";
});

document.querySelector('#cam-btn')?.addEventListener('click', () => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  document.querySelector<HTMLButtonElement>('#cam-btn')!.style.background = track.enabled ? "#4CAF50" : "#f44336";
});