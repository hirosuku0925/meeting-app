import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'
import voiceChangerManager from './voice-changer-manager'
import { setupVoiceChangerButtonHandler } from './voice-changer-dialog'
import { setupFaceAvatarButtonHandler } from './face-image-avatar-dialog'
import SettingsManager from './settings-manager'

// --- 1. スタイル (省略なし) ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
  .tool-btn:hover { background: #444; transform: scale(1.1); }
  .tool-btn.active { background: #4facfe !important; }
  .tool-btn.off { background: #ea4335 !important; }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; font-size: 10px; color: #888; gap: 4px; }
  .name-label { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 18px; font-weight: bold; color: white; display: none; z-index: 2; text-shadow: 0 0 8px rgba(0,0,0,0.9); pointer-events: none; }
  .camera-off .name-label { display: block; }
  .camera-off video { opacity: 0; }
  #needle-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; z-index: 5; }
  #needle-guard { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: transparent; display: none; z-index: 6; }
  .video-container { position: relative; height: 120px; min-width: 160px; background: #222; border-radius: 8px; overflow: hidden; cursor: pointer; border: 2px solid #333; flex-shrink: 0; }
  .video-container.active-border { border-color: #4facfe; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML (省略なし) ---
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
        <div style="padding: 10px; display: flex; gap: 5px;"><input id="chat-input" type="text" style="flex: 1; background: #333; border: 1px solid #444; color: white; border-radius: 4px; padding: 6px;"><button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 0 10px; border-radius: 4px;">Go</button></div>
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
const needleGuard = document.querySelector<HTMLDivElement>('#needle-guard')!;

let localStream: MediaStream;
let rawCameraStream: MediaStream; // 生のカメラを保存
let peer: Peer | null = null;
let myName = "ゲスト";
let isCameraOn = true;
let isAvatarOn = false;

// 接続中のPeerを管理（MediaConnectionを保持してストリームを入れ替えるため）
const connections = new Map<string, { call: MediaConnection, data: DataConnection, name: string }>();

// --- 4. 初期化 ---
async function init() {
  try {
    rawCameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStream = rawCameraStream;
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;

    (document.querySelector('#name-input') as HTMLInputElement).value = SettingsManager.getUserName() || "";
    (document.querySelector('#room-input') as HTMLInputElement).value = SettingsManager.getLastRoomName() || "";

    setupFaceAvatarButtonHandler('avatar-btn');
    setupVoiceChangerButtonHandler();

    document.querySelector('#local-container')!.addEventListener('click', () => {
        bigVideo.srcObject = localStream;
        bigVideo.muted = true;
        document.querySelectorAll('.video-container').forEach(c => c.classList.remove('active-border'));
        document.querySelector('#local-container')!.classList.add('active-border');
    });
  } catch (e) { statusBadge.innerText = "カメラを許可してください"; }
}

// --- 5. 接続ロジック ---
function joinRoom(roomKey: string, seat: number) {
  if (peer) peer.destroy();
  peer = new Peer(`${roomKey}-${seat}`);

  peer.on('open', () => {
    statusBadge.innerText = `オンライン: 席 ${seat}`;
    for (let i = 1; i < seat; i++) connectToTarget(`${roomKey}-${i}`);
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    setupCallEvents(call);
  });

  peer.on('connection', (conn) => setupDataEvents(conn));
  peer.on('error', (err) => { if (err.type === 'unavailable-id') joinRoom(roomKey, seat + 1); });
}

function connectToTarget(targetId: string) {
  if (!peer) return;
  const call = peer.call(targetId, localStream);
  const conn = peer.connect(targetId);
  setupCallEvents(call);
  setupDataEvents(conn);
}

function setupCallEvents(call: MediaConnection) {
  call.on('stream', (stream) => addRemoteVideo(call.peer, stream, call));
  call.on('close', () => removeRemoteVideo(call.peer));
}

function setupDataEvents(conn: DataConnection) {
  conn.on('open', () => {
    const existing = connections.get(conn.peer);
    if (existing) existing.data = conn;
    conn.send({ type: 'sync', name: myName, cam: isCameraOn, avatar: isAvatarOn });
  });

  conn.on('data', (data: any) => {
    const remote = connections.get(conn.peer);
    if (!data || !remote) return;

    if (data.type === 'sync' || data.type === 'state-change') {
      remote.name = data.name;
      const container = document.getElementById(`container-${conn.peer}`);
      if (container) {
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
  container.innerHTML = `<video autoplay playsinline style="height:100%;width:100%;object-fit:cover;"></video><div class="name-label"></div>`;
  const v = container.querySelector('video')!;
  v.srcObject = stream;
  videoGrid.appendChild(container);

  container.onclick = () => {
    bigVideo.srcObject = stream;
    bigVideo.muted = false;
    document.querySelectorAll('.video-container').forEach(c => c.classList.remove('active-border'));
    container.classList.add('active-border');
  };

  // connectionsに登録（後でストリームを入れ替えるのに使う）
  const dataConn = connections.get(peerId)?.data;
  connections.set(peerId, { call, data: dataConn!, name: "不明" });
}

function removeRemoteVideo(peerId: string) {
  document.getElementById(`container-${peerId}`)?.remove();
  connections.delete(peerId);
}

// --- 6. ユーザーアクション ---

// カメラボタン
document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  const track = rawCameraStream.getVideoTracks()[0];
  if (!track) return;
  isCameraOn = !isCameraOn;
  track.enabled = isCameraOn;
  
  updateLocalUI();
  broadcastState();
});

// アバターボタン
document.querySelector('#avatar-btn')?.addEventListener('click', async (e) => {
  isAvatarOn = !isAvatarOn;
  
  if (isAvatarOn) {
    needleFrame.style.display = 'block';
    needleGuard.style.display = 'block';
    bigVideo.style.opacity = '0';
    // 本来はここでNeedle EngineのcanvasからcaptureStream()したものをlocalStreamにする
    // 例: localStream = (needleCanvas as any).captureStream(30);
  } else {
    needleFrame.style.display = 'none';
    needleGuard.style.display = 'none';
    bigVideo.style.opacity = '1';
    localStream = rawCameraStream;
  }

  updateLocalUI();
  broadcastState();
  
  // ストリームが切り替わったことを相手に反映（replaceTrack）
  const videoTrack = localStream.getVideoTracks()[0];
  connections.forEach(conn => {
    const sender = conn.call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
    if (sender && videoTrack) sender.replaceTrack(videoTrack);
  });
});

function updateLocalUI() {
  const container = document.querySelector('#local-container')!;
  // カメラもアバターもOFFなら名前を出す
  container.classList.toggle('camera-off', !isCameraOn && !isAvatarOn);
  document.querySelector('#local-name-label')!.textContent = myName;
  document.querySelector('#cam-btn')!.classList.toggle('off', !isCameraOn);
  document.querySelector('#avatar-btn')!.classList.toggle('active', isAvatarOn);
}

function broadcastState() {
  connections.forEach(c => {
    if (c.data?.open) c.data.send({ type: 'state-change', name: myName, cam: isCameraOn, avatar: isAvatarOn });
  });
}

// 以下、参加・チャット等のイベント (省略なし)
document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value.trim();
  myName = (document.querySelector('#name-input') as HTMLInputElement).value.trim() || "名無し";
  if (!room) return alert("部屋名を入れてください");
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

document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

function appendMessage(sender: string, text: string, isMe = false) {
  const div = document.createElement('div');
  div.className = `chat-msg ${isMe ? 'me' : ''}`;
  div.innerHTML = `<strong>${sender}:</strong> ${text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

init();