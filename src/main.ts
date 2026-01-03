import './style.css'
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as Kalidokit from 'kalidokit';
import { Peer, DataConnection } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'

// --- 1. UIの構築 (元のデザインを完全にそのまま維持) ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; overflow: hidden; background: #f0f2f5;">
    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333; margin-bottom: 20px;">マルチ会議室 (VRM対応版)</h1>
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; padding: 10px; width: 100%;">
        <div id="local-container" style="text-align: center;">
          <p style="font-size: 12px; color: #666; margin-bottom: 5px;">自分</p>
          <canvas id="local-canvas" width="480" height="360" style="width: 260px; border: 3px solid #646cff; border-radius: 15px; background: #222; box-shadow: 0 8px 16px rgba(0,0,0,0.2);"></canvas>
        </div>
      </div>
      <div class="card" style="width: 100%; max-width: 500px; margin-top: 20px; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
        <div style="background: #f8f9fa; padding: 15px; border-radius: 12px; margin-bottom: 15px; text-align: left;">
          <div style="margin-bottom: 10px;">
            <label style="font-size: 11px; font-weight: bold; color: #1976D2;">🏞 背景画像</label>
            <input type="file" id="bg-upload" accept="image/*" style="width: 100%; font-size: 10px; margin-top: 5px;">
          </div>
          <div>
            <label style="font-size: 11px; font-weight: bold; color: #646cff;">👤 3Dアバター状態</label>
            <p style="font-size: 10px; color: #666;">キツネの顔.vrm 読み込み中...</p>
          </div>
        </div>
        <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 15px;">
          <button id="avatar-mode-btn" style="background-color: #555; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">👤 アバター: OFF</button>
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
`

// --- 2. 3Dシーン & VRM設定 ---
const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#f0f2f5'); 
const camera = new THREE.PerspectiveCamera(30, canvas.width / canvas.height, 0.1, 1000);
camera.position.set(0, 1.45, 0.75);

const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
renderer.setSize(canvas.width, canvas.height);

const light = new THREE.DirectionalLight(0xffffff);
light.position.set(1, 1, 1).normalize();
scene.add(light, new THREE.AmbientLight(0xffffff, 0.5));

let currentVrm: VRM | null = null;
let isAvatarMode = false;

// VRMロード
const loader = new GLTFLoader();
loader.register((parser: any) => new VRMLoaderPlugin(parser));
loader.load('./キツネの顔.vrm', (gltf: any) => {
  const vrm: VRM = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm);
  scene.add(vrm.scene);
  currentVrm = vrm;
  vrm.scene.visible = false;
});

// --- 3. アニメーション & AI ---
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (currentVrm) {
    currentVrm.scene.visible = isAvatarMode;
    if (isAvatarMode && res.multiFaceLandmarks?.[0]) {
      const riggedFace = Kalidokit.Face.solve(res.multiFaceLandmarks[0], { runtime: 'mediapipe', video: video });
      if (riggedFace) {
        const head = currentVrm.humanoid.getRawBoneNode('head');
        if (head) {
          head.rotation.y = riggedFace.head.y;
          head.rotation.x = riggedFace.head.x;
          head.rotation.z = riggedFace.head.z;
        }
        currentVrm.expressionManager?.setValue('blink', 1 - riggedFace.eye.l);
        currentVrm.expressionManager?.setValue('aa', riggedFace.mouth.shape.A);
      }
    }
  }
  renderer.render(scene, camera);
});

// --- 4. 通信ロジック (維持) ---
const connections: Map<string, DataConnection> = new Map();
const peer = new Peer();
let processedStream: MediaStream = canvas.captureStream(30);

peer.on('open', (id) => statusEl.innerText = `あなたのID: ${id}`);

function addRemoteVideo(stream: MediaStream, remoteId: string) {
  if (document.getElementById(`remote-${remoteId}`)) return;
  const div = document.createElement('div');
  div.id = `remote-${remoteId}`;
  div.style.textAlign = "center";
  div.innerHTML = `<p style="font-size:10px; color:#666; margin-bottom:5px;">User: ${remoteId.slice(0,4)}</p>`;
  const v = document.createElement('video');
  v.style.width = "260px"; v.style.borderRadius = "15px"; v.autoplay = true; v.srcObject = stream;
  div.appendChild(v);
  document.querySelector('#video-grid')!.appendChild(div);
}

function setupConnection(conn: DataConnection) {
  if (connections.has(conn.peer)) return;
  connections.set(conn.peer, conn);
  conn.on('open', () => {
    const members = Array.from(connections.keys()).concat(peer.id);
    conn.send({ type: 'sync-members', members });
  });
  conn.on('data', (data: any) => {
    if (data.type === 'sync-members') {
      data.members.forEach((mId: string) => {
        if (mId !== peer.id && !connections.has(mId)) connectTo(mId);
      });
    }
  });
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

navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  video.srcObject = stream;
  video.play();
  stream.getAudioTracks().forEach(t => processedStream.addTrack(t));
  const loop = async () => {
    if (video.readyState >= 2) await faceMesh.send({ image: video });
    requestAnimationFrame(loop);
  };
  loop();
});

// --- 5. UIボタン操作の維持 ---
document.querySelector('#bg-upload')?.addEventListener('change', (e: any) => {
  const f = e.target.files[0]; if (!f) return;
  new THREE.TextureLoader().load(URL.createObjectURL(f), (texture) => {
    scene.background = texture;
  });
});

document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  const btn = document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!;
  btn.innerText = isAvatarMode ? "👤 アバター: ON" : "👤 アバター: OFF";
  btn.style.backgroundColor = isAvatarMode ? "#646cff" : "#555";
});

document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const id = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value.trim();
  if (id) connectTo(id);
});
document.querySelector('#hangup-btn')?.addEventListener('click', () => window.location.reload());