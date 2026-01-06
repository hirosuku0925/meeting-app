import './style.css'
import * as THREE from 'three';
import { FaceMesh } from '@mediapipe/face_mesh';

// --- 1. UI構築 (背景切り替えボタン付き) ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; flex-direction: column; align-items: center; background: #f0f9ff; padding: 10px; font-family: sans-serif;">
    <div id="video-container" style="position: relative; width: 640px; height: 480px; border: 8px solid #4d97ff; border-radius: 20px; overflow: hidden; background: black;">
      <div id="virtual-bg" style="position: absolute; width: 100%; height: 100%; background-size: cover; display: none;"></div>
      <video id="local-video" style="width: 100%; height: 100%; object-fit: cover; position: absolute; transform: scaleX(-1);" autoplay playsinline muted></video>
      <canvas id="avatar-canvas" style="width: 100%; height: 100%; position: absolute; z-index: 10;"></canvas>
    </div>

    <div style="margin-top: 10px; display: flex; gap: 10px;">
      <button onclick="window.changeBg('none')" style="padding: 5px 15px; border-radius: 20px; border: none; background: #fff; cursor: pointer;">背景なし</button>
      <button onclick="window.changeBg('green')" style="padding: 5px 15px; border-radius: 20px; border: none; background: #00ff00; cursor: pointer;">グリーンバック</button>
      <button onclick="window.changeBg('scratch')" style="padding: 5px 15px; border-radius: 20px; border: none; background: #4d97ff; color: white; cursor: pointer;">Scratch背景</button>
    </div>

    <div style="margin-top: 10px; width: 600px; background: white; padding: 10px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
      <div id="chat-logs" style="height: 60px; overflow-y: auto; font-size: 14px; border-bottom: 2px solid #f0f0f0; margin-bottom: 5px;"></div>
      <div style="display: flex; gap: 10px;">
        <input id="chat-input" placeholder="@nijinai こんにちは！" style="flex: 1; padding: 8px; border: 2px solid #4d97ff; border-radius: 10px;">
        <button id="send-btn" style="background: #4d97ff; color: white; border: none; padding: 8px 15px; border-radius: 10px; cursor: pointer;">送信</button>
      </div>
    </div>
  </div>
`;

// --- 2. 背景切り替えロジック ---
const video = document.querySelector('#local-video') as HTMLVideoElement;
const virtualBg = document.querySelector('#virtual-bg') as HTMLDivElement;

(window as any).changeBg = (type: string) => {
  if (type === 'none') {
    video.style.opacity = "1";
    virtualBg.style.display = "none";
  } else if (type === 'green') {
    video.style.opacity = "0";
    virtualBg.style.display = "block";
    virtualBg.style.backgroundColor = "#00ff00";
    virtualBg.style.backgroundImage = "none";
  } else if (type === 'scratch') {
    video.style.opacity = "0.3"; // ビデオを薄く残す
    virtualBg.style.display = "block";
    virtualBg.style.backgroundImage = "url('https://scratch.mit.edu/static/images/scratch-og.png')";
  }
};

// --- 3. Three.js セットアップ (複数人用) ---
const canvas = document.querySelector('#avatar-canvas') as HTMLCanvasElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 640 / 480, 0.1, 100);
camera.position.z = 5;
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(640, 480);

const loader = new THREE.TextureLoader();
const avatarGroups: THREE.Group[] = [];

// 最大4人分のグループを作成
for (let i = 0; i < 4; i++) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  avatarGroups.push(group);
  
  // 各グループにパーツを追加
  const addP = (file: string, z: number) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: loader.load(`./${file}`), transparent: true }));
    sprite.position.z = z;
    sprite.scale.set(2.8, 2.8, 1);
    sprite.name = file;
    group.add(sprite);
  };
  
  addP('face.svg', 0);
  addP('face outline.svg', 0.01);
  addP('eye left2.svg', 0.06);
  addP('eye right2.svg', 0.06);
  addP('eye left pupil.svg', 0.07);
  addP('eye right pupil.svg', 0.07);
  addP('nose.svg', 0.05);
  addP('mouth.svg', 0.04);
}

// --- 4. 顔トラッキング (複数人対応版) ---
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 4, refineLandmarks: true, minDetectionConfidence: 0.5 });

faceMesh.onResults((res) => {
  avatarGroups.forEach(g => g.visible = false); // 一旦全員非表示

  if (res.multiFaceLandmarks) {
    res.multiFaceLandmarks.forEach((s, i) => {
      if (i >= 4) return;
      const group = avatarGroups[i];
      group.visible = true;

      const faceWidth = Math.hypot(s[234].x - s[454].x, s[234].y - s[454].y);
      group.position.set((0.5 - s[1].x) * 4.2, (0.5 - s[1].y) * 3.2, 0);
      group.scale.set(faceWidth * 4.5, faceWidth * 4.5, 1);

      const yaw = (s[1].x - s[4].x) * 10;
      const pitch = (s[1].y - s[4].y) * 10;

      group.children.forEach((c: any) => {
        if (c.name === 'nose.svg') { c.position.x = yaw * 0.25; c.position.y = -pitch * 0.25; }
        if (c.name.includes('pupil')) { c.position.x = yaw * 0.35; c.position.y = -pitch * 0.35; }
      });
    });
  }
  renderer.render(scene, camera);
});

// カメラ起動
navigator.mediaDevices.getUserMedia({ video: true }).then(s => {
  video.srcObject = s;
  video.onloadedmetadata = () => {
    const loop = async () => { await faceMesh.send({ image: video }); requestAnimationFrame(loop); };
    loop();
  };
});