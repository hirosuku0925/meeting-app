import './style.css'
import { Peer } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #f0f2f5; overflow: hidden;">
    <div style="width: 280px; background: #2c3e50; color: white; padding: 20px; display: flex; flex-direction: column; gap: 15px; box-shadow: 2px 0 5px rgba(0,0,0,0.1);">
      <h3 style="margin: 0; color: #3498db;">🔒 鍵付きルーム</h3>
      
      <div style="margin-top: 10px;">
        <label style="font-size: 11px; color: #bdc3c7;">ルーム名:</label>
        <input id="room-id-input" type="text" placeholder="例: room-A" style="width: 100%; padding: 10px; border-radius: 5px; border: none; margin-top: 5px; color: #333;">
      </div>

      <div>
        <label style="font-size: 11px; color: #bdc3c7;">パスワード:</label>
        <input id="room-pass-input" type="password" placeholder="4桁以上の数字など" style="width: 100%; padding: 10px; border-radius: 5px; border: none; margin-top: 5px; color: #333;">
      </div>

      <button id="join-room-btn" style="background: #3498db; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold; margin-top: 10px; transition: 0.3s;">
        部屋を作成・移動
      </button>

      <div style="border-top: 1px solid #34495e; padding-top: 15px; margin-top: 10px;">
        <p style="font-size: 12px; color: #bdc3c7;">現在の状態:</p>
        <div id="current-room-display" style="font-weight: bold; color: #2ecc71;">未入室</div>
      </div>
    </div>

    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; width: 100%;">
        <div id="local-container" style="text-align: center;">
          <canvas id="local-canvas" width="480" height="360" style="width: 320px; border: 3px solid #646cff; border-radius: 15px; background: #000;"></canvas>
          <p style="font-size: 12px; color: #666; margin-top: 5px;">自分 (プレビュー)</p>
        </div>
      </div>

      <div style="margin-top: 30px; display: flex; gap: 10px;">
        <button id="record-btn" style="background: #ff9800; color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer; font-weight: bold;">🔴 録画保存</button>
        <button id="hangup-btn" style="background: #e74c3c; color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer;">退出</button>
      </div>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const videoGrid = document.querySelector('#video-grid')!;
const roomInput = document.querySelector<HTMLInputElement>('#room-id-input')!;
const passInput = document.querySelector<HTMLInputElement>('#room-pass-input')!;
const roomDisplay = document.querySelector<HTMLElement>('#current-room-display')!;

let localStream: MediaStream;
let processedStream: MediaStream;
let peer: Peer | null = null;

// AI処理
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

function joinRoom(roomName: string, pass: string) {
  if (peer) peer.destroy();
  
  // パスワードを混ぜた特殊なIDを作成（例: roomA_secret123）
  const secureID = `${roomName}_${pass}`;
  peer = new Peer(secureID);

  peer.on('open', (id) => {
    roomDisplay.innerText = `入室中: ${roomName}`;
    roomDisplay.style.color = "#2ecc71";
    console.log("Your Secure ID:", id);
    alert(`「${roomName}」に入室しました！\n同じパスワードを知っている人だけがこの部屋で合流できます。`);
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      // 誰かが既にホストとして入っている場合は、そこへ発信する側に回る仕組み（簡易版）
      connectToHost(secureID);
    } else {
      console.error(err);
    }
  });

  peer.on('call', (call) => {
    call.answer(processedStream);
    setupRemoteVideo(call);
  });
}

function connectToHost(hostID: string) {
  // 自分がホストになれなかった場合、ゲストとして接続
  if (!peer) return;
  const call = peer.call(hostID, processedStream);
  setupRemoteVideo(call);
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

document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  const r = roomInput.value.trim();
  const p = passInput.value.trim();
  if (!r || !p) return alert("ルーム名とパスワードを両方入力してください");
  joinRoom(r, p);
});

// 録画（安全なダウンロード版）
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