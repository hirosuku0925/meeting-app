import './style.css'
import { Peer, MediaConnection } from 'peerjs'
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'

let myName = "";

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="max-width: 1200px; margin: 0 auto; font-family: sans-serif;">
    <h1 style="font-size: 1.5rem;">超軽量 AI会議室</h1>
    <div id="video-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; padding: 10px;">
      <div class="video-container" style="position: relative; aspect-ratio: 4/3; background: #000; border-radius: 10px; overflow: hidden;">
        <canvas id="local-canvas" width="320" height="240" style="width: 100%; height: 100%; object-fit: cover;"></canvas>
        <div id="my-name-label" style="position: absolute; bottom: 5px; left: 5px; background: rgba(0,0,0,0.6); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">自分</div>
      </div>
    </div>

    <div class="card" style="padding: 15px; background: #f9f9f9; border-radius: 10px; margin-top: 10px;">
      <input id="name-input" type="text" placeholder="名前を入力" style="width: 80%; padding: 8px; margin-bottom: 10px;">
      <div style="display: flex; gap: 5px; flex-wrap: wrap; justify-content: center; margin-bottom: 10px;">
        <button id="blur-btn" style="background-color: #4CAF50; font-size: 11px; padding: 5px 10px;">背景ぼかし: OFF</button>
        <button id="share-btn" style="background-color: #2196F3; font-size: 11px; padding: 5px 10px;">画面共有</button>
        <button id="hangup-btn" style="background-color: #f44336; font-size: 11px; padding: 5px 10px;">退出</button>
      </div>
      <div style="font-size: 11px; border-top: 1px solid #ddd; padding-top: 10px;">
        <input id="remote-id-input" type="text" placeholder="相手のID" style="padding: 5px;">
        <button id="connect-btn">接続</button>
      </div>
      <p id="status" style="font-size: 10px; color: #888; margin-top: 5px;">ID取得中...</p>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d', { alpha: false })!; // アルファチャンネルを無効にして高速化
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const statusDisplay = document.querySelector<HTMLParagraphElement>('#status')!;
const shareBtn = document.querySelector<HTMLButtonElement>('#share-btn')!;
const nameInput = document.querySelector<HTMLInputElement>('#name-input')!;

let isBlurred = false;
let isScreenSharing = false;
let processedStream: MediaStream;
let activeCalls: MediaConnection[] = [];
let localCameraStream: MediaStream;

const selfieSegmentation = new SelfieSegmentation({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
});

// 計算負荷の低いモデルを選択
selfieSegmentation.setOptions({ modelSelection: 0 });

selfieSegmentation.onResults((results) => {
  ctx.save();
  // 画面共有中やぼかしOFFの時はAI処理結果をそのまま描画（CPU節約）
  if (isScreenSharing || !isBlurred) {
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  } else {
    // ぼかし処理
    ctx.globalCompositeOperation = 'copy';
    ctx.filter = 'blur(4px)'; // ぼかし強度を下げて負荷軽減
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    
    ctx.globalCompositeOperation = 'destination-atop';
    ctx.filter = 'none';
    ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
    
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#222'; // 背景を単色にして塗りつぶし負荷を減らす
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.restore();
});

async function startCamera() {
  // 通信量と負荷を最小限にするための超軽量設定
  localCameraStream = await navigator.mediaDevices.getUserMedia({ 
    video: { width: 320, height: 240, frameRate: 10 }, // 10fpsまで落とす
    audio: true 
  });
  video.srcObject = localCameraStream;
  video.onloadedmetadata = () => {
    video.play();
    processedStream = canvas.captureStream(10); // 送信も10fps
    localCameraStream.getAudioTracks().forEach(track => processedStream.addTrack(track));
    
    const sendVideo = async () => {
      if (video.readyState >= 2) {
        await selfieSegmentation.send({ image: video });
      }
      // 意図的にウェイトを置いてCPUを休ませる（約20fps相当）
      setTimeout(() => {
        requestAnimationFrame(sendVideo);
      }, 50); 
    };
    sendVideo();
  };
}
startCamera();

// --- 通信・ボタン処理（軽量版） ---
nameInput.addEventListener('input', () => {
  myName = nameInput.value;
  document.querySelector('#my-name-label')!.textContent = myName || "自分";
});

shareBtn.addEventListener('click', async () => {
  if (!isScreenSharing) {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: true });
      video.srcObject = screenStream;
      isScreenSharing = true;
      shareBtn.innerText = "停止";
      screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
    } catch (err) { console.error(err); }
  } else { stopScreenShare(); }
});

function stopScreenShare() {
  video.srcObject = localCameraStream;
  isScreenSharing = false;
  shareBtn.innerText = "画面共有";
}

document.querySelector('#hangup-btn')?.addEventListener('click', () => {
  window.location.reload();
});

document.querySelector('#blur-btn')?.addEventListener('click', () => {
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
  setupVideoCall(call, call.metadata?.name || "ゲスト");
});

document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const remoteId = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value;
  if (!remoteId) return alert('IDを入力してください');
  const call = peer.call(remoteId, processedStream, { metadata: { name: myName || "ゲスト" } });
  activeCalls.push(call);
  setupVideoCall(call, "相手"); 
});

function setupVideoCall(call: MediaConnection, name: string) {
  const videoGrid = document.querySelector('#video-grid')!;
  const container = document.createElement('div');
  container.style.cssText = "position: relative; aspect-ratio: 4/3; background: #000; border-radius: 10px; overflow: hidden;";

  const remoteVideo = document.createElement('video');
  remoteVideo.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;

  const nameLabel = document.createElement('div');
  nameLabel.innerText = name;
  nameLabel.style.cssText = "position: absolute; bottom: 5px; left: 5px; background: rgba(0,0,0,0.6); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;";

  container.appendChild(remoteVideo);
  container.appendChild(nameLabel);

  call.on('stream', (stream) => {
    remoteVideo.srcObject = stream;
    videoGrid.appendChild(container);
  });
  call.on('close', () => container.remove());
}