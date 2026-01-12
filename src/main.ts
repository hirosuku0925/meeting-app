import './style.css'
import { Peer } from 'peerjs'

// --- 1. スタイル設定 ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
  .tool-btn:hover { background: #444; transform: scale(1.1); }
  .tool-btn.active { background: #4facfe !important; }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; font-size: 10px; color: #888; gap: 4px; }
  .off { background: #ea4335 !important; }
  #avatar-canvas { display: none; background: #1a1a1a; position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTMLレイアウト ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="height: 60vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain;"></video>
      <canvas id="avatar-canvas"></canvas>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">準備中...</div>
      
      <div id="chat-box" style="display:none; position: absolute; right: 10px; top: 10px; bottom: 10px; width: 220px; background: rgba(30,30,30,0.9); border-radius: 8px; flex-direction: column; border: 1px solid #444; z-index: 100;">
        <div style="padding: 8px; border-bottom: 1px solid #444; font-size: 12px; font-weight: bold;">チャット</div>
        <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 11px;"></div>
        <div style="padding: 8px; display: flex; gap: 5px;">
          <input id="chat-input" type="text" style="flex: 1; background: #222; border: 1px solid #555; color: white; border-radius: 4px; padding: 5px; font-size: 11px;">
          <button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 5px; border-radius: 4px; font-size: 11px;">送信</button>
        </div>
      </div>
    </div>

    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 12px; border-top: 1px solid #333; flex-shrink: 0;">
      <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>マイク</span></div>
      <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>カメラ</span></div>
      <div class="ctrl-group"><button id="share-btn" class="tool-btn">💻</button><span>画面共有</span></div>
      <div class="ctrl-group"><button id="avatar-btn" class="tool-btn">🐱</button><span>アバター</span></div>
      <div class="ctrl-group"><button id="chat-toggle-btn" class="tool-btn">💬</button><span>チャット</span></div>
      <div class="ctrl-group"><button id="record-btn" class="tool-btn">🔴</button><span>録画</span></div>
      <div style="width: 1px; height: 40px; background: #444; margin: 0 10px;"></div>
      <input id="room-input" type="text" placeholder="ルーム名" style="background: #222; border: 1px solid #444; color: white; padding: 10px; border-radius: 5px; width: 100px;">
      <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 10px 18px; border-radius: 5px; cursor: pointer; font-weight: bold;">参加</button>
      <button id="exit-btn" style="background: #ea4335; color: white; border: none; padding: 10px 18px; border-radius: 5px; cursor: pointer;">終了</button>
    </div>

    <div id="video-grid" style="flex: 1; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; align-items: center; justify-content: center;">
      <video id="local-video" autoplay playsinline muted style="height: 100%; border-radius: 8px; border: 2px solid #4facfe; object-fit: cover;"></video>
    </div>
  </div>
`

// --- 3. 変数と初期化（エラーが出ていた部分を修正） ---
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const avatarCanvas = document.querySelector<HTMLCanvasElement>('#avatar-canvas')!;
const ctx = avatarCanvas.getContext('2d')!;
const videoGrid = document.querySelector<HTMLElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLElement>('#status-badge')!;
const chatBox = document.querySelector<HTMLElement>('#chat-box')!;
const chatMessages = document.querySelector<HTMLElement>('#chat-messages')!;

let localStream: MediaStream;
let screenStream: MediaStream | null = null;
let peer: Peer | null = null;
let connectedPeers = new Set<string>();
let isAvatarMode = false;
let isMouthOpen = false;
let pupilOffset = { x: 0, y: 0 };

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    statusBadge.innerText = "準備完了！";
  } catch (e) {
    statusBadge.innerText = "カメラを許可してください";
  }
}

// --- 4. アバター描画 ---
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
      img.src = src + "?v=" + new Date().getTime();
      img.onload = () => { ctx.drawImage(img, x, y, 400, 400); resolve(true); };
      img.onerror = () => resolve(false);
    });
  };
  await draw('/cat-face.png');
  await draw('/eye-base.png');
  await draw('/eye-pupil.png', pupilOffset.x, pupilOffset.y);
  await draw(isMouthOpen ? '/cat-mouth-open.png' : '/cat-mouth-close.png');
  if (isAvatarMode) requestAnimationFrame(drawAvatar);
}

// --- 5. 画面共有機能 ---
async function toggleScreenShare() {
  const btn = document.querySelector('#share-btn') as HTMLElement;
  if (!screenStream) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      bigVideo.srcObject = screenStream;
      btn.classList.add('active');
      statusBadge.innerText = "画面共有中...";
      connectedPeers.forEach(id => peer?.call(id, screenStream!));
      screenStream.getVideoTracks()[0].onended = () => toggleScreenShare();
    } catch (e) { console.error(e); }
  } else {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
    bigVideo.srcObject = isAvatarMode ? null : localStream;
    btn.classList.remove('active');
    statusBadge.innerText = "カメラ映像に戻りました";
  }
}

// --- 6. 通信機能 ---
function join() {
  const room = (document.querySelector<HTMLInputElement>('#room-input')!).value.trim();
  if (!room) return;
  if (peer) peer.destroy();
  peer = new Peer(`room-${room}-${Math.floor(Math.random() * 1000)}`);
  peer.on('open', () => { 
    statusBadge.innerText = `部屋: ${room}`;
  });
  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
  });
}

function handleCall(call: any) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);
  call.on('stream', (remoteStream: MediaStream) => {
    if (document.getElementById(call.peer)) return;
    const v = document.createElement('video');
    v.id = call.peer; v.srcObject = remoteStream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "height: 100%; border-radius: 8px; cursor: pointer; background: #222;";
    v.onclick = () => { bigVideo.srcObject = remoteStream; bigVideo.muted = false; };
    videoGrid.appendChild(v);
  });
}

// --- 7. イベント登録 ---
document.querySelector('#mic-btn')?.addEventListener('click', (e) => {
  const t = localStream.getAudioTracks()[0]; t.enabled = !t.enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !t.enabled);
});
document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  const t = localStream.getVideoTracks()[0]; t.enabled = !t.enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !t.enabled);
});
document.querySelector('#share-btn')?.addEventListener('click', toggleScreenShare);
document.querySelector('#avatar-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  avatarCanvas.style.display = isAvatarMode ? 'block' : 'none';
  bigVideo.style.display = isAvatarMode ? 'none' : 'block';
  if (isAvatarMode) drawAvatar();
});
document.querySelector('#chat-toggle-btn')?.addEventListener('click', () => {
  chatBox.style.display = chatBox.style.display === 'none' ? 'flex' : 'none';
});
document.querySelector('#chat-send-btn')?.addEventListener('click', () => {
  const input = document.querySelector<HTMLInputElement>('#chat-input')!;
  if (!input.value) return;
  const div = document.createElement('div');
  div.innerText = `自分: ${input.value}`;
  chatMessages.appendChild(div); // ここで変数を使いました！
  input.value = "";
});
document.querySelector('#join-btn')?.addEventListener('click', join);
document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

init();