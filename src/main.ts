import './style.css'
import * as THREE from 'three';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Peer } from 'peerjs';

// --- 1. UI構築 (背景選択ボタンを追加) ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; flex-direction: column; align-items: center; background: #f0f2f5; padding: 20px; overflow-y: auto;">
    <h1 style="color: #333; margin-bottom: 10px;">V-Meeting: Emoji & Beauty</h1>
    
    <div id="video-container" style="position: relative; width: 480px; height: 360px; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3); background: #000;">
      <div id="bg-layer" style="position: absolute; width: 100%; height: 100%; background: #fff; background-size: cover; display: none;"></div>
      <video id="local-video" style="width: 100%; height: 100%; object-fit: cover; position: absolute; transform: scaleX(-1); filter: brightness(1.1) contrast(1.1) saturate(1.1) blur(0px); transition: 0.3s;" autoplay playsinline muted></video>
      <canvas id="emoji-canvas" style="width: 100%; height: 100%; position: absolute; pointer-events: none; z-index: 10;"></canvas>
    </div>

    <div class="card" style="margin-top: 20px; background: white; padding: 20px; border-radius: 16px; width: 440px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
      <div style="margin-bottom: 15px; display: flex; flex-direction: column; gap: 10px;">
        <div style="font-size: 12px; font-weight: bold; color: #666;">✨ メイク・背景設定</div>
        <div style="display: flex; gap: 5px;">
          <button id="bg-none" style="flex:1; font-size: 10px; padding: 5px;">背景なし</button>
          <button id="bg-blur" style="flex:1; font-size: 10px; padding: 5px;">背景ぼかし</button>
          <button id="bg-image" style="flex:1; font-size: 10px; padding: 5px;">オシャレ壁</button>
        </div>
      </div>
      
      <div style="display: flex; gap: 8px; margin-bottom: 10px;">
        <input id="remote-id-input" placeholder="相手のIDを入力" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
        <button id="connect-btn" style="flex: 1; background: #646cff; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">入室</button>
      </div>
      <p id="status" style="font-size: 11px; color: #1976D2; font-weight: bold; text-align: center;">ID取得中...</p>
    </div>
    <div id="video-grid" style="display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; justify-content: center;"></div>
  </div>
`;

// --- 2. 3D & 顔認識設定 ---
const canvas = document.querySelector('#emoji-canvas') as HTMLCanvasElement;
const video = document.querySelector('#local-video') as HTMLVideoElement;
const bgLayer = document.querySelector('#bg-layer') as HTMLDivElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 480 / 360, 0.1, 10);
camera.position.z = 2.0;
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
    // 💡 左右のズレ修正済み
    emojiMask.position.x = (s[1].x - 0.5) * 1.25; 
    emojiMask.position.y = (0.5 - s[1].y) * 0.95;
    emojiMask.position.z = 1.0;

    const mouthW = Math.hypot(s[61].x - s[291].x, s[61].y - s[291].y);
    emojiMaterial.opacity = mouthW > 0.08 ? 1.0 : 0.0;
  }
  renderer.render(scene, camera);
});

// --- 3. メイク・背景のボタン機能 ---
document.getElementById('bg-none')?.addEventListener('click', () => {
  video.style.filter = "brightness(1.1) contrast(1.1) saturate(1.1)";
  bgLayer.style.display = "none";
});
document.getElementById('bg-blur')?.addEventListener('click', () => {
  video.style.filter = "brightness(1.1) blur(8px)";
  bgLayer.style.display = "none";
});
document.getElementById('bg-image')?.addEventListener('click', () => {
  video.style.filter = "brightness(1.1)";
  bgLayer.style.backgroundImage = "url('https://images.unsplash.com/photo-1518655048521-f130df041f66?auto=format&fit=crop&w=480&q=80')";
  bgLayer.style.display = "block";
});

// --- 4. 通信 & 起動 (以前と同じ) ---
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
peer.on('call', (call) => {
  call.answer(myStream);
  call.on('stream', (s) => addRemoteVideo(s, call.peer));
});
document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const remoteId = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value.trim();
  if (remoteId && myStream) {
    const call = peer.call(remoteId, myStream);
    call.on('stream', (s) => addRemoteVideo(s, remoteId));
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