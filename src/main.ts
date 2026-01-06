import './style.css'
import * as THREE from 'three';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Peer } from 'peerjs';

// --- 1. UI構築 ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; flex-direction: column; align-items: center; background: #f0f2f5; padding: 20px;">
    <h1 style="color: #333;">V-Meeting: Scratch Avatar</h1>
    <div id="video-container" style="position: relative; width: 480px; height: 360px; border-radius: 20px; overflow: hidden; background: #000;">
      <video id="local-video" style="width: 100%; height: 100%; object-fit: cover; position: absolute; transform: scaleX(-1);" autoplay playsinline muted></video>
      <canvas id="emoji-canvas" style="width: 100%; height: 100%; position: absolute; z-index: 10;"></canvas>
    </div>
    <div class="card" style="margin-top: 20px; background: white; padding: 20px; border-radius: 16px; width: 440px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); text-align: center;">
      <p id="status" style="font-size: 11px; color: #1976D2; font-weight: bold;">あなたのID: 取得中...</p>
      <div style="display: flex; gap: 8px;">
        <input id="remote-id-input" placeholder="相手のIDを入力" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
        <button id="connect-btn" style="flex: 1; background: #646cff; color: white; border: none; border-radius: 5px; cursor: pointer;">参加</button>
      </div>
    </div>
    <div id="video-grid" style="display: flex; gap: 10px; margin-top: 20px;"></div>
  </div>
`;

// --- 2. 3Dアバター構築 (各パーツを分ける) ---
const canvas = document.querySelector('#emoji-canvas') as HTMLCanvasElement;
const video = document.querySelector('#local-video') as HTMLVideoElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 480 / 360, 0.1, 10);
camera.position.z = 2.0;
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(480, 360);

const avatarGroup = new THREE.Group();
scene.add(avatarGroup);

const loader = new THREE.TextureLoader();

// Scratch風ネコのパーツ（顔・目・鼻・口）
function createPart(url: string, size: number, z: number) {
  const mat = new THREE.SpriteMaterial({ map: loader.load(url), transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(size, size, 1);
  sprite.position.z = z;
  return sprite;
}

// 💡 Scratchのネコ素材をシミュレーションしたパーツ
const faceBase = createPart('https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f431.png', 1.4, 0); // ベースの顔
const eyeL = createPart('https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/26aa.png', 0.25, 0.1); // 左目
const eyeR = createPart('https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/26aa.png', 0.25, 0.1); // 右目
const pupilL = createPart('https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/26ab.png', 0.1, 0.2); // 黒目左
const pupilR = createPart('https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/26ab.png', 0.1, 0.2); // 黒目右

avatarGroup.add(faceBase, eyeL, eyeR, pupilL, pupilR);

// --- 3. 顔の動きと連動させる ---
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (res.multiFaceLandmarks?.[0]) {
    const s = res.multiFaceLandmarks[0];
    const faceWidth = Math.hypot(s[234].x - s[454].x, s[234].y - s[454].y);
    
    // 全体の位置
    avatarGroup.position.set((0.5 - s[1].x) * 1.4, (0.5 - s[1].y) * 1.1, 1.0);
    avatarGroup.scale.set(faceWidth, faceWidth, 1);

    // 💡 目の位置を顔のパーツに合わせる
    const moveEye = (sprite: THREE.Sprite, landmark: any, ox: number, oy: number) => {
      sprite.position.x = (landmark.x - s[1].x) * 1.5 + ox;
      sprite.position.y = (s[1].y - landmark.y) * 1.5 + oy;
    };

    moveEye(eyeL, s[33], -0.1, 0.1);
    moveEye(eyeR, s[263], 0.1, 0.1);
    
    // 💡 黒目の動き（視線を少し動かす）
    pupilL.position.set(eyeL.position.x, eyeL.position.y, 0.2);
    pupilR.position.set(eyeR.position.x, eyeR.position.y, 0.2);

    // 💡 瞬き（目が細くなる）
    const eyeOpen = Math.abs(s[159].y - s[145].y);
    eyeL.scale.y = eyeR.scale.y = eyeOpen < 0.015 ? 0.05 : 0.25;
  }
  renderer.render(scene, camera);
});

// --- 4. 通信 (PeerJS) ---
const peer = new Peer();
let myStream: MediaStream;
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  myStream = stream; video.srcObject = stream;
  video.onloadedmetadata = () => {
    const loop = async () => { await faceMesh.send({ image: video }); requestAnimationFrame(loop); };
    loop();
  };
});
peer.on('open', (id) => (document.querySelector('#status') as HTMLElement).innerText = `あなたのID: ${id}`);
peer.on('call', (call) => { call.answer(myStream); call.on('stream', (s) => addRemoteVideo(s, call.peer)); });
document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const rid = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value;
  if (rid && myStream) { const call = peer.call(rid, myStream); call.on('stream', (s) => addRemoteVideo(s, rid)); }
});
function addRemoteVideo(s: MediaStream, id: string) {
  if (document.getElementById(`remote-${id}`)) return;
  const v = document.createElement('video'); v.id = `remote-${id}`;
  v.style.width = "200px"; v.style.borderRadius = "10px"; v.autoplay = true; v.playsInline = true;
  v.srcObject = s; document.getElementById('video-grid')!.appendChild(v);
}