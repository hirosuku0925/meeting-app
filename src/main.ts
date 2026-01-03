import './style.css'
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Peer } from 'peerjs';

// --- 1. 画面表示(UI)の作成 ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; overflow: hidden; background: #f0f2f5;">
    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333; margin-bottom: 20px;">VRMマルチ会議室</h1>
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; padding: 10px; width: 100%;">
        <div id="local-container" style="text-align: center;">
          <p style="font-size: 12px; color: #666; margin-bottom: 5px;">自分</p>
          <canvas id="local-canvas" width="480" height="360" style="width: 260px; border: 3px solid #646cff; border-radius: 15px; background: #222; box-shadow: 0 8px 16px rgba(0,0,0,0.2);"></canvas>
        </div>
      </div>
      <div class="card" style="width: 100%; max-width: 500px; margin-top: 20px; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
        <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 15px; flex-wrap: wrap;">
          <button id="mic-btn" style="background-color: #4CAF50; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer; min-width: 100px;">🎤 マイク: ON</button>
          <button id="cam-btn" style="background-color: #4CAF50; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer; min-width: 100px;">📷 カメラ: ON</button>
          <button id="avatar-mode-btn" style="background-color: #646cff; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer; min-width: 100px;">👤 アバター: ON</button>
          <button id="hangup-btn" style="background-color: #f44336; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">退出</button>
        </div>
        <p id="status" style="font-size: 11px; color: #1976D2; font-weight: bold; text-align:center; margin-top:10px;">ID取得中...</p>
        <div style="display: flex; gap: 10px; margin-top:10px;">
             <input id="remote-id-input" type="text" placeholder="相手のID" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
             <button id="connect-btn" style="flex: 1; background-color: #646cff; color: white; border-radius: 5px; border:none; cursor:pointer;">入室</button>
        </div>
      </div>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`;

// --- 2. 状態管理変数 ---
let isAvatarMode = true;
let isMicOn = true;
let isCamOn = true;
let currentVrm: VRM | null = null;
let localRawStream: MediaStream;
let processedStream: MediaStream;

// --- 3. 3Dシーン設定 ---
const canvas = document.querySelector('#local-canvas') as HTMLCanvasElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 480 / 360, 0.1, 20.0);
camera.position.set(0, 1.4, 1.5);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(480, 360);
const light = new THREE.DirectionalLight(0xffffff, Math.PI);
light.position.set(1, 1, 1).normalize();
scene.add(light);

// --- 4. VRMモデルの読み込み ---
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));
// 💡 public/fox_face.vrm を読み込む
loader.load('/fox_face.vrm', (gltf) => {
  currentVrm = gltf.userData.vrm;
  if (currentVrm) {
    scene.add(currentVrm.scene);
    currentVrm.scene.rotation.y = Math.PI;
  }
});

// --- 5. MediaPipe FaceMesh 設定 ---
const video = document.querySelector('#hidden-video') as HTMLVideoElement;
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (currentVrm) {
    currentVrm.scene.visible = (isAvatarMode && isCamOn);
  }

  if (isCamOn && isAvatarMode && currentVrm && res.multiFaceLandmarks?.[0]) {
    const s = res.multiFaceLandmarks[0];
    const head = currentVrm.humanoid.getRawBoneNode('head');
    if (head) {
      head.rotation.y = (s[234].x - s[454].x) * 0.5;
      head.rotation.x = (s[10].y - s[152].y) * 0.5;
      head.rotation.z = Math.atan2(s[263].y - s[33].y, s[263].x - s[33].x);
    }
    if (currentVrm.expressionManager) {
      const eyeScore = Math.abs(s[159].y - s[145].y);
      currentVrm.expressionManager.setValue('blink', eyeScore < 0.012 ? 1 : 0);
      const mouthScore = Math.abs(s[13].y - s[14].y);
      currentVrm.expressionManager.setValue('aa', Math.min(mouthScore * 12, 1.0));
    }
    currentVrm.update(1/30);
  }
  renderer.render(scene, camera);
});

// --- 6. 通信 (PeerJS) 設定 ---
const peer = new Peer();
const statusEl = document.querySelector('#status') as HTMLElement;
peer.on('open', (id) => statusEl.innerText = `あなたのID: ${id}`);

function addRemoteVideo(stream: MediaStream, remoteId: string) {
  if (document.getElementById(`remote-${remoteId}`)) return;
  const div = document.createElement('div');
  div.id = `remote-${remoteId}`;
  div.style.textAlign = "center";
  div.innerHTML = `
    <p style="font-size:10px; color:#666;">User: ${remoteId.slice(0,4)}</p>
    <video id="v-${remoteId}" style="width:260px; border-radius:15px; background:#222;" autoplay playsinline></video>
  `;
  document.querySelector('#video-grid')!.appendChild(div);
  const v = document.getElementById(`v-${remoteId}`) as HTMLVideoElement;
  v.srcObject = stream;
}

peer.on('call', (call) => {
  call.answer(processedStream);
  call.on('stream', (s) => addRemoteVideo(s, call.peer));
});

// --- 7. カメラ起動と加工ストリーム作成 ---
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localRawStream = stream;
  video.srcObject = stream;
  
  // キャンバスの映像を抽出して音声と合成
  processedStream = canvas.captureStream(30);
  stream.getAudioTracks().forEach(t => processedStream.addTrack(t));
  
  video.onloadedmetadata = () => {
    video.play();
    const loop = async () => {
      if (isCamOn) await faceMesh.send({ image: video });
      requestAnimationFrame(loop);
    };
    loop();
  };
});

// --- 8. イベントリスナー ---
document.querySelector('#mic-btn')?.addEventListener('click', () => {
  isMicOn = !isMicOn;
  localRawStream.getAudioTracks().forEach(t => t.enabled = isMicOn);
  const btn = document.querySelector<HTMLButtonElement>('#mic-btn')!;
  btn.innerText = isMicOn ? "🎤 マイク: ON" : "🎤 マイク: OFF";
  btn.style.backgroundColor = isMicOn ? "#4CAF50" : "#f44336";
});

document.querySelector('#cam-btn')?.addEventListener('click', () => {
  isCamOn = !isCamOn;
  localRawStream.getVideoTracks().forEach(t => t.enabled = isCamOn);
  const btn = document.querySelector<HTMLButtonElement>('#cam-btn')!;
  btn.innerText = isCamOn ? "📷 カメラ: ON" : "📷 カメラ: OFF";
  btn.style.backgroundColor = isCamOn ? "#4CAF50" : "#f44336";
});

document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  const btn = document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!;
  btn.innerText = isAvatarMode ? "👤 アバター: ON" : "👤 アバター: OFF";
  btn.style.backgroundColor = isAvatarMode ? "#646cff" : "#555";
});

document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const idInput = document.querySelector('#remote-id-input') as HTMLInputElement;
  const id = idInput.value;
  if (id) {
    const call = peer.call(id, processedStream);
    call.on('stream', (s) => addRemoteVideo(s, id));
  }
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());