import './style.css'
import { Peer, MediaConnection } from 'peerjs'
// 'type' を追加して Error 1484 を解消
import { SelfieSegmentation, type Results } from '@mediapipe/selfie_segmentation'

// --- 1. スタイル ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
  .tool-btn:hover { background: #444; transform: scale(1.1); }
  .active { background: #4facfe !important; }
  .off { background: #ea4335 !important; }
  .video-container { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #111; }
  #canvas-output { width: 100%; height: 100%; object-fit: contain; }
  #camera-off-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: none; align-items: center; justify-content: center; background: #222; z-index: 5; }
  #user-icon-display { width: 160px; height: 160px; border-radius: 50%; object-fit: cover; border: 4px solid #4facfe; }
  #effect-panel { display: none; position: absolute; bottom: 110px; background: rgba(20,20,20,0.95); padding: 15px; border-radius: 10px; border: 1px solid #444; gap: 10px; flex-direction: column; width: 280px; z-index: 1000; }
  .panel-section { border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 5px; }
  .effect-btn { background: #444; color: white; border: none; padding: 6px 12px; border-radius: 5px; cursor: pointer; font-size: 11px; margin: 2px; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="height: 65vh; position: relative; background: #1a1a1a;">
      <div class="video-container">
        <canvas id="canvas-output"></canvas>
        <div id="camera-off-overlay"><img id="user-icon-display" src="https://api.dicebear.com/7.x/bottts/svg?seed=yuki"></div>
        <video id="temp-video" autoplay playsinline muted style="display:none;"></video>
      </div>
      <div id="effect-panel">
        <div class="panel-section">
          <div style="font-size:11px; color:#888; margin-bottom:5px;">背景</div>
          <button class="effect-btn" id="btn-none">なし</button>
          <button class="effect-btn" id="btn-blur">ぼかし</button>
          <button class="effect-btn" id="btn-remove">除去</button>
          <button class="effect-btn" id="btn-bg-img">画像選択</button>
          <input type="file" id="bg-upload" accept="image/*" style="display:none;">
        </div>
        <div class="panel-section">
          <div style="font-size:11px; color:#888; margin-bottom:5px;">アイコンアップロード</div>
          <input type="file" id="icon-upload" accept="image/*" style="display:none;">
          <button class="effect-btn" id="icon-upload-btn" style="background:#4facfe; width:100%;">画像を変更</button>
        </div>
      </div>
    </div>
    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 15px; border-top: 1px solid #333;">
      <button id="mic-btn" class="tool-btn">🎤</button>
      <button id="cam-btn" class="tool-btn">📹</button>
      <button id="effect-btn" class="tool-btn">✨</button>
      <input id="room-input" type="text" placeholder="ルーム名" style="background:#222; border:1px solid #444; color:white; padding:10px; width:120px; border-radius:5px;">
      <button id="join-btn" style="background:#2ecc71; color:white; border:none; padding:10px 20px; border-radius:5px; font-weight:bold; cursor:pointer;">参加</button>
    </div>
    <div id="video-grid" style="flex: 1; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; align-items: center;"></div>
  </div>
`;

// --- 3. ロジック本体 ---
const video = document.getElementById('temp-video') as HTMLVideoElement;
const canvas = document.getElementById('canvas-output') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const cameraOffOverlay = document.getElementById('camera-off-overlay') as HTMLDivElement;
const userIconDisplay = document.getElementById('user-icon-display') as HTMLImageElement;
const videoGrid = document.getElementById('video-grid') as HTMLDivElement;

let currentEffect: 'none' | 'blur' | 'remove' | 'image' = 'none';
let backgroundImage: HTMLImageElement | null = null;
let isCameraOn = true;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();

// 背景セグメンテーション
const selfieSegmentation = new SelfieSegmentation({
  locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
});
selfieSegmentation.setOptions({ modelSelection: 1 });
selfieSegmentation.onResults((results: Results) => {
  if (!isCameraOn) return;
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-out';
  if (currentEffect === 'blur') {
    ctx.filter = 'blur(15px)'; ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  } else if (currentEffect === 'remove') {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (currentEffect === 'image' && backgroundImage) {
    ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  }
  ctx.globalCompositeOperation = 'destination-atop';
  ctx.filter = 'none';
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  ctx.restore();
});

// 通信処理（ルーム機能）
function handleCall(call: MediaConnection) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);
  call.on('stream', (stream) => {
    if (document.getElementById(call.peer)) return;
    const v = document.createElement('video');
    v.id = call.peer; v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "height: 100%; min-width: 150px; border-radius: 8px; background: #222; object-fit: cover;";
    videoGrid.appendChild(v);
  });
  call.on('close', () => { document.getElementById(call.peer)?.remove(); connectedPeers.delete(call.peer); });
}

document.getElementById('join-btn')!.onclick = () => {
  const room = (document.getElementById('room-input') as HTMLInputElement).value.trim();
  if (!room) return alert("ルーム名を入力してください");
  
  if (peer) peer.destroy();
  const roomID = `vroom-${room}-${Math.floor(Math.random() * 1000)}`;
  peer = new Peer(roomID);

  peer.on('open', () => {
    alert(`ルーム「${room}」に参加しました`);
    // 他の参加者を探す（簡易的なポーリング）
    setInterval(() => {
      for (let i = 0; i < 10; i++) {
        const target = `vroom-${room}-${i}`;
        if (peer && target !== peer.id && !connectedPeers.has(target)) {
          const call = peer.call(target, canvas.captureStream());
          if (call) handleCall(call);
        }
      }
    }, 5000);
  });

  peer.on('call', (call) => {
    call.answer(canvas.captureStream());
    handleCall(call);
  });
};

// UIイベント設定
document.getElementById('cam-btn')!.onclick = (e) => {
  isCameraOn = !isCameraOn;
  (e.currentTarget as HTMLElement).classList.toggle('off', !isCameraOn);
  cameraOffOverlay.style.display = isCameraOn ? 'none' : 'flex';
  const stream = video.srcObject as MediaStream;
  if (stream) stream.getVideoTracks()[0].enabled = isCameraOn;
};

document.getElementById('icon-upload-btn')!.onclick = () => (document.getElementById('icon-upload') as HTMLInputElement).click();
document.getElementById('icon-upload')!.onchange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) userIconDisplay.src = URL.createObjectURL(file);
};

document.getElementById('btn-none')!.onclick = () => currentEffect = 'none';
document.getElementById('btn-blur')!.onclick = () => currentEffect = 'blur';
document.getElementById('btn-remove')!.onclick = () => currentEffect = 'remove';
document.getElementById('btn-bg-img')!.onclick = () => (document.getElementById('bg-upload') as HTMLInputElement).click();
document.getElementById('bg-upload')!.onchange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    const img = new Image(); img.src = URL.createObjectURL(file);
    img.onload = () => { backgroundImage = img; currentEffect = 'image'; };
  }
};

document.getElementById('effect-btn')!.onclick = () => {
  const p = document.getElementById('effect-panel')!;
  p.style.display = p.style.display === 'none' ? 'flex' : 'none';
};

async function init() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  video.srcObject = stream;
  const loop = async () => {
    if (isCameraOn && video.readyState >= 2) await selfieSegmentation.send({ image: video });
    requestAnimationFrame(loop);
  };
  video.onloadeddata = loop;
}
init();