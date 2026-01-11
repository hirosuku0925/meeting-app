import './style.css'
import { Peer } from 'peerjs'

// --- スタイル設定（全機能維持） ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
  .tool-btn:hover { background: #444; transform: scale(1.1); }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; font-size: 10px; color: #888; gap: 4px; }
  .off { background: #ea4335 !important; }
  .active { background: #4facfe !important; }
  #avatar-canvas { display: none; background: #1a1a1a; position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; z-index: 5; }
`;
document.head.appendChild(globalStyle);

// --- HTML構造（録画・チャット・アバター全部入り） ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="height: 60vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain;"></video>
      <canvas id="avatar-canvas"></canvas>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">準備完了</div>
      
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

// --- 要素・変数 ---
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const avatarCanvas = document.querySelector<HTMLCanvasElement>('#avatar-canvas')!;
const ctx = avatarCanvas.getContext('2d')!;
const videoGrid = document.querySelector<HTMLElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLElement>('#status-badge')!;
const chatBox = document.querySelector<HTMLElement>('#chat-box')!;
const chatMessages = document.querySelector<HTMLElement>('#chat-messages')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

// アバター用変数
let isAvatarMode = false;
let isMouthOpen = false;
let pupilOffset = { x: 0, y: 0 };

// --- アバター描画処理 ---
setInterval(() => { if (isAvatarMode) isMouthOpen = !isMouthOpen; }, 300);

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') pupilOffset.x = 15;
  if (e.key === 'ArrowLeft')  pupilOffset.x = -15;
  if (e.key === 'ArrowUp')    pupilOffset.y = -10;
  if (e.key === 'ArrowDown')  pupilOffset.y = 10;
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
  const m = isMouthOpen ? '/cat-mouth-open.png' : '/cat-mouth-close.png';
  await draw(m);
  requestAnimationFrame(drawAvatar);
}

// --- 録画・チャット・接続（全てのボタン機能） ---
document.querySelector('#mic-btn')?.addEventListener('click', (e) => {
  localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !localStream.getAudioTracks()[0].enabled);
});
document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !localStream.getVideoTracks()[0].enabled);
});
document.querySelector('#avatar-btn')?.addEventListener('click', (e) => {
  isAvatarMode = !isAvatarMode;
  (e.currentTarget as HTMLElement).classList.toggle('active', isAvatarMode);
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
  chatMessages.appendChild(div);
  input.value = "";
});
document.querySelector('#record-btn')?.addEventListener('click', (e) => {
  const btn = e.currentTarget as HTMLElement;
  if (!recorder || recorder.state === 'inactive') {
    chunks = []; recorder = new MediaRecorder(localStream);
    recorder.ondataavailable = (ev) => chunks.push(ev.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'record.webm'; a.click();
    };
    recorder.start(); btn.classList.add('active'); btn.innerText = "⏹️";
  } else {
    recorder.stop(); btn.classList.remove('active'); btn.innerText = "🔴";
  }
});

// 接続ロジック (省略なし)
async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: true } });
    localVideo.srcObject = localStream; bigVideo.srcObject = localStream;
  } catch (e) { statusBadge.innerText = "エラー"; }
}

function join() {
  const room = (document.querySelector<HTMLInputElement>('#room-input')!).value.trim();
  if (!room) return;
  const roomKey = `cat-zoom-${room}`;
  tryNextSeat(roomKey, 1);
}

function tryNextSeat(roomKey: string, seat: number) {
  if (peer) peer.destroy();
  peer = new Peer(`${roomKey}-${seat}`);
  peer.on('open', () => {
    statusBadge.innerText = `${seat}番席で参加中`;
    setInterval(() => {
      if (!peer || peer.destroyed) return;
      for (let i = 1; i < seat; i++) {
        const tid = `${roomKey}-${i}`;
        if (!connectedPeers.has(tid)) { const call = peer.call(tid, localStream); if (call) handleCall(call); }
      }
    }, 4000);
  });
  peer.on('call', (call) => { call.answer(localStream); handleCall(call); });
  peer.on('error', (err) => { if (err.type === 'unavailable-id') tryNextSeat(roomKey, seat + 1); });
}

function handleCall(call: any) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);
  call.on('stream', (stream: MediaStream) => {
    if (document.getElementById(call.peer)) return;
    const v = document.createElement('video');
    v.id = call.peer; v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "height: 100%; min-width: 150px; border-radius: 8px; cursor: pointer;";
    v.onclick = () => { bigVideo.srcObject = stream; bigVideo.muted = false; };
    videoGrid.appendChild(v);
  });
}

document.querySelector('#join-btn')?.addEventListener('click', join);
document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());
init();