import './style.css'
import { Peer } from 'peerjs'

// --- 1. スタイル（お母さん公認デザイン） ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
  .tool-btn:hover { background: #444; transform: scale(1.1); }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; font-size: 10px; color: #888; gap: 4px; }
  .off { background: #ea4335 !important; }
  .active { background: #4facfe !important; }
  #avatar-canvas { display: none; background: #1a1a1a; position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; }
`;
document.head.appendChild(globalStyle);

// --- 2. レイアウト（使い慣れたボタン配置） ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="flex: 1; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain;"></video>
      <canvas id="avatar-canvas"></canvas>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">準備完了</div>
    </div>

    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 15px; border-top: 1px solid #333; flex-shrink: 0;">
      <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>マイク</span></div>
      <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>カメラ</span></div>
      <div class="ctrl-group"><button id="avatar-btn" class="tool-btn">🐱</button><span>アバター</span></div>
      <div class="ctrl-group"><button id="record-btn" class="tool-btn">🔴</button><span>録画</span></div>
      <div style="width: 1px; height: 40px; background: #444; margin: 0 10px;"></div>
      <input id="room-input" type="text" placeholder="部屋名" style="background: #222; border: 1px solid #444; color: white; padding: 10px; border-radius: 5px; width: 100px;">
      <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 10px 18px; border-radius: 5px; cursor: pointer; font-weight: bold;">参加</button>
    </div>

    <div id="video-grid" style="height: 120px; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; justify-content: center;">
      <video id="local-video" autoplay playsinline muted style="height: 100%; border-radius: 8px; border: 2px solid #4facfe;"></video>
    </div>
  </div>
`

// --- 3. プログラム処理 ---
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const avatarCanvas = document.querySelector<HTMLCanvasElement>('#avatar-canvas')!;
const ctx = avatarCanvas.getContext('2d')!;
const videoGrid = document.querySelector<HTMLElement>('#video-grid')!;

let localStream: MediaStream;
let peer: Peer | null = null;
let isAvatarMode = false;
let isMouthOpen = false;
let pupilOffset = { x: 0, y: 0 };

// 口パクタイマー
setInterval(() => { if (isAvatarMode) isMouthOpen = !isMouthOpen; }, 300);

// キー操作で黒目を動かす
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') pupilOffset.x = 20;
  if (e.key === 'ArrowLeft')  pupilOffset.x = -20;
  if (e.key === 'ArrowUp')    pupilOffset.y = -15;
  if (e.key === 'ArrowDown')  pupilOffset.y = 15;
});
window.addEventListener('keyup', () => { pupilOffset = { x: 0, y: 0 }; });

// アバター描画処理（確実に読み込むための工夫付き）
async function drawAvatar() {
  if (!isAvatarMode) return;
  avatarCanvas.width = 400; avatarCanvas.height = 400;
  ctx.clearRect(0, 0, 400, 400);

  const draw = (src: string, x = 0, y = 0) => {
    return new Promise((resolve) => {
      const img = new Image();
      // キャッシュ（古いデータ）を回避して最新を読み込むための ?v=...
      img.src = src + "?v=" + new Date().getTime();
      img.onload = () => { ctx.drawImage(img, x, y, 400, 400); resolve(true); };
      img.onerror = () => resolve(false);
    });
  };

  // publicフォルダの画像たちを重ねて描く
  await draw('/cat-face.png');
  await draw('/eye-base.png');
  await draw('/eye-pupil.png', pupilOffset.x, pupilOffset.y);
  await draw(isMouthOpen ? '/cat-mouth-open.png' : '/cat-mouth-close.png');
  
  if (isAvatarMode) requestAnimationFrame(drawAvatar);
}

// ルーム参加処理
async function join() {
  const room = (document.querySelector<HTMLInputElement>('#room-input')!).value.trim();
  if (!room) return;
  if (peer) peer.destroy();
  peer = new Peer(`cat-room-${room}-${Math.floor(Math.random()*100)}`);
  
  peer.on('open', () => { 
    const badge = document.querySelector('#status-badge') as HTMLElement;
    if (badge) badge.innerText = `部屋: ${room}`; 
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    call.on('stream', (remote) => {
      const v = document.createElement('video');
      v.srcObject = remote; v.autoplay = true; v.playsInline = true;
      v.style.height = "100%"; v.style.borderRadius = "8px";
      v.onclick = () => { bigVideo.srcObject = remote; };
      videoGrid.appendChild(v);
    });
  });
}

// ボタンイベント
document.querySelector('#avatar-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  avatarCanvas.style.display = isAvatarMode ? 'block' : 'none';
  bigVideo.style.display = isAvatarMode ? 'none' : 'block';
  if (isAvatarMode) drawAvatar();
});
document.querySelector('#join-btn')?.addEventListener('click', join);

// 初期化（カメラ起動）
async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream; bigVideo.srcObject = localStream;
}
init();