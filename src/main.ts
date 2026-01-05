import './style.css'
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Peer } from 'peerjs';

// --- 1. UI構築 (これまでのボタン＋クレジット) ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; flex-direction: column; align-items: center; background: #f0f2f5; padding: 20px; overflow-y: auto;">
    <h1 style="color: #333; margin-bottom: 10px;">V-Meeting: Emoji & Hamster</h1>
    
    <div style="position: relative; width: 480px; height: 360px; background: #000; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3); flex-shrink: 0;">
      <canvas id="local-canvas" style="width: 100%; height: 100%; object-fit: cover;"></canvas>
      <video id="hidden-video" style="display:none;" autoplay playsinline muted></video>
      <canvas id="vrm-canvas" style="display:none;"></canvas>
    </div>

    <div class="card" style="margin-top: 20px; background: white; padding: 20px; border-radius: 16px; width: 440px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
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
          <b>Credits:</b><br>
          3D Model: "Gas mask and helmet" by Chenchanchong (CC BY 4.0)<br>
          BGM: 鉄道ビジネスカジュアルチャンネル (https://www.youtube.com/@heitetsu4649)
        </p>
      </div>
    </div>
    <div id="video-grid" style="display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; justify-content: center;"></div>
  </div>
`;

// --- 2. 状態管理 ---
let isAvatarMode = true;
let isCamOn = true;
let isMicOn = true;
let currentVrm: VRM | null = null;
let lastEmojiTime = 0;
let localStream: MediaStream;

// --- 3. 3Dシーン設定 ---
const canvas = document.querySelector('#local-canvas') as HTMLCanvasElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 480 / 360, 0.1, 20.0);
camera.position.set(0, 1.4, 1.5);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(480, 360);
scene.add(new THREE.DirectionalLight(0xffffff, Math.PI), new THREE.AmbientLight(0xffffff, 0.5));

// --- 4. 絵文字システム ---
const emojis: THREE.Sprite[] = [];
function spawnEmoji(type: string) {
  const texture = new THREE.TextureLoader().load(`https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${type}.png`);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.position.set((Math.random() - 0.5) * 0.3, 1.6, 0.5);
  sprite.scale.set(0.15, 0.15, 0.15);
  scene.add(sprite);
  emojis.push(sprite);
  setTimeout(() => {
    scene.remove(sprite);
    const idx = emojis.indexOf(sprite);
    if (idx > -1) emojis.splice(idx, 1);
  }, 2000);
}

// --- 5. モデル読み込み (VRM/GLB対応) ---
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));
const baseUrl = import.meta.env.BASE_URL || '/';
const modelPath = `${baseUrl}gas_mask_and_helmet.glb`.replace(/\/+/g, '/');

loader.load(modelPath, (gltf) => {
  currentVrm = gltf.userData.vrm || null;
  const modelScene = currentVrm ? currentVrm.scene : gltf.scene;
  scene.add(modelScene);
  modelScene.rotation.y = Math.PI;
}, undefined, (e) => console.error("Load Error:", e));

// --- 6. フェイストラッキング & 表情解析 ---
const video = document.querySelector('#hidden-video') as HTMLVideoElement;
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (currentVrm) currentVrm.scene.visible = (isAvatarMode && isCamOn);

  if (isCamOn && isAvatarMode && res.multiFaceLandmarks?.[0]) {
    const s = res.multiFaceLandmarks[0];
    
    // 笑い判定: 口角(61, 291)の距離
    const mouthW = Math.hypot(s[61].x - s[291].x, s[61].y - s[291].y);
    if (mouthW > 0.085 && Date.now() - lastEmojiTime > 500) {
      spawnEmoji('1f604'); // 😄
      lastEmojiTime = Date.now();
    }

    // アバターの首振り
    const headNode = currentVrm?.humanoid?.getRawBoneNode('head') || scene.children.find(c => c.type === "Group");
    if (headNode) {
      headNode.rotation.y = (s[234].x - s[454].x) * 0.5;
      headNode.rotation.x = (s[10].y - s[152].y) * 0.5;
    }
    if (currentVrm) currentVrm.update(1/30);
  }

  // 絵文字アニメーション
  emojis.forEach(e => { e.position.y += 0.01; e.material.opacity -= 0.01; });
  renderer.render(scene, camera);
});

// --- 7. 通信 (PeerJS) ---
const peer = new Peer();
const processedStream = canvas.captureStream(30);
peer.on('open', (id) => (document.querySelector('#status') as HTMLElement).innerText = `ID: ${id}`);

peer.on('call', (call) => {
  call.answer(processedStream);
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

// --- 8. メイン開始 ---
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localStream = stream;
  video.srcObject = stream;
  stream.getAudioTracks().forEach(t => processedStream.addTrack(t));
  video.onloadedmetadata = () => {
    video.play();
    const loop = async () => { if (isCamOn) await faceMesh.send({ image: video }); requestAnimationFrame(loop); };
    loop();
  };
});

// --- 9. ボタン操作 ---
document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!.style.background = isAvatarMode ? "#646cff" : "#555";
});

document.querySelector('#mic-btn')?.addEventListener('click', () => {
  isMicOn = !isMicOn;
  localStream.getAudioTracks().forEach(t => t.enabled = isMicOn);
  document.querySelector<HTMLButtonElement>('#mic-btn')!.style.background = isMicOn ? "#4CAF50" : "#f44336";
});

document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const id = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value.trim();
  if (id) {
    const call = peer.call(id, processedStream);
    call.on('stream', (s) => addRemoteVideo(s, id));
  }
});