import './style.css'
import { Peer } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; overflow: hidden; background: #f0f2f5;">
    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333; margin-bottom: 20px;">バーチャル会議室</h1>
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; padding: 10px; width: 100%;">
        <div id="local-container" style="text-align: center;">
          <canvas id="local-canvas" width="480" height="360" style="width: 280px; border: 3px solid #646cff; border-radius: 15px; background: #222;"></canvas>
        </div>
      </div>
      <div class="card" style="width: 100%; max-width: 500px; margin-top: 20px; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
        <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 15px; flex-wrap: wrap;">
          <button id="camera-btn" style="background-color: #2196F3; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">📹 カメラ: ON</button>
          <button id="avatar-mode-btn" style="background-color: #555; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">👤 アバター: OFF</button>
          <button id="hangup-btn" style="background-color: #f44336; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">退出</button>
        </div>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 12px; margin-bottom: 15px;">
          <input type="text" id="user-name-input" placeholder="名前" value="なまえ" style="width: 100%; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
        </div>
        <div style="display: flex; gap: 10px;">
           <input id="remote-id-input" type="text" placeholder="相手のIDを入力" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
           <button id="connect-btn" style="flex: 1; background-color: #646cff; color: white; border-radius: 5px; border: none; cursor: pointer;">接続</button>
        </div>
        <p id="status" style="font-size: 12px; color: #999; margin-top: 10px;">ID: 取得中...</p>
      </div>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const nameInput = document.querySelector<HTMLInputElement>('#user-name-input')!; // 読み取りを有効化
const videoGrid = document.querySelector('#video-grid')!;

let isCameraOn = true;
let isAvatarMode = false; // 読み取りを有効化
let localStream: MediaStream;

const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

faceMesh.onResults((results) => {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 反転表示（鏡合わせ）
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);

  if (isCameraOn && results.image) {
    if (isAvatarMode) {
      // アバターモード：背景を塗りつぶして顔の上に円を描く
      ctx.fillStyle = "#f0f2f5";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (results.multiFaceLandmarks?.[0]) {
        const landmarks = results.multiFaceLandmarks[0];
        const centerX = landmarks[1].x * canvas.width;
        const centerY = landmarks[1].y * canvas.height;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
        ctx.fillStyle = "#646cff";
        ctx.fill();
      }
    } else {
      // 通常モード：カメラ映像を描画
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    }
  } else {
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ネームタグの描画（nameInputの値をここで使用）
  ctx.scale(-1, 1); // 文字が反転しないように戻す
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(-canvas.width + 10, canvas.height - 40, 100, 30);
  ctx.fillStyle = "white";
  ctx.font = "16px sans-serif";
  ctx.fillText(nameInput.value, -canvas.width + 20, canvas.height - 20);

  ctx.restore();
});

navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localStream = stream;
  video.srcObject = stream;
  const predict = async () => {
    if (isCameraOn) await faceMesh.send({ image: video });
    requestAnimationFrame(predict);
  };
  predict();
});

const peer = new Peer();
const connectedPeers = new Set();

peer.on('open', (id) => {
  document.querySelector<HTMLElement>('#status')!.innerText = `あなたのID: ${id}`;
});

peer.on('call', (call) => {
  const processedStream = canvas.captureStream(25);
  localStream.getAudioTracks().forEach(t => processedStream.addTrack(t));
  call.answer(processedStream);
  setupRemoteVideo(call);
});

document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const id = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value;
  if (!id || id === peer.id) return;
  const processedStream = canvas.captureStream(25);
  localStream.getAudioTracks().forEach(t => processedStream.addTrack(t));
  setupRemoteVideo(peer.call(id, processedStream));
});

function setupRemoteVideo(call: any) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);
  call.on('stream', (stream: MediaStream) => {
    if (document.getElementById(`video-${call.peer}`)) return;
    const v = document.createElement('video');
    v.id = `video-${call.peer}`;
    v.style.width = "280px";
    v.style.borderRadius = "15px";
    v.srcObject = stream;
    v.autoplay = true;
    v.playsInline = true;
    videoGrid.appendChild(v);
  });
}

document.querySelector('#camera-btn')?.addEventListener('click', () => {
  isCameraOn = !isCameraOn;
  localStream.getVideoTracks()[0].enabled = isCameraOn;
  document.querySelector<HTMLButtonElement>('#camera-btn')!.innerText = isCameraOn ? "📹 カメラ: ON" : "📹 カメラ: OFF";
});

document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  const btn = document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!;
  btn.innerText = isAvatarMode ? "👤 アバター: ON" : "👤 アバター: OFF";
  btn.style.backgroundColor = isAvatarMode ? "#FFC107" : "#555";
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());