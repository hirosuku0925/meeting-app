import './style.css'
import { Peer } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #f0f2f5; overflow: hidden;">
    <div style="width: 250px; background: #2c3e50; color: white; padding: 20px; display: flex; flex-direction: column; gap: 20px;">
      <h3>🏠 ルーム設定</h3>
      <div>
        <label style="font-size: 12px; color: #bdc3c7;">現在の部屋:</label>
        <div id="current-room-display" style="font-weight: bold; font-size: 18px; color: #3498db;">未入室</div>
      </div>
      <hr style="border: 0; border-top: 1px solid #34495e; width: 100%;">
      <p style="font-size: 12px; color: #bdc3c7;">移動する部屋のIDを入力:</p>
      <input id="room-id-input" type="text" placeholder="例: room-A" style="padding: 10px; border-radius: 5px; border: none; width: 100%; box-sizing: border-box; color: #000;">
      <button id="join-room-btn" style="background: #3498db; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer; font-weight: bold;">部屋を移動する</button>
    </div>

    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333;">AI会議室</h1>
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; width: 100%;">
        <div id="local-container" style="text-align: center;">
          <canvas id="local-canvas" width="480" height="360" style="width: 320px; border: 3px solid #646cff; border-radius: 15px; background: #000;"></canvas>
          <p style="font-size: 12px; color: #666; margin-top: 5px;">あなた (自分)</p>
        </div>
      </div>

      <div class="card" style="width: 100%; max-width: 400px; margin-top: 20px; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center;">
         <div style="display: flex; justify-content: center; gap: 10px;">
           <button id="record-btn" style="background-color: #ff9800; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold;">🔴 録画</button>
           <button id="hangup-btn" style="background: #f44336; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer;">退出</button>
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
const roomIdInput = document.querySelector<HTMLInputElement>('#room-id-input')!;
const roomDisplay = document.querySelector<HTMLElement>('#current-room-display')!; // 型を指定

let localStream: MediaStream;
let processedStream: MediaStream;
let peer: Peer | null = null;

const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });
faceMesh.onResults((res) => {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
  if (res.image) ctx.drawImage(res.image, 0, 0, canvas.width, canvas.height);
  ctx.restore();
});

async function startApp() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  video.srcObject = localStream;
  processedStream = canvas.captureStream(25);
  localStream.getAudioTracks().forEach(t => processedStream.addTrack(t));

  video.onloadedmetadata = () => {
    video.play();
    const loop = async () => { if (video.readyState >= 2) await faceMesh.send({ image: video }); requestAnimationFrame(loop); };
    loop();
  };

  document.querySelector('#join-room-btn')?.addEventListener('click', () => {
    const roomName = roomIdInput.value.trim();
    if (!roomName) return alert("部屋IDを入力してください");
    joinRoom(roomName);
  });
}

function joinRoom(roomName: string) {
  if (peer) peer.destroy();
  
  peer = new Peer(); 
  
  peer.on('open', (id) => {
    if (roomDisplay) roomDisplay.innerText = roomName; // エラー解消：型チェック
    alert(`あなたの接続ID: ${id}\n仲間にこのIDを教えて接続してもらってください。`);
  });

  peer.on('call', (call) => {
    call.answer(processedStream);
    setupRemoteVideo(call);
  });
}

function setupRemoteVideo(call: any) {
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

startApp();

// 録画機能
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
document.querySelector('#record-btn')?.addEventListener('click', () => {
  const btn = document.querySelector<HTMLButtonElement>('#record-btn')!;
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(processedStream);
    mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `room-record.webm`; a.click();
    };
    mediaRecorder.start();
    btn.innerText = "⏹ 停止";
  } else {
    mediaRecorder.stop();
    btn.innerText = "🔴 録画";
  }
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());