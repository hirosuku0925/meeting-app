import './style.css'
import { Peer, MediaConnection, DataConnection } from 'peerjs'
import { setupVoiceChangerButtonHandler } from './voice-changer-dialog'
import { setupFaceAvatarButtonHandler } from './face-image-avatar-dialog'
import SettingsManager from './settings-manager'

// 型定義
interface RemoteUser {
    data?: DataConnection;
    name: string;
    avatar: boolean;
    cam: boolean;
}

const AVATAR_URL = "https://engine.needle.tools/samples-uploads/facefilter/?";

// --- 1. スタイル設定 ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
  .tool-btn.active { background: #4facfe !important; }
  .tool-btn.off { background: #ea4335 !important; }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; font-size: 10px; color: #888; gap: 4px; }
  .chat-msg { margin-bottom: 5px; word-break: break-all; padding: 4px; border-radius: 4px; background: rgba(255,255,255,0.05); }
  .chat-msg.me { color: #4facfe; background: rgba(79, 172, 254, 0.1); }
  .name-label { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 18px; font-weight: bold; color: white; display: none; z-index: 2; text-shadow: 0 0 8px rgba(0,0,0,0.9); pointer-events: none; }
  .camera-off .name-label { display: block; }
  .camera-off video { opacity: 0; }
  .video-container { position: relative; height: 120px; min-width: 160px; background: #222; border-radius: 8px; overflow: hidden; cursor: pointer; border: 2px solid #333; flex-shrink: 0; }
  .video-container.active-border { border-color: #4facfe; }
  #main-remote-avatar { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; z-index: 5; pointer-events: none; }
  .avatar-shield { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1000; background: transparent; pointer-events: all; display: none; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML構造 ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="flex: 1; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain; z-index: 1;"></video>
      <div id="remote-avatar-wrapper" style="position:absolute; top:0; left:0; width:100%; height:100%; display:none; z-index: 5;">
        <iframe id="main-remote-avatar" src="about:blank" allow="camera; microphone;"></iframe>
        <div id="avatar-shield" class="avatar-shield"></div>
      </div>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 2000;">準備中...</div>
      <div id="chat-box" style="display:none; position: absolute; right: 10px; top: 10px; bottom: 10px; width: 250px; background: rgba(20,20,20,0.95); border-radius: 8px; flex-direction: column; border: 1px solid #444; z-index: 3000;">
        <div style="padding: 10px; border-bottom: 1px solid #444; font-size: 13px; font-weight: bold;">チャット</div>
        <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 12px;"></div>
        <div style="padding: 10px; display: flex; gap: 5px;"><input id="chat-input" type="text" style="flex: 1; background: #333; border: 1px solid #444; color: white; border-radius: 4px; padding: 6px;"><button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 0 10px; border-radius: 4px;">Go</button></div>
      </div>
    </div>
    <div id="video-grid" style="height: 140px; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; align-items: center; border-top: 1px solid #333;">
      <div id="local-container" class="video-container active-border camera-on">
        <video id="local-video" autoplay playsinline muted style="height: 100%; width: 100%; object-fit: cover;"></video>
      </div>
    </div>
    <div id="toolbar" style="height: 80px; background: #111; display: flex; align-items: center; justify-content: center; gap: 15px; border-top: 1px solid #333;">
      <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>マイク</span></div>
      <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>カメラ</span></div>
      <div class="ctrl-group"><button id="chat-toggle-btn" class="tool-btn">💬</button><span>チャット</span></div>
      <div class="ctrl-group"><button id="avatar-btn" class="tool-btn">🎭</button><span>アバター</span></div>
      <div class="ctrl-group"><button id="voice-changer-btn" class="tool-btn">🎙️</button><span>ボイス</span></div>
      <input id="name-input" type="text" placeholder="名前" style="background: #222; border: 1px solid #444; color: white; padding: 8px; border-radius: 5px; width: 80px;">
      <input id="room-input" type="text" placeholder="部屋名" style="background: #222; border: 1px solid #444; color: white; padding: 8px; border-radius: 5px; width: 80px;">
      <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 10px 15px; border-radius: 5px; font-weight: bold;">参加</button>
      <button id="exit-btn" style="background: #ea4335; color: white; border: none; padding: 10px 15px; border-radius: 5px;">終了</button>
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
const mainRemoteAvatar = document.querySelector<HTMLIFrameElement>('#main-remote-avatar')!;
const remoteAvatarWrapper = document.querySelector<HTMLDivElement>('#remote-avatar-wrapper')!;
const avatarShield = document.querySelector<HTMLDivElement>('#avatar-shield')!;

let localStream: MediaStream;
let peer: Peer | null = null;
let myName = "ゲスト";
let isCameraOn = true;
let isAvatarOn = false;
let currentFocusedPeerId = 'local'; 

const connections = new Map<string, RemoteUser>();

// --- 4. 画面表示の核 (バグ修正済み) ---
function refreshMainDisplay() {
    if (currentFocusedPeerId === 'local') {
        updateMainDisplay(localStream, isAvatarOn, isCameraOn, true);
    } else {
        const remote = connections.get(currentFocusedPeerId);
        const container = document.getElementById(`container-${currentFocusedPeerId}`);
        const videoEl = container?.querySelector('video');
        if (remote && videoEl && videoEl.srcObject instanceof MediaStream) {
            // 相手を映すときは「アバターOFF」として扱う (相手の映像にアバターが含まれているため)
            updateMainDisplay(videoEl.srcObject, false, remote.cam, false);
        }
    }
}

function updateMainDisplay(stream: MediaStream, avatarState: boolean, camState: boolean, isMuted: boolean) {
    bigVideo.srcObject = stream;
    bigVideo.muted = isMuted;

    // 「自分」かつ「アバターON」の時だけ共通iframeを使う
    if (currentFocusedPeerId === 'local' && avatarState && camState) {
        bigVideo.style.opacity = '0';
        if (mainRemoteAvatar.src !== AVATAR_URL) mainRemoteAvatar.src = AVATAR_URL;
        remoteAvatarWrapper.style.display = 'block';
        avatarShield.style.display = 'block'; 
    } else {
        // 相手がアバター中でも、ここには相手のビデオをそのまま出す
        bigVideo.style.opacity = camState ? '1' : '0';
        remoteAvatarWrapper.style.display = 'none';
        avatarShield.style.display = 'none';
        mainRemoteAvatar.src = "about:blank"; // 重要：中身を消して割り込みを防ぐ
    }
}

// --- 5. 初期化 ---
async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    
    setupFaceAvatarButtonHandler('avatar-btn');
    setupVoiceChangerButtonHandler();
    
    document.querySelector('#local-container')!.addEventListener('click', () => {
        currentFocusedPeerId = 'local';
        refreshMainDisplay();
        document.querySelectorAll('.video-container').forEach(c => c.classList.remove('active-border'));
        document.querySelector('#local-container')!.classList.add('active-border');
    });
  } catch (e) { statusBadge.innerText = "カメラを許可してください"; }
}

// --- 6. 接続ロジック ---
function joinRoom(roomKey: string, seat: number) {
  if (peer) peer.destroy();
  peer = new Peer(`${roomKey}-${seat}`);
  peer.on('open', () => {
    statusBadge.innerText = `オンライン: 席 ${seat}`;
    for (let i = 1; i < seat; i++) connectToTarget(`${roomKey}-${i}`);
  });
  peer.on('call', (call: MediaConnection) => {
    call.answer(localStream);
    setupCallEvents(call);
  });
  peer.on('connection', (conn: DataConnection) => setupDataEvents(conn));
}

function connectToTarget(targetId: string) {
  if (!peer) return;
  setupCallEvents(peer.call(targetId, localStream));
  setupDataEvents(peer.connect(targetId));
}

function setupCallEvents(call: MediaConnection) {
  call.on('stream', (stream: MediaStream) => addRemoteVideo(call.peer, stream));
  call.on('close', () => removeRemoteVideo(call.peer));
}

function setupDataEvents(conn: DataConnection) {
  conn.on('open', () => {
    connections.set(conn.peer, { data: conn, name: "不明", avatar: false, cam: true });
    conn.send({ type: 'sync', name: myName, cam: isCameraOn, avatar: isAvatarOn });
  });
  conn.on('data', (data: any) => {
    const remote = connections.get(conn.peer);
    if (!data || !remote) return;
    
    if (data.type === 'sync' || data.type === 'state-toggle') {
      remote.name = data.name;
      remote.avatar = !!data.avatar;
      remote.cam = !!data.cam;
      const container = document.getElementById(`container-${conn.peer}`);
      if (container) {
        container.classList.toggle('camera-off', !remote.cam);
        const label = container.querySelector('.name-label');
        if (label) label.textContent = remote.name;
      }
      if (currentFocusedPeerId === conn.peer) refreshMainDisplay();
    }
    if (data.type === 'chat' && data.message) appendMessage(data.name, data.message);
  });
}

function addRemoteVideo(peerId: string, stream: MediaStream) {
  if (document.getElementById(`container-${peerId}`)) return;
  const container = document.createElement('div');
  container.id = `container-${peerId}`;
  container.className = "video-container camera-on";
  container.innerHTML = `<video autoplay playsinline style="height:100%;width:100%;object-fit:cover;"></video><div class="name-label"></div>`;
  const v = container.querySelector('video')!;
  v.srcObject = stream;
  videoGrid.appendChild(container);
  
  container.onclick = () => {
    currentFocusedPeerId = peerId;
    refreshMainDisplay();
    document.querySelectorAll('.video-container').forEach(c => c.classList.remove('active-border'));
    container.classList.add('active-border');
  };
  if (!connections.has(peerId)) connections.set(peerId, { name: "待機中", avatar: false, cam: true });
}

function removeRemoteVideo(peerId: string) {
  document.getElementById(`container-${peerId}`)?.remove();
  connections.delete(peerId);
  if (currentFocusedPeerId === peerId) document.querySelector<HTMLElement>('#local-container')?.click();
}

// --- 7. アクション ---
document.querySelector('#avatar-btn')?.addEventListener('click', () => {
  isAvatarOn = !isAvatarOn;
  refreshMainDisplay();
  document.querySelector('#avatar-btn')!.classList.toggle('active', isAvatarOn);
  broadcastState();
});

document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  const track = localStream.getVideoTracks()[0];
  if (!track) return;
  isCameraOn = !isCameraOn;
  track.enabled = isCameraOn;
  document.querySelector('#local-container')!.classList.toggle('camera-off', !isCameraOn);
  (e.currentTarget as HTMLElement).classList.toggle('off', !isCameraOn);
  refreshMainDisplay();
  broadcastState();
});

function broadcastState() {
  connections.forEach(c => {
    if (c.data?.open) c.data.send({ type: 'state-toggle', name: myName, cam: isCameraOn, avatar: isAvatarOn });
  });
}

document.querySelector('#join-btn')?.addEventListener('click', () => {
  const r = document.querySelector<HTMLInputElement>('#room-input')!.value.trim();
  myName = document.querySelector<HTMLInputElement>('#name-input')!.value.trim() || "名無し";
  if (r) joinRoom(`vFINAL-${r}`, 1);
});

document.querySelector('#chat-send-btn')?.addEventListener('click', () => {
  const i = document.querySelector<HTMLInputElement>('#chat-input')!;
  if (!i.value.trim()) return;
  connections.forEach(c => c.data?.open && c.data.send({ type: 'chat', name: myName, message: i.value }));
  appendMessage("自分", i.value, true);
  i.value = "";
});

function appendMessage(sender: string, text: string, isMe = false) {
  const div = document.createElement('div');
  div.className = `chat-msg ${isMe ? 'me' : ''}`;
  div.innerHTML = `<strong>${sender}:</strong> ${text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

init();