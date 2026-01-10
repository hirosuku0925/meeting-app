import './style.css'
import { Peer } from 'peerjs' // エラー解消：下で使用します
import { FaceMesh } from '@mediapipe/face_mesh'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #f0f2f5;">
    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333; margin-bottom: 20px;">AI会議室 (安全・通信版)</h1>
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; padding: 10px; width: 100%;">
        <div id="local-container" style="text-align: center;">
          <canvas id="local-canvas" width="480" height="360" style="width: 320px; border: 3px solid #646cff; border-radius: 15px; background: #000;"></canvas>
          <p style="font-size: 12px; color: #666; margin-top: 5px;">自分</p>
        </div>
      </div>
      <div class="card" style="width: 100%; max-width: 500px; margin-top: 20px; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
           <input id="remote-id-input" type="text" placeholder="相手のIDを入力" style="flex: 2; padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
           <button id="connect-btn" style="flex: 1; background-color: #646cff; color: white; border-radius: 8px; border: none; cursor: pointer; font-weight: bold;">接続</button>
        </div>
        <p id="status" style="font-size: 13px; color: #1976d2; font-weight: bold; text-align: center; margin-bottom: 15px;">ID取得中...</p>
        <div style="border-top: 1px solid #eee; padding-top: 15px; display: flex; justify-content: center; gap: 10px;">
           <button id="record-btn" style="background-color: #ff9800; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; font-weight: bold;">🔴 録画開始</button>
           <button id="hangup-btn" style="background: #f44336; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer;">退出</button>
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

let localStream: MediaStream;
let processedStream: MediaStream;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

// AI設定
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
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    video.srcObject = localStream;
    processedStream = canvas.captureStream(25);
    localStream.getAudioTracks().forEach(t => processedStream.addTrack(t));

    video.onloadedmetadata = () => {
      video.play();
      const loop = async () => { if (video.readyState >= 2) await faceMesh.send({ image: video }); requestAnimationFrame(loop); };
      loop();
    };

    // --- PeerJS通信を開始 ---
    const peer = new Peer(); // ここで使用！
    
    peer.on('open', (id) => {
      document.getElementById('status')!.innerText = `あなたのID: ${id}`;
    });

    peer.on('call', (call) => {
      call.answer(processedStream);
      setupRemoteVideo(call);
    });

    document.querySelector('#connect-btn')?.addEventListener('click', () => {
      const remoteId = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value;
      if (!remoteId || remoteId === peer.id) return;
      setupRemoteVideo(peer.call(remoteId, processedStream));
    });

    // --- 安全な録画機能 ---
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
          a.href = url; a.download = `meeting-record.webm`; a.click();
          alert("自分のPCに録画を保存しました！");
        };
        mediaRecorder.start();
        btn.innerText = "⏹ 停止して保存";
        btn.style.backgroundColor = "#f44336";
      } else {
        mediaRecorder.stop();
        btn.innerText = "🔴 録画開始";
        btn.style.backgroundColor = "#ff9800";
      }
    });

  } catch (err) {
    alert("カメラを許可してください");
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
document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());