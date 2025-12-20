import './style.css'
import { Peer } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>AI顔追跡アバター会議室</h1>
    <div id="video-grid" style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; padding: 20px;">
      <canvas id="local-canvas" width="480" height="360" style="width: 300px; border: 2px solid #646cff; border-radius: 10px; background: #333;"></canvas>
    </div>
    <div class="card">
      <div style="display: flex; gap: 5px; flex-wrap: wrap; justify-content: center; margin-bottom: 10px;">
        <button id="camera-btn" style="background-color: #2196F3;">カメラ: ON</button>
        <button id="avatar-mode-btn" style="background-color: #FFC107;">アバター: OFF</button>
        <button id="hangup-btn" style="background-color: #f44336;">退出</button>
      </div>
      <div style="background: #f0f0f0; padding: 10px; border-radius: 8px; font-size: 12px; display: flex; flex-direction: column; gap: 5px;">
        <label>👤 通常の顔画像：<input type="file" id="avatar-close" accept="image/*"></label>
        <label>😮 口を開けた画像：<input type="file" id="avatar-open" accept="image/*"></label>
      </div>
      <p id="status">ID取得中...</p>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
let isCameraOn = true;
let isAvatarMode = false;
let imgClose: HTMLImageElement | null = null;
let imgOpen: HTMLImageElement | null = null;
let localStream: MediaStream; // 追加

// 顔認識AI（FaceMesh）の設定
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults((results) => {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];

    // 口の開き具合を判定
    const topLip = landmarks[13];
    const bottomLip = landmarks[14];
    const distance = Math.sqrt(Math.pow(topLip.x - bottomLip.x, 2) + Math.pow(topLip.y - bottomLip.y, 2));
    const isMouthOpen = distance > 0.02;

    if (isAvatarMode && imgClose) {
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const faceLeft = landmarks[234].x * canvas.width;
      const faceRight = landmarks[454].x * canvas.width;
      const faceTop = landmarks[10].y * canvas.height;
      const faceBottom = landmarks[152].y * canvas.height;
      
      const width = (faceRight - faceLeft) * 2;
      const height = (faceBottom - faceTop) * 2;
      const centerX = (faceLeft + faceRight) / 2 - width / 2;
      const centerY = (faceTop + faceBottom) / 2 - height / 2;

      const targetImg = (isMouthOpen && imgOpen) ? imgOpen : imgClose;
      ctx.drawImage(targetImg, centerX, centerY, width, height);
    } else {
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    }
  } else {
    // 顔が見つからない時はビデオをそのまま出す（カメラOFFなら真っ暗）
    if (isCameraOn) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
  ctx.restore();
});

// カメラ開始
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localStream = stream;
  video.srcObject = stream;
  video.play();
  const predict = async () => {
    if (isCameraOn) {
      await faceMesh.send({ image: video });
    }
    requestAnimationFrame(predict);
  };
  predict();
});

// 画像アップロード
const setupUpload = (id: string, callback: (img: HTMLImageElement) => void) => {
  document.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const img = new Image();
      img.onload = () => callback(img);
      img.src = URL.createObjectURL(file);
    }
  });
};
setupUpload('avatar-close', (img) => imgClose = img);
setupUpload('avatar-open', (img) => imgOpen = img);

// カメラボタンの修正
document.querySelector('#camera-btn')?.addEventListener('click', () => {
  isCameraOn = !isCameraOn;
  localStream.getVideoTracks()[0].enabled = isCameraOn;
  const btn = document.querySelector<HTMLButtonElement>('#camera-btn')!;
  btn.innerText = isCameraOn ? "カメラ: ON" : "カメラ: OFF";
  btn.style.backgroundColor = isCameraOn ? "#2196F3" : "#f44336";
});

// アバターボタン
document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  const btn = document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!;
  btn.innerText = isAvatarMode ? "アバター: ON" : "アバター: OFF";
  btn.style.backgroundColor = isAvatarMode ? "#FFC107" : "#555";
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => window.location.reload());

// Peer処理の修正（エラー箇所）
const peer = new Peer();
peer.on('open', (id: string) => {
  const statusEl = document.querySelector<HTMLElement>('#status');
  if (statusEl) {
    statusEl.innerText = `あなたのID: ${id}`;
  }
});