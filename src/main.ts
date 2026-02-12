import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'
import voiceChangerManager from './voice-changer-manager'
import { setupVoiceChangerButtonHandler } from './voice-changer-dialog'
import { setupFaceAvatarButtonHandler } from './face-image-avatar-dialog'
import SettingsManager from './settings-manager'

// --- 1. スタイル設定（3人以上対応レイアウト） ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  
  /* 下部のビデオ表示エリアをグリッドに変更 */
  #video-grid { 
    flex: 1; 
    background: #000; 
    display: grid; 
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
    gap: 10px; 
    padding: 10px; 
    overflow-y: auto; 
    align-content: start;
  }

  .video-container { 
    position: relative; 
    aspect-ratio: 16 / 9; 
    background: #222; 
    border-radius: 8px; 
    overflow: hidden; 
    cursor: pointer; 
    border: 2px solid #333; 
    transition: 0.2s;
  }
  .video-container:hover { border-color: #4facfe; }

  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
  .tool-btn:hover { background: #444; transform: scale(1.1); }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; font-size: 10px; color: #888; gap: 4px; }
  .off { background: #ea4335 !important; }
  .active { background: #4facfe !important; }
  
  .name-label {
    position: absolute;
    top: 50%; left: 50%; transform: translate(-50%, -50%);
    font-size: 18px; font-weight: bold; color: white;
    display: none; z-index: 2; text-shadow: 0 0 10px rgba(0,0,0,0.8);
    pointer-events: none;
  }
  .camera-off .name-label { display: block; }
  .camera-off video { opacity: 0; }

  #needle-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; z-index: 5; }
  #needle-guard { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: transparent; display: none; z-index: 6; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML構造 ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="height: 50vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain;"></video>
      <iframe id="needle-frame" src="https://engine.needle.tools/samples-uploads/facefilter/?" allow="camera; microphone; fullscreen"></iframe>
      <div id="needle-guard"></div> 
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">準備中...</div>
      
      <div id="chat-box" style="display:none; position: absolute; right: 10px; top: 10px; bottom: 10px; width: 220px; background: rgba(30,30,30,0.9); border-radius: 8px; flex-direction: column; border: 1px solid #444; z-index: 100;">
        <div style="padding: 8px; border-bottom: 1px solid #444; font-size: 12px; font-weight: bold;">チャット</div>
        <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 11px;"></div>
        <div style="padding: 8px; display: flex; gap: 5px;">
          <input id="chat-input" type="text" placeholder="メッセージ..." style="flex: 1; background: #222; border: 1px solid #555; color: white; border-radius: 4px; padding: 5px; font-size: 11px;">
          <button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 5px; border-radius: 4px; font-size: 11px;">送信</button>
        </div>
      </div>
    </div>

    <div id="video-grid">
      <div id="local-container" class="video-container">
        <video id="local-video" autoplay playsinline muted style="height: 100%; width: 100%; object-fit: cover;"></video>
        <div id="local-name-label" class="name-label">自分</div>
      </div>
    </div>

    <div id="toolbar" style="height: 90px; background: #111; display: flex; align-items: center; justify-content: center; gap: 10px; border-top: 1px solid #333; padding: 0 10px;">
      <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>マイク</span></div>
      <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>カメラ</span></div>
      <div class="ctrl-group"><button id="chat-toggle-btn" class="tool-btn">💬</button><span>チャット</span></div>
      <div class="ctrl-group"><button id="avatar-btn" class="tool-btn">🎭</button><span>アバター</span></div>
      <input id="name-input" type="text" placeholder="名前" style="background: #222; border: 1px solid #444; color: white; padding: 8px; border-radius: 5px; width: 80px; font-size: 12px;">
      <input id="room-input" type="text" placeholder="部屋名" style="background: #222; border: 1px solid #444; color: white; padding: 8px; border-radius: 5px; width: 80px; font-size: 12px;">
      <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; font-weight: bold;">参加</button>
      <button id="exit-btn" style="background: #ea4335; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer;">終了</button>
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
const connectedPeers = new Set<string>();
const dataConnections = new Map<string, DataConnection>();

// --- 4. 初期化 ---
async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    statusBadge.innerText = "準備完了";

    (document.querySelector('#name-input') as HTMLInputElement).value = SettingsManager.getUserName() || "";
    (document.querySelector('#room-input') as HTMLInputElement).value = SettingsManager.getLastRoomName() || "";

    setupFaceAvatarButtonHandler('avatar-btn');
    setupVoiceChangerButtonHandler();
  } catch (e) { statusBadge.innerText = "カメラ/マイクを許可してください"; }
}

// --- 5. 接続ロジック（多人数対応） ---
function tryNextSeat(roomKey: string, seat: number) {
  if (peer) { peer.destroy(); peer = null; }
  peer = new Peer(`${roomKey}-${seat}`);

  peer.on('open', (id) => {
    statusBadge.innerText = `入室完了: ${seat}番目の席`;
    // 1番から自分の席番号までの全員に自分から接続を試みる
    for (let i = 1; i <= 20; i++) { // 最大20人想定
      const targetId = `${roomKey}-${i}`;
      if (targetId !== id && !connectedPeers.has(targetId)) {
        const call = peer!.call(targetId, localStream);
        if (call) handleCall(call);
        const conn = peer!.connect(targetId);
        if (conn) handleDataConnection(conn);
      }
    }
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
  });

  peer.on('connection', (conn) => handleDataConnection(conn));

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      tryNextSeat(roomKey, seat + 1); // 席が埋まってたら次へ
    }
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
    v.srcObject = stream;
    v.autoplay = true;
    v.playsInline = true;
    v.style.cssText = "height: 100%; width: 100%; object-fit: cover;";
    
    const label = document.createElement('div');
    label.className = "name-label";
    label.innerText = "リモート"; 

    container.appendChild(v);
    container.appendChild(label);
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
    if (data.type === 'chat') appendMessage(data.name, data.message);
  });
  conn.on('close', () => dataConnections.delete(conn.peer));
}

// --- 6. イベント ---

// マイクON/OFF
document.querySelector('#mic-btn')?.addEventListener('click', (e) => {
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    const btn = e.currentTarget as HTMLElement;
    btn.classList.toggle('off', !audioTrack.enabled);
    btn.innerText = audioTrack.enabled ? '🎤' : '🔇';
  }
});

// カメラON/OFF
document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    const container = document.querySelector('#local-container')!;
    container.classList.toggle('camera-off', !videoTrack.enabled);
    (e.currentTarget as HTMLElement).classList.toggle('off', !videoTrack.enabled);
  }
});

// 参加
document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value.trim();
  myName = (document.querySelector('#name-input') as HTMLInputElement).value.trim() || "名無し";
  if (!room) return alert("部屋名を入力してください");
  
  SettingsManager.setUserName(myName);
  SettingsManager.setLastRoomName(room);
  
  // 自分以外のビデオをクリアして再接続
  videoGrid.querySelectorAll('.video-container:not(#local-container)').forEach(v => v.remove());
  connectedPeers.clear();
  tryNextSeat(`vFINAL-${room}`, 1);
});

// チャット
document.querySelector('#chat-send-btn')?.addEventListener('click', () => {
  const input = document.querySelector<HTMLInputElement>('#chat-input')!;
  const msg = input.value.trim();
  if (!msg) return;
  dataConnections.forEach(conn => conn.send({ type: 'chat', name: myName, message: msg }));
  appendMessage("自分", msg, true);
  input.value = "";
});

function appendMessage(sender: string, text: string, isMe = false) {
  const div = document.createElement('div');
  div.className = `chat-msg ${isMe ? 'me' : ''}`;
  div.innerText = `${sender}: ${text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

document.querySelector('#chat-toggle-btn')?.addEventListener('click', () => {
  chatBox.style.display = chatBox.style.display === 'none' ? 'flex' : 'none';
});

document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

init();