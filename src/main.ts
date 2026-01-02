import './style.css'
import { Peer } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

// --- デザインを完全に元に戻しました ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; overflow: hidden; background: #f0f2f5;">
    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333; margin-bottom: 20px;">マルチ会議室 (Web版)</h1>
      
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; padding: 10px; width: 100%;">
        <div id="local-container" style="text-align: center;">
          <p style="font-size: 12px; color: #666; margin-bottom: 5px;">自分 (3Dアバター)</p>
          <canvas id="local-canvas" width="480" height="360" style="width: 280px; border: 3px solid #646cff; border-radius: 15px; background: #222; box-shadow: 0 8px 16px rgba(0,0,0,0.2);"></canvas>
        </div>
      </div>

      <div class="card" style="width: 100%; max-width: 550px; margin-top: 20px; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
        <div style="background: #f8f9fa; padding: 15px; border-radius: 12px; margin-bottom: 15px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
              <label style="font-size: 11px; font-weight: bold; color: #1976D2;">🏞 背景変更</label>
              <input type="file" id="bg-upload" accept="image/*" style="width: 100%; font-size: 10px; margin-top: 5px;">
            </div>
            <div>
              <label style="font-size: 11px; font-weight: bold; color: #646cff;">👤 アバター選択(.vrm)</label>
              <input type="file" id="vrm-upload" accept=".vrm" style="width: 100%; font-size: 10px; margin-top: 5px;">
            </div>
          </div>
        </div>
        
        <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 15px; flex-wrap: wrap;">
          <button id="mic-btn" style="background-color: #4CAF50; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer; min-width: 90px;">🎤 マイク</button>
          <button id="cam-btn" style="background-color: #4CAF50; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer; min-width: 90px;">📷 カメラ</button>
          <button id="screen-btn" style="background-color: #ff9800; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer; min-width: 90px;">💻 画面共有</button>
          <button id="hangup-btn" style="background-color: #f44336; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">退出</button>
        </div>

        <p id="status" style="font-size: 11px; color: #1976D2; font-weight: bold; text-align:center;">ID取得中...</p>
        <div style="display: flex; gap: 10px; margin-top:10px;">
             <input id="remote-id-input" type="text" placeholder="相手のIDを入力して入室" style="flex: 2; padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
             <button id="connect-btn" style="flex: 1; background-color: #646cff; color: white; border-radius: 8px; border:none; cursor:pointer; font-weight:bold;">入室</button>
        </div>
      </div>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

// --- 3D設定 ---
const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 480 / 360, 0.1, 20);
camera.position.set(0, 1.45, 0.8);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(480, 360);
const light = new THREE.DirectionalLight(0xffffff, 1.0);
light.position.set(1, 1, 1).normalize();
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.7));

let currentVrm: any = null;
const loader = new GLTFLoader();
loader.register((parser: any) => new VRMLoaderPlugin(parser));

// --- 3Dアバター選択を有効化 ---
document.querySelector('#vrm-upload')?.addEventListener('change', async (e: any) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  loader.load(url, (gltf: any) => {
    if (currentVrm) scene.remove(currentVrm.scene);
    currentVrm = gltf.userData.vrm;
    scene.add(currentVrm.scene);
    currentVrm.scene.rotation.y = Math.PI;
    statusEl.innerText = "アバター読み込み完了！";
  });
});

// --- AI追跡 (FaceMesh) ---
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (currentVrm && res.multiFaceLandmarks?.[0]) {
    const landmarks = res.multiFaceLandmarks[0];
    const head = currentVrm.humanoid.getRawBoneNode('head');
    if (head) {
      head.rotation.set((landmarks[1].y - 0.5) * 1.5, (landmarks[1].x - 0.5) * -1.5, 0, 'XYZ');
    }
  }
  renderer.render(scene, camera);
});

// --- カメラ & 通信 ---
const peer = new Peer();
peer.on('open', (id) => { statusEl.innerText = `あなたのID: ${id}`; });

document.querySelector('#cam-btn')?.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play();
      const loop = async () => {
        await faceMesh.send({ image: video });
        requestAnimationFrame(loop);
      };
      loop();
    };
  } catch (err) {
    statusEl.innerText = "カメラの起動に失敗しました";
  }
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => window.location.reload());