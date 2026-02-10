import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'
import { setupVoiceChangerButtonHandler } from './voice-changer-dialog'
import { setupFaceAvatarButtonHandler } from './face-image-avatar-dialog'
import SettingsManager from './settings-manager'

// --- 1. スタイル設定 ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
  .tool-btn:hover { background: #444; transform: scale(1.1); }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; font-size: 10px; color: #888; gap: 4px; }
  .off { background: #ea4335 !important; }
  .active { background: #4facfe !important; }
  .name-label { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 18px; font-weight: bold; color: white; display: none; z-index: 2; text-shadow: 0 0 10px rgba(0,0,0,0.8); pointer-events: none; text-align: center; width: 100%; }
  
  .camera-off .name-label { display: block; }
  .camera-off video { opacity: 0; }
  .avatar-on { border: 2px solid #4facfe !important; }
  .avatar-on .name-label { display: block; color: #4facfe; font-size: 14px; top: 20px; transform: translate(-50%, 0); }

  #needle-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; z-index: 5; }
  #needle-guard { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: transparent; display: none; z-index: 6; }
  .video-container { position: relative; height: 100%; min-width: 180px; background: #222; border-radius: 8px; overflow: hidden; border: 1px solid #333; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML構造 ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="height: 60vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain;"></video>
      <iframe id="needle-frame" src="https://engine.needle.tools/samples-uploads/facefilter/?" allow="camera; microphone; fullscreen"></iframe>
      <div id="needle-guard"></div> 
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">準備中...</div>
      <div id="chat-box" style="display:none; position: absolute; right: 10px; top: 10px; bottom: 10px; width: 220px; background: rgba(30,30,30,0.9); border-radius: 8px; flex-direction: column; border: 1px solid #444; z-index: 100;">
        <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 11px;"></div>
        <div style="padding: 8px; display: flex; gap: 5px;">
          <input id="chat-input" type="text" placeholder="メッセージ..." style="flex: 1; background: #222; border: 1px solid #555; color: white; padding: 5px; font-size: 11px;">
          <button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 5px; border-radius: 4px;">送信</button>
        </div>
      </div>
    </div>
    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 12px;">
      <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>マイク</span></div>
      <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>カメラ</span></div>
      <div class="ctrl-group"><button id="chat-toggle-btn" class="tool-btn">💬</button><span>チャット</span></div>
      <div class="ctrl-group"><button id="avatar-btn" class="tool-btn">🎭</button><span>アバター</span></div>
      <input id="name-input" type="text" placeholder="名前" style="background: #222; border: 1px solid #444; color: white; padding: 10px; width: 85px;">
      <input id="room-input" type="text" placeholder="部屋名" style="background: #222; border: 1px solid #444; color: white; padding: 10px; width: 85px;">
      <button id="join-btn" style="background: #2ecc71; color: white; padding: 10px 15px; border-radius: 5px; font-weight: bold;">参加</button>
      <button id="exit-btn" style="background: #ea4335; color: white; padding: 10px 15px; border-radius: 5px;">終了</button>
    </div>
    <div id="video-grid" style="flex: 1; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto;">
      <div id="local-container" class="video-container">
        <video id="local-video" autoplay playsinline muted style="height: 100%; width: 100%; object-fit: cover;"></video>
        <div id="local-name-label" class="name-label">自分</div>
      </div>
    </div>
  </div>
`;

// --- 3. 変数管理 ---
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const videoGrid = document.querySelector<HTMLDivElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLDivElement>('#status-badge')!;
const needleFrame = document.querySelector<HTMLIFrameElement>('#needle-frame')!;
const needleGuard = document.querySelector<HTMLDivElement>('#needle-guard')!;
const chatBox = document.querySelector<HTMLDivElement>('#chat-box')!;
const chatMessages = document.querySelector<HTMLDivElement>('#chat-messages')!;
const chatInput = document.querySelector<HTMLInputElement>('#chat-input')!;

let localStream: MediaStream;
let peer: Peer | null = null;
let myName = "ゲスト";
let isAvatarActive = false;
const calls = new Map<string, MediaConnection>();
const dataConns = new Map<string, DataConnection>();

// --- 4. ヘルパー関数 ---

function getCurrentStream() {
  if (isAvatarActive) {
    const canvas = needleFrame.contentWindow?.document.querySelector('canvas');
    if (canvas) return (canvas as any).captureStream(30);
  }
  return localStream;
}

async function changeVideoTrack(newStream: MediaStream) {
  const newTrack = newStream.getVideoTracks()[0];
  localVideo.srcObject = newStream; 
  calls.forEach(call => {
    const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
    if (sender) sender.replaceTrack(newTrack);
  });
}

// --- 5. 通信ロジック ---

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    statusBadge.innerText = "準備完了";
    setupFaceAvatarButtonHandler('avatar-btn');
    setupVoiceChangerButtonHandler();
  } catch(e) { statusBadge.innerText = "カメラを許可してね"; }
}

function joinRoom(roomKey: string, seat: number) {
  // ★分身対策：徹底的にリセット
  if (peer) {
    peer.destroy();
    peer = null;
    calls.forEach(c => c.close());
    calls.clear();
    dataConns.clear();
    const remotes = videoGrid.querySelectorAll('.video-container:not(#local-container)');
    remotes.forEach(r => r.remove());
  }

  const myId = `${roomKey}-${seat}`;
  peer = new Peer(myId);

  peer.on('open', (id) => {
    statusBadge.innerText = `参加中: ${id}`;
    
    for (let i = 1; i <= 90; i++) {
      const targetId = `${roomKey}-${i}`;
      // ★自分自身には絶対に接続しない
      if (id === targetId) continue;
      
      const call = peer!.call(targetId, getCurrentStream());
      if (call) handleCall(call);
      const conn = peer!.connect(targetId);
      if (conn) handleDataConnection(conn);
    }
  });

  peer.on('call', (call) => {
    // ★着信時も自分自身なら拒否
    if (call.peer === peer?.id) {
        call.close();
        return;
    }
    call.answer(getCurrentStream()); 
    handleCall(call);
  });

  peer.on('connection', (conn) => {
    if (conn.peer === peer?.id) {
        conn.close();
        return;
    }
    handleDataConnection(conn);
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id' && seat < 90) {
      joinRoom(roomKey, seat + 1);
    }
  });
}

function handleCall(call: MediaConnection) {
  // ★映像受信時に相手が自分自身だったら即ブロック（分身防止の最終防衛ライン）
  if (call.peer === peer?.id) {
    call.close();
    return;
  }

  calls.set(call.peer, call);
  call.on('stream', (stream) => {
    if (document.getElementById(`container-${call.peer}`)) return;
    const container = document.createElement('div');
    container.id = `container-${call.peer}`;
    container.className = "video-container";
    const v = document.createElement('video');
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "height: 100%; width: 100%; object-fit: cover;";
    const label = document.createElement('div');
    label.className = "name-label";
    label.innerText = "相手";
    
    container.appendChild(v);
    container.appendChild(label);
    videoGrid.appendChild(container);
    container.onclick = () => { bigVideo.srcObject = stream; };
  });
  call.on('close', () => { 
    document.getElementById(`container-${call.peer}`)?.remove(); 
    calls.delete(call.peer); 
  });
}

function handleDataConnection(conn: DataConnection) {
  dataConns.set(conn.peer, conn);
  conn.on('data', (data: any) => {
    const targetContainer = document.getElementById(`container-${conn.peer}`);
    if (!targetContainer) return;
    const label = targetContainer.querySelector('.name-label') as HTMLElement;

    if (data.type === 'chat') {
      appendMessage(data.name, data.message);
    } 
    else if (data.type === 'avatar-sync') {
      if (data.value === 1) {
        targetContainer.classList.add('avatar-on');
        if (label) label.innerText = `${data.name} (アバター)`;
      } else {
        targetContainer.classList.remove('avatar-on');
        if (label) label.innerText = "相手";
      }
    }
    else if (data.type === 'camera-sync') {
      if (data.enabled === false) {
        targetContainer.classList.add('camera-off');
        if (label) label.innerText = data.name;
      } else {
        targetContainer.classList.remove('camera-off');
      }
    }
  });
}

// --- 6. ボタンイベント ---

document.querySelector('#mic-btn')?.addEventListener('click', (e) => {
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
});

document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  const container = document.querySelector('#local-container')!;
  
  if (!track.enabled) { 
    container.classList.add('camera-off'); 
    (document.querySelector('#local-name-label') as HTMLElement).textContent = myName; 
  } else { 
    container.classList.remove('camera-off'); 
  }
  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);

  const syncData = { type: 'camera-sync', name: myName, enabled: track.enabled };
  dataConns.forEach(c => c.send(syncData));
});

document.querySelector('#avatar-btn')?.addEventListener('click', async () => {
  isAvatarActive = !isAvatarActive;
  needleFrame.style.display = isAvatarActive ? 'block' : 'none';
  needleGuard.style.display = isAvatarActive ? 'block' : 'none';
  bigVideo.style.opacity = isAvatarActive ? '0' : '1';
  (document.querySelector('#avatar-btn') as HTMLElement).classList.toggle('active', isAvatarActive);

  await changeVideoTrack(getCurrentStream());

  const syncData = { type: 'avatar-sync', name: myName, value: isAvatarActive ? 1 : 0 };
  dataConns.forEach(c => c.send(syncData));
});

document.querySelector('#chat-toggle-btn')?.addEventListener('click', () => {
  chatBox.style.display = (chatBox.style.display === 'none') ? 'flex' : 'none';
});

document.querySelector('#chat-send-btn')?.addEventListener('click', () => {
  const msg = chatInput.value.trim();
  if (!msg) return;
  const data = { type: 'chat', name: myName, message: msg };
  dataConns.forEach(conn => conn.send(data));
  appendMessage(myName, msg, true);
  chatInput.value = "";
});

document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value.trim();
  myName = (document.querySelector('#name-input') as HTMLInputElement).value.trim() || "ゲスト";
  if (!room) return alert("部屋名を入れてね");
  joinRoom(`room-${room}`, 1);
});

document.querySelector('#exit-btn')?.addEventListener('click', () => {
    location.reload(); // 終了時はリロードが一番確実
});

function appendMessage(sender: string, text: string, isMe = false) {
  const div = document.createElement('div');
  div.style.cssText = `margin-bottom: 5px; word-break: break-all; color: ${isMe ? "#4facfe" : "white"};`;
  div.innerText = `${sender}: ${text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

init();