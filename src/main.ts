import './style.css'
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Peer } from 'peerjs';

// --- 1. UI構築 ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; flex-direction: column; align-items: center; background: #f0f2f5; padding: 20px; overflow-y: auto;">
    <h1 style="color: #333; margin-bottom: 10px;">V-Meeting: Emoji Mask</h1>
    <div style="position: relative; width: 480px; height: 360px; background: #000; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3); flex-shrink: 0;">
      <canvas id="local-canvas" style="width: 100%; height: 100%; object-fit: cover;"></canvas>
      <video id="hidden-video" style="display:none;" autoplay playsinline muted></video>
    </div>
    <div class="card" style="margin-top: 20px; background: white; padding: 20px; border-radius: 16px; width: 440px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
      <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
        <button id="mic-btn" style="background: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer;">🎤 ON</button>
        <button id="cam-btn" style="background: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer;">📷 ON</button>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 15px;">
        <input id="remote-id-input" placeholder="相手のIDを入力" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
        <button id="connect-btn" style="flex: 1; background: #646cff; color: white; border: none; border-radius: 5px; cursor: pointer;">入室</button>
      </div>
      <p id="status" style="font-size: 11px; color: #1976D2; font-weight: bold; text-align:center; margin-top: 10px;">ID取得中...</p>
    </div>
    <div id="video-grid" style="display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; justify-content: center;"></div>
  </div>
`;

// --- 2. 3D設定 & 絵文字マスク ---
const canvas = document.querySelector('#local-canvas') as HTMLCanvasElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 480 / 360, 0.1, 20.0);
camera.position.set(0, 1.4, 1.5);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(480, 360);
scene.add(new THREE.AmbientLight(0xffffff, 1.0));

const emojiTexture = new THREE.TextureLoader().load('https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f604.png');
const emojiMaterial = new THREE.SpriteMaterial({ map: emojiTexture, transparent: true, opacity: 0 });
const emojiMask = new THREE.Sprite(emojiMaterial);
emojiMask.scale.set(0.3, 0.3, 0.3);
scene.add(emojiMask);

// --- 3. モデル読み込み ---
let currentModel: THREE.Object3D | null = null;
const loader = new GLTFLoader();
const baseUrl = import.meta.env.BASE_URL || '/';
loader.load(`${baseUrl}gas_mask_and_helmet.glb`, (gltf) => {
  currentModel = gltf.scene;
  scene.add(currentModel);
  currentModel.rotation.y = Math.PI;
});

// --- 4. 顔トラッキング ---
const video = document.querySelector('#hidden-video') as HTMLVideoElement;
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (res.multiFaceLandmarks?.[0]) {
    const s = res.multiFaceLandmarks[0];
    if (currentModel) {
      currentModel.position.set((0.5 - s[1].x) * 1.5, (0.5 - s[1].y) * 1.2, 0);
      currentModel.rotation.y = (s[234].x - s[454].x) * 0.5 + Math.PI;
      currentModel.rotation.x = (s[10].y - s[152].y) * 0.5;
    }
    emojiMask.position.set(currentModel?.position.x || 0, (currentModel?.position.y || 1.4) + 0.1, 0.6);
    const mouthW = Math.hypot(s[61].x - s[291].x, s[61].y - s[291].y);
    emojiMaterial.opacity = mouthW > 0.085 ? 1.0 : 0.0;
  }
  renderer.render(scene, camera);
});

// --- 5. 通信 (PeerJS) エラー修正箇所 ---
const peer = new Peer();
const processedStream = canvas.captureStream(30); // 💡 これが「未使用」だった変数

peer.on('open', (id) => (document.querySelector('#status') as HTMLElement).innerText = `ID: ${id}`);

// 相手から電話が来た時
peer.on('call', (call) => {
  call.answer(processedStream); // 💡 ここで使うことで警告が消えます
  call.on('stream', (s) => addRemoteVideo(s, call.peer));
});

function addRemoteVideo(stream: MediaStream, remoteId: string) {
  if (document.getElementById(`remote-${remoteId}`)) return;
  const v = document.createElement('video');
  v.id = `remote-${remoteId}`;
  v.style.width = "200px"; v.style.borderRadius = "10px"; v.autoplay = true; v.playsInline = true;
  v.srcObject = stream;
  document.getElementById('video-grid')!.appendChild(v);
}

// 自分から電話をかける時
document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const id = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value.trim();
  if (id) {
    const call = peer.call(id, processedStream); // 💡 ここでも使う
    call.on('stream', (s) => addRemoteVideo(s, id));
  }
});

// カメラ開始
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  video.srcObject = stream;
  // 音声トラックを加工ストリームに合流させる
  stream.getAudioTracks().forEach(track => processedStream.addTrack(track));
  
  video.onloadedmetadata = () => {
    video.play();
    const loop = async () => { await faceMesh.send({ image: video }); requestAnimationFrame(loop); };
    loop();
  };
});