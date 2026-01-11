import './style.css'
import { Peer } from 'peerjs'

// --- HTML & スタイル ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; flex-direction: column; background: #000; color: white;">
    <div id="main-display" style="flex: 1; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain;"></video>
      <canvas id="avatar-canvas" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain;"></canvas>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">待機中</div>
    </div>

    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 15px; border-top: 1px solid #333;">
      <button id="mic-btn" style="width:50px; height:50px; border-radius:50%; border:none; cursor:pointer; background:#333; color:white;">🎤</button>
      <button id="cam-btn" style="width:50px; height:50px; border-radius:50%; border:none; cursor:pointer; background:#333; color:white;">📹</button>
      <button id="avatar-btn" style="width:50px; height:50px; border-radius:50%; border:none; cursor:pointer; background:#333; color:white;">🐱</button>
      <div style="width: 1px; height: 40px; background: #444;"></div>
      <input id="room-input" type="text" placeholder="部屋名" style="background:#222; border:1px solid #444; color:white; padding:10px; border-radius:5px; width:120px;">
      <button id="join-btn" style="background:#2ecc71; color:white; border:none; padding:10px 20px; border-radius:5px; cursor:pointer; font-weight:bold;">参加</button>
    </div>

    <div id="video-grid" style="height: 120px; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; justify-content: center;">
      <video id="local-video" autoplay playsinline muted style="height: 100%; border-radius: 8px; border: 2px solid #4facfe;"></video>
    </div>
  </div>
`

// --- 変数設定 ---
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const avatarCanvas = document.querySelector<HTMLCanvasElement>('#avatar-canvas')!;
const ctx = avatarCanvas.getContext('2d')!;
const videoGrid = document.querySelector<HTMLElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLElement>('#status-badge')!;

let localStream: MediaStream;
let peer: Peer | null = null;
let isAvatarMode = false;
let isMouthOpen = false;
let pupilOffset = { x: 0, y: 0 };

// --- 1. アバター描画 (Scratch猫パーツ) ---
setInterval(() => { if (isAvatarMode) isMouthOpen = !isMouthOpen; }, 300);
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') pupilOffset.x = 20;
  if (e.key === 'ArrowLeft')  pupilOffset.x = -20;
  if (e.key === 'ArrowUp')    pupilOffset.y = -15;
  if (e.key === 'ArrowDown')  pupilOffset.y = 15;
});
window.addEventListener('keyup', () => { pupilOffset = { x: 0, y: 0 }; });

async function drawAvatar() {
  if (!isAvatarMode) return;
  avatarCanvas.width = 400; avatarCanvas.height = 400;
  ctx.clearRect(0, 0, 400, 400);

  const draw = (src: string, x = 0, y = 0) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = src;
      img.onload = () => { ctx.drawImage(img, x, y, 400, 400); resolve(true); };
      img.onerror = () => resolve(false);
    });
  };

  await draw('/cat-face.png');
  await draw('/eye-base.png');
  await draw('/eye-pupil.png', pupilOffset.x, pupilOffset.y);
  await draw(isMouthOpen ? '/cat-mouth-open.png' : '/cat-mouth-close.png');
  
  requestAnimationFrame(drawAvatar);
}

// --- 2. ルーム接続機能 (PeerJS) ---
async function startConnection() {
  const roomName = (document.querySelector<HTMLInputElement>('#room-input')!).value.trim();
  if (!roomName) { alert("部屋名を入れてね！"); return; }
  
  statusBadge.innerText = "接続中...";
  // 前の接続があれば消す
  if (peer) peer.destroy();

  // ルーム名に基づいたIDで参加
  peer = new Peer(`room-${roomName}-${Math.floor(Math.random() * 1000)}`);

  peer.on('open', (id) => {
    statusBadge.innerText = `参加中: ${roomName}`;
    console.log("My peer ID:", id);
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    setupRemoteVideo(call);
  });
}

function setupRemoteVideo(call: any) {
  call.on('stream', (remoteStream: MediaStream) => {
    if (document.getElementById(call.peer)) return;
    const v = document.createElement('video');
    v.id = call.peer; v.srcObject = remoteStream; v.autoplay = true; v.playsInline = true;
    v.style.height = "100%"; v.style.borderRadius = "8px";
    v.onclick = () => { bigVideo.srcObject = remoteStream; };
    videoGrid.appendChild(v);
  });
}

// --- 3. ボタン操作 ---
document.querySelector('#join-btn')?.addEventListener('click', startConnection);

document.querySelector('#avatar-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  avatarCanvas.style.display = isAvatarMode ? 'block' : 'none';
  bigVideo.style.display = isAvatarMode ? 'none' : 'block';
  if (isAvatarMode) drawAvatar();
});

// 初期化
async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  bigVideo.srcObject = localStream;
}
init();