import './style.css'
import { Peer, type MediaConnection } from 'peerjs'
import { setupVoiceChangerButtonHandler } from './voice-changer-dialog'
import { setupFaceAvatarButtonHandler } from './face-image-avatar-dialog'

// --- 1. スタイル ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .video-container { position: relative; height: 160px; min-width: 200px; background: #222; border-radius: 12px; overflow: hidden; border: 2px solid #333; transition: 0.3s; }
  .video-container:hover { border-color: #4facfe; transform: translateY(-5px); }
  .name-badge { position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.6); padding: 2px 10px; border-radius: 4px; font-size: 12px; z-index: 5; }
  #video-grid { flex: 1; display: flex; gap: 15px; padding: 20px; overflow-x: auto; align-items: center; background: #0a0a0a; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML構造 ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="height: 60vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center;">
      <video id="big-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: contain;"></video>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: #4facfe; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; z-index: 10;">待機中</div>
    </div>
    
    <div id="video-grid">
      <div id="local-container" class="video-container">
        <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover;"></video>
        <div class="name-badge">あなた</div>
      </div>
    </div>

    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 15px; border-top: 1px solid #333;">
      <input id="room-input" type="text" placeholder="部屋名（共通）" style="background: #222; border: 1px solid #444; color: white; padding: 12px; border-radius: 8px; width: 150px;">
      <input id="seat-input" type="number" value="1" min="1" max="10" style="background: #222; border: 1px solid #444; color: white; padding: 12px; border-radius: 8px; width: 60px;">
      <button id="join-btn" style="background: #2ecc71; color: white; padding: 12px 25px; border-radius: 8px; font-weight: bold; cursor: pointer;">参加</button>
      <button id="exit-btn" style="background: #ea4335; color: white; padding: 12px 25px; border-radius: 8px; cursor: pointer;">終了</button>
    </div>
  </div>
`;

// --- 3. 変数とロジック ---
let localStream: MediaStream;
let peer: Peer | null = null;
const videoGrid = document.querySelector('#video-grid')!;
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  (document.querySelector('#local-video') as HTMLVideoElement).srcObject = localStream;
  bigVideo.srcObject = localStream;
  setupFaceAvatarButtonHandler('avatar-btn'); // アバターボタンがある場合
}

function joinRoom(roomName: string, mySeat: number) {
  if (peer) peer.destroy();
  
  // ID形式: room-test-1, room-test-2...
  peer = new Peer(`${roomName}-${mySeat}`);

  peer.on('open', (id) => {
    document.querySelector('#status-badge')!.innerHTML = `参加中: 席 ${mySeat}`;
    
    // 3人以上のための「総当たり」接続
    // 1番から10番までの席に誰かいないか確認して電話をかける
    for (let i = 1; i <= 10; i++) {
      if (i === mySeat) continue; 
      const targetId = `${roomName}-${i}`;
      const call = peer!.call(targetId, localStream);
      if (call) handleCall(call);
    }
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
  });
}

function handleCall(call: MediaConnection) {
  call.on('stream', (remoteStream) => {
    if (document.getElementById(`container-${call.peer}`)) return;

    const container = document.createElement('div');
    container.id = `container-${call.peer}`;
    container.className = "video-container";
    
    const v = document.createElement('video');
    v.srcObject = remoteStream;
    v.autoplay = true;
    v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
    
    const badge = document.createElement('div');
    badge.className = "name-badge";
    badge.innerText = `席 ${call.peer.split('-').pop()}`;

    container.appendChild(v);
    container.appendChild(badge);
    videoGrid.appendChild(container);

    container.onclick = () => { bigVideo.srcObject = remoteStream; };
  });

  call.on('close', () => {
    document.getElementById(`container-${call.peer}`)?.remove();
  });
}

document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value;
  const seat = parseInt((document.querySelector('#seat-input') as HTMLInputElement).value);
  if (!room) return alert("部屋名を入れてね");
  joinRoom(`room-${room}`, seat);
});

document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

init();