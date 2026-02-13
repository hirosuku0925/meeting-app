import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'
import voiceChangerManager from './voice-changer-manager'
import { setupVoiceChangerButtonHandler } from './voice-changer-dialog'
import { setupFaceAvatarButtonHandler } from './face-image-avatar-dialog'
import SettingsManager from './settings-manager'

// --- 1. スタイル設定（全パーツ維持） ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
  .tool-btn:hover { background: #444; transform: scale(1.1); }
  .tool-btn.active { background: #4facfe !important; }
  .tool-btn.off { background: #ea4335 !important; }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; font-size: 10px; color: #888; gap: 4px; }
  .chat-msg { margin-bottom: 5px; word-break: break-all; padding: 4px; border-radius: 4px; background: rgba(255,255,255,0.05); }
  .chat-msg.me { color: #4facfe; background: rgba(79, 172, 254, 0.1); }
  .name-label { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 18px; font-weight: bold; color: white; display: none; z-index: 2; text-shadow: 0 0 8px rgba(0,0,0,0.9); pointer-events: none; }
  .camera-off .name-label { display: block; }
  .camera-off video { opacity: 0; }
  
  /* リモートアバター用の枠 */
  .remote-avatar-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: none; z-index: 4; border: none; pointer-events: none; }
  .avatar-active .remote-avatar-overlay { display: block; }

  #needle-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; z-index: 5; }
  #needle-guard { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: transparent; display: none; z-index: 6; }
  .video-container { position: relative; height: 120px; min-width: 160px; background: #222; border-radius: 8px; overflow: hidden; cursor: pointer; border: 2px solid #333; flex-shrink: 0; }
  .video-container.active-border { border-color: #4facfe; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML構造（UIを完全復元） ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="flex: 1; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain;"></video>
      <iframe id="needle-frame" src="https://engine.needle.tools/samples-uploads/facefilter/?" allow="camera; microphone; fullscreen"></iframe>
      <div id="needle-guard"></div> 
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">準備中...</div>
      
      <div id="chat-box" style="display:none; position: absolute; right: 10px; top: 10px; bottom: 10px; width: 250px; background: rgba(20,20,20,0.95); border-radius: 8px; flex-direction: column; border: 1px solid #444; z-index: 100;">
        <div style="padding: 10px; border-bottom: 1px solid #444; font-size: 13px; font-weight: bold;">チャット</div>
        <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 12px;"></div>
        <div style="padding: 10px; display: flex; gap: 5px;">
          <input id="chat-input" type="text" style="flex: 1; background: #333; border: 1px solid #444; color: white; border-radius: 4px; padding: 6px;">
          <button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 0 10px; border-radius: 4px;">Go</button>
        </div>
      </div>
    </div>

    <div id="video-grid" style="height: 140px; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; align-items: center; border-top: 1px solid #333;">
      <div id="local-container" class="video-container active-border">
        <video id="local-video" autoplay playsinline muted style="height: 100%; width: 100%; object-fit: cover;"></video>
        <div id="local-name-label" class="name-label"></div>
      </div>
    </div>

    <div id="toolbar" style="height: 80px; background: #111; display: flex; align-items: center; justify-content: center; gap: 15px; border-top: 1px solid #333; padding: 0 10px;">
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
const needleFrame = document.querySelector<HTMLIFrameElement>('#needle-frame')!;

let rawCameraStream: MediaStream;
let peer: Peer | null = null;
let myName = "ゲスト";
let isCameraOn = true;
let isAvatarOn = false;

const connections = new Map<string, { call: MediaConnection, data: DataConnection, name: string }>();

// --- 4. 初期化 ---
async function init() {
  try {
    rawCameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = rawCameraStream;
    bigVideo.srcObject = rawCameraStream;

    // 設定の読み込み
    (document.querySelector('#name-input') as HTMLInputElement).value = SettingsManager.getUserName() || "";
    (document.querySelector('#room-input') as HTMLInputElement).value = SettingsManager.getLastRoomName() || "";

    setupFaceAvatarButtonHandler('avatar-btn');
    setupVoiceChangerButtonHandler();

    document.querySelector('#local-container')!.addEventListener('click', () => {
        bigVideo.srcObject = localVideo.srcObject;
        bigVideo.muted = true;
        document.querySelectorAll('.video-container').forEach(c => c.classList.remove('active-border'));
        document.querySelector('#local-container')!.classList.add('active-border');
    });
  } catch (e) {
    statusBadge.innerText = "カメラエラー: 許可してください";
  }
}

// --- 5. 接続ロジック（ルーム参加） ---
function joinRoom(roomKey: string, seat: number) {
  if (peer) peer.destroy();
  peer = new Peer(`${roomKey}-${seat}`);

  peer.on('open', () => {
    statusBadge.innerText = `オンライン: 席 ${seat}`;
    for (let i = 1; i < seat; i++) connectToTarget(`${roomKey}-${i}`);
  });

  peer.on('call', (call) => {
    call.answer(rawCameraStream);
    setupCallEvents(call);
  });

  peer.on('connection', (conn) => setupDataEvents(conn));
  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') joinRoom(roomKey, seat + 1);
  });
}

function connectToTarget(targetId: string) {
  if (!peer) return;
  const call = peer.call(targetId, rawCameraStream);
  const conn = peer.connect(targetId);
  if (call) setupCallEvents(call);
  if (conn) setupDataEvents(conn);
}

function setupCallEvents(call: MediaConnection) {
  call.on('stream', (stream) => addRemoteVideo(call.peer, stream, call));
  call.on('close', () => removeRemoteVideo(call.peer));
}

// データ同期（チャット・アバター状態）
function setupDataEvents(conn: DataConnection) {
  conn.on('open', () => {
    const existing = connections.get(conn.peer) || { call: null as any, data: conn, name: "不明" };
    existing.data = conn;
    connections.set(conn.peer, existing);
    conn.send({ type: 'sync', name: myName, cam: isCameraOn, avatar: isAvatarOn });
  });

  conn.on('data', (data: any) => {
    const remote = connections.get(conn.peer);
    if (!data || !remote) return;

    if (data.type === 'sync' || data.type === 'state-change') {
      remote.name = data.name;
      const container = document.getElementById(`container-${conn.peer}`);
      if (container) {
        // 重要：相手がアバターなら、相手の枠でアバターiframeを表示
        container.classList.toggle('avatar-active', data.avatar);
        container.classList.toggle('camera-off', !data.cam && !data.avatar);
        const label = container.querySelector('.name-label');
        if (label) label.textContent = data.name;
      }
    }
    if (data.type === 'chat') appendMessage(data.name, data.message);
  });
}

function addRemoteVideo(peerId: string, stream: MediaStream, call: MediaConnection) {
  if (document.getElementById(`container-${peerId}`)) return;

  const container = document.createElement('div');
  container.id = `container-${peerId}`;
  container.className = "video-container";
  container.innerHTML = `
    <video autoplay playsinline style="height:100%;width:100%;object-fit:cover;"></video>
    <iframe class="remote-avatar-overlay" src="https://engine.needle.tools/samples-uploads/facefilter/?" allow="camera; microphone;"></iframe>
    <div class="name-label"></div>
  `;
  const v = container.querySelector('video')!;
  v.srcObject = stream;
  videoGrid.appendChild(container);

  container.onclick = () => {
    bigVideo.srcObject = stream;
    bigVideo.muted = false;
    document.querySelectorAll('.video-container').forEach(c => c.classList.remove('active-border'));
    container.classList.add('active-border');
  };

  const existing = connections.get(peerId) || { data: null as any, name: "待機中" };
  connections.set(peerId, { ...existing, call });
}

function removeRemoteVideo(peerId: string) {
  document.getElementById(`container-${peerId}`)?.remove();
  connections.delete(peerId);
}

// --- 6. アバター・カメラ制御 ---

document.querySelector('#avatar-btn')?.addEventListener('click', () => {
  isAvatarOn = !isAvatarOn;
  needleFrame.style.display = isAvatarOn ? 'block' : 'none';
  bigVideo.style.opacity = isAvatarOn ? '0' : '1';
  
  updateLocalUI();
  broadcastState();
});

function updateLocalUI() {
  const container = document.querySelector('#local-container')!;
  container.classList.toggle('camera-off', !isCameraOn && !isAvatarOn);
  document.querySelector('#local-name-label')!.textContent = myName;
  document.querySelector('#cam-btn')!.classList.toggle('off', !isCameraOn);
  document.querySelector('#avatar-btn')!.classList.toggle('active', isAvatarOn);
}

function broadcastState() {
  connections.forEach(c => {
    if (c.data?.open) c.sendData({ type: 'state-change', name: myName, cam: isCameraOn, avatar: isAvatarOn });
  });
}

// --- 7. ボタンイベント群 ---

document.querySelector('#cam-btn')?.addEventListener('click', () => {
  const track = rawCameraStream.getVideoTracks()[0];
  isCameraOn = !isCameraOn;
  if (track) track.enabled = isCameraOn;
  updateLocalUI();
  broadcastState();
});

document.querySelector('#mic-btn')?.addEventListener('click', (e) => {
  const track = rawCameraStream.getAudioTracks()[0];
  if (track) track.enabled = !track.enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !track?.enabled);
});

document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value.trim();
  myName = (document.querySelector('#name-input') as HTMLInputElement).value.trim() || "名無し";
  if (!room) return alert("部屋名を入れてね");
  SettingsManager.setUserName(myName);
  SettingsManager.setLastRoomName(room);
  joinRoom(`vFINAL-${room}`, 1);
});

document.querySelector('#chat-send-btn')?.addEventListener('click', () => {
  const input = document.querySelector<HTMLInputElement>('#chat-input')!;
  if (!input.value.trim()) return;
  connections.forEach(c => c.data?.open && c.data.send({ type: 'chat', name: myName, message: input.value }));
  appendMessage("自分", input.value, true);
  input.value = "";
});

document.querySelector('#chat-toggle-btn')?.addEventListener('click', () => {
  chatBox.style.display = chatBox.style.display === 'none' ? 'flex' : 'none';
});

document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

function appendMessage(sender: string, text: string, isMe = false) {
  const div = document.createElement('div');
  div.className = `chat-msg ${isMe ? 'me' : ''}`;
  div.innerHTML = `<strong>${sender}:</strong> ${text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

init();