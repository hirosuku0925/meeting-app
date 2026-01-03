import './style.css'
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as Kalidokit from 'kalidokit';
import { Peer, DataConnection } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'

// --- 1. UI構築（Scratchのようにカメラの上に重ねる構造） ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; flex-direction: column; align-items: center; background: #f0f2f5; padding: 20px; font-family: sans-serif;">
    <h1 style="margin-bottom: 20px;">キツネ会議室</h1>
    
    <div style="position: relative; width: 480px; height: 360px; background: #000; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
      <video id="hidden-video" style="width: 100%; height: 100%; object-fit: cover;" autoplay playsinline muted></video>
      <canvas id="local-canvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;"></canvas>
    </div>

    <div class="controls" style="margin-top: 20px; background: white; padding: 20px; border-radius: 15px; display: flex; flex-direction: column; gap: 10px; width: 440px;">
      <div style="display: flex; gap: 10px; justify-content: center;">
        <button id="avatar-mode-btn" style="background: #646cff; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">👤 アバター: ON</button>
        <button id="mic-btn" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">🎤 ON</button>
        <button id="hangup-btn" style="background: #f44336; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">退出</button>
      </div>
      <p id="status" style="font-size: 12px; color: #666; text-align: center;">ID準備中...</p>
      <div style="display: flex; gap: 10px;">
        <input id="remote-id-input" placeholder="相手のID" style="flex: 1; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
        <button id="connect-btn" style="background: #646cff; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer;">入室</button>
      </div>
    </div>
  </div>
`

// --- 2. 3Dシーン & カメラ設定（顔にピントを合わせる） ---
const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(35, 480 / 360, 0.1, 1000);
camera.position.set(0, 1.45, 0.65); // 顔の高さに合わせる

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0); // 背景を透明にする
renderer.setSize(480, 360);

const light = new THREE.DirectionalLight(0xffffff, 1.5);
light.position.set(1, 1, 1).normalize();
scene.add(light, new THREE.AmbientLight(0xffffff, 0.8));

let currentVrm: VRM | null = null;
let isAvatarMode = true;

const loader = new GLTFLoader();
loader.register((parser: any) => new VRMLoaderPlugin(parser));
loader.load('./キツネの顔.vrm', (gltf) => {
  const vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm);
  scene.add(vrm.scene);
  currentVrm = vrm;
  document.getElementById('status')!.innerText = "アバター準備完了";
});

// --- 3. 顔認識（追従バグ修正済み） ---
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (currentVrm && isAvatarMode && res.multiFaceLandmarks?.[0]) {
    const riggedFace = Kalidokit.Face.solve(res.multiFaceLandmarks[0], { runtime: 'mediapipe', video: video });
    if (riggedFace) {
      const head = currentVrm.humanoid.getRawBoneNode('head');
      const neck = currentVrm.humanoid.getRawBoneNode('neck');
      if (head && neck) {
        // 感度を上げて機敏に動くように設定
        head.rotation.y = riggedFace.head.y * 1.5;
        neck.rotation.y = riggedFace.head.y * 0.3;
        head.rotation.x = riggedFace.head.x;
        head.rotation.z = riggedFace.head.z;
      }
      currentVrm.expressionManager?.setValue('blink', 1 - riggedFace.eye.l);
      currentVrm.expressionManager?.setValue('aa', riggedFace.mouth.shape.A * 1.5);
    }
  }
  if (currentVrm) currentVrm.scene.visible = isAvatarMode;
  renderer.render(scene, camera);
});

// --- 4. PeerJS 通信 ---
const connections: Map<string, DataConnection> = new Map();
const peer = new Peer();
let processedStream: MediaStream = canvas.captureStream(30);

peer.on('open', (id) => document.getElementById('status')!.innerText = `あなたのID: ${id}`);

function setupConnection(conn: DataConnection) {
  if (connections.has(conn.peer)) return;
  connections.set(conn.peer, conn);
  conn.on('data', (data: any) => {
    if (data.type === 'sync') {
      data.members.forEach((mId: string) => { if (mId !== peer.id) connectTo(mId); });
    }
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
  document.body.appendChild(div); // 簡易表示
}

// --- 5. カメラ起動 & ループ ---
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  video.srcObject = stream;
  video.play();
  const loop = async () => {
    if (video.readyState >= 2) await faceMesh.send({ image: video });
    requestAnimationFrame(loop);
  };
  loop();
});

// --- 6. ボタン操作 ---
document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!.innerText = isAvatarMode ? "👤 アバター: ON" : "👤 アバター: OFF";
});
document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const id = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value;
  if (id) connectTo(id);
});