import './style.css'
import { Peer, MediaConnection } from 'peerjs'
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision"

// --- 1. スタイル ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
  .tool-btn:hover { background: #444; transform: scale(1.1); }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; font-size: 10px; color: #888; gap: 4px; }
  .off { background: #ea4335 !important; }
  .active { background: #4facfe !important; }
  .video-container { position: relative; height: 100%; min-width: 180px; background: #222; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .avatar-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: none; align-items: center; justify-content: center; background: #222; z-index: 5; }
  .avatar-wrapper { position: relative; width: 50%; aspect-ratio: 1/1; }
  .avatar-part { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; }
  #eye-lid-l, #eye-lid-r { position: absolute; top: 38%; width: 15%; height: 8%; background: #ff9d00; display: none; border-radius: 50%; z-index: 10; }
  #icon-selector { display: none; background: rgba(20, 20, 20, 0.95); padding: 15px; border-top: 1px solid #444; gap: 12px; justify-content: center; flex-wrap: wrap; position: absolute; bottom: 100px; width: 100%; z-index: 1000; }
  .preset-img { width: 50px; height: 50px; border-radius: 50%; cursor: pointer; border: 3px solid transparent; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="height: 60vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <div class="video-container" style="width:100%; border-radius:0;">
        <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain;"></video>
        <div id="big-avatar" class="avatar-overlay"><div class="avatar-wrapper"><img id="big-avatar-img" src="" class="avatar-part"><div id="eye-lid-l-big" style="position:absolute; top:38%; left:25%; width:15%; height:8%; background:#ff9d00; display:none; border-radius:50%;"></div><div id="eye-lid-r-big" style="position:absolute; top:38%; right:25%; width:15%; height:8%; background:#ff9d00; display:none; border-radius:50%;"></div></div></div>
      </div>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">AI読み込み中...</div>
    </div>
    <div id="icon-selector"></div>
    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 12px; border-top: 1px solid #333; position: relative;">
      <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>マイク</span></div>
      <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>カメラ</span></div>
      <div class="ctrl-group"><button id="icon-btn" class="tool-btn">👤</button><span>変身</span></div>
      <div class="ctrl-group"><button id="chat-toggle-btn" class="tool-btn">💬</button><span>チャット</span></div>
      <div style="width: 1px; height: 40px; background: #444; margin: 0 10px;"></div>
      <input id="room-input" type="text" placeholder="ルーム名" style="background: #222; border: 1px solid #444; color: white; padding: 10px; width: 100px;">
      <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 10px 18px; border-radius: 5px; font-weight: bold;">参加</button>
      <button id="exit-btn" style="background: #ea4335; color: white; border: none; padding: 10px 18px; border-radius: 5px;">終了</button>
    </div>
    <div id="video-grid" style="flex: 1; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto;">
      <div class="video-container" id="local-container" style="border: 2px solid #4facfe;">
         <video id="local-video" autoplay playsinline muted style="height: 100%; object-fit: cover;"></video>
         <div id="local-avatar" class="avatar-overlay"><div class="avatar-wrapper"><img id="local-avatar-img" src="" class="avatar-part"><div id="eye-lid-l" style="position:absolute; top:38%; left:25%; width:15%; height:8%; background:#ff9d00; display:none; border-radius:50%;"></div><div id="eye-lid-r" style="position:absolute; top:38%; right:25%; width:15%; height:8%; background:#ff9d00; display:none; border-radius:50%;"></div></div></div>
      </div>
    </div>
  </div>
`;

// --- 3. プログラム ---
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const videoGrid = document.querySelector<HTMLElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLElement>('#status-badge')!;
const iconSelector = document.querySelector<HTMLElement>('#icon-selector')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();
let faceLandmarker: any;
let isTransformMode = false;
let myIconUrl: string = "https://api.dicebear.com/7.x/big-smile/svg?seed=Fox";

async function setupAI() {
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate: "GPU" },
    outputFaceBlendshapes: true, runningMode: "VIDEO"
  });
  statusBadge.innerText = "準備完了";
}

async function predict() {
  if (faceLandmarker && localVideo.readyState >= 2) {
    const result = faceLandmarker.detectForVideo(localVideo, performance.now());
    if (result.faceBlendshapes?.length > 0) {
      const shapes = result.faceBlendshapes[0].categories;
      const jawOpen = shapes.find((s:any) => s.categoryName === "jawOpen")?.score || 0;
      const eyeL = shapes.find((s:any) => s.categoryName === "eyeBlinkLeft")?.score || 0;
      const eyeR = shapes.find((s:any) => s.categoryName === "eyeBlinkRight")?.score || 0;

      const scale = 1 + jawOpen;
      [document.getElementById('local-avatar-img'), document.getElementById('big-avatar-img')].forEach(el => { if(el) el.style.transform = `scaleY(${scale})`; });
      
      const showL = eyeL > 0.4 ? 'block' : 'none';
      const showR = eyeR > 0.4 ? 'block' : 'none';
      [document.getElementById('eye-lid-l'), document.getElementById('eye-lid-l-big')].forEach(el => { if(el) el.style.display = showL; });
      [document.getElementById('eye-lid-r'), document.getElementById('eye-lid-r-big')].forEach(el => { if(el) el.style.display = showR; });
    }
  }
  requestAnimationFrame(predict);
}

// 参加処理
function join() {
  const input = document.querySelector<HTMLInputElement>('#room-input')!;
  const room = input.value.trim();
  if (!room) return alert("ルーム名を入力してください");
  statusBadge.innerText = "接続中...";
  tryNextSeat(`vFINAL-${room}`, 1);
}

function tryNextSeat(roomKey: string, seat: number) {
  if (peer) peer.destroy();
  peer = new Peer(`${roomKey}-${seat}`);
  peer.on('open', () => {
    statusBadge.innerText = `${seat}番席で入室`;
    setInterval(() => {
      if (!peer || peer.destroyed) return;
      for (let i = 1; i < seat; i++) {
        const targetId = `${roomKey}-${i}`;
        if (!connectedPeers.has(targetId)) {
          const call = peer.call(targetId, localStream);
          if (call) handleCall(call);
        }
      }
    }, 4000);
  });
  peer.on('call', (call: MediaConnection) => { call.answer(localStream); handleCall(call); });
  peer.on('error', (err: any) => { if (err.type === 'unavailable-id') tryNextSeat(roomKey, seat + 1); });
}

function handleCall(call: MediaConnection) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);
  call.on('stream', (stream: MediaStream) => {
    if (document.getElementById(call.peer)) return;
    const v = document.createElement('video');
    v.id = call.peer; v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "height: 100%; min-width: 180px; border-radius: 8px; object-fit: cover; cursor: pointer;";
    v.onclick = () => { bigVideo.srcObject = stream; };
    videoGrid.appendChild(v);
  });
}

// 初期化
async function init() {
  await setupAI();
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  bigVideo.srcObject = localStream;
  (document.getElementById('local-avatar-img') as HTMLImageElement).src = myIconUrl;
  (document.getElementById('big-avatar-img') as HTMLImageElement).src = myIconUrl;
  predict();
}

// UIイベント
const animalIcons = ["Fox", "Bear", "Panda", "Cat", "Dog"].map(s => `https://api.dicebear.com/7.x/big-smile/svg?seed=${s}`);
animalIcons.forEach(url => {
  const img = document.createElement('img');
  img.src = url; img.className = 'preset-img';
  img.onclick = () => {
    myIconUrl = url; isTransformMode = true;
    (document.getElementById('local-avatar-img') as HTMLImageElement).src = url;
    (document.getElementById('big-avatar-img') as HTMLImageElement).src = url;
    document.getElementById('local-avatar')!.style.display = 'flex';
    if(bigVideo.srcObject === localStream) document.getElementById('big-avatar')!.style.display = 'flex';
  };
  iconSelector.appendChild(img);
});

document.querySelector('#icon-btn')?.addEventListener('click', () => { iconSelector.style.display = iconSelector.style.display === 'none' ? 'flex' : 'none'; });
document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
  document.getElementById('local-avatar')!.style.display = (isTransformMode || !track.enabled) ? 'flex' : 'none';
});
document.querySelector('#join-btn')?.addEventListener('click', join);
document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

init();