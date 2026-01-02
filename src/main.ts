import './style.css'
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import * as Kalidokit from 'kalidokit';
import { Peer } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'

// --- 1. UIの構築 ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; overflow: hidden; background: #f0f2f5;">
    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333; margin-bottom: 20px;">キツネ会議室</h1>
      
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; padding: 10px; width: 100%;">
        <div id="local-container" style="text-align: center;">
          <p style="font-size: 12px; color: #666; margin-bottom: 5px;">自分 (3Dキツネ)</p>
          <canvas id="local-canvas" width="480" height="360" style="width: 280px; border: 3px solid #646cff; border-radius: 15px; background: #222; box-shadow: 0 8px 16px rgba(0,0,0,0.2);"></canvas>
        </div>
      </div>

      <div class="card" style="width: 100%; max-width: 500px; margin-top: 20px; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
        <div style="background: #e3f2fd; padding: 12px; border-radius: 10px; margin-bottom: 15px; text-align: left; border: 1px solid #bbdefb;">
          <label style="font-size: 11px; font-weight: bold; color: #1976D2;">🏞 背景画像を選択</label>
          <input type="file" id="bg-upload" accept="image/*" style="width: 100%; font-size: 10px; margin-top: 5px;">
        </div>

        <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 15px;">
          <button id="mic-btn" style="background-color: #4CAF50; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">🎤</button>
          <button id="cam-btn" style="background-color: #4CAF50; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">📷</button>
          <button id="hangup-btn" style="background-color: #f44336; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">退出</button>
        </div>
        <p id="status" style="font-size: 11px; color: #1976D2; font-weight: bold; text-align:center;">ID取得中...</p>
        <div style="display: flex; gap: 10px; margin-top:10px;">
             <input id="remote-id-input" type="text" placeholder="相手のIDを入力" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
             <button id="connect-btn" style="flex: 1; background-color: #646cff; color: white; border-radius: 5px; border:none; cursor:pointer; font-weight:bold;">入室</button>
        </div>
      </div>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

// --- 2. 3Dシーン設定 ---
const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f0f2f5'); 

const camera = new THREE.PerspectiveCamera(30, canvas.width / canvas.height, 0.1, 1000);
camera.position.set(0, 1.45, 0.75); // キツネの顔の高さ

const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
renderer.setSize(canvas.width, canvas.height);
renderer.setPixelRatio(window.devicePixelRatio);

const light = new THREE.DirectionalLight(0xffffff);
light.position.set(1, 1, 1).normalize();
scene.add(light, new THREE.AmbientLight(0xffffff, 0.5));

// --- 3. VRM読み込みと背景変更ロジック ---
let currentVrm: VRM | null = null;
const loader = new GLTFLoader();
loader.register((parser: any) => new VRMLoaderPlugin(parser));

// ファイルパスを正しく設定（./キツネの顔.vrm）
loader.load('./キツネの顔.vrm', (gltf: any) => {
  const vrm: VRM = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm);
  scene.add(vrm.scene);
  currentVrm = vrm;
}, undefined, (error) => console.error("VRMの読み込みに失敗:", error));

// 背景アップロード処理
document.querySelector('#bg-upload')?.addEventListener('change', (e: any) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  new THREE.TextureLoader().load(url, (texture) => {
    scene.background = texture;
  });
});

// --- 4. アニメーション (顔連動) ---
function animateVrm(faceLandmarks: any) {
  if (!currentVrm || !faceLandmarks) return;
  
  const riggedFace = Kalidokit.Face.solve(faceLandmarks, {
    runtime: 'mediapipe',
    video: video
  });

  if (riggedFace) {
    const head = currentVrm.humanoid.getRawBoneNode('head');
    if (head) {
      head.rotation.y = riggedFace.head.y;
      head.rotation.x = riggedFace.head.x;
      head.rotation.z = riggedFace.head.z;
    }
    // 表情（瞬き・口パク）
    currentVrm.expressionManager?.setValue('blink', 1 - riggedFace.eye.l);
    currentVrm.expressionManager?.setValue('aa', riggedFace.mouth.shape.A);
  }
}

// --- 5. 通信とカメラループ ---
const statusEl = document.querySelector<HTMLElement>('#status')!;
const peer = new Peer();
let processedStream: MediaStream = canvas.captureStream(30);

peer.on('open', (id) => statusEl.innerText = `あなたのID: ${id}`);
peer.on('call', (call) => {
  call.answer(processedStream);
  call.on('stream', (s) => addRemoteVideo(s, call.peer));
});

function addRemoteVideo(stream: MediaStream, remoteId: string) {
  if (document.getElementById(`remote-${remoteId}`)) return;
  const div = document.createElement('div');
  div.id = `remote-${remoteId}`;
  div.innerHTML = `<p style="font-size:10px; color:#666;">相手: ${remoteId.slice(0,4)}</p>`;
  const v = document.createElement('video');
  v.style.width = "280px"; v.style.borderRadius = "15px"; v.autoplay = true; v.playsInline = true;
  v.srcObject = stream;
  div.appendChild(v);
  document.querySelector('#video-grid')!.appendChild(div);
}

const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });
faceMesh.onResults((res) => {
  if (res.multiFaceLandmarks && res.multiFaceLandmarks[0]) {
    animateVrm(res.multiFaceLandmarks[0]);
  }
});

// カメラ起動とループ開始
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  video.srcObject = stream;
  // ビデオの読み込みを待ってからループ開始
  video.onloadedmetadata = () => {
    video.play();
    const loop = async () => {
      if (video.readyState >= 2) {
        await faceMesh.send({ image: video });
      }
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    loop();
  };
  stream.getAudioTracks().forEach(t => processedStream.addTrack(t));
}).catch(err => {
  console.error("カメラの起動に失敗しました:", err);
  alert("カメラを許可してください");
});

// イベント系
document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const id = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value.trim();
  if (id && id !== peer.id) {
    const call = peer.call(id, processedStream);
    call.on('stream', (s) => addRemoteVideo(s, id));
  }
});
document.querySelector('#hangup-btn')?.addEventListener('click', () => window.location.reload());