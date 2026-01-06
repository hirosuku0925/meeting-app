import './style.css'
import * as THREE from 'three';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Peer } from 'peerjs';

// --- 1. UI構築 ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; flex-direction: column; align-items: center; background: #f0f2f5; padding: 20px;">
    <h1 style="color: #333;">V-Meeting: Emoji Mask</h1>
    <div style="position: relative; width: 480px; height: 360px; border-radius: 20px; overflow: hidden; background: #000;">
      <video id="local-video" style="width: 100%; height: 100%; object-fit: cover; position: absolute;" autoplay playsinline muted></video>
      <canvas id="emoji-canvas" style="width: 100%; height: 100%; position: absolute; pointer-events: none; z-index: 10;"></canvas>
    </div>
    <div class="card" style="margin-top: 20px; background: white; padding: 20px; border-radius: 16px; width: 440px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
      <div style="display: flex; gap: 8px; margin-bottom: 10px;">
        <input id="remote-id-input" placeholder="相手のIDを入力" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
        <button id="connect-btn" style="flex: 1; background: #646cff; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">入室（通話開始）</button>
      </div>
      <p id="status" style="font-size: 11px; color: #1976D2; font-weight: bold; text-align:center;">ID取得中...</p>
    </div>
    <div id="video-grid" style="display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap;"></div>
  </div>
`;

// --- 2. 設定 & 顔認識 ---
const canvas = document.querySelector('#emoji-canvas') as HTMLCanvasElement;
const video = document.querySelector('#local-video') as HTMLVideoElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 480 / 360, 0.1, 10);
camera.position.z = 2.5;
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(480, 360);

const emojiTexture = new THREE.TextureLoader().load('https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f604.png');
const emojiMaterial = new THREE.SpriteMaterial({ map: emojiTexture, transparent: true, opacity: 0 });
const emojiMask = new THREE.Sprite(emojiMaterial);
scene.add(emojiMask);

const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (res.multiFaceLandmarks?.[0]) {
    const s = res.multiFaceLandmarks[0];
    const faceWidth = Math.hypot(s[234].x - s[454].x, s[234].y - s[454].y);
    emojiMask.scale.set(faceWidth * 1.2, faceWidth * 1.2, 1);
    emojiMask.position.set((0.5 - s[1].x) * 1.5, (0.5 - s[1].y) * 1.1, 1.0);
    const mouthW = Math.hypot(s[61].x - s[291].x, s[61].y - s[291].y);
    emojiMaterial.opacity = mouthW > 0.08 ? 1.0 : 0.0;
  }
  renderer.render(scene, camera);
});

// --- 3. 通信 (PeerJS) 徹底修正 ---
const peer = new Peer();
let localStream: MediaStream;

// カメラとマイクを準備
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localStream = stream; // 💡 自分の「生のカメラ映像」を保存
  video.srcObject = stream;
  video.onloadedmetadata = () => {
    const loop = async () => { await faceMesh.send({ image: video }); requestAnimationFrame(loop); };
    loop();
  };
});

// 相手からかかってきた時
peer.on('call', (call) => {
  call.answer(localStream); // 💡 自分の映像を返して参加
  call.on('stream', (remoteStream) => addRemoteVideo(remoteStream, call.peer));
});

// 「入室」ボタンを押した時
document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const remoteId = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value.trim();
  if (remoteId && localStream) {
    console.log("接続中: " + remoteId);
    const call = peer.call(remoteId, localStream); // 💡 相手に自分の映像を送る
    call.on('stream', (remoteStream) => addRemoteVideo(remoteStream, remoteId));
  } else {
    alert("相手のIDを入力してください、またはカメラが準備できていません。");
  }
});

function addRemoteVideo(stream: MediaStream, id: string) {
  if (document.getElementById(`remote-${id}`)) return;
  const v = document.createElement('video');
  v.id = `remote-${id}`;
  v.style.width = "200px"; v.style.borderRadius = "10px"; v.autoplay = true; v.playsInline = true;
  v.srcObject = stream;
  document.getElementById('video-grid')!.appendChild(v);
}

peer.on('open', (id) => (document.querySelector('#status') as HTMLElement).innerText = `あなたのID: ${id}`);