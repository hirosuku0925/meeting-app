import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'
import { setupVoiceChangerButtonHandler } from './voice-changer-dialog'
import { setupFaceAvatarButtonHandler } from './face-image-avatar-dialog'
import { setupBeautyFilterButtonHandler } from './beauty-filter-dialog'

// --- 1. デザイン設定（CSS） ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { 
    background: #333; border: 2px solid #444; color: white; font-size: 20px; 
    width: 55px; height: 55px; border-radius: 50%; cursor: pointer; 
    transition: all 0.3s; display: flex; align-items: center; justify-content: center; 
  }
  .tool-btn:hover { background: #555; transform: scale(1.1); }
  .tool-btn.active { background: #4facfe !important; border-color: #00f2fe; }
  .tool-btn.off { background: #ea4335 !important; }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .btn-label { font-size: 10px; color: #aaa; font-weight: bold; }
  .video-container { position: relative; height: 100%; min-width: 220px; background: #222; border-radius: 12px; overflow: hidden; border: 2px solid #333; }
  .name-overlay { 
    position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
    display: none; align-items: center; justify-content: center; 
    background: #111; font-size: 24px; font-weight: bold; color: #4facfe; z-index: 1; 
  }
  .camera-off .name-overlay { display: flex; }
  #needle-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; z-index: 5; }
  #status-badge { 
    position: absolute; top: 20px; left: 20px; background: rgba(0,0,0,0.8); 
    padding: 6px 15px; border-radius: 30px; border: 1px solid #4facfe; 
    font-size: 13px; z-index: 10;
  }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML構造 ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="height: 65vh; position: relative; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain; z-index: 2;"></video>
      <iframe id="needle-frame" src="https://engine.needle.tools/samples-uploads/facefilter/?" allow="camera; microphone; fullscreen"></iframe>
      <div id="status-badge">システム準備中...</div>
    </div>

    <div id="toolbar" style="height: 120px; background: #111; display: flex; align-items: center; justify-content: center; gap: 20px; padding: 0 20px;">
      <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span class="btn-label">Camera</span></div>
      <div class="ctrl-group"><button id="avatar-btn" class="tool-btn">🎭</button><span class="btn-label">Avatar</span></div>
      <div class="ctrl-group"><button id="voice-btn" class="tool-btn">📢</button><span class="btn-label">Voice</span></div>
      <div class="ctrl-group"><button id="beauty-btn" class="tool-btn">✨</button><span class="btn-label">Beauty</span></div>
      
      <div style="display: flex; flex-direction: column; gap: 5px; margin-left: 10px;">
        <input id="name-input" type="text" placeholder="名前" style="background: #222; border: 1px solid #444; color: white; padding: 8px; width: 100px; border-radius: 4px;">
        <input id="room-input" type="text" placeholder="部屋名" style="background: #222; border: 1px solid #444; color: white; padding: 8px; width: 100px; border-radius: 4px;">
      </div>
      <button id="join-btn" style="background: #2ecc71; color: white; padding: 15px 25px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer;">入室</button>
    </div>

    <div id="video-grid" style="flex: 1; background: #050505; display: flex; gap: 15px; padding: 15px; overflow-x: auto; align-items: center;">
      <div id="local-container" class="video-container">
        <video id="local-video" autoplay playsinline muted style="height: 100%; width: 100%; object-fit: cover;"></video>
        <div id="local-name-tag" class="name-overlay">あなた</div>
      </div>
    </div>
  </div>
`;

// --- 3. プログラム本体 ---
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

async function changeVideoTrack(newStream: MediaStream) {
  const newTrack = newStream.getVideoTracks()[0];
  calls.forEach(call => {
    const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
    if (sender) sender.replaceTrack(newTrack);
  });
}

function getAvatarStream(): MediaStream | null {
  try {
    const canvas = needleFrame.contentWindow?.document.querySelector('canvas');
    return canvas ? (canvas as any).captureStream(30) : null;
  } catch(e) { return null; }
}

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    statusBadge.innerText = "オンライン";
    
    // ボタンの初期化（エラーが起きても他が動くように1つずつ実行）
    try { setupFaceAvatarButtonHandler('avatar-btn'); } catch(e) {}
    try { setupVoiceChangerButtonHandler('voice-btn'); } catch(e) {}
    try { setupBeautyFilterButtonHandler('beauty-btn'); } catch(e) {}
  } catch(e) { 
    statusBadge.innerText = "カメラエラー"; 
  }
}

function joinRoom(roomKey: string, seat: number) {
  if (peer) { peer.destroy(); peer = null; }

  // 接続IDをランダムにして競合（WebSocketクローズ）を防ぐ工夫
  const randomId = Math.floor(Math.random() * 1000);
  peer = new Peer(`${roomKey}-${seat}-${randomId}`);
  
  peer.on('open', (id) => {
    statusBadge.innerText = "入室しました";
    for (let i = 1; i <= 5; i++) {
      if (i === seat) continue;
      const targetIdPrefix = `${roomKey}-${i}`; 
      // 簡易化のため直接接続（本来はサーバーで管理するが、まずはボタンを動かす優先）
    }
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
  });

  peer.on('error', (err) => {
    console.error("PeerJS Error:", err);
    statusBadge.innerText = "通信エラー: 再入室してください";
  });
}

function handleCall(call: MediaConnection) {
  calls.set(call.peer, call);
  call.on('stream', (stream) => {
    if (document.getElementById(`container-${call.peer}`)) return;
    const container = document.createElement('div');
    container.id = `container-${call.peer}`;
    container.className = "video-container";
    container.innerHTML = `<video autoplay playsinline style="height: 100%; width: 100%; object-fit: cover;"></video><div class="name-overlay" id="name-${call.peer}">通信中</div>`;
    videoGrid.appendChild(container);
    container.querySelector('video')!.srcObject = stream;
  });
}

// ボタンイベント
document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  document.querySelector('#local-container')?.classList.toggle('camera-off', !track.enabled);
  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
});

document.querySelector('#avatar-btn')?.addEventListener('click', (e) => {
  isAvatarActive = !isAvatarActive;
  needleFrame.style.display = isAvatarActive ? 'block' : 'none';
  (e.currentTarget as HTMLElement).classList.toggle('active', isAvatarActive);
  const stream = isAvatarActive ? getAvatarStream() : localStream;
  if (stream) changeVideoTrack(stream);
});

document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value;
  if (!room) { alert("部屋名を入れてね！"); return; }
  myName = (document.querySelector('#name-input') as HTMLInputElement).value || "ゲスト";
  document.getElementById('local-name-tag')!.innerText = myName;
  joinRoom(`room-${room}`, 1);
});

init();