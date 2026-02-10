import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="conference-root" style="display: flex; height: 100vh; width: 100vw; font-family: sans-serif; background: #000; color: white; overflow: hidden; flex-direction: column;">
    
    <div id="main-display" style="flex: 1; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <canvas id="output-canvas" style="height: 100%; max-width: 100%; object-fit: contain; cursor: move;"></canvas>
      <div id="status-badge" style="position: absolute; top: 20px; left: 20px; background: rgba(0,0,0,0.6); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">待機中</div>
      
      <div id="chat-box" style="display:none; position: absolute; right: 20px; top: 20px; bottom: 100px; width: 250px; background: rgba(30,30,30,0.9); border-radius: 10px; flex-direction: column; border: 1px solid #444; z-index: 100;">
        <div style="padding: 10px; border-bottom: 1px solid #444; font-weight: bold; font-size: 14px;">チャット</div>
        <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 12px; display: flex; flex-direction: column; gap: 5px;"></div>
        <div style="padding: 10px; display: flex; gap: 5px;">
          <input id="chat-input" type="text" style="flex: 1; background: #222; border: 1px solid #555; color: white; border-radius: 4px; padding: 5px;">
          <button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 5px 10px; border-radius: 4px; cursor: pointer;">送信</button>
        </div>
      </div>
    </div>

    <div id="control-panel" style="background: #111; padding: 15px; border-top: 1px solid #333;">
      <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 15px;">
        <input id="user-name" type="text" placeholder="なまえ" style="background: #222; border: 1px solid #444; color: white; padding: 8px; border-radius: 4px; width: 100px;">
        <input id="room-input" type="text" placeholder="るーむめい" style="background: #222; border: 1px solid #444; color: white; padding: 8px; border-radius: 4px; width: 100px;">
        <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-weight: bold;">参加</button>
        <button id="exit-btn" style="background: #ea4335; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-weight: bold;">退出</button>
      </div>

      <div id="toolbar" style="display: flex; align-items: center; justify-content: center; gap: 20px;">
        <button id="mic-btn" class="tool-btn">🎤</button>
        <button id="cam-btn" class="tool-btn">📹</button>
        <label class="tool-btn" title="おめんを選ぶ">🎭
          <input type="file" id="mask-upload" accept="image/*" style="display:none;">
        </label>
        <button id="chat-toggle-btn" class="tool-btn">💬</button>
      </div>
    </div>

    <div id="video-grid" style="height: 120px; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; align-items: center; border-top: 1px solid #222;"></div>
  </div>
`

// --- スタイル追加 ---
const style = document.createElement('style');
style.textContent = `
  .tool-btn { background: #333; border: none; color: white; font-size: 20px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
  .off { background: #ea4335 !important; }
  .remote-unit { height: 100%; min-width: 140px; background: #222; border-radius: 8px; overflow: hidden; position: relative; display: flex; align-items: center; justify-content: center; }
  .remote-unit video { width: 100%; height: 100%; object-fit: cover; }
  .name-tag { position: absolute; bottom: 2px; left: 5px; background: rgba(0,0,0,0.5); font-size: 10px; padding: 1px 4px; border-radius: 3px; z-index: 5; }
  .cam-off-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #333; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; z-index: 4; }
`;
document.head.appendChild(style);

// --- 変数管理 ---
const canvas = document.querySelector<HTMLCanvasElement>('#output-canvas')!;
const ctx = canvas.getContext('2d')!;
const v = document.createElement('video');
const videoGrid = document.querySelector('#video-grid')!;
const chatMessages = document.querySelector('#chat-messages')!;

let localStream: MediaStream;
let maskImg: HTMLImageElement | null = null;
let maskX = 0, maskY = 0, isDragging = false;
let peer: Peer | null = null;
const connections = new Map<string, {call: MediaConnection, data: DataConnection}>();

// --- 映像合成（自分用） ---
function draw() {
  if (v.paused || v.ended) return;
  canvas.width = v.videoWidth; canvas.height = v.videoHeight;
  
  const videoTrack = localStream?.getVideoTracks()[0];
  const name = (document.getElementById('user-name') as HTMLInputElement).value || "自分";

  if (videoTrack && videoTrack.enabled) {
    // カメラONのとき
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    if (maskImg) {
      const size = canvas.height * 0.6;
      ctx.drawImage(maskImg, maskX || (canvas.width - size)/2, maskY || (canvas.height - size)/2, size, size);
    }
  } else {
    // ★カメラOFFのとき：黒背景に名前を出す
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);
  }
  requestAnimationFrame(draw);
}

// ドラッグ操作（お面用）
canvas.onmousedown = (e) => { isDragging = true; updateMaskPos(e); };
window.onmousemove = (e) => { if(isDragging) updateMaskPos(e); };
window.onmouseup = () => { isDragging = false; };

function updateMaskPos(e: any) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const size = canvas.height * 0.6;
  maskX = (e.clientX - rect.left) * scaleX - size / 2;
  maskY = (e.clientY - rect.top) * scaleY - size / 2;
}

// --- 通信ロジック ---
async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  v.srcObject = localStream; v.play();
  v.onloadedmetadata = () => draw();
}

function join() {
  const room = (document.querySelector<HTMLInputElement>('#room-input')!).value;
  if (!room) return alert("ルーム名を入れてね");
  peer = new Peer();
  peer.on('open', (id) => {
    document.querySelector('#status-badge')!.innerHTML = `入室中: ${room}`;
  });
  peer.on('call', (call) => {
    call.answer(canvas.captureStream(30));
    setupRemote(call);
  });
  peer.on('connection', (conn) => {
    conn.on('data', (data: any) => {
        if (data.type === 'chat') addChat(data.name, data.text);
        if (data.type === 'cam-status') updateRemoteUI(conn.peer, data.enabled, data.name);
    });
    const call = peer!.call(conn.peer, canvas.captureStream(30));
    setupRemote(call);
    connections.set(conn.peer, {call, data: conn});
  });
}

function setupRemote(call: MediaConnection) {
  call.on('stream', (stream) => {
    if (document.getElementById(`unit-${call.peer}`)) return;
    const unit = document.createElement('div');
    unit.id = `unit-${call.peer}`;
    unit.className = 'remote-unit';
    unit.innerHTML = `
      <div id="off-overlay-${call.peer}" class="cam-off-overlay" style="display:none;">カメラOFF</div>
      <video autoplay playsinline></video>
      <div class="name-tag" id="tag-${call.peer}">あいて</div>
    `;
    videoGrid.appendChild(unit);
    unit.querySelector('video')!.srcObject = stream;
  });
}

// 相手がカメラを消した時に画面を切り替える
function updateRemoteUI(peerId: string, enabled: boolean, name: string) {
    const overlay = document.getElementById(`off-overlay-${peerId}`);
    const tag = document.getElementById(`tag-${peerId}`);
    if (overlay) overlay.style.display = enabled ? 'none' : 'flex';
    if (overlay) overlay.innerText = name;
    if (tag) tag.innerText = name;
}

function addChat(name: string, text: string) {
  const msg = document.createElement('div');
  msg.innerHTML = `<span style="color:#4facfe; font-weight:bold;">${name}:</span> ${text}`;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- ボタンイベント ---
document.querySelector('#mic-btn')?.addEventListener('click', (e) => {
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
});

document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  const name = (document.getElementById('user-name') as HTMLInputElement).value || "ななし";
  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
  
  // 相手にもカメラの状態を送る
  connections.forEach(c => c.data.send({ type: 'cam-status', enabled: track.enabled, name: name }));
});

document.querySelector('#join-btn')?.addEventListener('click', join);
document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

document.querySelector('#chat-send-btn')?.addEventListener('click', () => {
  const input = document.querySelector<HTMLInputElement>('#chat-input')!;
  const name = (document.querySelector<HTMLInputElement>('#user-name')!).value || "じぶん";
  if (!input.value) return;
  addChat(name, input.value);
  connections.forEach(c => c.data.send({ type: 'chat', name, text: input.value }));
  input.value = "";
});

document.querySelector('#chat-toggle-btn')?.addEventListener('click', () => {
  const box = document.querySelector<HTMLElement>('#chat-box')!;
  box.style.display = box.style.display === 'none' ? 'flex' : 'none';
});

document.querySelector('#mask-upload')?.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => { maskImg = img; };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
});

init();