import './style.css'
import { Peer, MediaConnection } from 'peerjs'
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>AIバーチャルアバター＆背景会議室</h1>
    <div id="video-grid" style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; padding: 20px;">
      <canvas id="local-canvas" width="480" height="360" style="width: 300px; border: 2px solid #646cff; border-radius: 10px; background: #333;"></canvas>
    </div>
    
    <div class="card">
      <div style="margin-bottom: 10px; display: flex; flex-direction: column; gap: 10px; align-items: center;">
        <div style="display: flex; gap: 5px; flex-wrap: wrap; justify-content: center;">
          <button id="mic-btn" style="background-color: #2196F3;">マイク: ON</button>
          <button id="camera-btn" style="background-color: #2196F3;">カメラ: ON</button>
          <button id="share-btn" style="background-color: #9C27B0;">画面共有: OFF</button>
          <button id="avatar-mode-btn" style="background-color: #FFC107;">アバターモード: OFF</button> <button id="blur-btn" style="background-color: #4CAF50;">背景ぼかし: OFF</button>
          <button id="hangup-btn" style="background-color: #f44336;">退出</button>
        </div>
        <div style="background: #f0f0f0; padding: 10px; border-radius: 8px; font-size: 14px; display: flex; flex-direction: column; gap: 5px;">
          <label>📁 背景画像：<input type="file" id="bg-upload" accept="image/*"></label>
          <label>👤 アバター画像：<input type="file" id="avatar-upload" accept="image/*"></label>
        </div>
      </div>
      <input id="remote-id-input" type="text" placeholder="相手のIDを入力">
      <button id="connect-btn">接続</button>
      <p id="status">あなたのID: 取得中...</p>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const statusDisplay = document.querySelector<HTMLParagraphElement>('#status')!;
const bgInput = document.querySelector<HTMLInputElement>('#bg-upload')!;
const avatarInput = document.querySelector<HTMLInputElement>('#avatar-upload')!;

let isBlurred = false;
let isCameraOn = true;
let isAvatarMode = false; // 新しい状態変数
let customBgImage: HTMLImageElement | null = null;
let avatarImage: HTMLImageElement | null = null;
let localStream: MediaStream;
let processedStream: MediaStream;
let screenStream: MediaStream | null = null;
let activeCalls: MediaConnection[] = [];

const selfieSegmentation = new SelfieSegmentation({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
});
selfieSegmentation.setOptions({ modelSelection: 0 });

selfieSegmentation.onResults((results) => {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (screenStream) {
    // 画面共有モード
    ctx.drawImage(screenStream.getVideoTracks()[0] as any, 0, 0, canvas.width, canvas.height);
  } else if (!isCameraOn) {
    // カメラOFFモード（アバター画像が設定されていれば表示）
    ctx.fillStyle = "#444";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (avatarImage) {
      const size = 150;
      const x = (canvas.width - size) / 2;
      const y = (canvas.height - size) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatarImage, x, y, size, size);
      ctx.restore();
    } else {
      ctx.fillStyle = "white";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Camera OFF", canvas.width / 2, canvas.height / 2);
    }
  } else if (isAvatarMode && avatarImage) {
    // 【カメラON時のバーチャルアバターモード】
    // まず背景を描画
    if (customBgImage) {
      ctx.drawImage(customBgImage, 0, 0, canvas.width, canvas.height);
    } else if (isBlurred) {
      ctx.filter = 'blur(8px)';
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      ctx.filter = 'none';
    } else {
      // アバターモード時はAI背景なし（黒背景など）
      ctx.fillStyle = "#000"; // アバターモードのデフォルト背景色
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // AIが認識した人物領域を透明にする
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
    
    // その透明になった部分にアバター画像を重ねる
    ctx.globalCompositeOperation = 'destination-over';
    const avatarWidth = canvas.width * 0.5; // アバターのサイズ調整
    const avatarHeight = canvas.height * 0.5;
    const avatarX = (canvas.width - avatarWidth) / 2;
    const avatarY = (canvas.height - avatarHeight) / 2;
    ctx.drawImage(avatarImage, avatarX, avatarY, avatarWidth, avatarHeight);
    
  } else {
    // 通常のAIバーチャル背景モード
    ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-out';
    if (customBgImage) {
      ctx.drawImage(customBgImage, 0, 0, canvas.width, canvas.height);
    } else if (isBlurred) {
      ctx.filter = 'blur(8px)';
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      ctx.filter = 'none';
    } else {
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    }
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  }
  ctx.restore();
});

// カメラ開始
async function startCamera() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: true });
  video.srcObject = localStream;
  video.onloadedmetadata = () => {
    video.play();
    processedStream = canvas.captureStream(20);
    localStream.getAudioTracks().forEach(track => processedStream.addTrack(track));
    
    const sendVideo = async () => {
      if (video.srcObject) {
        await selfieSegmentation.send({ image: video });
        requestAnimationFrame(sendVideo);
      }
    };
    sendVideo();
  };
}
startCamera();

// --- 既存のボタン処理 ---

// マイクON/OFF
document.querySelector('#mic-btn')?.addEventListener('click', () => {
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  const btn = document.querySelector<HTMLButtonElement>('#mic-btn')!;
  btn.innerText = audioTrack.enabled ? "マイク: ON" : "マイク: OFF";
  btn.style.backgroundColor = audioTrack.enabled ? "#2196F3" : "#f44336";
});

// カメラON/OFF
document.querySelector('#camera-btn')?.addEventListener('click', () => {
  isCameraOn = !isCameraOn;
  localStream.getVideoTracks()[0].enabled = isCameraOn; // カメラON/OFFで映像ストリームを実際に停止・再開
  const btn = document.querySelector<HTMLButtonElement>('#camera-btn')!;
  btn.innerText = isCameraOn ? "カメラ: ON" : "カメラ: OFF";
  btn.style.backgroundColor = isCameraOn ? "#2196F3" : "#f44336";
});

// 画面共有ボタン
document.querySelector('#share-btn')?.addEventListener('click', async () => {
  const btn = document.querySelector<HTMLButtonElement>('#share-btn')!;
  if (!screenStream) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      btn.innerText = "画面共有: ON";
      btn.style.backgroundColor = "#E91E63";
      screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) { console.error(err); }
  } else { stopScreenShare(); }
});

function stopScreenShare() {
  const btn = document.querySelector<HTMLButtonElement>('#share-btn')!;
  screenStream?.getTracks().forEach(track => track.stop());
  screenStream = null;
  btn.innerText = "画面共有: OFF";
  btn.style.backgroundColor = "#9C27B0";
}

// アバターモード ON/OFF ボタン (新規)
document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  const btn = document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!;
  btn.innerText = isAvatarMode ? "アバターモード: ON" : "アバターモード: OFF";
  btn.style.backgroundColor = isAvatarMode ? "#FFC107" : "#FFEB3B"; // 黄色系
});

// 背景画像アップロード
bgInput.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => { customBgImage = img; isBlurred = false; };
    img.src = event.target?.result as string;
  };
  reader.readAsDataURL(file);
});

// アバター画像アップロード
avatarInput.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => { avatarImage = img; };
    img.src = event.target?.result as string;
  };
  reader.readAsDataURL(file);
});

// 退出処理
document.querySelector('#hangup-btn')?.addEventListener('click', () => {
  activeCalls.forEach(call => call.close());
  localStream?.getTracks().forEach(track => track.stop());
  screenStream?.getTracks().forEach(track => track.stop());
  window.location.reload();
});

// 背景ぼかしボタン
document.querySelector('#blur-btn')?.addEventListener('click', () => {
  customBgImage = null;
  isBlurred = !isBlurred;
  const btn = document.querySelector<HTMLButtonElement>('#blur-btn')!;
  btn.innerText = isBlurred ? "背景ぼかし: ON" : "背景ぼかし: OFF";
  btn.style.backgroundColor = isBlurred ? '#f44336' : '#4CAF50';
});

const peer = new Peer();
peer.on('open', id => { statusDisplay.innerText = `あなたのID: ${id}`; });
peer.on('call', (call) => {
  call.answer(processedStream);
  activeCalls.push(call);
  setupVideoCall(call);
});

document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const remoteId = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value;
  if (!remoteId) return alert('IDを入力してください');
  const call = peer.call(remoteId, processedStream);
  activeCalls.push(call);
  setupVideoCall(call);
});

function setupVideoCall(call: MediaConnection) {
  const videoGrid = document.querySelector('#video-grid')!;
  const remoteVideo = document.createElement('video');
  remoteVideo.style.width = "300px";
  remoteVideo.style.borderRadius = "10px";
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;
  call.on('stream', (stream) => {
    remoteVideo.srcObject = stream;
    videoGrid.appendChild(remoteVideo);
  });
  call.on('close', () => remoteVideo.remove());
}