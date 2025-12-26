import './style.css'
import { Peer } from 'peerjs'
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; overflow: hidden; background: #f0f2f5;">
    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333; margin-bottom: 20px;">バーチャル会議室</h1>
      
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; padding: 10px; min-height: 360px;">
        <div style="text-align: center;">
          <p style="font-size: 12px; color: #666; margin-bottom: 5px;">自分 (加工映像)</p>
          <canvas id="local-canvas" width="480" height="360" style="width: 320px; border: 3px solid #646cff; border-radius: 15px; background: #222; box-shadow: 0 8px 16px rgba(0,0,0,0.2);"></canvas>
        </div>
      </div>

      <div class="card" style="width: 100%; max-width: 500px; margin-top: 20px; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
        <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 15px;">
          <button id="hangup-btn" style="background-color: #f44336; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">退出 (リロード)</button>
        </div>

        <div style="background: #f8f9fa; padding: 15px; border-radius: 12px; text-align: left;">
          <div style="display: flex; gap: 10px;">
             <input id="remote-id-input" type="text" placeholder="相手のIDをここに貼り付け" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
             <button id="connect-btn" style="flex: 1; background-color: #646cff; color: white; border-radius: 5px; border: none; cursor: pointer;">相手に接続</button>
          </div>
        </div>
        <p id="status" style="font-size: 14px; color: #1976D2; font-weight: bold; margin-top: 15px; text-align: center;">ID取得中...</p>
      </div>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

// --- 変数 ---
const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;
let processedStream: MediaStream;

// --- 映像の準備 (MediaPipe) ---
const selfie = new SelfieSegmentation({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}` });
selfie.setOptions({ modelSelection: 1 });
selfie.onResults((res) => {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(res.image, 0, 0, canvas.width, canvas.height);
  ctx.restore();
});

// --- 相手の映像を表示する ---
function showRemoteVideo(stream: MediaStream, peerId: string) {
  if (document.getElementById(`remote-${peerId}`)) return;

  const container = document.createElement('div');
  container.id = `remote-${peerId}`;
  container.style.textAlign = "center";
  container.innerHTML = `<p style="font-size: 12px; color: #666;">相手の映像</p>`;
  
  const v = document.createElement('video');
  v.style.width = "320px";
  v.style.borderRadius = "15px";
  v.autoplay = true;
  v.playsInline = true;
  v.srcObject = stream;
  
  container.appendChild(v);
  document.querySelector('#video-grid')!.appendChild(container);
}

// --- メイン処理 ---
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  // ボイスチェンジャーを通さず、マイク音声をそのまま使う
  processedStream = canvas.captureStream(30);
  stream.getAudioTracks().forEach(track => processedStream.addTrack(track));
  
  video.srcObject = stream;
  video.play();
  setInterval(() => selfie.send({ image: video }), 40);
});

const peer = new Peer();
peer.on('open', (id) => {
  statusEl.innerText = `あなたのID: ${id}`;
});

// 着信時
peer.on('call', (call) => {
  call.answer(processedStream);
  call.on('stream', (remoteStream) => showRemoteVideo(remoteStream, call.peer));
  statusEl.innerText = "接続完了！";
});

// 発信時
document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const remoteId = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value.trim();
  if (!remoteId) return;
  const call = peer.call(remoteId, processedStream);
  call.on('stream', (remoteStream) => showRemoteVideo(remoteStream, remoteId));
  statusEl.innerText = "接続中...";
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => window.location.reload());