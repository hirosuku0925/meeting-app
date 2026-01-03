import './style.css'
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'; 
import * as Kalidokit from 'kalidokit';
import { Peer } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'

// --- 1. UI構築 ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; flex-direction: column; align-items: center; background: #f0f2f5; padding: 20px; font-family: sans-serif; overflow-y: auto;">
    <h1 style="margin-bottom: 10px;">キツネ会議室</h1>
    
    <div style="position: relative; width: 480px; height: 360px; background: #000; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3); flex-shrink: 0;">
      <canvas id="final-canvas" style="width: 100%; height: 100%; object-fit: cover;"></canvas>
      <video id="hidden-video" style="display:none;" autoplay playsinline muted></video>
      <canvas id="vrm-canvas" style="display:none;"></canvas>
    </div>

    <div class="card" style="margin-top: 20px; background: white; padding: 20px; border-radius: 16px; width: 440px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
      <div style="background: #f8f9fa; padding: 12px; border-radius: 10px; margin-bottom: 15px;">
        <label style="font-size: 11px; font-weight: bold; color: #1976D2;">🏞 背景画像を選択</label>
        <input type="file" id="bg-upload" accept="image/*" style="width: 100%; font-size: 11px; margin-top: 5px;">
        <p id="vrm-status" style="font-size: 10px; color: #666; margin-top: 5px;">アバター読み込み中...</p>
      </div>

      <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 15px;">
        <button id="mic-btn" style="background: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer;">🎤 ON</button>
        <button id="cam-btn" style="background: #4CAF50; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer;">📷 ON</button>
        <button id="avatar-mode-btn" style="background: #646cff; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer;">👤 アバター: ON</button>
        <button id="hangup-btn" style="background: #f44336; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer;">退出</button>
      </div>

      <p id="status" style="font-size: 11px; color: #1976D2; font-weight: bold; text-align:center;">ID取得中...</p>
      
      <div style="display: flex; gap: 8px;">
        <input id="remote-id-input" placeholder="相手のIDを入力" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
        <button id="connect-btn" style="flex: 1; background: #646cff; color: white; border: none; border-radius: 5px; cursor: pointer;">入室</button>
      </div>
    </div>
    <div id="video-grid" style="display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; justify-content: center;"></div>
  </div>
`

// --- 2. 3D & VRM 設定 ---
const vrmCanvas = document.querySelector<HTMLCanvasElement>('#vrm-canvas')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 480 / 360, 0.1, 1000);
camera.position.set(0, 1.45, 0.65); 

const renderer = new THREE.WebGLRenderer({ canvas: vrmCanvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0); 
renderer.setSize(480, 360);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const light = new THREE.DirectionalLight(0xffffff, 1.5);
light.position.set(1, 1, 1).normalize();
scene.add(light, new THREE.AmbientLight(0xffffff, 0.8));

let currentVrm: VRM | null = null;
let isAvatarMode = true;
let localStream: MediaStream;
let bgImage: HTMLImageElement | null = null;

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));
loader.load('./キツネの顔.vrm', (gltf) => {
  const vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm); 
  scene.add(vrm.scene);
  currentVrm = vrm;
  document.getElementById('vrm-status')!.innerText = "アバター準備完了";
});

// --- 3. 顔認識と表情・追従 ---
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (currentVrm && isAvatarMode && res.multiFaceLandmarks?.[0]) {
    const landmarks = res.multiFaceLandmarks[0];
    const riggedFace = Kalidokit.Face.solve(landmarks, { runtime: 'mediapipe', video: video });
    
    if (riggedFace) {
      const head = currentVrm.humanoid.getRawBoneNode('head');
      if (head) {
        head.rotation.y = riggedFace.head.y * 1.5;
        head.rotation.x = riggedFace.head.x;
        head.rotation.z = riggedFace.head.z;
      }
      const nose = landmarks[1];
      currentVrm.scene.position.x = -(nose.x - 0.5) * 0.55; 
      currentVrm.scene.position.y = -(nose.y - 0.5) * 0.45;

      currentVrm.expressionManager?.setValue('blink', 1 - riggedFace.eye.l);
      currentVrm.expressionManager?.setValue('aa', riggedFace.mouth.shape.A * 1.5);
    }
  }
  renderer.render(scene, camera);
});

// --- 4. 映像合成ロジック ---
const finalCanvas = document.querySelector<HTMLCanvasElement>('#final-canvas')!;
finalCanvas.width = 480;
finalCanvas.height = 360;
const finalCtx = finalCanvas.getContext('2d')!;

function compose() {
  finalCtx.clearRect(0, 0, 480, 360);
  if (bgImage) {
    finalCtx.drawImage(bgImage, 0, 0, 480, 360);
  } else {
    finalCtx.drawImage(video, 0, 0, 480, 360);
  }
  if (isAvatarMode && currentVrm) {
    finalCtx.drawImage(vrmCanvas, 0, 0, 480, 360);
  }
  requestAnimationFrame(compose);
}
compose();

// --- 5. 通信 (PeerJS) ---
const peer = new Peer();
const processedStream = finalCanvas.captureStream(30);

peer.on('open', (id) => document.getElementById('status')!.innerText = `あなたのID: ${id}`);
peer.on('call', (call) => {
  call.answer(processedStream);
  call.on('stream', (s) => addRemoteVideo(s, call.peer));
});

function connectTo(id: string) {
  const call = peer.call(id, processedStream);
  call.on('stream', (s) => addRemoteVideo(s, id));
}

function addRemoteVideo(stream: MediaStream, remoteId: string) {
  if (document.getElementById(`remote-${remoteId}`)) return;
  const v = document.createElement('video');
  v.id = `remote-${remoteId}`;
  v.style.width = "200px"; v.style.borderRadius = "10px"; v.autoplay = true; v.playsInline = true;
  v.srcObject = stream;
  document.getElementById('video-grid')!.appendChild(v);
}

// --- 6. メインループ開始 ---
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localStream = stream;
  video.srcObject = stream;
  video.play();
  stream.getAudioTracks().forEach(t => processedStream.addTrack(t));

  const loop = async () => {
    if (video.readyState >= 2) await faceMesh.send({ image: video });
    requestAnimationFrame(loop);
  };
  loop();
});

// --- 7. イベント設定 ---
document.querySelector('#bg-upload')?.addEventListener('change', (e: any) => {
  const file = e.target.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { bgImage = img; };
    img.src = url;
  }
});

document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  const btn = document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!;
  btn.innerText = isAvatarMode ? "👤 アバター: ON" : "👤 アバター: OFF";
  btn.style.background = isAvatarMode ? "#646cff" : "#555";
});

document.querySelector('#mic-btn')?.addEventListener('click', () => {
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  document.querySelector<HTMLButtonElement>('#mic-btn')!.style.background = track.enabled ? "#4CAF50" : "#f44336";
});

document.querySelector('#cam-btn')?.addEventListener('click', () => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  document.querySelector<HTMLButtonElement>('#cam-btn')!.style.background = track.enabled ? "#4CAF50" : "#f44336";
});

document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const id = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value.trim();
  if (id) connectTo(id);
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => window.location.reload());