import './style.css'
import { FaceMesh } from '@mediapipe/face_mesh'
import * as THREE from 'three';
// 最新の書き方に変更しました
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; overflow: hidden; background: #f0f2f5;">
    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333; margin-bottom: 20px;">きつね顔アバター会議</h1>
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; width: 100%;">
        <canvas id="local-canvas" width="480" height="360" style="width: 280px; border: 3px solid #646cff; border-radius: 15px; background: #222;"></canvas>
      </div>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;

// --- 3D Scene 設定 ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 480 / 360, 0.1, 20);
camera.position.set(0, 1.45, 0.8); // 顔の高さに調整

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(480, 360);

let currentVrm: any = null;
const loader = new GLTFLoader();

// 型エラー（any）が出ないように書き直しました
loader.register((parser: any) => new VRMLoaderPlugin(parser));

loader.load(
  '/fox_face.vrm', // publicフォルダにあるファイル名と合わせてね
  (gltf: any) => {
    const vrm = gltf.userData.vrm;
    scene.add(vrm.scene);
    currentVrm = vrm;
    vrm.scene.rotation.y = Math.PI; // 正面を向ける
  },
  undefined,
  (error) => console.error(error)
);

// --- AI (MediaPipe) で顔を追跡 ---
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (currentVrm && res.multiFaceLandmarks?.[0]) {
    const landmarks = res.multiFaceLandmarks[0];
    const head = currentVrm.humanoid.getRawBoneNode('head');
    if (head) {
      // 顔の傾きを計算して3Dモデルに伝える
      const yaw = (landmarks[1].x - 0.5) * -1.5; 
      const pitch = (landmarks[1].y - 0.5) * 1.5;
      head.rotation.set(pitch, yaw, 0, 'XYZ');
    }
  }
  renderer.render(scene, camera);
});

// --- カメラ開始 ---
navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
  video.srcObject = stream;
  const loop = async () => {
    await faceMesh.send({ image: video });
    requestAnimationFrame(loop);
  };
  loop();
});