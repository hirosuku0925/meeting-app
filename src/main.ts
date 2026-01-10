import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #1a1a1a; color: white; overflow: hidden;">
    <div style="width: 260px; background: #2c3e50; padding: 20px; display: flex; flex-direction: column; gap: 12px; z-index: 10; box-shadow: 2px 0 10px rgba(0,0,0,0.5);">
      <h3 style="color: #3498db; margin: 0; font-size: 18px;">🌐 グループ会議</h3>
      
      <div style="display: flex; flex-direction: column; gap: 5px;">
        <label style="font-size: 10px; color: #bdc3c7;">ルーム名</label>
        <input id="room-id-input" type="text" placeholder="例: room1" style="width: 100%; padding: 8px; border-radius: 4px; border: none; color: #333;">
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 5px;">
        <label style="font-size: 10px; color: #bdc3c7;">パスワード</label>
        <input id="room-pass-input" type="password" placeholder="****" style="width: 100%; padding: 8px; border-radius: 4px; border: none; color: #333;">
      </div>

      <button id="join-room-btn" style="background: #3498db; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer; font-weight: bold; margin-top: 5px;">部屋に入室</button>
      
      <div style="border-top: 1px solid #34495e; padding-top: 10px; display: flex; flex-direction: column; gap: 8px;">
        <button id="toggle-mic" style="background: #2ecc71; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">🎤 マイク: ON</button>
        <button id="toggle-video" style="background: #2ecc71; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">📹 カメラ: ON</button>
        <button id="share-screen-btn" style="background: #9b59b6; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">🖥 画面共有</button>
      </div>

      <div style="margin-top: auto; display: flex; flex-direction: column; gap: 8px;">
        <button id="record-btn" style="background: #ff9800; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer; font-weight: bold;">🔴 録画開始</button>
        <button id="hangup-btn" style="background: #e74c3c; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer; font-weight: bold;">退出</button>
      </div>

      <div id="status-area" style="font-size: 11px; color: #2ecc71; text-align: center;">待機中</div>
    </div>

    <div style="flex: 1; display: flex; flex-direction: column; position: relative; background: #000;">
      <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 10px;">
        <video id="big-video" autoplay playsinline style="max-width: 100%; max-height: 100%; border-radius: 8px; background: #111;"></video>
      </div>

      <div id="video-grid" style="height: 150px; background: rgba(0,0,0,0.6); display: flex; gap: 10px; padding: 10px; overflow-x: auto; border-top: 1px solid #333;">
        <div style="position: relative; min-width: 180px; height: 100%;">
          <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px; border: 2px solid #646cff;"></video>
          <span style="position: absolute; bottom: 4px; left: 4px; font-size: 10px; background: rgba(0,0,0,0.5); padding: 1px 4px;">あなた</span>
        </div>
      </div>
    </div>
  </div>
`

// --- 要素取得 ---
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const videoGrid = document.querySelector('#video-grid')!;
const statusArea = document.querySelector<HTMLElement>('#status-area')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

// --- 初期化 ---
async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  bigVideo.srcObject = localStream;
}

// --- 接続ロジック ---
document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('room-pass-input') as HTMLInputElement).value.trim();
  if (!room || !pass) return alert("部屋名とパスワードを入力してください");

  if (peer) peer.destroy();

  // 1〜15番の席をランダムに選ぶ（より衝突しにくく）
  const myNum = Math.floor(Math.random() * 15) + 1;
  const myID = `room_${room}_${pass}_${myNum}`;
  
  peer = new Peer(myID);

  peer.on('open', (id) => {
    console.log("My Peer ID:", id);
    statusArea.innerText = `入室中 (席:${myNum})`;
    
    // 他の全席に電話をかける
    for (let i = 1; i <= 15; i++) {
      if (i === myNum) continue;
      const targetID = `room_${room}_${pass}_${i}`;
      const call = peer!.call(targetID, localStream);
      if (call) setupRemoteVideo(call);
    }
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    setupRemoteVideo(call);
  });

  peer.on('error', (err) => {
    console.error("PeerJS Error:", err);
    if (err.type === 'unavailable-id') {
      alert("席が埋まっています。もう一度入室ボタンを押してください。");
    }
  });
});

function setupRemoteVideo(call: any) {
  call.on('stream', (stream: MediaStream) => {
    if (connectedPeers.has(call.peer)) return;
    connectedPeers.add(call.peer);

    const container = document.createElement('div');
    container.id = `v-${call.peer}`;
    container.style.cssText = "position: relative; min-width: 180px; height: 100%; cursor: pointer;";
    
    const v = document.createElement('video');
    v.srcObject = stream;
    v.autoplay = true; v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 6px; background: #000;";
    
    container.onclick = () => { bigVideo.srcObject = stream; };
    container.appendChild(v);
    videoGrid.appendChild(container);
  });

  call.on('close', () => {
    document.getElementById(`v-${call.peer}`)?.remove();
    connectedPeers.delete(call.peer);
  });
}

// --- 各種ボタン機能 ---
document.querySelector('#toggle-mic')?.addEventListener('click', () => {
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  const btn = document.querySelector<HTMLButtonElement>('#toggle-mic')!;
  btn.innerText = track.enabled ? "🎤 マイク: ON" : "🎙️ マイク: OFF";
  btn.style.background = track.enabled ? "#2ecc71" : "#e74c3c";
});

document.querySelector('#toggle-video')?.addEventListener('click', () => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  const btn = document.querySelector<HTMLButtonElement>('#toggle-video')!;
  btn.innerText = track.enabled ? "📹 カメラ: ON" : "🚫 カメラ: OFF";
  btn.style.background = track.enabled ? "#2ecc71" : "#e74c3c";
});

document.querySelector('#share-screen-btn')?.addEventListener('click', async () => {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    bigVideo.srcObject = screenStream;
    screenStream.getVideoTracks()[0].onended = () => { bigVideo.srcObject = localStream; };
  } catch (err) { console.error(err); }
});

document.querySelector('#record-btn')?.addEventListener('click', () => {
  const btn = document.querySelector<HTMLButtonElement>('#record-btn')!;
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(bigVideo.srcObject as MediaStream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `meeting.webm`; a.click();
    };
    mediaRecorder.start();
    btn.innerText = "⏹ 停止";
    btn.style.background = "#555";
  } else {
    mediaRecorder.stop();
    btn.innerText = "🔴 録画開始";
    btn.style.background = "#ff9800";
  }
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => {
  if (confirm("会議を退出してリロードしますか？")) location.reload();
});

init();