import './style.css'
import * as THREE from 'three';
import { FaceMesh } from '@mediapipe/face_mesh';

// --- 1. UI構築 ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; flex-direction: column; align-items: center; background: #f0f9ff; padding: 20px; font-family: sans-serif;">
    <h1 style="color: #4d97ff; margin-bottom: 10px;">Scratch 3D & Chat @nijinai</h1>
    <div id="video-container" style="position: relative; width: 640px; height: 480px; border: 10px solid #4d97ff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
      <video id="local-video" style="width: 100%; height: 100%; object-fit: cover; position: absolute; transform: scaleX(-1);" autoplay playsinline muted></video>
      <canvas id="avatar-canvas" style="width: 100%; height: 100%; position: absolute; z-index: 10;"></canvas>
    </div>
    <div style="margin-top: 15px; width: 600px; background: white; padding: 15px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
      <div id="chat-logs" style="height: 80px; overflow-y: auto; font-size: 14px; border-bottom: 2px solid #f0f0f0; margin-bottom: 10px; padding: 5px;"></div>
      <div style="display: flex; gap: 10px;">
        <input id="chat-input" placeholder="@nijinai こんにちは！" style="flex: 1; padding: 10px; border: 2px solid #4d97ff; border-radius: 10px;">
        <button id="send-btn" style="background: #4d97ff; color: white; border: none; padding: 10px 20px; border-radius: 10px; cursor: pointer; font-weight: bold;">送信</button>
      </div>
    </div>
  </div>
`;

// --- 2. Three.js セットアップ ---
const canvas = document.querySelector('#avatar-canvas') as HTMLCanvasElement;
const video = document.querySelector('#local-video') as HTMLVideoElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 640 / 480, 0.1, 100);
camera.position.z = 5;
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(640, 480);

const avatarGroup = new THREE.Group();
scene.add(avatarGroup);

const loader = new THREE.TextureLoader();
const parts: { [key: string]: THREE.Sprite } = {};

function addPart(fileName: string, z: number, scale = 2.8) {
  const texture = loader.load(`./${fileName}`);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.position.z = z;
  sprite.scale.set(scale, scale, 1);
  avatarGroup.add(sprite);
  parts[fileName] = sprite;
  return sprite;
}

// --- 3. 画像パーツの登録 (GitHubのファイル名と正確に一致させています) ---
// 奥から配置
addPart('left ear.svg', -0.2);
addPart('right ear.svg', -0.2);
addPart('left ear outline.svg', -0.19);
addPart('right ear outline.svg', -0.19);
addPart('face.svg', 0);
addPart('face outline.svg', 0.01);
addPart('cheeks.svg', 0.02);
addPart('cheeks outline.svg', 0.021);
addPart('whiskers left.svg', 0.03);
addPart('whiskers right.svg', 0.03);
addPart('mouth.svg', 0.04);
addPart('mouth2.svg', 0.041);
addPart('nose.svg', 0.05);
addPart('eye left2.svg', 0.06);
addPart('eye right2.svg', 0.06);
addPart('eye left pupil.svg', 0.07);
addPart('eye right pupil.svg', 0.07);

const eyeLBlink = addPart('eye left blink.svg', 0.08);
const eyeRBlink = addPart('eye right blink.svg', 0.08);
eyeLBlink.visible = eyeRBlink.visible = false;

// --- 4. 顔トラッキングロジック ---
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5 });

faceMesh.onResults((res) => {
  if (res.multiFaceLandmarks?.[0]) {
    const s = res.multiFaceLandmarks[0];
    const faceWidth = Math.hypot(s[234].x - s[454].x, s[234].y - s[454].y);
    avatarGroup.position.set((0.5 - s[1].x) * 4, (0.5 - s[1].y) * 3, 0);
    avatarGroup.scale.set(faceWidth * 4.5, faceWidth * 4.5, 1);

    const yaw = (s[1].x - s[4].x) * 10;
    const pitch = (s[1].y - s[4].y) * 10;

    const applyM = (name: string, p: number) => {
      if (parts[name]) {
        parts[name].position.x = yaw * p;
        parts[name].position.y = -pitch * p;
      }
    };

    // パララックス（視差）による立体感の調整
    applyM('nose.svg', 0.25);
    applyM('mouth.svg', 0.2);
    applyM('eye left pupil.svg', 0.35);
    applyM('eye right pupil.svg', 0.35);
    applyM('left ear.svg', -0.15);
    applyM('right ear.svg', -0.15);

    // 瞬き判定
    const eyeOpen = Math.abs(s[159].y - s[145].y);
    const isBlink = eyeOpen < 0.012;
    ['eye left2.svg', 'eye right2.svg', 'eye left pupil.svg', 'eye right pupil.svg'].forEach(n => {
      if (parts[n]) parts[n].visible = !isBlink;
    });
    eyeLBlink.visible = eyeRBlink.visible = isBlink;
  }
  renderer.render(scene, camera);
});

// --- 5. チャット反応 ---
const chatInput = document.getElementById('chat-input') as HTMLInputElement;
const chatLogs = document.getElementById('chat-logs')!;
const sendBtn = document.getElementById('send-btn')!;

sendBtn.onclick = () => {
  const val = chatInput.value.trim();
  if (!val) return;
  const d = document.createElement('div');
  d.innerHTML = `<b>あなた:</b> ${val}`;
  chatLogs.appendChild(d);
  chatInput.value = "";

  if (val.includes("@nijinai")) {
    setTimeout(() => {
      const r = document.createElement('div');
      r.innerHTML = `<b style="color:#ff4d97">nijinai:</b> 呼びましたか？griffpatchさんのネコを再現中だよ！`;
      chatLogs.appendChild(r);
      chatLogs.scrollTop = chatLogs.scrollHeight;
      avatarGroup.position.y += 0.4;
      setTimeout(() => avatarGroup.position.y -= 0.4, 200);
    }, 800);
  }
};

navigator.mediaDevices.getUserMedia({ video: true }).then(s => {
  video.srcObject = s;
  video.onloadedmetadata = () => {
    const loop = async () => { await faceMesh.send({ image: video }); requestAnimationFrame(loop); };
    loop();
  };
});