import './style.css'
import { Peer } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #f0f2f5; overflow: hidden;">
    <div style="width: 280px; background: #2c3e50; color: white; padding: 20px; display: flex; flex-direction: column; gap: 15px;">
      <h3 style="margin: 0; color: #3498db;">🏠 会議コントロール</h3>
      <input id="room-id-input" type="text" placeholder="部屋名" style="width: 100%; padding: 10px; border-radius: 5px; color: #333;">
      <input id="room-pass-input" type="password" placeholder="パスワード" style="width: 100%; padding: 10px; border-radius: 5px; color: #333;">
      <button id="join-room-btn" style="background: #3498db; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">部屋を移動する</button>
      
      <div style="border-top: 1px solid #34495e; padding-top: 15px; margin-top: 10px; display: flex; flex-direction: column; gap: 10px;">
        <button id="toggle-mic" style="background: #2ecc71; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">🎤 マイク: ON</button>
        <button id="toggle-video" style="background: #2ecc71; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">📹 カメラ: ON</button>
      </div>

      <div id="status-area" style="font-size: 12px; margin-top: 10px; color: #2ecc71;"></div>
    </div>

    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; width: 100%;">
        <canvas id="local-canvas" width="480" height="360" style="width: 320px; border: 3px solid #646cff; border-radius: 15px; background: #000;"></canvas>
      </div>
      <div style="margin-top: 20px;">
        <button id="record-btn" style="background: #ff9800; color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer; font-weight: bold;">🔴 録画保存</button>
        <button id="hangup-btn" style="background: #e74c3c; color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer; margin-left: 10px;">退出</button>
      </div>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const videoGrid = document.querySelector('#video-grid')!;
const statusArea = document.querySelector<HTMLElement>('#status-area')!;

let localStream: MediaStream;
let processedStream: MediaStream;
let peer: Peer | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

// マイクとカメラの状態
let micOn = true;
let videoOn = true;

const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });
faceMesh.onResults((res) => {
  ctx.save(); ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
  if (res.image) ctx.drawImage(res.image, 0, 0, canvas.width, canvas.height);
  ctx.restore();
});

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  video.srcObject = localStream;
  processedStream = canvas.captureStream(25);
  localStream.getAudioTracks().forEach(t => processedStream.addTrack(t));

  video.onloadedmetadata = () => {
    video.play();
    const loop = async () => { if (video.readyState >= 2) await faceMesh.send({ image: video }); requestAnimationFrame(loop); };
    loop();
  };

  // マイクの切り替え
  document.querySelector('#toggle-mic')?.addEventListener('click', () => {
    micOn = !micOn;
    localStream.getAudioTracks().forEach(track => track.enabled = micOn);
    const btn = document.querySelector<HTMLButtonElement>('#toggle-mic')!;
    btn.innerText = micOn ? "🎤 マイク: ON" : "🎙️ マイク: OFF";
    btn.style.background = micOn ? "#2ecc71" : "#e74c3c";
  });

  // カメラの切り替え
  document.querySelector('#toggle-video')?.addEventListener('click', () => {
    videoOn = !videoOn;
    localStream.getVideoTracks().forEach(track => track.enabled = videoOn);
    const btn = document.querySelector<HTMLButtonElement>('#toggle-video')!;
    btn.innerText = videoOn ? "📹 カメラ: ON" : "🚫 カメラ: OFF";
    btn.style.background = videoOn ? "#2ecc71" : "#e74c3c";
    // OFFの時はキャンバスを黒く塗る
    if (!videoOn) {
        setTimeout(() => {
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }, 100);
    }
  });
}

// 接続処理 (前回と同じ)
document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('room-pass-input') as HTMLInputElement).value.trim();
  if (!room || !pass) return alert("全部入力してください");

  if (peer) peer.destroy();
  peer = new Peer();
  
  peer.on('open', () => {
    statusArea.innerText = `接続中...`;
    const targetID = `room_${room}_${pass}_host`;
    const hostPeer = new Peer(targetID);
    
    hostPeer.on('open', () => {
        statusArea.innerText = `部屋「${room}」を作成しました`;
        hostPeer.on('call', (call) => {
            call.answer(processedStream);
            setupRemoteVideo(call);
        });
    });

    hostPeer.on('error', (err: any) => {
        if (err.type === 'unavailable-id') {
            statusArea.innerText = `部屋「${room}」に参加しました`;
            const call = peer!.call(targetID, processedStream);
            setupRemoteVideo(call);
        }
        hostPeer.destroy();
    });
  });

  peer.on('call', (call) => {
    call.answer(processedStream);
    setupRemoteVideo(call);
  });
});

function setupRemoteVideo(call: any) {
  call.on('stream', (stream: MediaStream) => {
    if (document.getElementById(`v-${call.peer}`)) return;
    const v = document.createElement('video');
    v.id = `v-${call.peer}`;
    v.style.width = "280px"; v.style.borderRadius = "15px";
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    videoGrid.appendChild(v);
  });
}

// 録画機能
document.querySelector('#record-btn')?.addEventListener('click', () => {
  const btn = document.querySelector<HTMLButtonElement>('#record-btn')!;
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(processedStream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `meeting.webm`; a.click();
    };
    mediaRecorder.start();
    btn.innerText = "⏹ 停止";
  } else {
    mediaRecorder.stop();
    btn.innerText = "🔴 録画保存";
  }
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());

init();