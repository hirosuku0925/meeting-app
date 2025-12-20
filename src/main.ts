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
        <button id="avatar-mode-btn" style="background-color: #555;">アバター: OFF</button>
        <button id="hangup-btn" style="background-color: #f44336;">退出</button>
      </div>
      
      <div style="background: #f0f0f0; padding: 10px; border-radius: 8px; font-size: 12px; display: flex; flex-direction: column; gap: 8px; text-align: left;">
        <strong>アバター設定（PNG推奨）:</strong>
        <label>👤 通常の顔：<input type="file" id="avatar-close" accept="image/*"></label>
        <label>😮 口を開けた顔：<input type="file" id="avatar-open" accept="image/*"></label>
      </div>
      
      <div style="margin-top: 15px;">
        <input id="remote-id-input" type="text" placeholder="相手のIDを入力" style="padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
        <button id="connect-btn" style="margin-left: 5px;">接続</button>
      </div>
      <p id="status" style="font-size: 14px; color: #666;">ID取得中...</p>
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
let localStream: MediaStream;

// --- FaceMesh (AI) の設定 ---
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

  // 1. 背景としてカメラ映像を常に描画（黒画面防止）
  if (results.image) {
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  }

  // 2. 顔が検知されている場合の処理
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];

    if (isAvatarMode && imgClose) {
      // 背景を塗りつぶしたい場合はここを有効に（今は透過で重ねる設定）
      // ctx.fillStyle = "#222"; 
      // ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 口の開き具合判定（上下の唇の距離）
      const topLip = landmarks[13];
      const bottomLip = landmarks[14];
      const distance = Math.sqrt(Math.pow(topLip.x - bottomLip.x, 2) + Math.pow(topLip.y - bottomLip.y, 2));
      const isMouthOpen = distance > 0.025;

      // 顔の座標計算
      const faceLeft = landmarks[234].x * canvas.width;
      const faceRight = landmarks[454].x * canvas.width;
      const faceTop = landmarks[10].y * canvas.height;
      const faceBottom = landmarks[152].y * canvas.height;
      
      const scale = 2.8; // アバターのサイズ（顔より少し大きく）
      const width = (faceRight - faceLeft) * scale;
      const height = (faceBottom - faceTop) * scale;
      const centerX = (faceLeft + faceRight) / 2 - width / 2;
      const centerY = (faceTop + faceBottom) / 2 - height / 2;

      // 画像の切り替え（口パク）
      const targetImg = (isMouthOpen && imgOpen) ? imgOpen : imgClose;
      ctx.drawImage(targetImg, centerX, centerY, width, height);
    }
  } else if (!isCameraOn) {
    // カメラOFFかつ顔未検知なら真っ黒
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.restore();
});

// --- カメラの開始 ---
navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: true }).then(stream => {
  localStream = stream;
  video.srcObject = stream;
  video.onloadedmetadata = () => {
    video.play();
    const predict = async () => {
      if (isCameraOn) {
        await faceMesh.send({ image: video });
      }
      requestAnimationFrame(predict);
    };
    predict();
  };
}).catch(err => console.error("カメラの起動に失敗しました:", err));

// --- 画像アップロード設定 ---
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

// --- ボタンイベント ---
document.querySelector('#camera-btn')?.addEventListener('click', () => {
  isCameraOn = !isCameraOn;
  if (localStream) localStream.getVideoTracks()[0].enabled = isCameraOn;
  const btn = document.querySelector<HTMLButtonElement>('#camera-btn')!;
  btn.innerText = isCameraOn ? "カメラ: ON" : "カメラ: OFF";
  btn.style.backgroundColor = isCameraOn ? "#2196F3" : "#f44336";
});

document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  const btn = document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!;
  btn.innerText = isAvatarMode ? "アバター: ON" : "アバター: OFF";
  btn.style.backgroundColor = isAvatarMode ? "#FFC107" : "#555";
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => {
  window.location.reload();
});

// --- PeerJS (通信) 設定 ---
const peer = new Peer();
const statusEl = document.querySelector<HTMLElement>('#status');

peer.on('open', (id: string) => {
  if (statusEl) statusEl.innerText = `あなたのID: ${id}`;
});

// 相手からの着信処理
peer.on('call', (call) => {
  const processedStream = canvas.captureStream(25);
  localStream.getAudioTracks().forEach(track => processedStream.addTrack(track));
  call.answer(processedStream);
  setupRemoteVideo(call);
});

// 自分から接続
document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const remoteId = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value;
  if (!remoteId) return alert("IDを入力してください");
  
  const processedStream = canvas.captureStream(25);
  localStream.getAudioTracks().forEach(track => processedStream.addTrack(track));
  const call = peer.call(remoteId, processedStream);
  setupRemoteVideo(call);
});

function setupRemoteVideo(call: any) {
  call.on('stream', (stream: MediaStream) => {
    const videoGrid = document.querySelector('#video-grid')!;
    const remoteVideo = document.createElement('video');
    remoteVideo.style.width = "300px";
    remoteVideo.style.borderRadius = "10px";
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;
    remoteVideo.srcObject = stream;
    videoGrid.appendChild(remoteVideo);
  });
}