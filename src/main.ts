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
  
  /* ボタンロック */
  .btn-lock-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0); cursor: not-allowed; z-index: 100; display: none; }
  .is-locked .btn-lock-overlay { display: block; }
  .is-locked { opacity: 0.3 !important; }

  /* ★【鉄壁】画面の下半分を完全にガードする透明な壁 */
  #needle-shield {
    position: absolute;
    bottom: 0; left: 0; width: 100%; height: 55%; /* 画像のボタンエリアを完全に覆う */
    z-index: 99999;
    display: none; 
    background: rgba(0,0,0,0); 
    cursor: no-drop;
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
        <div id="needle-shield"></div> 
      </div>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; font-size: 12px; z-index: 2001;">準備OK</div>
      <div id="chat-box"><div id="chat-messages"></div><div id="chat-input-area"><input id="chat-msg-input" type="text" placeholder="メッセージ..."></div></div>
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

let localStream: MediaStream | null = null;
let peer: Peer | null = null;
let isAvatarActive = false;
let isJoined = false;
const dataConns = new Map<string, DataConnection>();
const calls = new Map<string, MediaConnection>();

const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const statusBadge = document.querySelector<HTMLDivElement>('#status-badge')!;
const needleFrame = document.querySelector<HTMLIFrameElement>('#needle-frame')!;
const needleShield = document.getElementById('needle-shield')!;

// ★映像を更新する関数
function updateAllVideos(stream: MediaStream) {
  localVideo.srcObject = stream;
  bigVideo.srcObject = stream;
  const videoTrack = stream.getVideoTracks()[0];
  calls.forEach(call => {
    const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
    if (sender) sender.replaceTrack(videoTrack);
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
    document.getElementById('video-grid')?.appendChild(container);
    container.querySelector('video')!.srcObject = stream;
  });
  call.on('close', () => {
    document.getElementById(`container-${call.peer}`)?.remove();
    calls.delete(call.peer);
  });
}

function joinRoom(roomKey: string) {
  if (peer) peer.destroy();
  // ★名前の重なりを防ぐためにランダムなIDを作成
  const myId = `${roomKey}-${Math.floor(Math.random() * 10000)}`;
  peer = new Peer(myId);

  peer.on('open', () => {
    isJoined = true;
    statusBadge.innerText = "入室中（ガード中）";
    document.getElementById('avatar-btn')?.classList.add('is-locked');
    needleShield.style.display = 'block'; // シールド出現！
    
    // 入室時に他のユーザーを自動で探す処理（本来はリストが必要ですが、ここでは着信を待つのが確実です）
  });

  peer.on('call', (call) => {
    const currentStream = isAvatarActive ? ((needleFrame.contentWindow?.document.querySelector('canvas') as any)?.captureStream(30) || localStream) : localStream;
    call.answer(currentStream!);
    handleCall(call);
  });

  peer.on('connection', (conn) => {
    dataConns.set(conn.peer, conn);
    // 接続されたら自分から相手にかけ直すことで、確実に映像を届ける
    if (localStream) {
        const currentStream = isAvatarActive ? ((needleFrame.contentWindow?.document.querySelector('canvas') as any)?.captureStream(30) || localStream) : localStream;
        const call = peer!.call(conn.peer, currentStream!);
        handleCall(call);
    }
  });
}

// アバター切り替え
document.querySelector('#avatar-btn')?.addEventListener('click', (e) => {
  if (isJoined) return;
  isAvatarActive = !isAvatarActive;
  needleFrame.style.display = isAvatarActive ? 'block' : 'none';
  (e.currentTarget as HTMLElement).classList.toggle('active', isAvatarActive);
  
  if (isAvatarActive) {
    setTimeout(() => {
      const canvas = needleFrame.contentWindow?.document.querySelector('canvas');
      const avStream = (canvas as any)?.captureStream(30);
      if (avStream) updateAllVideos(avStream);
    }, 2000);
  } else {
    updateAllVideos(localStream!);
  }
});

document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value;
  if (room) joinRoom(`room-${room}`);
});

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  bigVideo.srcObject = localStream;
  setupFaceAvatarButtonHandler('avatar-btn');
  setupVoiceChangerButtonHandler('voice-btn');
}
init();