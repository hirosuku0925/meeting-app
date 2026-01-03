import './style.css'
import * as THREE from 'three';
// 💡 Addonsからインポートすることでパス解決を確実にします
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm';
import { FaceMesh } from '@mediapipe/face_mesh';

// --- 3Dシーンのセットアップ ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 480 / 360, 0.1, 20.0);
camera.position.set(0, 1.4, 1.5);

// 💡 ! と as で型を確定させます
const canvas = document.querySelector('#local-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
renderer.setSize(480, 360);
renderer.setPixelRatio(window.devicePixelRatio);

const light = new THREE.DirectionalLight(0xffffff, Math.PI);
light.position.set(1, 1, 1).normalize();
scene.add(light);

// --- VRMモデルの読み込み ---
let currentVrm: VRM | null = null; // 💡 型を指定
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

// publicフォルダに「キツネの顔.vrm」を置いている前提です
loader.load('/キツネの顔.vrm', (gltf) => {
  const vrm = gltf.userData.vrm as VRM;
  currentVrm = vrm;
  scene.add(vrm.scene);
  vrm.scene.rotation.y = Math.PI; 
});

// --- MediaPipe FaceMesh 設定 ---
// 💡 HTMLVideoElementとして取得
const video = document.querySelector('#hidden-video') as HTMLVideoElement;
const faceMesh = new FaceMesh({ 
  locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` 
});
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((res) => {
  if (currentVrm && res.multiFaceLandmarks?.[0]) {
    const s = res.multiFaceLandmarks[0];

    // 1. 首の回転連動
    const head = currentVrm.humanoid.getRawBoneNode('head');
    if (head) {
      head.rotation.y = (s[234].x - s[454].x) * 0.5;
      head.rotation.x = (s[10].y - s[152].y) * 0.5;
      head.rotation.z = Math.atan2(s[263].y - s[33].y, s[263].x - s[33].x);
    }

    // 2. まばたき連動
    const eyeScore = Math.abs(s[159].y - s[145].y);
    const blink = eyeScore < 0.015 ? 1 : 0;
    if (currentVrm.expressionManager) {
        currentVrm.expressionManager.setValue('blink', blink);
    }

    // 3. 口パク連動
    const mouthScore = Math.abs(s[13].y - s[14].y);
    if (currentVrm.expressionManager) {
        currentVrm.expressionManager.setValue('aa', Math.min(mouthScore * 10, 1.0));
    }

    currentVrm.update(1/30);
  }
  renderer.render(scene, camera);
});

// カメラ起動
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play();
        const loop = async () => {
          await faceMesh.send({ image: video });
          requestAnimationFrame(loop);
        };
        loop();
      };
    });
}