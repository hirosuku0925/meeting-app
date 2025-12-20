import './style.css'
import { Peer } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>oVice風 バーチャルアバター会議室</h1>
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
        <strong>oViceアバター設定:</strong>
        <input type="text" id="user-name-input" placeholder="表示名を入力" value="User Name" style="padding: 5px; border-radius: 4px; border: 1px solid #ccc;">
        <label>👤 通常（真顔）：<input type="file" id="avatar-close" accept="image/*"></label>
        <label>😮 発話（口開）：<input type="file" id="avatar-open" accept="image/*"></label>
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
const nameInput = document.querySelector<HTMLInputElement>('#user-name-input')!;

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

  // 1. 背景描画（常にカメラ映像を出す）
  if (results.image) {
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  }

  // 2. 顔認識時のアバター描画
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];

    if (isAvatarMode && imgClose) {
      // 角度計算
      const leftEye = landmarks[33];
      const rightEye = landmarks[263];
      const angle = Math.atan2((rightEye.y - leftEye.y) * canvas.height, (rightEye.x - leftEye.x) * canvas.width);

      // 口の開き（発話判定）
      const topLip = landmarks[13];
      const bottomLip = landmarks[14];
      const dist = Math.sqrt(Math.pow(topLip.x - bottomLip.x, 2) + Math.pow(topLip.y - bottomLip.y, 2));
      const isMouthOpen = dist > 0.025;

      // 位置とサイズ
      const centerX = landmarks[1].x * canvas.width;
      const centerY = landmarks[1].y * canvas.height;
      const faceLeft = landmarks[234].x * canvas.width;
      const faceRight = landmarks[454].x * canvas.width;
      const radius = ((faceRight - faceLeft) * 1.8) / 2;

      // --- oVice風：発話リング ---
      if (isMouthOpen) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      // --- oVice風：円形クリッピング描画 ---
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.clip();
      
      ctx.translate(centerX, centerY);
      ctx.rotate(angle);
      
      const targetImg = (isMouthOpen && imgOpen) ? imgOpen : imgClose;
      ctx.drawImage(targetImg, -radius, -radius, radius * 2, radius * 2);
      ctx.restore();

      // --- oVice風：ネームタグ ---
      const userName = nameInput.value || "User";
      ctx.font = "bold 14px sans-serif";
      const tw = ctx.measureText(userName).width;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(centerX - (tw+16)/2, centerY + radius + 8, tw+16, 22, 11);
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.textAlign = "center";
      ctx.fillText(userName, centerX, centerY + radius + 24);
    }
  } else if (!isCameraOn) {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.restore();
});

// --- カメラ制御 ---
navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: true }).then(stream => {
  localStream = stream;
  video.srcObject = stream;
  video.onloadedmetadata = () => {
    video.play();
    const predict = async () => {
      if (isCameraOn) await faceMesh.send({ image: video });
      requestAnimationFrame(predict);
    };
    predict();
  };
});

// --- 画像アップロード ---
const setupUpload = (id: string, cb: (img: HTMLImageElement) => void) => {
  document.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const img = new Image();
      img.onload = () => cb(img);
      img.src = URL.createObjectURL(file);
    }
  });
};
setupUpload('avatar-close', (img) => imgClose = img);
setupUpload('avatar-open', (img) => imgOpen = img);

// --- ボタン・通信処理 ---
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

document.querySelector('#hangup-btn')?.addEventListener('click', () => window.location.reload());

const peer = new Peer();
peer.on('open', (id) => {
  const statusEl = document.querySelector<HTMLElement>('#status');
  if (statusEl) statusEl.innerText = `あなたのID: ${id}`;
});

peer.on('call', (call) => {
  const processedStream = canvas.captureStream(25);
  localStream.getAudioTracks().forEach(track => processedStream.addTrack(track));
  call.answer(processedStream);
  setupRemoteVideo(call);
});

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