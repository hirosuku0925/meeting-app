import './style.css'
import { Peer, MediaConnection } from 'peerjs'
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>AIバーチャル背景 & 画面共有 会議室</h1>
    <div id="video-grid" style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; padding: 20px;">
      <canvas id="local-canvas" width="480" height="360" style="width: 300px; border: 2px solid #646cff; border-radius: 10px;"></canvas>
    </div>
    <div class="card">
      <div style="margin-bottom: 10px; display: flex; flex-direction: column; gap: 10px; align-items: center;">
        <div style="display: flex; gap: 5px; flex-wrap: wrap; justify-content: center;">
          <button id="blur-btn" style="background-color: #4CAF50;">背景ぼかし: OFF</button>
          <button id="share-btn" style="background-color: #2196F3;">画面共有を開始</button>
          <button id="hangup-btn" style="background-color: #f44336;">退出する</button>
        </div>
        <div style="background: #f0f0f0; padding: 10px; border-radius: 8px; font-size: 14px;">
          <label>背景画像：</label>
          <input type="file" id="bg-upload" accept="image/*" style="font-size: 12px;">
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
const shareBtn = document.querySelector<HTMLButtonElement>('#share-btn')!;

let isBlurred = false;
let isScreenSharing = false;
let customBgImage: HTMLImageElement | null = null;
let processedStream: MediaStream;
let activeCalls: MediaConnection[] = [];
let localCameraStream: MediaStream;

const selfieSegmentation = new SelfieSegmentation({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
});
selfieSegmentation.setOptions({ modelSelection: 0 });

selfieSegmentation.onResults((results) => {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (isScreenSharing) {
    // 画面共有中はAI処理をせず、そのまま描画
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  } else {
    // 通常時はAI背景合成
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

async function startCamera() {
  localCameraStream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: true });
  video.srcObject = localCameraStream;
  video.onloadedmetadata = () => {
    video.play();
    processedStream = canvas.captureStream(20);
    localCameraStream.getAudioTracks().forEach(track => processedStream.addTrack(track));
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

// 画面共有の切り替え
shareBtn.addEventListener('click', async () => {
  if (!isScreenSharing) {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      video.srcObject = screenStream;
      isScreenSharing = true;
      shareBtn.innerText = "画面共有を停止";
      shareBtn.style.backgroundColor = "#ff9800";

      // 画面共有が終了（ブラウザ側の停止ボタンなど）した時の処理
      screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) {
      console.error("画面共有に失敗:", err);
    }
  } else {
    stopScreenShare();
  }
});

function stopScreenShare() {
  video.srcObject = localCameraStream;
  isScreenSharing = false;
  shareBtn.innerText = "画面共有を開始";
  shareBtn.style.backgroundColor = "#2196F3";
}

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

document.querySelector('#hangup-btn')?.addEventListener('click', () => {
  activeCalls.forEach(call => call.close());
  const stream = video.srcObject as MediaStream;
  stream?.getTracks().forEach(track => track.stop());
  window.location.reload();
});

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
  call.on('stream', (stream: MediaStream) => {
    remoteVideo.srcObject = stream;
    videoGrid.appendChild(remoteVideo);
  });
  call.on('close', () => remoteVideo.remove());
}