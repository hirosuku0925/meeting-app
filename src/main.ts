import './style.css'
import { Peer } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #f0f2f5;">
    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333; margin-bottom: 20px;">AI会議室</h1>
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; padding: 10px; width: 100%;">
        <div id="local-container" style="text-align: center;">
          <canvas id="local-canvas" width="480" height="360" style="width: 320px; border: 3px solid #646cff; border-radius: 15px; background: #000;"></canvas>
          <p style="font-size: 12px; color: #666; margin-top: 5px;">自分</p>
        </div>
      </div>
      <div class="card" style="width: 100%; max-width: 500px; margin-top: 20px; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
           <input id="remote-id-input" type="text" placeholder="相手のIDを入力" style="flex: 2; padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
           <button id="connect-btn" style="flex: 1; background-color: #646cff; color: white; border-radius: 8px; border: none; cursor: pointer; font-weight: bold;">入室</button>
        </div>
        <p id="status" style="font-size: 13px; color: #1976d2; font-weight: bold; text-align: center;">ID取得中...</p>
        <div style="border-top: 1px solid #eee; margin-top: 15px; padding-top: 15px; display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
           <button id="mic-btn" style="background-color: #4CAF50; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer;">🎤 マイク: ON</button>
           <button id="avatar-mode-btn" style="padding: 8px 15px; border-radius: 5px; cursor: pointer;">👤 アバター: OFF</button>
           <button id="hangup-btn" style="background: #f44336; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer;">退出</button>
        </div>
      </div>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const videoGrid = document.querySelector('#video-grid')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;

let isAvatarMode = false;
let isMicOn = true;
let localStream: MediaStream; // これを使用することで警告を消します
let processedStream: MediaStream;

const faceMesh = new FaceMesh({ 
  locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${f}` 
});
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((results) => {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  if (results.image) {
    if (isAvatarMode && results.multiFaceLandmarks?.[0]) {
      ctx.fillStyle = "#eef";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const landmarks = results.multiFaceLandmarks[0];
      ctx.beginPath();
      ctx.arc(landmarks[1].x * canvas.width, landmarks[1].y * canvas.height, 60, 0, Math.PI * 2);
      ctx.fillStyle = "#646cff";
      ctx.fill();
    } else {
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    }
  }
  ctx.restore();
});

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    video.srcObject = localStream;
    
    processedStream = canvas.captureStream(25);
    // localStreamから音声トラックを取り出して追加
    localStream.getAudioTracks().forEach(track => processedStream.addTrack(track));

    video.onloadedmetadata = () => {
      video.play();
      const loop = async () => {
        if (video.readyState >= 2) await faceMesh.send({ image: video });
        requestAnimationFrame(loop);
      };
      loop();
    };

    const peer = new Peer();
    peer.on('open', (id) => { statusEl.innerText = `あなたのID: ${id}`; });
    peer.on('call', (call) => {
      call.answer(processedStream);
      setupRemoteVideo(call);
    });

    document.querySelector('#connect-btn')?.addEventListener('click', () => {
      const remoteId = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value;
      if (!remoteId || remoteId === peer.id) return;
      setupRemoteVideo(peer.call(remoteId, processedStream));
    });

    // マイクボタンの処理で localStream を使用
    document.querySelector('#mic-btn')?.addEventListener('click', () => {
      isMicOn = !isMicOn;
      localStream.getAudioTracks().forEach(track => track.enabled = isMicOn);
      const btn = document.querySelector<HTMLButtonElement>('#mic-btn')!;
      btn.innerText = isMicOn ? "🎤 マイク: ON" : "🎤 マイク: OFF";
      btn.style.backgroundColor = isMicOn ? "#4CAF50" : "#f44336";
    });

  } catch (err) {
    alert("カメラ・マイクを許可してください");
  }
}

const connectedPeers = new Set();
function setupRemoteVideo(call: any) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);
  call.on('stream', (stream: MediaStream) => {
    if (document.getElementById(`v-${call.peer}`)) return;
    const v = document.createElement('video');
    v.id = `v-${call.peer}`;
    v.style.width = "280px";
    v.style.borderRadius = "15px";
    v.srcObject = stream;
    v.autoplay = true;
    v.playsInline = true;
    videoGrid.appendChild(v);
  });
}

init();

document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!.innerText = isAvatarMode ? "👤 アバター: ON" : "👤 アバター: OFF";
});
document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());