import './style.css'
import * as THREE from 'three';
import { FaceMesh } from '@mediapipe/face_mesh';

// --- 1. 背景とビデオのUI ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; flex-direction: column; align-items: center; background: #fdfdfd; padding: 20px; font-family: sans-serif;">
    <h1 style="color: #4d97ff; margin-bottom: 15px;">Scratch 3D Head Tracking</h1>
    <div id="video-container" style="position: relative; width: 640px; height: 480px; border: 10px solid #4d97ff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
      <video id="local-video" style="width: 100%; height: 100%; object-fit: cover; position: absolute; transform: scaleX(-1);" autoplay playsinline muted></video>
      <canvas id="avatar-canvas" style="width: 100%; height: 100%; position: absolute; z-index: 10;"></canvas>
    </div>
    <div style="margin-top: 15px; background: white; padding: 10px 20px; border-radius: 50px; font-size: 14px; border: 2px solid #4d97ff;">
       Original assets by <strong>griffpatch</strong>
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

// パーツ生成ヘルパー
const parts: { [key: string]: THREE.Sprite } = {};
function addPart(fileName: string, z: number, scale = 2.5) {
  const texture = loader.load(`./${fileName}`); // publicフォルダから読み込み
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.position.z = z;
  sprite.scale.set(scale, scale, 1);
  avatarGroup.add(sprite);
  parts[fileName] = sprite;
  return sprite;
}

// --- 3. パーツのレイヤー配置 (リストに基づいた重なり順) ---
// 奥から順番に配置
addPart('left ear.svg', -0.15);
addPart('right ear.svg', -0.15);
addPart('left ear outline.svg', -0.14);
addPart('right ear outline.svg', -0.14);
addPart('face.svg', 0);
addPart('face outline.svg', 0.01);
addPart('cheeks.svg', 0.02);
addPart('cheeks outline.svg', 0.025);
addPart('whiskers left.svg', 0.03);
addPart('whiskers right.svg', 0.03);
addPart('mouth.svg', 0.04);
addPart('mouth2.svg', 0.041);
addPart('nose.svg', 0.05);
addPart('eye left2.svg', 0.06);
addPart('eye right2.svg', 0.06);
addPart('eye left pupil.svg', 0.07);
addPart('eye right pupil.svg', 0.07);

// 瞬き用 (最初は隠しておく)
const eyeLBlink = addPart('eye left blink.svg', 0.08);
const eyeRBlink = addPart('eye right blink.svg', 0.08);
eyeLBlink.visible = eyeRBlink.visible = false;

// --- 4. 顔トラッキングとアニメーション ---
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5 });

faceMesh.onResults((res) => {
  if (res.multiFaceLandmarks?.[0]) {
    const s = res.multiFaceLandmarks[0];

    // 位置とスケール
    const faceWidth = Math.hypot(s[234].x - s[454].x, s[234].y - s[454].y);
    avatarGroup.position.set((0.5 - s[1].x) * 4, (0.5 - s[1].y) * 3, 0);
    avatarGroup.scale.set(faceWidth * 4, faceWidth * 4, 1);

    // 立体感のための「ずれ」計算
    const yaw = (s[1].x - s[4].x) * 8;   // 左右
    const pitch = (s[1].y - s[4].y) * 8; // 上下

    // パーツごとに異なる移動量を適用 (Parallax Effect)
    const applyMotion = (name: string, power: number) => {
      if (parts[name]) {
        parts[name].position.x = yaw * power;
        parts[name].position.y = -pitch * power;
      }
    };

    // 前にあるパーツほど大きく動かす
    applyMotion('nose.svg', 0.2);
    applyMotion('mouth.svg', 0.15);
    applyMotion('mouth2.svg', 0.15);
    applyMotion('eye left2.svg', 0.12);
    applyMotion('eye right2.svg', 0.12);
    applyMotion('eye left pupil.svg', 0.25); // 瞳はさらに動く
    applyMotion('eye right pupil.svg', 0.25);
    applyMotion('whiskers left.svg', 0.1);
    applyMotion('whiskers right.svg', 0.1);
    applyMotion('left ear.svg', -0.12);  // 耳は奥なので逆に動く
    applyMotion('right ear.svg', -0.12);
    applyMotion('left ear outline.svg', -0.12);
    applyMotion('right ear outline.svg', -0.12);

    // 瞬きアニメーション
    const eyeOpen = Math.abs(s[159].y - s[145].y);
    const isBlinking = eyeOpen < 0.012;
    parts['eye left2.svg'].visible = parts['eye right2.svg'].visible = !isBlinking;
    parts['eye left pupil.svg'].visible = parts['eye right pupil.svg'].visible = !isBlinking;
    eyeLBlink.visible = eyeRBlink.visible = isBlinking;
    if(isBlinking) {
        eyeLBlink.position.x = yaw * 0.12; eyeLBlink.position.y = -pitch * 0.12;
        eyeRBlink.position.x = yaw * 0.12; eyeRBlink.position.y = -pitch * 0.12;
    }
  }
  renderer.render(scene, camera);
});

// カメラ開始
navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
  video.srcObject = stream;
  video.onloadedmetadata = () => {
    const loop = async () => { await faceMesh.send({ image: video }); requestAnimationFrame(loop); };
    loop();
  };
});