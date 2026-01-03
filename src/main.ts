import './style.css'
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'; 
import * as Kalidokit from 'kalidokit';
import { Peer, DataConnection } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'

// --- 1. UI構築 ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; flex-direction: column; align-items: center; background: #f0f2f5; padding: 20px; font-family: sans-serif; overflow-y: auto;">
    <h1 style="margin-bottom: 10px;">キツネ会議室</h1>
    
    <div style="position: relative; width: 480px; height: 360px; background: #000; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3); flex-shrink: 0;">
      <video id="hidden-video" style="width: 100%; height: 100%; object-fit: cover;" autoplay playsinline muted></video>
      <canvas id="local-canvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;"></canvas>
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
const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 480 / 360, 0.1, 1000);
camera.position.set(0, 1.45, 0.65); 

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0); 
renderer.setSize(480, 360);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const light = new THREE.DirectionalLight(0xffffff, 1.5);
light.position.set(1, 1, 1).normalize();
scene.add(light, new THREE.AmbientLight(0xffffff, 0.8));

let currentVrm: VRM | null = null;
let isAvatarMode = true;
let localStream: MediaStream;
let bgImage: HTMLImageElement | null = null; // 💡 追加：背景画像保持用

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));
loader.load('./キツネの顔.vrm', (gltf) => {
  const vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm); 
  scene.add(vrm.scene);
  currentVrm = vrm;
  document.getElementById('vrm-status')!.innerText = "アバター準備完了";
});

// --- 3. 顔認識・追従ロジック ---
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (currentVrm && isAvatarMode && res.multiFaceLandmarks?.[0]) {
    const landmarks = res.multiFaceLandmarks[0];
    const riggedFace = Kalidokit.Face.solve(landmarks, { runtime: 'mediapipe', video: video });
    
    if (riggedFace) {
      const head = currentVrm.humanoid.getRawBoneNode('head');
      const neck = currentVrm.humanoid.getRawBoneNode('neck');
      if (head && neck) {
        head.rotation.y = riggedFace.head.y * 1.5;
        neck.rotation.y = riggedFace.head.y * 0.3;
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
  if (currentVrm) currentVrm.scene.visible = isAvatarMode;
  renderer.render(scene, camera);
});

// --- 4. 💡 映像合成ロジック (黒背景＆画像反映対策) ---
const sendCanvas = document.createElement('canvas');
sendCanvas.width = 480;
sendCanvas.height = 360;
const sendCtx = sendCanvas.getContext('2d')!;

function compose() {
  // ① 背景をクリア
  sendCtx.clearRect(0, 0, 480, 360);
  
  // ② 💡 背景画像がある場合は画像を描画、なければビデオを描画
  if (bgImage) {
    sendCtx.drawImage(bgImage, 0, 0, 480, 360);
  } else {
    sendCtx.drawImage(video, 0, 0, 480, 360);
  }
  
  // ③ その上にアバターを描画
  sendCtx.drawImage(canvas, 0, 0, 480, 360);
  
  requestAnimationFrame(compose);
}
compose();

const peer = new Peer();
const connections: Map<string, DataConnection> = new Map();
let processedStream = sendCanvas.captureStream(30);

peer.on('open', (id) => document.getElementById('status')!.innerText = `あなたのID: ${id}`);

// --- 通信関連 (setupConnection, connectTo, addRemoteVideo) は以前と同じ ---
function setupConnection(conn: DataConnection) {
  if (connections.has(conn.peer)) return;
  connections.set(conn.peer, conn);
  conn.on('close', () => {
    connections.delete(conn.peer);
    document.getElementById(`remote-${conn.peer}`)?.remove();
  });
}

function connectTo(id: string) {
  if (connections.has(id) || id === peer.id) return;
  const conn = peer.connect(id);
  setupConnection(conn);
  const call = peer.call(id, processedStream);
  call.on('stream', (s) => addRemoteVideo(s, id));
}

peer.on('connection', setupConnection);
peer.on('call', (call) => {
  call.answer(processedStream);
  call.on('stream', (s) => addRemoteVideo(s, call.peer));
});

function addRemoteVideo(stream: MediaStream, remoteId: string) {
  if (document.getElementById(`remote-${remoteId}`)) return;
  const div = document.createElement('div');
  div.id = `remote-${remoteId}`;
  const v = document.createElement('video');
  v.style.width = "200px"; v.style.borderRadius = "10px"; v.autoplay = true; v.playsInline = true;
  v.srcObject = stream;
  div.appendChild(v);
  document.getElementById('video-grid')!.appendChild(div);
}

// --- 5. メインループ ---
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

// --- 6. 💡 背景画像選択の修正 ---
document.querySelector('#bg-upload')?.addEventListener('change', (e: any) => {
  const file = e.target.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    // 画面表示用のビデオ背景も変更
    video.style.backgroundImage = `url(${url})`;
    video.style.backgroundSize = "cover";
    video.style.backgroundColor = "transparent";
    
    // 💡 合成用に画像オブジェクトを作成
    const img = new Image();
    img.onload = () => { bgImage = img; };
    img.src = url;
  }
});

// その他のボタンイベント
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
document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!.style.background = isAvatarMode ? "#646cff" : "#555";
});
document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const id = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value.trim();
  if (id) connectTo(id);
});
document.querySelector('#hangup-btn')?.addEventListener('click', () => window.location.reload());