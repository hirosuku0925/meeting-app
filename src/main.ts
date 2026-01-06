import './style.css'
import * as THREE from 'three';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Peer } from 'peerjs';

// --- 1. UI構築 ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; flex-direction: column; align-items: center; background: #f0f2f5; padding: 20px; overflow-y: auto;">
    <h1 style="color: #333; margin-bottom: 10px;">V-Meeting: Emoji Face</h1>
    <div style="position: relative; width: 480px; height: 360px; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3); background: #000;">
      <video id="local-video" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top:0; left:0;" autoplay playsinline muted></video>
      <canvas id="emoji-canvas" style="width: 100%; height: 100%; position: absolute; top:0; left:0; pointer-events: none; z-index: 10;"></canvas>
    </div>
    <div class="card" style="margin-top: 20px; background: white; padding: 20px; border-radius: 16px; width: 440px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
      <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 15px;">
        <button id="mic-btn" style="background: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer;">🎤 ON</button>
        <button id="cam-btn" style="background: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer;">📷 ON</button>
      </div>
      <div style="display: flex; gap: 8px; margin-bottom: 10px;">
        <input id="remote-id-input" placeholder="相手のIDを入力" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
        <button id="connect-btn" style="flex: 1; background: #646cff; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">入室</button>
      </div>
      <p id="status" style="font-size: 11px; color: #1976D2; font-weight: bold; text-align:center;">ID取得中...</p>
    </div>
    <div id="video-grid" style="display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; justify-content: center;"></div>
  </div>
`;

// --- 2. 3D設定 ---
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

// --- 3. 顔トラッキング (左右反転とサイズの修正) ---
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (res.multiFaceLandmarks?.[0]) {
    const s = res.multiFaceLandmarks[0];
    const faceWidth = Math.hypot(s[234].x - s[454].x, s[234].y - s[454].y);
    
    // 💡 サイズを顔に合わせる (1.1倍に少し小さくしました)
    const emojiSize = faceWidth * 1.1;
    emojiMask.scale.set(emojiSize, emojiSize, 1);

    // 💡 左右のズレを修正（ここが一番大事！）
    // 画像では右にずれていたので、計算を反転させました
    emojiMask.position.x = (s[1].x - 0.5) * -1.4; 
    emojiMask.position.y = (0.5 - s[1].y) * 1.1;
    emojiMask.position.z = 1.0;

    const mouthW = Math.hypot(s[61].x - s[291].x, s[61].y - s[291].y);
    emojiMaterial.opacity = mouthW > 0.08 ? 1.0 : 0.0;
  }
  renderer.render(scene, camera);
});

// --- 4. 通信 (PeerJS) & 起動 ---
const peer = new Peer();
let myStream: MediaStream;

navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  myStream = stream;
  video.srcObject = stream;
  video.onloadedmetadata = () => {
    const loop = async () => { await faceMesh.send({ image: video }); requestAnimationFrame(loop); };
    loop();
  };
});

peer.on('open', (id) => (document.querySelector('#status') as HTMLElement).innerText = `あなたのID: ${id}`);

// 💡 相手からの着信に応答する設定
peer.on('call', (call) => {
  call.answer(myStream);
  call.on('stream', (remoteStream) => addRemoteVideo(remoteStream, call.peer));
});

// 💡 入室ボタンで相手を呼び出す設定
document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const remoteId = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value.trim();
  if (remoteId && myStream) {
    const call = peer.call(remoteId, myStream);
    call.on('stream', (remoteStream) => addRemoteVideo(remoteStream, remoteId));
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