import './style.css'
import * as THREE from 'three';
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
      <div style="display: flex; gap: 8px; justify-content: center;">
        <button id="mic-btn" style="background: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer;">🎤 ON</button>
        <button id="cam-btn" style="background: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer;">📷 ON</button>
      </div>
      <p id="status" style="font-size: 11px; color: #1976D2; font-weight: bold; text-align:center; margin-top: 10px;">ID取得中...</p>
    </div>
    <div id="video-grid" style="display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; justify-content: center;"></div>
  </div>
`;

// --- 2. 3Dシーン設定 ---
const canvas = document.querySelector('#local-canvas') as HTMLCanvasElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 480 / 360, 0.1, 20.0);
camera.position.set(0, 0, 2); // カメラ位置を調整

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(480, 360);

// --- 3. 絵文字マスクの設定 ---
const emojiTexture = new THREE.TextureLoader().load('https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f604.png');
const emojiMaterial = new THREE.SpriteMaterial({ map: emojiTexture, transparent: true, opacity: 0 });
const emojiMask = new THREE.Sprite(emojiMaterial);
emojiMask.scale.set(0.6, 0.6, 1); // 顔全体を隠すために少し大きく
scene.add(emojiMask);

// --- 4. 顔トラッキング & 判定 ---
const video = document.querySelector('#hidden-video') as HTMLVideoElement;
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (res.multiFaceLandmarks?.[0]) {
    const s = res.multiFaceLandmarks[0];
    
    // 💡 絵文字の位置を鼻の頭（s[1]）に合わせる
    // 座標計算を調整して、カメラ映像の顔の上にピッタリ乗るようにします
    emojiMask.position.set(
      (s[1].x - 0.5) * -2, 
      (0.5 - s[1].y) * 1.5, 
      0.5
    );

    // 😊 笑い判定
    const mouthW = Math.hypot(s[61].x - s[291].x, s[61].y - s[291].y);
    emojiMaterial.opacity = mouthW > 0.08 ? 1.0 : 0.0;
  }
  renderer.render(scene, camera);
});

// --- 5. 通信 & メイン開始 ---
const peer = new Peer();
const processedStream = canvas.captureStream(30);
peer.on('open', (id) => (document.querySelector('#status') as HTMLElement).innerText = `ID: ${id}`);

navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  video.srcObject = stream;
  stream.getAudioTracks().forEach(track => processedStream.addTrack(track));
  video.onloadedmetadata = () => {
    video.play();
    const loop = async () => {
      await faceMesh.send({ image: video });
      requestAnimationFrame(loop);
    };
    loop();
  };
});