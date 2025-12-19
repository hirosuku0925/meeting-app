import './style.css'
import { Peer } from 'peerjs'
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>AI背景ぼかし会議室</h1>
    <div id="video-grid" style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; padding: 20px;">
      <canvas id="local-canvas" width="640" height="480" style="width: 300px; border: 2px solid #646cff; border-radius: 10px;"></canvas>
    </div>
    <div class="card">
      <button id="blur-btn" style="background-color: #4CAF50;">AIぼかし: OFF</button>
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
let isBlurred = false;
let processedStream: MediaStream;

// AIの設定
const selfieSegmentation = new SelfieSegmentation({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
});

selfieSegmentation.setOptions({ modelSelection: 1 });

selfieSegmentation.onResults((results) => {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. 人間の部分だけを切り抜くパスを作成
  ctx.beginPath();
  ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
  
  // 2. 背景を描画（ぼかし判定）
  ctx.globalCompositeOperation = 'source-out';
  if (isBlurred) {
    ctx.filter = 'blur(10px)';
  }
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';

  // 3. 人間をくっきり重ねる
  ctx.globalCompositeOperation = 'destination-over';
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  
  ctx.restore();
});

// カメラ開始と通信用ストリームの準備
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  video.srcObject = stream;
  video.play();
  
  // Canvasの映像をストリーム（映像データ）に変換
  processedStream = canvas.captureStream(30);
  // 本物のマイク音声を合体させる
  stream.getAudioTracks().forEach(track => processedStream.addTrack(track));

  const sendVideo = async () => {
    await selfieSegmentation.send({ image: video });
    requestAnimationFrame(sendVideo);
  };
  sendVideo();
});

// ボタン操作
document.querySelector('#blur-btn')?.addEventListener('click', () => {
  isBlurred = !isBlurred;
  const btn = document.querySelector<HTMLButtonElement>('#blur-btn')!;
  btn.innerText = isBlurred ? "AIぼかし: ON" : "AIぼかし: OFF";
  btn.style.backgroundColor = isBlurred ? '#f44336' : '#4CAF50';
});

// --- ここから PeerJS (通信) の処理 ---
const peer = new Peer();

peer.on('open', id => {
  statusDisplay.innerText = `あなたのID: ${id}`;
});

// 誰かからかかってきた時
peer.on('call', (call) => {
  call.answer(processedStream); // 背景ボケ映像を返してあげる
  setupVideoCall(call);
});

// 自分からかける時
document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const remoteId = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value;
  if (!remoteId) return alert('IDを入力してください');
  const call = peer.call(remoteId, processedStream);
  setupVideoCall(call);
});

function setupVideoCall(call: any) {
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