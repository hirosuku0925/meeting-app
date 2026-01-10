import './style.css'
import { Peer } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #f0f2f5; overflow: hidden;">
    <div style="width: 280px; background: #2c3e50; color: white; padding: 20px; display: flex; flex-direction: column; gap: 15px;">
      <h3 style="margin: 0; color: #3498db;">🔒 鍵付きルーム</h3>
      <p style="font-size: 11px; color: #bdc3c7;">IDを教えてもらった相手と繋がります</p>
      
      <button id="join-room-btn" style="background: #3498db; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">接続を開始する</button>
      
      <div id="status-area" style="font-size: 12px; margin-top: 10px; color: #2ecc71; word-break: break-all;"></div>
    </div>

    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; width: 100%;">
        <div style="text-align: center;">
          <canvas id="local-canvas" width="480" height="360" style="width: 320px; border: 3px solid #646cff; border-radius: 15px; background: #000;"></canvas>
          <p style="font-size: 12px; color: #666;">あなた</p>
        </div>
      </div>

      <div style="margin-top: 30px; display: flex; gap: 10px;">
        <button id="record-btn" style="background: #ff9800; color: white; border: none; padding: 12px 24px; border-radius: 20px; cursor: pointer; font-weight: bold;">🔴 録画開始</button>
        <button id="hangup-btn" style="background: #e74c3c; color: white; border: none; padding: 12px 24px; border-radius: 20px; cursor: pointer;">退出</button>
      </div>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const videoGrid = document.querySelector('#video-grid')!;
const statusArea = document.querySelector('#status-area')!;

let localStream: MediaStream;
let processedStream: MediaStream;
let peer: Peer | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

// AI (FaceMesh) 設定
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });
faceMesh.onResults((res) => {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
}

// 接続ボタン
document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  if (peer) peer.destroy();
  peer = new Peer();

  peer.on('open', (id) => {
    statusArea.innerHTML = `あなたのID:<br><b style="font-size:16px; color:white;">${id}</b><br><span style="color:#bdc3c7;">これを相手に伝えてください</span>`;
    
    const remoteId = prompt("相手のIDを入力してください（待機する場合はキャンセル）");
    if (remoteId) {
      const call = peer!.call(remoteId, processedStream);
      setupRemoteVideo(call);
    }
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

// 録画機能（安全なローカル保存版）
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
      a.href = url; a.download = `record-${Date.now()}.webm`; a.click();
    };
    mediaRecorder.start();
    btn.innerText = "⏹ 録画を停止";
    btn.style.backgroundColor = "#f44336";
  } else {
    mediaRecorder.stop();
    btn.innerText = "🔴 録画開始";
    btn.style.backgroundColor = "#ff9800";
  }
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());

init();