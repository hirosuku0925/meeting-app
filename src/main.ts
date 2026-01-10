import './style.css'
import { Peer } from 'peerjs'

// --- HTML構造の構築 ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #f0f2f5;">
    <div style="width: 280px; background: #2c3e50; color: white; padding: 20px; display: flex; flex-direction: column; gap: 15px;">
      <h3 style="margin: 0; color: #3498db;">🌐 AI会議室</h3>
      
      <input id="room-id-input" type="text" placeholder="部屋名" style="width: 100%; padding: 10px; border-radius: 5px; color: #333;">
      <input id="room-pass-input" type="password" placeholder="パスワード" style="width: 100%; padding: 10px; border-radius: 5px; color: #333;">
      <button id="join-room-btn" style="background: #3498db; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">部屋を移動する</button>
      
      <div style="border-top: 1px solid #34495e; padding-top: 15px; display: flex; flex-direction: column; gap: 10px;">
        <button id="toggle-mic" style="background: #2ecc71; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">🎤 マイク: ON</button>
        <button id="toggle-video" style="background: #2ecc71; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">📹 カメラ: ON</button>
        <button id="share-screen-btn" style="background: #9b59b6; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">🖥 画面共有</button>
      </div>

      <div id="status-area" style="font-size: 12px; color: #2ecc71;">待機中...</div>
    </div>

    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; width: 100%;">
        <div style="text-align: center;">
          <video id="local-video" autoplay playsinline muted style="width: 320px; border: 3px solid #646cff; border-radius: 15px; background: #000;"></video>
          <p style="font-size: 12px; color: #666;">あなた</p>
        </div>
      </div>

      <div style="margin-top: 20px; display: flex; gap: 10px;">
        <button id="record-btn" style="background: #ff9800; color: white; border: none; padding: 10px 24px; border-radius: 20px; cursor: pointer; font-weight: bold;">🔴 録画開始</button>
        <button id="hangup-btn" style="background: #e74c3c; color: white; border: none; padding: 10px 24px; border-radius: 20px; cursor: pointer;">退出</button>
      </div>
    </div>
  </div>
`

// --- 変数定義 ---
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const videoGrid = document.querySelector('#video-grid')!;
const statusArea = document.querySelector<HTMLElement>('#status-area')!;

let localStream: MediaStream;
let screenStream: MediaStream | null = null;
let peer: Peer | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

let micOn = true;
let videoOn = true;

// --- 初期化：カメラとマイクの取得 ---
async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch (err) {
    console.error("デバイスの取得に失敗:", err);
    alert("カメラまたはマイクの使用を許可してください。");
  }
}

// --- 部屋への移動・接続ロジック ---
document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('room-pass-input') as HTMLInputElement).value.trim();
  if (!room || !pass) return alert("部屋名とパスワードを入力してください");

  if (peer) peer.destroy();
  peer = new Peer();

  peer.on('open', () => {
    statusArea.innerText = `部屋「${room}」に接続中...`;
    const targetID = `room_${room}_${pass}_host`;
    const hostPeer = new Peer(targetID);

    hostPeer.on('open', () => {
      statusArea.innerText = `部屋「${room}」のホストとして待機中`;
      hostPeer.on('call', (call) => {
        call.answer(screenStream || localStream);
        setupRemoteVideo(call);
      });
    });

    hostPeer.on('error', (err: any) => {
      if (err.type === 'unavailable-id') {
        statusArea.innerText = `部屋「${room}」に参加しました`;
        const call = peer!.call(targetID, screenStream || localStream);
        setupRemoteVideo(call);
      }
      hostPeer.destroy();
    });
  });

  peer.on('call', (call) => {
    call.answer(screenStream || localStream);
    setupRemoteVideo(call);
  });
});

// --- 画面共有機能 ---
document.querySelector('#share-screen-btn')?.addEventListener('click', async () => {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    localVideo.srcObject = screenStream;
    
    // 共有停止時の処理
    screenStream.getVideoTracks()[0].onended = () => {
      localVideo.srcObject = localStream;
      screenStream = null;
    };
  } catch (err) {
    console.error("画面共有エラー:", err);
  }
});

// --- リモート映像の表示 ---
function setupRemoteVideo(call: any) {
  call.on('stream', (stream: MediaStream) => {
    if (document.getElementById(`v-${call.peer}`)) return;
    const v = document.createElement('video');
    v.id = `v-${call.peer}`;
    v.style.width = "320px"; v.style.borderRadius = "15px";
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    videoGrid.appendChild(v);
  });
}

// --- カメラ・マイクの切り替え ---
document.querySelector('#toggle-mic')?.addEventListener('click', () => {
  micOn = !micOn;
  localStream.getAudioTracks().forEach(t => t.enabled = micOn);
  const btn = document.querySelector<HTMLButtonElement>('#toggle-mic')!;
  btn.innerText = micOn ? "🎤 マイク: ON" : "🎙️ マイク: OFF";
  btn.style.background = micOn ? "#2ecc71" : "#e74c3c";
});

document.querySelector('#toggle-video')?.addEventListener('click', () => {
  videoOn = !videoOn;
  localStream.getVideoTracks().forEach(t => t.enabled = videoOn);
  const btn = document.querySelector<HTMLButtonElement>('#toggle-video')!;
  btn.innerText = videoOn ? "📹 カメラ: ON" : "🚫 カメラ: OFF";
  btn.style.background = videoOn ? "#2ecc71" : "#e74c3c";
});

// --- 録画機能 ---
document.querySelector('#record-btn')?.addEventListener('click', () => {
  const btn = document.querySelector<HTMLButtonElement>('#record-btn')!;
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    recordedChunks = [];
    const streamToRecord = screenStream || localStream;
    mediaRecorder = new MediaRecorder(streamToRecord);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `meeting-record.webm`; a.click();
    };
    mediaRecorder.start();
    btn.innerText = "⏹ 録画を停止";
  } else {
    mediaRecorder.stop();
    btn.innerText = "🔴 録画開始";
  }
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());

init();