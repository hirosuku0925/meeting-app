import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'
import { setupVoiceChangerButtonHandler } from './voice-changer-dialog'
import { setupFaceAvatarButtonHandler } from './face-image-avatar-dialog'

// --- 1. スタイル設定 ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; position: relative; }
  .active { background: #4facfe !important; }
  .off { background: #ea4335 !important; }
  
  /* ボタンロック用 */
  .btn-lock-overlay {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0); cursor: not-allowed; z-index: 100;
    display: none;
  }
  .is-locked .btn-lock-overlay { display: block; }
  .is-locked { opacity: 0.3 !important; }

  /* ★アバター画面（iframe）の中を触らせないシールド */
  #iframe-shield {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    z-index: 10; display: none; cursor: default;
  }

  .name-overlay { 
    position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
    display: none; align-items: center; justify-content: center; 
    background: #222; font-size: 24px; font-weight: bold; z-index: 10;
  }
  .camera-off .name-overlay { display: flex; }
  .video-container { position: relative; height: 100%; min-width: 180px; background: #222; border-radius: 8px; overflow: hidden; }
  #needle-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; z-index: 5; }
`;
document.head.appendChild(globalStyle);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="height: 60vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain; z-index: 2;"></video>
      <div id="avatar-wrapper" style="position: absolute; top:0; left:0; width:100%; height:100%;">
        <iframe id="needle-frame" src="https://engine.needle.tools/samples-uploads/facefilter/?" allow="camera; microphone; fullscreen"></iframe>
        <div id="iframe-shield"></div> </div>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; font-size: 12px; z-index: 20;">準備OK</div>
    </div>
    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 12px;">
      <button id="cam-btn" class="tool-btn">📹</button>
      <button id="mic-btn" class="tool-btn">🎤</button>
      <button id="avatar-btn" class="tool-btn">🎭<div id="avatar-lock" class="btn-lock-overlay"></div></button>
      <button id="chat-btn" class="tool-btn">💬</button>
      <input id="name-input" type="text" placeholder="名前" style="background: #222; border: 1px solid #444; color: white; padding: 10px; width: 85px;">
      <input id="room-input" type="text" placeholder="部屋名" style="background: #222; border: 1px solid #444; color: white; padding: 10px; width: 85px;">
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

// --- 2. 変数管理 ---
let localStream: MediaStream | null = null;
let peer: Peer | null = null;
let isAvatarActive = false;
let isJoined = false;
const dataConns = new Map<string, DataConnection>();
const calls = new Map<string, MediaConnection>();

const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const videoGrid = document.querySelector<HTMLDivElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLDivElement>('#status-badge')!;
const needleFrame = document.querySelector<HTMLIFrameElement>('#needle-frame')!;
const iframeShield = document.getElementById('iframe-shield')!;

// --- 3. 補助関数 ---
function updateAllVideos(stream: MediaStream) {
  localVideo.srcObject = stream;
  bigVideo.srcObject = stream;
  const track = stream.getVideoTracks()[0];
  calls.forEach(call => {
    const sender = call.peerConnection.getSenders().find(s => s.track?.kind === 'video');
    if (sender) sender.replaceTrack(track);
  });
}

function getAvatarStream(): MediaStream | null {
  try {
    const canvas = needleFrame.contentWindow?.document.querySelector('canvas');
    return canvas ? (canvas as any).captureStream(30) : null;
  } catch (e) { return null; }
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

function handleDataConnection(conn: DataConnection) {
  dataConns.set(conn.peer, conn);
  conn.on('data', (data: any) => {
    const container = document.getElementById(`container-${conn.peer}`);
    if (!container) return;
    if (data.type === 'state') {
      if (data.cam) container.classList.remove('camera-off');
      else container.classList.add('camera-off');
    }
  });
}

function joinRoom(roomKey: string, seat: number) {
  if (peer) peer.destroy();
  const uniqueId = Math.floor(Math.random() * 9000) + 1000;
  peer = new Peer(`${roomKey}-${seat}-${uniqueId}`);

  peer.on('open', () => {
    statusBadge.innerText = "入室完了（ロック中）";
    isJoined = true;
    
    // ★ボタンをロック & 映像内のボタンを触らせないシールドをON
    document.getElementById('avatar-btn')?.classList.add('is-locked');
    iframeShield.style.display = 'block';

    for (let i = 1; i <= 5; i++) {
      if (i === seat) continue;
      if (localStream) {
        const targetId = `${roomKey}-${i}`;
        const call = peer!.call(targetId, localStream);
        if (call) handleCall(call);
        const conn = peer!.connect(targetId);
        if (conn) handleDataConnection(conn);
      }
    }
  });

  peer.on('call', (call) => {
    if (localStream) {
      // ★自分がアバターならアバター映像を、そうでないならカメラ映像を相手に送る
      const currentStream = isAvatarActive ? (getAvatarStream() || localStream) : localStream;
      call.answer(currentStream);
      handleCall(call);
    }
  });

  peer.on('connection', (conn) => handleDataConnection(conn));
}

// --- 4. 初期化とイベント ---
async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    setupFaceAvatarButtonHandler('avatar-btn');
    setupVoiceChangerButtonHandler('voice-btn');
  } catch (e) { statusBadge.innerText = "カメラを許可してね"; }
}

document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value;
  const name = (document.querySelector('#name-input') as HTMLInputElement).value;
  if (!room) return alert("部屋名を入れてね！");
  document.getElementById('local-name-tag')!.innerText = name || "ゲスト";
  joinRoom(`room-${room}`, 1);
});

document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
  document.getElementById('local-container')?.classList.toggle('camera-off', !track.enabled);
  dataConns.forEach(conn => conn.send({ type: 'state', cam: track.enabled }));
});

document.querySelector('#avatar-btn')?.addEventListener('click', (e) => {
  if (isJoined) return;
  isAvatarActive = !isAvatarActive;
  needleFrame.style.display = isAvatarActive ? 'block' : 'none';
  (e.currentTarget as HTMLElement).classList.toggle('active', isAvatarActive);
  
  if (isAvatarActive) {
    setTimeout(() => {
      const av = getAvatarStream();
      if (av) updateAllVideos(av);
    }, 1000);
  } else if (localStream) {
    updateAllVideos(localStream);
  }
});

document.querySelector('#mic-btn')?.addEventListener('click', (e) => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !audioTrack.enabled);
});

init();