import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'
// ↓ ここでエラーが起きている可能性が高いので、確実に存在する名前に合わせました
import { setupVoiceChangerButtonHandler } from './voice-changer-dialog'
import { setupFaceAvatarButtonHandler } from './face-image-avatar-dialog'

// --- 1. スタイル設定 ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
  .tool-btn:hover { background: #444; transform: scale(1.1); }
  .active { background: #4facfe !important; }
  .name-overlay { 
    position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
    display: none; align-items: center; justify-content: center; 
    background: #222; font-size: 24px; font-weight: bold; z-index: 1;
  }
  .camera-off .name-overlay { display: flex; }
  .video-container { position: relative; height: 100%; min-width: 180px; background: #222; border-radius: 8px; overflow: hidden; border: 1px solid #333; }
  #needle-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; z-index: 5; }
  #needle-guard { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: transparent; display: none; z-index: 6; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML構造 ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="height: 60vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain; z-index: 2;"></video>
      <iframe id="needle-frame" src="https://engine.needle.tools/samples-uploads/facefilter/?" allow="camera; microphone; fullscreen"></iframe>
      <div id="needle-guard"></div> 
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">準備中...</div>
    </div>
    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 12px;">
      <button id="cam-btn" class="tool-btn">📹</button>
      <button id="avatar-btn" class="tool-btn">🎭</button>
      <input id="name-input" type="text" placeholder="名前" style="background: #222; border: 1px solid #444; color: white; padding: 10px; width: 85px;">
      <input id="room-input" type="text" placeholder="部屋名" style="background: #222; border: 1px solid #444; color: white; padding: 10px; width: 85px;">
      <button id="join-btn" style="background: #2ecc71; color: white; padding: 10px 15px; border-radius: 5px; font-weight: bold;">参加</button>
    </div>
    <div id="video-grid" style="flex: 1; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto;">
      <div id="local-container" class="video-container">
        <video id="local-video" autoplay playsinline muted style="height: 100%; width: 100%; object-fit: cover;"></video>
        <div id="local-name-tag" class="name-overlay">自分</div>
      </div>
    </div>
  </div>
`;

let localStream: MediaStream;
let peer: Peer | null = null;
let myName = "ゲスト";
let isAvatarActive = false;
const calls = new Map<string, MediaConnection>();
const dataConns = new Map<string, DataConnection>();

const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const videoGrid = document.querySelector<HTMLDivElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLDivElement>('#status-badge')!;
const needleFrame = document.querySelector<HTMLIFrameElement>('#needle-frame')!;

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    statusBadge.innerText = "準備完了";
    
    // パーツの呼び出し（ここでエラーが出ても止まらないようにtry-catchに保護されています）
    try { setupFaceAvatarButtonHandler('avatar-btn'); } catch(e) { console.error(e); }
    try { setupVoiceChangerButtonHandler(); } catch(e) { console.error(e); }

  } catch(e) { 
    statusBadge.innerText = "カメラを許可してください"; 
    console.error("Camera error:", e);
  }
}

// （以下、前回の handleCall, handleDataConnection, joinRoom と同じです）
function joinRoom(roomKey: string, seat: number) {
  if (peer) peer.destroy();
  peer = new Peer(`${roomKey}-${seat}`);
  peer.on('open', () => {
    statusBadge.innerText = "入室しました";
    for (let i = 1; i <= 5; i++) {
      if (i === seat) continue;
      const targetId = `${roomKey}-${i}`;
      const call = peer!.call(targetId, localStream);
      if (call) handleCall(call);
      const conn = peer!.connect(targetId);
      if (conn) handleDataConnection(conn);
    }
  });
  peer.on('call', (call) => { call.answer(localStream); handleCall(call); });
  peer.on('connection', (conn) => handleDataConnection(conn));
}

function handleCall(call: MediaConnection) {
  calls.set(call.peer, call);
  call.on('stream', (stream) => {
    if (document.getElementById(`container-${call.peer}`)) return;
    const container = document.createElement('div');
    container.id = `container-${call.peer}`;
    container.className = "video-container";
    container.innerHTML = `<video autoplay playsinline style="height: 100%; width: 100%; object-fit: cover;"></video><div class="name-overlay" id="name-${call.peer}">通信中...</div>`;
    videoGrid.appendChild(container);
    container.querySelector('video')!.srcObject = stream;
  });
}

function handleDataConnection(conn: DataConnection) {
  dataConns.set(conn.peer, conn);
  conn.on('open', () => { conn.send({ type: 'info', name: myName }); });
  conn.on('data', (data: any) => {
    if (data.type === 'info') {
      const label = document.getElementById(`name-${conn.peer}`);
      if (label) label.innerText = data.name;
    }
    if (data.type === 'state') {
      const container = document.getElementById(`container-${conn.peer}`);
      if (data.cam) container?.classList.remove('camera-off');
      else container?.classList.add('camera-off');
    }
  });
}

document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value;
  myName = (document.querySelector('#name-input') as HTMLInputElement).value || "ゲスト";
  document.getElementById('local-name-tag')!.innerText = myName;
  joinRoom(`room-${room}`, 1);
});

init();