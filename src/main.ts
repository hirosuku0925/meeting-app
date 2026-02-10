import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'
import { setupVoiceChangerButtonHandler } from './voice-changer-dialog'
import { setupFaceAvatarButtonHandler } from './face-image-avatar-dialog'

const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; position: relative; }
  .active { background: #4facfe !important; }
  .off { background: #ea4335 !important; }
  
  /* ボタンロック（入室後） */
  .btn-lock-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0); cursor: not-allowed; z-index: 100; display: none; }
  .is-locked .btn-lock-overlay { display: block; }
  .is-locked { opacity: 0.3 !important; }

  /* ★最強の透明シールド（Needleのボタンを完全にガード） */
  #needle-shield {
    position: absolute;
    bottom: 0; left: 0; width: 100%; height: 120px; /* 下側のボタンエリアを広くカバー */
    z-index: 1000; display: none; background: rgba(0,0,0,0); cursor: no-drop;
  }

  .video-container { position: relative; height: 100%; min-width: 180px; background: #222; border-radius: 8px; overflow: hidden; }
  .name-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: none; align-items: center; justify-content: center; background: #222; font-size: 24px; font-weight: bold; z-index: 10; }
  .camera-off .name-overlay { display: flex; }
  #needle-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; z-index: 5; }
  
  #chat-box { position: absolute; right: 10px; bottom: 110px; width: 250px; height: 300px; background: rgba(0,0,0,0.85); border-radius: 8px; display: none; flex-direction: column; z-index: 2000; border: 1px solid #444; }
  #chat-messages { flex: 1; overflow-y: auto; padding: 10px; font-size: 14px; }
  #chat-input-area { display: flex; padding: 10px; border-top: 1px solid #444; }
  #chat-msg-input { flex: 1; background: #222; border: none; color: white; padding: 5px; border-radius: 4px; }
`;
document.head.appendChild(globalStyle);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="height: 60vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain; z-index: 2;"></video>
      <div id="avatar-wrapper" style="position: absolute; top:0; left:0; width:100%; height:100%;">
        <iframe id="needle-frame" src="https://engine.needle.tools/samples-uploads/facefilter/?" allow="camera; microphone; fullscreen"></iframe>
        <div id="needle-shield"></div> </div>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; font-size: 12px; z-index: 2001;">準備OK</div>
      
      <div id="chat-box">
        <div id="chat-messages"></div>
        <div id="chat-input-area"><input id="chat-msg-input" type="text" placeholder="メッセージ..."></div>
      </div>
    </div>

    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 12px;">
      <button id="cam-btn" class="tool-btn">📹</button>
      <button id="mic-btn" class="tool-btn">🎤</button>
      <button id="share-btn" class="tool-btn">📺</button>
      <button id="avatar-btn" class="tool-btn">🎭<div class="btn-lock-overlay"></div></button>
      <button id="chat-btn" class="tool-btn">💬</button>
      <input id="name-input" type="text" placeholder="名前" style="background: #222; border: 1px solid #444; color: white; padding: 10px; width: 70px;">
      <input id="room-input" type="text" placeholder="部屋" style="background: #222; border: 1px solid #444; color: white; padding: 10px; width: 70px;">
      <button id="join-btn" style="background: #2ecc71; color: white; padding: 10px 15px; border-radius: 5px; font-weight: bold;">参加</button>
    </div>

    <div id="video-grid" style="flex: 1; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto;">
      <div id="local-container" class="video-container">
        <video id="local-video" autoplay playsinline muted style="height: 100%; width: 100%; object-fit: cover;"></video>
        <div id="local-name-tag" class="name-overlay">自分</div>
      </div>
    </div>
  </div>
`;

// --- 変数管理 ---
let localStream: MediaStream | null = null;
let screenStream: MediaStream | null = null;
let peer: Peer | null = null;
let isAvatarActive = false;
let isJoined = false;
let myName = "ゲスト";
const dataConns = new Map<string, DataConnection>();
const calls = new Map<string, MediaConnection>();

const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const videoGrid = document.querySelector<HTMLDivElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLDivElement>('#status-badge')!;
const needleFrame = document.querySelector<HTMLIFrameElement>('#needle-frame')!;
const needleShield = document.getElementById('needle-shield')!;

// --- 同期処理 ---
function updateAllVideos(stream: MediaStream) {
  localVideo.srcObject = stream;
  bigVideo.srcObject = stream;
  const track = stream.getVideoTracks()[0];
  calls.forEach(call => {
    const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
    if (sender) sender.replaceTrack(track);
  });
}

function handleDataConnection(conn: DataConnection) {
  dataConns.set(conn.peer, conn);
  conn.on('data', (data: any) => {
    if (data.type === 'chat') {
        const msg = document.createElement('div');
        msg.innerText = `${data.name}: ${data.text}`;
        document.getElementById('chat-messages')?.appendChild(msg);
    }
    if (data.type === 'state') {
      const container = document.getElementById(`container-${conn.peer}`);
      if (container) data.cam ? container.classList.remove('camera-off') : container.classList.add('camera-off');
    }
  });
}

function handleCall(call: MediaConnection) {
  calls.set(call.peer, call);
  call.on('stream', (stream) => {
    if (document.getElementById(`container-${call.peer}`)) return;
    const container = document.createElement('div');
    container.id = `container-${call.peer}`;
    container.className = "video-container";
    container.innerHTML = `<video autoplay playsinline style="height: 100%; width: 100%; object-fit: cover;"></video><div class="name-overlay">通信中</div>`;
    videoGrid.appendChild(container);
    container.querySelector('video')!.srcObject = stream;
  });
}

// --- 参加処理 ---
function joinRoom(roomKey: string, seat: number) {
  if (peer) peer.destroy();
  peer = new Peer(`${roomKey}-${seat}-${Math.floor(Math.random()*1000)}`);
  peer.on('open', () => {
    isJoined = true;
    statusBadge.innerText = "入室中（ロック中）";
    document.getElementById('avatar-btn')?.classList.add('is-locked');
    // ★入室したらアバター内のボタンをガード！
    needleShield.style.display = 'block';

    for (let i = 1; i <= 5; i++) {
      if (i === seat) continue;
      const targetId = `${roomKey}-${i}`;
      if (localStream) {
        handleCall(peer!.call(targetId, localStream));
        handleDataConnection(peer!.connect(targetId));
      }
    }
  });
  peer.on('call', (call) => {
    const stream = isAvatarActive ? ( (needleFrame.contentWindow?.document.querySelector('canvas') as any)?.captureStream(30) || localStream ) : localStream;
    call.answer(stream!);
    handleCall(call);
  });
  peer.on('connection', handleDataConnection);
}

// --- イベント ---
document.querySelector('#avatar-btn')?.addEventListener('click', (e) => {
  if (isJoined) return;
  isAvatarActive = !isAvatarActive;
  needleFrame.style.display = isAvatarActive ? 'block' : 'none';
  (e.currentTarget as HTMLElement).classList.toggle('active', isAvatarActive);
  
  if (isAvatarActive) {
    // アバター起動時、少し待ってからストリームを切り替え
    setTimeout(() => {
      const canvas = needleFrame.contentWindow?.document.querySelector('canvas');
      const avStream = (canvas as any)?.captureStream(30);
      if (avStream) updateAllVideos(avStream);
    }, 1500);
  } else {
    // アバター終了時、元のカメラに確実に戻す
    updateAllVideos(localStream!);
  }
});

document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value;
  myName = (document.querySelector('#name-input') as HTMLInputElement).value || "ゲスト";
  if (room) joinRoom(`room-${room}`, 1);
});

// カメラ・マイク・共有・チャットは前のロジックを維持
document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  const track = localStream?.getVideoTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
    document.getElementById('local-container')?.classList.toggle('camera-off', !track.enabled);
    dataConns.forEach(conn => conn.send({ type: 'state', cam: track.enabled }));
  }
});

document.querySelector('#mic-btn')?.addEventListener('click', (e) => {
  const track = localStream?.getAudioTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
  }
});

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    setupFaceAvatarButtonHandler('avatar-btn');
    setupVoiceChangerButtonHandler('voice-btn');
  } catch(err) {
    statusBadge.innerText = "カメラエラー！";
  }
}
init();