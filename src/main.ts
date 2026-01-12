import './style.css'
import { Peer, MediaConnection } from 'peerjs'
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision"

// --- 1. スタイル ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
  .tool-btn:hover { background: #444; transform: scale(1.1); }
  .off { background: #ea4335 !important; }
  .active { background: #4facfe !important; }
  .video-container { position: relative; height: 100%; width: 100%; background: #222; display: flex; align-items: center; justify-content: center; overflow: hidden; background-size: cover; background-position: center; }
  #follower-avatar { position: absolute; display: none; pointer-events: none; z-index: 100; width: 150px; height: 150px; object-fit: contain; }
  #icon-selector { display: none; background: rgba(20, 20, 20, 0.95); padding: 15px; border-top: 1px solid #444; gap: 12px; justify-content: center; flex-wrap: wrap; position: absolute; bottom: 100px; width: 100%; z-index: 1000; }
  .preset-img { width: 50px; height: 50px; border-radius: 50%; cursor: pointer; border: 3px solid transparent; }
  #chat-box { display:none; position: absolute; right: 10px; top: 10px; bottom: 10px; width: 220px; background: rgba(30,30,30,0.9); border-radius: 8px; flex-direction: column; border: 1px solid #444; z-index: 200; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="height: 65vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center;">
      <div id="bg-container" class="video-container">
        <video id="local-video" autoplay playsinline muted style="height: 100%; width: 100%; object-fit: contain;"></video>
        <img id="follower-avatar" src="">
      </div>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">準備中...</div>
      <div id="chat-box">
        <div style="padding: 8px; border-bottom: 1px solid #444; font-size: 12px; font-weight: bold;">チャット</div>
        <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 11px;"></div>
        <div style="padding: 8px; display: flex; gap: 5px;">
          <input id="chat-input" type="text" style="flex: 1; background: #222; border: 1px solid #555; color: white; padding: 5px;">
          <button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 5px;">送信</button>
        </div>
      </div>
    </div>
    <div id="icon-selector">
       <div style="width:100%; text-align:center; font-size:12px;">アバター選択 / 背景アップロード</div>
       <input type="file" id="bg-upload" accept="image/*" style="display:none;">
       <button id="bg-upload-btn" style="background:#555; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer; font-size:11px;">背景画像を選択</button>
    </div>
    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 12px; border-top: 1px solid #333; position: relative;">
      <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>マイク</span></div>
      <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>カメラ</span></div>
      <div class="ctrl-group"><button id="icon-btn" class="tool-btn">👤</button><span>変身</span></div>
      <div class="ctrl-group"><button id="chat-toggle-btn" class="tool-btn">💬</button><span>チャット</span></div>
      <div class="ctrl-group"><button id="record-btn" class="tool-btn">🔴</button><span>録画</span></div>
      <div style="width: 1px; height: 40px; background: #444; margin: 0 5px;"></div>
      <input id="room-input" type="text" placeholder="ルーム" style="background: #222; border: 1px solid #444; color: white; padding: 10px; width: 80px; border-radius: 5px;">
      <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 10px 15px; border-radius: 5px; font-weight: bold;">参加</button>
      <button id="exit-btn" style="background: #ea4335; color: white; border: none; padding: 10px 15px; border-radius: 5px;">終了</button>
    </div>
    <div id="video-grid" style="flex: 1; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto;"></div>
  </div>
`;

// --- 3. プログラム ---
const video = document.querySelector<HTMLVideoElement>('#local-video')!;
const avatar = document.querySelector<HTMLImageElement>('#follower-avatar')!;
const bgContainer = document.getElementById('bg-container')!;
const chatBox = document.getElementById('chat-box')!;
const chatMessages = document.getElementById('chat-messages')!;
const chatInput = document.querySelector<HTMLInputElement>('#chat-input')!;
const statusBadge = document.getElementById('status-badge')!;

let faceLandmarker: any;
let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();
let isTransformMode = false;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

// AIセットアップ
async function setupAI() {
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate: "GPU" },
    runningMode: "VIDEO"
  });
  statusBadge.innerText = "準備完了";
}

// 追従ループ
async function predict() {
  if (faceLandmarker && video.readyState >= 2 && isTransformMode) {
    const result = faceLandmarker.detectForVideo(video, performance.now());
    if (result.faceLandmarks && result.faceLandmarks[0]) {
      const nose = result.faceLandmarks[0][4];
      const rect = video.getBoundingClientRect();
      avatar.style.display = "block";
      avatar.style.left = `${nose.x * rect.width + rect.left - 75}px`;
      avatar.style.top = `${nose.y * rect.height + rect.top - 75}px`;
    }
  }
  requestAnimationFrame(predict);
}

// 背景アップロード修正
const bgUploadBtn = document.getElementById('bg-upload-btn');
const bgUploadInput = document.getElementById('bg-upload') as HTMLInputElement;
if (bgUploadBtn && bgUploadInput) {
  bgUploadBtn.onclick = () => bgUploadInput.click();
  bgUploadInput.addEventListener('change', (e: any) => {
    const file = e.target.files[0];
    if (file && bgContainer) {
      bgContainer.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
    }
  });
}

// アイコン選択
const icons = ["Fox", "Bear", "Panda", "Cat", "Dog"].map(s => `https://api.dicebear.com/7.x/big-smile/svg?seed=${s}`);
icons.forEach(url => {
  const img = document.createElement('img');
  img.src = url; img.className = 'preset-img';
  img.onclick = () => { avatar.src = url; isTransformMode = true; };
  document.getElementById('icon-selector')?.appendChild(img);
});

// チャット送信機能
document.getElementById('chat-send-btn')?.addEventListener('click', () => {
  if (!chatInput.value) return;
  const div = document.createElement('div');
  div.innerText = `自分: ${chatInput.value}`;
  chatMessages?.appendChild(div);
  chatInput.value = "";
});

// 録画
document.getElementById('record-btn')?.addEventListener('click', (e) => {
  const btn = e.currentTarget as HTMLElement;
  if (!recorder || recorder.state === 'inactive') {
    chunks = []; recorder = new MediaRecorder(localStream);
    recorder.ondataavailable = (ev) => chunks.push(ev.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rec.webm'; a.click();
    };
    recorder.start(); btn.classList.add('active');
  } else { recorder.stop(); btn.classList.remove('active'); }
});

// 接続
function join() {
  const roomInput = document.getElementById('room-input') as HTMLInputElement;
  if (!roomInput.value) return alert("ルーム名入力");
  peer = new Peer(`vF-${roomInput.value}-${Math.floor(Math.random()*100)}`);
  peer.on('open', (id) => {
    statusBadge.innerText = `入室: ${id}`;
    peer?.on('call', (call) => { call.answer(localStream); handleCall(call); });
  });
}
function handleCall(call: MediaConnection) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);
  call.on('stream', (stream) => {
    if (document.getElementById(call.peer)) return;
    const v = document.createElement('video'); v.id = call.peer; v.srcObject = stream; v.autoplay = true;
    v.style.cssText = "height: 80px; border-radius: 8px;";
    document.getElementById('video-grid')?.appendChild(v);
  });
}

document.getElementById('icon-btn')?.addEventListener('click', () => { 
  const s = document.getElementById('icon-selector')!;
  s.style.display = s.style.display === 'none' ? 'flex' : 'none'; 
});
document.getElementById('chat-toggle-btn')?.addEventListener('click', () => { 
  chatBox.style.display = chatBox.style.display === 'none' ? 'flex' : 'none'; 
});
document.getElementById('join-btn')?.addEventListener('click', join);
document.getElementById('exit-btn')?.addEventListener('click', () => location.reload());

async function init() {
  await setupAI();
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  video.srcObject = localStream;
  predict();
}
init();