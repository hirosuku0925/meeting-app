import './style.css'
import { Peer, MediaConnection } from 'peerjs'
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'

let myName = "";

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="max-width: 1000px; margin: 0 auto; background: #1a1a1a; color: white; min-height: 100vh; padding: 10px;">
    <h1 style="font-size: 1.2rem; text-align: center;">高速・軽量 会議室</h1>
    
    <div id="video-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; margin-bottom: 20px;">
      <div class="video-container" style="position: relative; aspect-ratio: 4/3; background: #333; border-radius: 8px; overflow: hidden;">
        <canvas id="local-canvas" width="320" height="240" style="width: 100%; height: 100%; object-fit: cover;"></canvas>
        <div id="my-name-label" style="position: absolute; bottom: 5px; left: 5px; background: rgba(0,0,0,0.7); padding: 2px 6px; border-radius: 4px; font-size: 10px;">自分</div>
      </div>
    </div>

    <div style="background: #2a2a2a; padding: 15px; border-radius: 12px; display: flex; flex-direction: column; gap: 10px;">
      <input id="name-input" type="text" placeholder="名前を入力" style="padding: 10px; border-radius: 6px; border: none; color: black;">
      
      <div style="display: flex; gap: 5px; justify-content: center;">
        <button id="blur-btn" style="flex: 1; background: #444; color: white; border: none; padding: 10px; border-radius: 6px; font-size: 11px; cursor: pointer;">ぼかし: OFF</button>
        <button id="share-btn" style="flex: 1; background: #007bff; color: white; border: none; padding: 10px; border-radius: 6px; font-size: 11px; cursor: pointer;">画面共有</button>
        <button id="hangup-btn" style="flex: 1; background: #dc3545; color: white; border: none; padding: 10px; border-radius: 6px; font-size: 11px; cursor: pointer;">退出</button>
      </div>

      <div style="display: flex; gap: 5px;">
        <input id="remote-id-input" type="text" placeholder="相手のID" style="flex: 2; padding: 8px; border-radius: 6px; border: none; color: black;">
        <button id="connect-btn" style="flex: 1; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer;">接続</button>
      </div>
      <p id="status" style="font-size: 10px; text-align: center; color: #aaa;">ID取得中...</p>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d', { desynchronized: true })!; 
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

// ここを修正：selfieMode に直し、modelSelection は 0（高速版）を指定
selfieSegmentation.setOptions({ modelSelection: 0, selfieMode: false });

selfieSegmentation.onResults((results) => {
  ctx.save();
  if (!isBlurred || isScreenSharing) {
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  } else {
    // ぼかし処理を軽量化（一度ぼかしてからマスクで抜く）
    ctx.filter = 'blur(4px)';
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'destination-atop';
    ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.restore();
});

async function startCamera() {
  try {
    localCameraStream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 320, height: 240, frameRate: { ideal: 15 } }, 
      audio: true 
    });
    video.srcObject = localCameraStream;
    video.onloadedmetadata = () => {
      video.play();
      // 相手に送るフレームレートを制限して軽くする
      processedStream = canvas.captureStream(15);
      localCameraStream.getAudioTracks().forEach(track => processedStream.addTrack(track));
      
      const process = async () => {
        if (!video.paused && !video.ended) {
          await selfieSegmentation.send({ image: video });
        }
        // CPUを休ませるための微小な待ち時間（重要）
        setTimeout(() => requestAnimationFrame(process), 40); 
      };
      process();
    };
  } catch (e) {
    console.error("カメラエラー:", e);
  }
}
startCamera();

// --- 各種イベント ---
nameInput.addEventListener('input', () => {
  myName = nameInput.value;
  document.querySelector('#my-name-label')!.textContent = myName || "自分";
});

shareBtn.addEventListener('click', async () => {
  if (!isScreenSharing) {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 } });
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
  btn.innerText = isBlurred ? "ぼかし: ON" : "ぼかし: OFF";
  btn.style.background = isBlurred ? '#dc3545' : '#444';
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
  if (!remoteId) return;
  const call = peer.call(remoteId, processedStream, { metadata: { name: myName || "ゲスト" } });
  activeCalls.push(call);
  setupVideoCall(call, "相手"); 
});

function setupVideoCall(call: MediaConnection, name: string) {
  const videoGrid = document.querySelector('#video-grid')!;
  const container = document.createElement('div');
  container.style.cssText = "position: relative; aspect-ratio: 4/3; background: #000; border-radius: 8px; overflow: hidden;";

  const remoteVideo = document.createElement('video');
  remoteVideo.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;

  const nameLabel = document.createElement('div');
  nameLabel.innerText = name;
  nameLabel.style.cssText = "position: absolute; bottom: 5px; left: 5px; background: rgba(0,0,0,0.7); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;";

  container.appendChild(remoteVideo);
  container.appendChild(nameLabel);

  call.on('stream', (stream) => {
    remoteVideo.srcObject = stream;
    videoGrid.appendChild(container);
  });
  call.on('close', () => container.remove());
}