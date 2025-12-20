import './style.css'
import { Peer } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1 style="color: #333; margin-bottom: 20px;">oVice風 バーチャルアバター会議室</h1>
    
    <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; padding: 10px;">
      <canvas id="local-canvas" width="480" height="360" style="width: 320px; border: 3px solid #646cff; border-radius: 15px; background: #222; box-shadow: 0 8px 16px rgba(0,0,0,0.2);"></canvas>
    </div>
    
    <div class="card" style="max-width: 500px; margin: 20px auto; padding: 25px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
      
      <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 20px; flex-wrap: wrap;">
        <button id="camera-btn" style="background-color: #2196F3; flex: 1; min-width: 100px; font-weight: bold; color: white;">📹 カメラ: ON</button>
        <button id="mic-btn" style="background-color: #4CAF50; flex: 1; min-width: 100px; font-weight: bold; color: white;">🎤 マイク: ON</button>
        <button id="avatar-mode-btn" style="background-color: #555; flex: 1; min-width: 100px; font-weight: bold; color: white;">👤 アバター: OFF</button>
        <button id="hangup-btn" style="background-color: #f44336; color: white; padding: 10px 15px; border-radius: 8px;">退出</button>
      </div>
      
      <div style="background: #f8f9fa; border: 1px solid #e0e0e0; padding: 20px; border-radius: 12px; text-align: left;">
        <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #444; border-left: 4px solid #00e5ff; padding-left: 10px;">あばたーせってい</h3>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; font-weight: bold; margin-bottom: 6px; font-size: 13px; color: #666;">なまえ</label>
          <input type="text" id="user-name-input" placeholder="名前を入力" value="User Name" 
            style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box; font-size: 14px;">
        </div>

        <div style="display: flex; gap: 15px;">
          <div style="flex: 1;">
            <label style="display: block; font-weight: bold; margin-bottom: 6px; font-size: 13px; color: #666;">いつものかお</label>
            <div style="border: 2px dashed #bbb; border-radius: 10px; height: 90px; position: relative; display: flex; align-items: center; justify-content: center; background: #fff; overflow: hidden;">
              <span id="label-close" style="font-size: 11px; color: #999; text-align: center; padding: 5px;">がぞうを<br>えらぶ</span>
              <img id="prev-close" style="display:none; position:absolute; width:100%; height:100%; object-fit:contain;">
              <input type="file" id="avatar-close" accept="image/*" style="opacity: 0; position: absolute; width: 100%; height: 100%; cursor: pointer;">
            </div>
          </div>
          <div style="flex: 1;">
            <label style="display: block; font-weight: bold; margin-bottom: 6px; font-size: 13px; color: #666;">しゃべるとき</label>
            <div style="border: 2px dashed #bbb; border-radius: 10px; height: 90px; position: relative; display: flex; align-items: center; justify-content: center; background: #fff; overflow: hidden;">
              <span id="label-open" style="font-size: 11px; color: #999; text-align: center; padding: 5px;">がぞうを<br>えらぶ</span>
              <img id="prev-open" style="display:none; position:absolute; width:100%; height:100%; object-fit:contain;">
              <input type="file" id="avatar-open" accept="image/*" style="opacity: 0; position: absolute; width: 100%; height: 100%; cursor: pointer;">
            </div>
          </div>
        </div>
      </div>
      
      <div style="margin-top: 20px; display: flex; gap: 8px;">
        <input id="remote-id-input" type="text" placeholder="相手のIDを入力" style="flex: 2; padding: 12px; border-radius: 8px; border: 1px solid #ddd;">
        <button id="connect-btn" style="flex: 1; background-color: #646cff; color: white; font-weight: bold; border: none; border-radius: 8px; cursor: pointer;">接続する</button>
      </div>
      <p id="status" style="font-size: 13px; color: #999; margin-top: 15px;">あなたのID: 取得中...</p>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

// --- 変数宣言 ---
const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const nameInput = document.querySelector<HTMLInputElement>('#user-name-input')!;

let isCameraOn = true;
let isMicOn = true; // マイクの状態
let isAvatarMode = false;
let imgClose: HTMLImageElement | null = null;
let imgOpen: HTMLImageElement | null = null;
let localStream: MediaStream;

// --- FaceMesh設定 ---
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

  // 背景描画（カメラがONの時だけ）
  if (isCameraOn && results.image) {
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // アバター描画ロジック
  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];
    if (isAvatarMode && imgClose) {
      const leftEye = landmarks[33], rightEye = landmarks[263];
      const angle = Math.atan2((rightEye.y - leftEye.y) * canvas.height, (rightEye.x - leftEye.x) * canvas.width);
      
      // 口の動き判定（マイクがOFFでもカメラが生きていれば口は動く）
      const isMouthOpen = Math.sqrt(Math.pow(landmarks[13].x - landmarks[14].x, 2) + Math.pow(landmarks[13].y - landmarks[14].y, 2)) > 0.025;
      
      const centerX = landmarks[1].x * canvas.width, centerY = landmarks[1].y * canvas.height;
      const radius = ((landmarks[454].x - landmarks[234].x) * canvas.width * 1.8) / 2;

      // 発話リング（マイクがONで口が開いている時だけ青く光る）
      if (isMouthOpen && isMicOn) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(centerX, centerY);
      ctx.rotate(angle);
      const targetImg = (isMouthOpen && imgOpen) ? imgOpen : imgClose;
      ctx.drawImage(targetImg, -radius, -radius, radius * 2, radius * 2);
      ctx.restore();

      // ネームタグ
      const userName = nameInput.value || "User";
      ctx.font = "bold 14px sans-serif";
      const tw = ctx.measureText(userName).width;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath();
      ctx.roundRect(centerX - (tw+16)/2, centerY + radius + 10, tw+16, 24, 12);
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.textAlign = "center";
      ctx.fillText(userName, centerX, centerY + radius + 27);
    }
  }
  ctx.restore();
});

// カメラ・マイク取得
navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: true }).then(stream => {
  localStream = stream;
  video.srcObject = stream;
  video.onloadedmetadata = () => {
    video.play();
    const predict = async () => {
      // カメラがONの時だけAIを動かす
      if (isCameraOn) await faceMesh.send({ image: video });
      requestAnimationFrame(predict);
    };
    predict();
  };
});

// アップロード処理
const setupUpload = (inputId: string, prevId: string, labelId: string, cb: (img: HTMLImageElement) => void) => {
  const input = document.querySelector<HTMLInputElement>(`#${inputId}`)!;
  const prev = document.querySelector<HTMLImageElement>(`#${prevId}`)!;
  const label = document.querySelector<HTMLElement>(`#${labelId}`)!;
  input.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { cb(img); prev.src = url; prev.style.display = 'block'; label.style.display = 'none'; };
      img.src = url;
    }
  });
};
setupUpload('avatar-close', 'prev-close', 'label-close', (img) => imgClose = img);
setupUpload('avatar-open', 'prev-open', 'label-open', (img) => imgOpen = img);

// --- ボタンイベント ---

// カメラON/OFF
document.querySelector('#camera-btn')?.addEventListener('click', () => {
  isCameraOn = !isCameraOn;
  if (localStream) localStream.getVideoTracks()[0].enabled = isCameraOn;
  const btn = document.querySelector<HTMLButtonElement>('#camera-btn')!;
  btn.innerText = isCameraOn ? "📹 カメラ: ON" : "📹 カメラ: OFF";
  btn.style.backgroundColor = isCameraOn ? "#2196F3" : "#f44336";
});

// マイクON/OFF
document.querySelector('#mic-btn')?.addEventListener('click', () => {
  isMicOn = !isMicOn;
  if (localStream) localStream.getAudioTracks()[0].enabled = isMicOn;
  const btn = document.querySelector<HTMLButtonElement>('#mic-btn')!;
  btn.innerText = isMicOn ? "🎤 マイク: ON" : "🎤 マイク: OFF";
  btn.style.backgroundColor = isMicOn ? "#4CAF50" : "#f44336";
});

// アバターモード切替
document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  const btn = document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!;
  btn.innerText = isAvatarMode ? "👤 アバター: ON" : "👤 アバター: OFF";
  btn.style.backgroundColor = isAvatarMode ? "#FFC107" : "#555";
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => window.location.reload());

// PeerJS関連は変更なし
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
    remoteVideo.style.width = "320px";
    remoteVideo.style.borderRadius = "15px";
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;
    remoteVideo.srcObject = stream;
    videoGrid.appendChild(remoteVideo);
  });
}