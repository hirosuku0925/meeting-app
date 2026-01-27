import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'
import voiceChangerManager from './voice-changer-manager'
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
  .chat-msg { margin-bottom: 5px; word-break: break-all; }
  .chat-msg.me { color: #4facfe; }
  #needle-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; z-index: 5; }
  .video-container { position: relative; height: 100%; min-width: 180px; background: #222; border-radius: 8px; overflow: hidden; cursor: pointer; border: 1px solid #333; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML構造 ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="height: 60vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain;"></video>
      <iframe id="needle-frame" src="https://engine.needle.tools/samples-uploads/facefilter/?" allow="camera; microphone; fullscreen"></iframe>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">準備中...</div>
      <div id="chat-box" style="display:none; position: absolute; right: 10px; top: 10px; bottom: 10px; width: 220px; background: rgba(30,30,30,0.9); border-radius: 8px; flex-direction: column; border: 1px solid #444; z-index: 100;">
        <div style="padding: 8px; border-bottom: 1px solid #444; font-size: 12px; font-weight: bold;">チャット</div>
        <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 11px;"></div>
        <div style="padding: 8px; display: flex; gap: 5px;">
          <input id="chat-input" type="text" placeholder="メッセージ..." style="flex: 1; background: #222; border: 1px solid #555; color: white; border-radius: 4px; padding: 5px; font-size: 11px;">
          <button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 5px; border-radius: 4px; font-size: 11px; cursor:pointer;">送信</button>
        </div>
      </div>
    </div>
    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 12px; border-top: 1px solid #333; flex-shrink: 0; padding: 0 10px;">
      <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>マイク</span></div>
      <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>カメラ</span></div>
      <div class="ctrl-group"><button id="share-btn" class="tool-btn">📺</button><span>画面共有</span></div>
      <div class="ctrl-group"><button id="chat-toggle-btn" class="tool-btn">💬</button><span>チャット</span></div>
      <div class="ctrl-group"><button id="record-btn" class="tool-btn">🔴</button><span>録画</span></div>
      <div class="ctrl-group"><button id="avatar-btn" class="tool-btn">🎭</button><span>アバター</span></div>
      <div class="ctrl-group"><button id="voice-changer-btn" class="tool-btn">🎙️</button><span>ボイス</span></div>
      <input id="name-input" type="text" placeholder="名前" style="background: #222; border: 1px solid #444; color: white; padding: 10px; border-radius: 5px; width: 90px; font-size: 12px;">
      <input id="room-input" type="text" placeholder="部屋名" style="background: #222; border: 1px solid #444; color: white; padding: 10px; border-radius: 5px; width: 90px; font-size: 12px;">
      <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; font-weight: bold;">参加</button>
      <button id="exit-btn" style="background: #ea4335; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer;">終了</button>
    </div>
    <div id="video-grid" style="flex: 1; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; align-items: center; justify-content: center;">
      <video id="local-video" autoplay playsinline muted style="height: 100%; border-radius: 8px; border: 2px solid #4facfe; object-fit: cover;"></video>
    </div>
  </div>
`;

// --- 3. 変数管理 ---
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const videoGrid = document.querySelector<HTMLDivElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLDivElement>('#status-badge')!;
const chatBox = document.querySelector<HTMLDivElement>('#chat-box')!;
const chatMessages = document.querySelector<HTMLDivElement>('#chat-messages')!;
const needleFrame = document.querySelector<HTMLIFrameElement>('#needle-frame')!;

let localStream: MediaStream;
let screenStream: MediaStream | null = null;
let peer: Peer | null = null;
let myName = "ゲスト";
const connectedPeers = new Set<string>();
const dataConnections = new Map<string, DataConnection>();

// --- 4. 初期化 (一回だけ実行) ---
async function init() {
  if (localStream) return;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    statusBadge.innerText = "準備完了";

    (document.querySelector('#name-input') as HTMLInputElement).value = SettingsManager.getUserName();
    (document.querySelector('#room-input') as HTMLInputElement).value = SettingsManager.getLastRoomName();

    setupFaceAvatarButtonHandler('avatar-btn');
    setupVoiceChangerButtonHandler();
  } catch (e) { statusBadge.innerText = "カメラを許可してください"; }
}

// --- 5. 接続ロジック (カメラをリセットしない) ---
function tryNextSeat(roomKey: string, seat: number) {
  if (peer) {
    peer.destroy();
    peer = null;
  }
  const myPeerId = `${roomKey}-${seat}`;
  peer = new Peer(myPeerId);

  peer.on('open', (id) => {
    statusBadge.innerText = `席${seat}で接続中...`;
    
    // 前の席の人に接続を試みる
    const connect = () => {
      if (!peer || peer.destroyed) return;
      for (let i = 1; i < seat; i++) {
        const targetId = `${roomKey}-${i}`;
        if (targetId === id) continue; // 自分にはかけない
        if (!connectedPeers.has(targetId)) {
          const call = peer.call(targetId, screenStream || localStream);
          if (call) handleCall(call);
          const conn = peer.connect(targetId);
          if (conn) handleDataConnection(conn);
        }
      }
    };
    setTimeout(connect, 1000); // 幽霊ID対策で1秒待つ
  });

  peer.on('call', (call) => {
    call.answer(screenStream || localStream);
    handleCall(call);
  });

  peer.on('connection', (conn) => handleDataConnection(conn));

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') tryNextSeat(roomKey, seat + 1);
  });
}

function handleCall(call: MediaConnection) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);

  call.on('stream', (stream) => {
    if (document.getElementById(`container-${call.peer}`)) return;
    const container = document.createElement('div');
    container.id = `container-${call.peer}`;
    container.className = "video-container";
    const v = document.createElement('video');
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "height: 100%; width: 100%; object-fit: cover;";

    // 黒画面防止（自動再生リトライ）
    const check = setInterval(() => {
      if (v.paused && v.readyState >= 2) v.play().catch(() => {});
      else if (!v.paused) clearInterval(check);
    }, 1000);

    container.appendChild(v);
    videoGrid.appendChild(container);
    container.onclick = () => { 
      bigVideo.srcObject = stream; 
      bigVideo.muted = false;
    };
  });

  call.on('close', () => {
    document.getElementById(`container-${call.peer}`)?.remove();
    connectedPeers.delete(call.peer);
  });
}

function handleDataConnection(conn: DataConnection) {
  dataConnections.set(conn.peer, conn);
  conn.on('data', (data: any) => {
    if (data && data.name) appendMessage(data.name, data.message);
  });
  conn.on('close', () => dataConnections.delete(conn.peer));
}

// --- 6. イベント設定 ---
document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value.trim();
  myName = (document.querySelector('#name-input') as HTMLInputElement).value.trim() || "名無し";
  if (!room) return alert("部屋名を入れてね");
  
  SettingsManager.setUserName(myName);
  SettingsManager.setLastRoomName(room);
  
  // 画面リセット
  const otherVideos = videoGrid.querySelectorAll('.video-container');
  otherVideos.forEach(v => v.remove());
  connectedPeers.clear();
  
  tryNextSeat(`vFINAL-${room}`, 1);
});

document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

function appendMessage(sender: string, text: string, isMe = false) {
  const div = document.createElement('div');
  div.className = `chat-msg ${isMe ? 'me' : ''}`;
  div.innerText = `${sender}: ${text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

document.querySelector('#chat-send-btn')?.addEventListener('click', () => {
  const input = document.querySelector<HTMLInputElement>('#chat-input')!;
  if (!input.value.trim()) return;
  dataConnections.forEach(conn => conn.send({ name: myName, message: input.value }));
  appendMessage("自分", input.value, true);
  input.value = "";
});

document.querySelector('#chat-toggle-btn')?.addEventListener('click', () => {
  chatBox.style.display = chatBox.style.display === 'none' ? 'flex' : 'none';
});

document.querySelector('#avatar-btn')?.addEventListener('click', (e) => {
  const isOff = needleFrame.style.display === 'none' || needleFrame.style.display === '';
  needleFrame.style.display = isOff ? 'block' : 'none';
  bigVideo.style.opacity = isOff ? '0' : '1';
  (e.currentTarget as HTMLElement).classList.toggle('active', isOff);
});

init();