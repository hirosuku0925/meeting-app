import './style.css'
import { Peer } from 'peerjs' // MediaConnectionは使わないので削除して警告を消しました
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
  
  // マスク（人間の形）を描画
  ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);

  // 背景の描画設定（人間以外の部分）
  ctx.globalCompositeOperation = 'source-out';
  if (isBlurred) {
    ctx.filter = 'blur(10px)';
  }
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';

  // 人間の描画設定（背景の上に人間を乗せる）
  ctx.globalCompositeOperation = 'destination-over';
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  ctx.restore();
});

// カメラ開始とAI処理のループ
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  video.srcObject = stream;
  video.play();
  
  // Canvasの映像を「通信用のストリーム」に変換する
  processedStream = canvas.captureStream(30).clone();
  // 音声を追加する
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

// PeerJSの接続処理
const peer = new Peer();

peer.on('open', id => {
  statusDisplay.innerText = `あなたのID: ${id}`;
});

// 相手からの着信
peer.on('call', (call) => {
  call.answer(processedStream); // 加工した映像を相手に送る
  handleCall(call);
});

// 自分から発信
document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const remoteId = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value;
  if (!remoteId) return alert('IDを入力してください');
  const call = peer.call(remoteId, processedStream);
  handleCall(call);
});

function handleCall(call: any) {
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