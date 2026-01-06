import './style.css'
import * as THREE from 'three';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Peer } from 'peerjs';

// --- 1. UI構築 ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; flex-direction: column; align-items: center; background: #f0f2f5; padding: 20px;">
    <h1 style="color: #333; margin-bottom: 10px;">V-Meeting: Emoji Face</h1>
    <div style="position: relative; width: 480px; height: 360px; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3); background: #000;">
      <video id="local-video" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top:0; left:0;" autoplay playsinline muted></video>
      <canvas id="emoji-canvas" style="width: 100%; height: 100%; position: absolute; top:0; left:0; pointer-events: none; z-index: 10;"></canvas>
    </div>
    <div class="card" style="margin-top: 20px; background: white; padding: 20px; border-radius: 16px; width: 440px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
      <div style="display: flex; gap: 8px; justify-content: center;">
        <button id="mic-btn" style="background: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer;">🎤 ON</button>
        <button id="cam-btn" style="background: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer;">📷 ON</button>
      </div>
      <p id="status" style="font-size: 11px; color: #1976D2; font-weight: bold; text-align:center; margin-top: 10px;">ID取得中...</p>
    </div>
    <div id="video-grid" style="display: flex; gap: 10px; margin-top: 20px;"></div>
  </div>
`;

// --- 2. 3D設定 (絵文字用) ---
const canvas = document.querySelector('#emoji-canvas') as HTMLCanvasElement;
const video = document.querySelector('#local-video') as HTMLVideoElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 480 / 360, 0.1, 10);
camera.position.z = 2;

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(480, 360);
renderer.setPixelRatio(window.devicePixelRatio);

const emojiTexture = new THREE.TextureLoader().load('https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f604.png');
const emojiMaterial = new THREE.SpriteMaterial({ map: emojiTexture, transparent: true, opacity: 0 });
const emojiMask = new THREE.Sprite(emojiMaterial);
emojiMask.scale.set(0.6, 0.6, 1);
scene.add(emojiMask);

// --- 3. 顔トラッキング ---
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (res.multiFaceLandmarks?.[0]) {
    const s = res.multiFaceLandmarks[0];
    // 鏡合わせになるように X 軸の計算を調整
    emojiMask.position.set((s[1].x - 0.5) * -2.2, (0.5 - s[1].y) * 1.6, 0.5);

    const mouthW = Math.hypot(s[61].x - s[291].x, s[61].y - s[291].y);
    emojiMaterial.opacity = mouthW > 0.08 ? 1.0 : 0.0;
  }
  renderer.render(scene, camera);
});

// --- 4. 起動処理の強化 ---
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    video.srcObject = stream;
    
    // 💡 映像データがブラウザに届くまで待機
    video.onloadeddata = () => {
      const runFaceMesh = async () => {
        // 💡 映像の横幅が 0 より大きい（＝ちゃんと映っている）時だけ処理
        if (video.videoWidth > 0) {
          await faceMesh.send({ image: video });
        }
        requestAnimationFrame(runFaceMesh);
      };
      runFaceMesh();
    };
  } catch (err) {
    console.error("Camera error:", err);
  }
}

startCamera();

const peer = new Peer();
peer.on('open', (id) => (document.querySelector('#status') as HTMLElement).innerText = `ID: ${id}`);