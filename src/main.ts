import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'
import { setupVoiceChangerButtonHandler } from './voice-changer-dialog'
import { setupFaceAvatarButtonHandler } from './face-image-avatar-dialog'
import { setupBeautyFilterButtonHandler } from './beauty-filter-dialog'

// --- 1. グローバルスタイル（デザイン設定） ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
  
  .tool-btn { 
    background: #333; border: 2px solid #444; color: white; font-size: 20px; 
    width: 55px; height: 55px; border-radius: 50%; cursor: pointer; 
    transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; 
    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
  }
  .tool-btn:hover { background: #555; transform: translateY(-3px); border-color: #4facfe; }
  .tool-btn.active { background: #4facfe !important; border-color: #00f2fe; box-shadow: 0 0 15px #4facfe; }
  .tool-btn.off { background: #ea4335 !important; border-color: #ff5f52; }
  
  .ctrl-group { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .btn-label { font-size: 11px; color: #ccc; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; }

  .video-container { 
    position: relative; height: 100%; min-width: 220px; background: #222; 
    border-radius: 12px; overflow: hidden; border: 2px solid #333; 
    box-shadow: 0 8px 20px rgba(0,0,0,0.5); 
  }
  .name-overlay { 
    position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
    display: none; align-items: center; justify-content: center; 
    background: linear-gradient(135deg, #222 0%, #111 100%); 
    font-size: 24px; font-weight: bold; color: #4facfe; z-index: 1; 
  }
  .camera-off .name-overlay { display: flex; }
  
  #needle-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; z-index: 5; }
  #status-badge { 
    position: absolute; top: 20px; left: 20px; background: rgba(0,0,0,0.8); 
    padding: 6px 15px; border-radius: 30px; border: 1px solid #4facfe; 
    font-size: 13px; color: #4facfe; z-index: 10; font-weight: bold;
  }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML構造（UIパーツをしっかり配置） ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="height: 65vh; position: relative; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain; z-index: 2;"></video>
      <iframe id="needle-frame" src="https://engine.needle.tools/samples-uploads/facefilter/?" allow="camera; microphone; fullscreen"></iframe>
      <div id="status-badge">システム起動中...</div>
    </div>

    <div id="toolbar" style="height: 120px; background: #111; border-top: 2px solid #222; display: flex; align-items: center; justify-content: center; gap: 25px; padding: 0 20px;">
      <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span class="btn-label">Camera</span></div>
      <div class="ctrl-group"><button id="avatar-btn" class="tool-btn">🎭</button><span class="btn-label">Avatar</span></div>
      <div class="ctrl-group"><button id="voice-btn" class="tool-btn">📢</button><span class="btn-label">Voice</span></div>
      <div class="ctrl-group"><button id="beauty-btn" class="tool-btn">✨</button><span class="btn-label">Beauty</span></div>
      
      <div style="height: 50px; width: 2px; background: #333; margin: 0 10px;"></div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <input id="name-input" type="text" placeholder="あなたの名前" style="background: #222; border: 1px solid #444; color: white; padding: 8px 12px; width: 120px; border-radius: 6px; outline: none;">
        <input id="room-input" type="text" placeholder="部屋番号" style="background: #222; border: 1px solid #444; color: white; padding: 8px 12px; width: 120px; border-radius: 6px; outline: none;">
      </div>
      <button id="join-btn" style="background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%); color: white; padding: 15px 30px; border-radius: 10px; font-weight: bold; border: none; cursor: pointer; font-size: 16px; box-shadow: 0 4px 15px rgba(46, 204, 113, 0.3);">入室する</button>
    </div>

    <div id="video-grid" style="flex: 1; background: #050505; display: flex; gap: 15px; padding: 15px; overflow-x: auto; align-items: center;">
      <div id="local-container" class="video-container">
        <video id="local-video" autoplay playsinline muted style="height: 100%; width: 100%; object-fit: cover;"></video>
        <div id="local-name-tag" class="name-overlay">あなた</div>
      </div>
    </div>
  </div>
`;

// --- 3. ロジック（全機能の同期） ---
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
  const canvas = needleFrame.contentWindow?.document.querySelector('canvas');
  return canvas ? (canvas as any).captureStream(30) : null;
}

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    statusBadge.innerText = "オンライン";
    
    // ダイアログハンドラーの初期化
    setupFaceAvatarButtonHandler('avatar-btn');
    setupVoiceChangerButtonHandler('voice-btn');
    setupBeautyFilterButtonHandler('beauty-btn');
  } catch(e) { 
    statusBadge.innerText = "エラー: カメラが見つかりません"; 
  }
}

function joinRoom(roomKey: string, seat: number) {
  if (peer) peer.destroy();
  peer = new Peer(`${roomKey}-${seat}`);
  
  peer.on('open', (id) => {
    statusBadge.innerText = `通信中: ${id}`;
    for (let i = 1; i <= 5; i++) {
      if (i === seat) continue;
      const targetId = `${roomKey}-${i}`;
      const call = peer!.call(targetId, localStream);
      if (call) handleCall(call);
      const conn = peer!.connect(targetId);
      if (conn) handleDataConnection(conn);
    }
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
  });

  peer.on('connection', (conn) => handleDataConnection(conn));
}

function handleCall(call: MediaConnection) {
  calls.set(call.peer, call);
  
  // 接続完了後にアバター状態をチェックして同期
  setTimeout(() => {
    if (isAvatarActive) {
      const av = getAvatarStream();
      if (av) changeVideoTrack(av);
    }
  }, 2500);

  call.on('stream', (stream) => {
    if (document.getElementById(`container-${call.peer}`)) return;
    const container = document.createElement('div');
    container.id = `container-${call.peer}`;
    container.className = "video-container";
    container.innerHTML = `
      <video autoplay playsinline style="height: 100%; width: 100%; object-fit: cover;"></video>
      <div class="name-overlay" id="name-${call.peer}">接続中...</div>
    `;
    videoGrid.appendChild(container);
    container.querySelector('video')!.srcObject = stream;
  });
}

function handleDataConnection(conn: DataConnection) {
  dataConns.set(conn.peer, conn);
  conn.on('open', () => {
    conn.send({ type: 'info', name: myName });
  });
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

// ボタンイベント
document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  document.querySelector('#local-container')?.classList.toggle('camera-off', !track.enabled);
  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
  dataConns.forEach(c => c.send({ type: 'state', cam: track.enabled }));
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
  myName = (document.querySelector('#name-input') as HTMLInputElement).value || "ゲスト";
  document.getElementById('local-name-tag')!.innerText = myName;
  joinRoom(`room-${room}`, 1);
});

init();