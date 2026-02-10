import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'

// --- 1. スタイル設定 ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 50px; height: 50px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .active { background: #2ecc71 !important; }
  .off { background: #ea4335 !important; }
  
  #main-display { height: 65vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; }
  #canvas-container { position: relative; height: 100%; width: 100%; display: flex; justify-content: center; }
  canvas { height: 100%; object-fit: contain; background: #000; }
  
  #chat-box { position: absolute; right: 10px; bottom: 120px; width: 250px; height: 250px; background: rgba(0,0,0,0.8); border-radius: 8px; display: none; flex-direction: column; z-index: 100; border: 1px solid #444; }
  #chat-messages { flex: 1; overflow-y: auto; padding: 10px; font-size: 14px; }
  #chat-input-area { display: flex; padding: 10px; border-top: 1px solid #444; }
  #chat-msg-input { flex: 1; background: #222; border: none; color: white; padding: 5px; border-radius: 4px; }
`;
document.head.appendChild(globalStyle);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display">
      <div id="canvas-container">
        <canvas id="output-canvas"></canvas>
      </div>
      <div id="chat-box">
        <div id="chat-messages"></div>
        <div id="chat-input-area"><input id="chat-msg-input" type="text" placeholder="送信..."></div>
      </div>
    </div>

    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 15px;">
      <button id="cam-btn" class="tool-btn">📹</button>
      <button id="mic-btn" class="tool-btn">🎤</button>
      <label class="tool-btn" style="cursor:pointer;">🖼️
        <input type="file" id="mask-upload" accept="image/*" style="display:none;">
      </label>
      <button id="chat-btn" class="tool-btn">💬</button>
      <button id="join-btn" style="background: #2ecc71; color: white; padding: 10px 20px; border-radius: 8px; font-weight: bold;">参加</button>
    </div>

    <div id="video-grid" style="flex: 1; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto;"></div>
  </div>
`;

// --- 2. 変数と処理 ---
let localStream: MediaStream | null = null;
let peer: Peer | null = null;
let maskImg: HTMLImageElement | null = null;
const canvas = document.getElementById('output-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const v = document.createElement('video');
const dataConns = new Map<string, DataConnection>();

// カメラ映像に画像を合成して描画するループ
function draw() {
  if (v.paused || v.ended) return;
  
  canvas.width = v.videoWidth;
  canvas.height = v.videoHeight;
  
  // 背景にカメラ映像を描画
  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
  
  // マスク画像があれば中央（顔付近）に描画
  if (maskImg) {
    const size = canvas.height * 0.6; // 画面の60%の大きさ
    ctx.drawImage(maskImg, (canvas.width - size) / 2, (canvas.height - size) / 2, size, size);
  }
  
  requestAnimationFrame(draw);
}

// 参加処理
function joinRoom() {
  const room = "my-secret-room"; 
  peer = new Peer();
  peer.on('open', () => {
    document.getElementById('join-btn')!.innerText = "入室中";
    document.getElementById('join-btn')!.style.background = "#555";
  });

  peer.on('call', (call) => {
    // Canvasの映像（画像が合成されたもの）を送信
    const stream = canvas.captureStream(30);
    call.answer(stream);
    setupRemoteVideo(call);
  });

  peer.on('connection', (conn) => {
    dataConns.set(conn.peer, conn);
    const stream = canvas.captureStream(30);
    const call = peer!.call(conn.peer, stream);
    setupRemoteVideo(call);
  });
}

function setupRemoteVideo(call: MediaConnection) {
  call.on('stream', (remoteStream) => {
    if (document.getElementById(`remote-${call.peer}`)) return;
    const rv = document.createElement('video');
    rv.id = `remote-${call.peer}`;
    rv.autoplay = true;
    rv.playsInline = true;
    rv.style.height = "100%";
    rv.style.borderRadius = "8px";
    document.getElementById('video-grid')?.appendChild(rv);
    rv.srcObject = remoteStream;
  });
}

// --- 3. イベント ---
document.getElementById('mask-upload')?.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => { maskImg = img; };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
});

document.getElementById('cam-btn')?.addEventListener('click', (e) => {
  const track = localStream?.getVideoTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
  }
});

document.getElementById('chat-btn')?.addEventListener('click', () => {
  const box = document.getElementById('chat-box')!;
  box.style.display = box.style.display === 'flex' ? 'none' : 'flex';
});

document.getElementById('join-btn')?.addEventListener('click', joinRoom);

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  v.srcObject = localStream;
  v.play();
  v.onloadedmetadata = () => { draw(); };
}
init();