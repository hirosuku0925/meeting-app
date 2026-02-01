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
  
  #needle-guard { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: transparent; display: none; z-index: 6; }

  .name-label {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    font-size: 24px; font-weight: bold; color: white; display: none; z-index: 2; text-shadow: 0 0 10px rgba(0,0,0,0.8);
    pointer-events: none; white-space: nowrap;
  }

  /* 相手の画面用アバター画像 */
  .remote-avatar {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    object-fit: contain; display: none; z-index: 3; pointer-events: none;
    background: #1a1a1a;
  }

  /* 状態別の表示切り替え */
  .camera-off .name-label { display: block; }
  .camera-off video { opacity: 0; }
  .avatar-active .remote-avatar { display: block; }
  .avatar-active video { opacity: 0; }

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
      <div id="needle-guard"></div> 
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">準備中...</div>
      <div id="chat-box" style="display:none; position: absolute; right: 10px; top: 10px; bottom: 10px; width: 220px; background: rgba(30,30,30,0.9); border-radius: 8px; flex-direction: column; border: 1px solid #444; z-index: 100;">
        <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 11px;"></div>
        <div style="padding: 8px; display: flex; gap: 5px;">
          <input id="chat-input" type="text" style="flex: 1; background: #222; border: 1px solid #555; color: white; border-radius: 4px; padding: 5px;">
          <button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 5px; border-radius: 4px;">送信</button>
        </div>
      </div>
    </div>
    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 12px;">
      <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>マイク</span></div>
      <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>カメラ</span></div>
      <div class="ctrl-group"><button id="avatar-btn" class="tool-btn">🎭</button><span>アバター</span></div>
      <input id="name-input" type="text" placeholder="名前" style="background: #222; border: 1px solid #444; color: white; padding: 10px; width: 90px;">
      <input id="room-input" type="text" placeholder="部屋名" style="background: #222; border: 1px solid #444; color: white; padding: 10px; width: 90px;">
      <button id="join-btn" style="background: #2ecc71; color: white; padding: 10px 15px; border-radius: 5px;">参加</button>
      <button id="exit-btn" style="background: #ea4335; color: white; padding: 10px 15px; border-radius: 5px;">終了</button>
    </div>
    <div id="video-grid" style="flex: 1; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; align-items: center; justify-content: center;">
      <div id="local-container" class="video-container">
        <video id="local-video" autoplay playsinline muted style="height: 100%; width: 100%; object-fit: cover;"></video>
        <div id="local-name-label" class="name-label"></div>
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

let localStream: MediaStream;
let peer: Peer | null = null;
let myName = "ゲスト";
let isAvatarActive = false; // アバター状態の変数
const connectedPeers = new Set<string>();
const dataConnections = new Map<string, DataConnection>();

// --- 4. 初期化 ---
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

// --- 5. 通信ロジック ---
function tryNextSeat(roomKey: string, seat: number) {
  if (peer) { peer.destroy(); peer = null; }
  peer = new Peer(`${roomKey}-${seat}`);
  peer.on('open', () => {
    statusBadge.innerText = `席${seat}で参加中`;
    setTimeout(() => {
      for (let i = 1; i < seat; i++) {
        const targetId = `${roomKey}-${i}`;
        if (!connectedPeers.has(targetId)) {
          const call = peer!.call(targetId, localStream);
          if (call) handleCall(call);
          const conn = peer!.connect(targetId);
          if (conn) handleDataConnection(conn);
        }
      }
    }, 1000);
  });
  peer.on('call', (call) => { call.answer(localStream); handleCall(call); });
  peer.on('connection', (conn) => handleDataConnection(conn));
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
    
    // 相手用アバター画像（変数を元に表示を切り替える場所）
    const avatarImg = document.createElement('img');
    avatarImg.src = "https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Animals/Raccoon.png";
    avatarImg.className = "remote-avatar";
    
    container.appendChild(v);
    container.appendChild(avatarImg);
    videoGrid.appendChild(container);
    container.onclick = () => { bigVideo.srcObject = stream; bigVideo.muted = false; };
  });
  call.on('close', () => { document.getElementById(`container-${call.peer}`)?.remove(); connectedPeers.delete(call.peer); });
}

function handleDataConnection(conn: DataConnection) {
  dataConnections.set(conn.peer, conn);
  conn.on('data', (data: any) => {
    // 変数(type)を受け取って、相手の表示を切り替える
    const container = document.getElementById(`container-${conn.peer}`);
    if (data.type === 'AVATAR_STATE') {
      if (data.active) container?.classList.add('avatar-active');
      else container?.classList.remove('avatar-active');
    }
    if (data.name && data.message) appendMessage(data.name, data.message);
  });
}

// --- 6. イベント設定 ---
document.querySelector('#avatar-btn')?.addEventListener('click', (e) => {
  isAvatarActive = !isAvatarActive; // 変数を反転
  const isOff = !isAvatarActive;
  
  needleFrame.style.display = isAvatarActive ? 'block' : 'none';
  needleGuard.style.display = isAvatarActive ? 'block' : 'none';
  bigVideo.style.opacity = isAvatarActive ? '0' : '1';
  (e.currentTarget as HTMLElement).classList.toggle('active', isAvatarActive);

  // 全員に「今アバターだよ（じゃないよ）」という変数を送る
  dataConnections.forEach(conn => {
    conn.send({ type: 'AVATAR_STATE', active: isAvatarActive });
  });
});

document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  const container = document.querySelector('#local-container')!;
  const label = document.querySelector('#local-name-label')!;
  if (!track.enabled) { container.classList.add('camera-off'); label.textContent = myName; }
  else { container.classList.remove('camera-off'); }
  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
});

document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value.trim();
  myName = (document.querySelector('#name-input') as HTMLInputElement).value.trim() || "名無し";
  if (!room) return alert("部屋名を入れてね");
  SettingsManager.setUserName(myName);
  SettingsManager.setLastRoomName(room);
  tryNextSeat(`vFINAL-${room}`, 1);
});

function appendMessage(sender: string, text: string) {
  const div = document.createElement('div');
  div.className = "chat-msg";
  div.innerText = `${sender}: ${text}`;
  document.querySelector('#chat-messages')?.appendChild(div);
}

init();