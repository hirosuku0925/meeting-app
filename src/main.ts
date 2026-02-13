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
  .tool-btn.active { background: #4facfe !important; }
  .tool-btn.off { background: #ea4335 !important; }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; font-size: 10px; color: #888; gap: 4px; }
  .chat-msg { margin-bottom: 5px; word-break: break-all; padding: 4px; border-radius: 4px; background: rgba(255,255,255,0.05); }
  .chat-msg.me { color: #4facfe; background: rgba(79, 172, 254, 0.1); }
  #needle-guard { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: transparent; display: none; z-index: 6; }
  .name-label { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 18px; font-weight: bold; color: white; display: none; z-index: 2; text-shadow: 0 0 8px rgba(0,0,0,0.9); pointer-events: none; }
  .camera-off .name-label { display: block; }
  .camera-off video { opacity: 0; }
  #needle-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; z-index: 5; }
  .video-container { position: relative; height: 120px; min-width: 160px; background: #222; border-radius: 8px; overflow: hidden; cursor: pointer; border: 2px solid #333; flex-shrink: 0; }
  .video-container.active-border { border-color: #4facfe; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML構造 ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="flex: 1; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <video id="big-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: contain;"></video>
      <iframe id="needle-frame" src="https://engine.needle.tools/samples-uploads/facefilter/?" allow="camera; microphone; fullscreen"></iframe>
      <div id="needle-guard"></div> 
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">準備中...</div>
      
      <div id="chat-box" style="display:none; position: absolute; right: 10px; top: 10px; bottom: 10px; width: 250px; background: rgba(20,20,20,0.95); border-radius: 8px; flex-direction: column; border: 1px solid #444; z-index: 100;">
        <div style="padding: 10px; border-bottom: 1px solid #444; font-size: 13px; font-weight: bold;">チャット</div>
        <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 12px;"></div>
        <div style="padding: 10px; display: flex; gap: 5px; border-top: 1px solid #333;">
          <input id="chat-input" type="text" placeholder="送信..." style="flex: 1; background: #333; border: 1px solid #444; color: white; border-radius: 4px; padding: 6px; font-size: 12px;">
          <button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 0 10px; border-radius: 4px; cursor:pointer;">Go</button>
        </div>
      </div>
    </div>

    <div id="video-grid" style="height: 140px; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; align-items: center; border-top: 1px solid #333;">
      <div id="local-container" class="video-container">
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
      <div style="display:flex; gap: 5px; margin-left: 10px;">
        <input id="name-input" type="text" placeholder="名前" style="background: #222; border: 1px solid #444; color: white; padding: 8px; border-radius: 5px; width: 80px; font-size: 12px;">
        <input id="room-input" type="text" placeholder="部屋名" style="background: #222; border: 1px solid #444; color: white; padding: 8px; border-radius: 5px; width: 80px; font-size: 12px;">
        <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 0 15px; border-radius: 5px; cursor: pointer; font-weight: bold;">参加</button>
        <button id="exit-btn" style="background: #ea4335; color: white; border: none; padding: 0 15px; border-radius: 5px; cursor: pointer;">終了</button>
      </div>
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
let peer: Peer | null = null;
let myName = "ゲスト";
const connections = new Map<string, { call?: MediaConnection, data?: DataConnection }>();

// --- 4. 初期化 ---
async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    statusBadge.innerText = "オフライン (準備完了)";

    (document.querySelector('#name-input') as HTMLInputElement).value = SettingsManager.getUserName() || "";
    (document.querySelector('#room-input') as HTMLInputElement).value = SettingsManager.getLastRoomName() || "";

    setupFaceAvatarButtonHandler('avatar-btn');
    setupVoiceChangerButtonHandler();
  } catch (e) {
    statusBadge.innerText = "エラー: カメラ/マイクを許可してください";
    console.error(e);
  }
}

// --- 5. 接続ロジック（フルメッシュ） ---
function joinRoom(roomKey: string, seat: number) {
  if (peer) peer.destroy();
  
  const myPeerId = `${roomKey}-${seat}`;
  peer = new Peer(myPeerId);

  peer.on('open', (id) => {
    statusBadge.innerText = `オンライン: 席 ${seat}`;
    statusBadge.style.borderColor = "#2ecc71";
    
    // 1番から自分の前の番号までの全員に自分から接続を仕掛ける
    for (let i = 1; i < seat; i++) {
      const targetId = `${roomKey}-${i}`;
      connectToTarget(targetId);
    }
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    setupCallEvents(call);
  });

  peer.on('connection', (conn) => {
    setupDataEvents(conn);
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      // 席が埋まっていたら次の席を試す
      joinRoom(roomKey, seat + 1);
    } else {
      console.error('PeerJS Error:', err);
    }
  });
}

function connectToTarget(targetId: string) {
  if (!peer) return;
  // メディア接続
  const call = peer.call(targetId, localStream);
  if (call) setupCallEvents(call);
  // データ接続
  const conn = peer.connect(targetId);
  if (conn) setupDataEvents(conn);
}

function setupCallEvents(call: MediaConnection) {
  call.on('stream', (remoteStream) => {
    addRemoteVideo(call.peer, remoteStream);
  });
  call.on('close', () => removeRemoteVideo(call.peer));
  call.on('error', () => removeRemoteVideo(call.peer));
}

function setupDataEvents(conn: DataConnection) {
  const current = connections.get(conn.peer) || {};
  connections.set(conn.peer, { ...current, data: conn });

  conn.on('data', (data: any) => {
    if (data && data.type === 'chat') {
      appendMessage(data.name, data.message);
    }
  });
  conn.on('close', () => connections.delete(conn.peer));
}

function addRemoteVideo(peerId: string, stream: MediaStream) {
  if (document.getElementById(`container-${peerId}`)) return;

  const container = document.createElement('div');
  container.id = `container-${peerId}`;
  container.className = "video-container";
  
  const v = document.createElement('video');
  v.srcObject = stream;
  v.autoplay = true;
  v.playsInline = true;
  v.style.cssText = "height: 100%; width: 100%; object-fit: cover;";
  
  container.appendChild(v);
  videoGrid.appendChild(container);

  container.onclick = () => {
    bigVideo.srcObject = stream;
    // 他のコンテナの枠線を消して、クリックしたものを強調
    document.querySelectorAll('.video-container').forEach(c => c.classList.remove('active-border'));
    container.classList.add('active-border');
  };
}

function removeRemoteVideo(peerId: string) {
  const el = document.getElementById(`container-${peerId}`);
  if (el) el.remove();
  if (bigVideo.srcObject instanceof MediaStream && connections.get(peerId)) {
     // メイン画面が消えた人のものだったら自分に戻す
     bigVideo.srcObject = localStream;
  }
  connections.delete(peerId);
}

// --- 6. ユーザーアクション ---

document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value.trim();
  myName = (document.querySelector('#name-input') as HTMLInputElement).value.trim() || "名無し";
  
  if (!room) return alert("部屋名を入力してください");
  
  SettingsManager.setUserName(myName);
  SettingsManager.setLastRoomName(room);
  
  // 初期化（既存接続クリア）
  videoGrid.querySelectorAll('.video-container:not(#local-container)').forEach(v => v.remove());
  connections.clear();
  
  joinRoom(`vFINAL-${room}`, 1);
});

document.querySelector('#exit-btn')?.addEventListener('click', () => {
  if (confirm("終了しますか？")) location.reload();
});

document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  const track = localStream.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  
  const container = document.querySelector('#local-container')!;
  const label = document.querySelector('#local-name-label')!;
  
  if (!track.enabled) {
    container.classList.add('camera-off');
    label.textContent = myName;
  } else {
    container.classList.remove('camera-off');
  }
  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
});

document.querySelector('#mic-btn')?.addEventListener('click', (e) => {
    const track = localStream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
});

document.querySelector('#avatar-btn')?.addEventListener('click', (e) => {
  const isOpening = needleFrame.style.display === 'none' || needleFrame.style.display === '';
  needleFrame.style.display = isOpening ? 'block' : 'none';
  needleGuard.style.display = isOpening ? 'block' : 'none';
  bigVideo.style.opacity = isOpening ? '0' : '1';
  (e.currentTarget as HTMLElement).classList.toggle('active', isOpening);
});

document.querySelector('#chat-send-btn')?.addEventListener('click', sendChatMessage);
document.querySelector('#chat-input')?.addEventListener('keypress', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') sendChatMessage();
});

function sendChatMessage() {
  const input = document.querySelector<HTMLInputElement>('#chat-input')!;
  const msg = input.value.trim();
  if (!msg) return;

  connections.forEach(conn => {
    if (conn.data && conn.data.open) {
      conn.data.send({ type: 'chat', name: myName, message: msg });
    }
  });

  appendMessage("自分", msg, true);
  input.value = "";
}

function appendMessage(sender: string, text: string, isMe = false) {
  const div = document.createElement('div');
  div.className = `chat-msg ${isMe ? 'me' : ''}`;
  div.innerHTML = `<strong>${sender}:</strong> ${text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

document.querySelector('#chat-toggle-btn')?.addEventListener('click', (e) => {
  const isHidden = chatBox.style.display === 'none';
  chatBox.style.display = isHidden ? 'flex' : 'none';
  (e.currentTarget as HTMLElement).classList.toggle('active', isHidden);
});

// 起動
init();