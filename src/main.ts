import './style.css'
import { Peer, MediaConnection } from 'peerjs'
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>AI背景ぼかし会議室</h1>
    <div id="video-grid" style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; padding: 20px;">
      <canvas id="local-canvas" width="480" height="360" style="width: 300px; border: 2px solid #646cff; border-radius: 10px;"></canvas>
    </div>
    <div class="card">
      <div style="margin-bottom: 10px; display: flex; gap: 5px; justify-content: center;">
        <button id="blur-btn" style="background-color: #4CAF50;">AIぼかし: OFF</button>
        <button id="hangup-btn" style="background-color: #f44336;">退出する</button>
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
let isBlurred = false;
let processedStream: MediaStream;
let activeCalls: MediaConnection[] = []; // 通信中のリストを保存

const selfieSegmentation = new SelfieSegmentation({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
});

selfieSegmentation.setOptions({ modelSelection: 0 });

selfieSegmentation.onResults((results) => {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-out';
  if (isBlurred) { ctx.filter = 'blur(8px)'; }
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'destination-over';
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  ctx.restore();
});

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: true });
  video.srcObject = stream;
  video.onloadedmetadata = () => {
    video.play();
    processedStream = canvas.captureStream(20);
    stream.getAudioTracks().forEach(track => processedStream.addTrack(track));
    const sendVideo = async () => {
      if (video.srcObject) { // カメラが動いている時だけ
        await selfieSegmentation.send({ image: video });
        requestAnimationFrame(sendVideo);
      }
    };
    sendVideo();
  };
}

startCamera();

// 退出ボタンの処理
document.querySelector('#hangup-btn')?.addEventListener('click', () => {
  // すべての通信を切る
  activeCalls.forEach(call => call.close());
  activeCalls = [];
  
  // 自分のカメラを止める
  const stream = video.srcObject as MediaStream;
  stream?.getTracks().forEach(track => track.stop());
  video.srcObject = null;
  
  // 画面をリロード（一番確実に初期状態に戻ります）
  window.location.reload();
});

document.querySelector('#blur-btn')?.addEventListener('click', () => {
  isBlurred = !isBlurred;
  const btn = document.querySelector<HTMLButtonElement>('#blur-btn')!;
  btn.innerText = isBlurred ? "AIぼかし: ON" : "AIぼかし: OFF";
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