import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'

// ★ 顔認識AI(MediaPipe)を読み込む準備
const script = document.createElement('script');
script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/face_detection";
document.head.appendChild(script);

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100vw; background: #000; color: white; overflow: hidden; flex-direction: column;">
    <div style="flex: 1; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <canvas id="output-canvas" style="height: 100%; max-width: 100%; object-fit: contain;"></canvas>
      <div id="chat-box" style="display:none; position: absolute; right: 20px; top: 20px; bottom: 100px; width: 250px; background: rgba(30,30,30,0.9); border-radius: 10px; flex-direction: column; border: 1px solid #444; z-index: 100;">
        <div style="padding: 10px; border-bottom: 1px solid #444; font-weight: bold;">チャット</div>
        <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 12px;"></div>
        <div style="padding: 10px; display: flex; gap: 5px;">
          <input id="chat-input" type="text" style="flex: 1; background: #222; border: 1px solid #555; color: white; padding: 5px;">
          <button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 5px;">送信</button>
        </div>
      </div>
    </div>
    <div style="background: #111; padding: 15px; border-top: 1px solid #333;">
      <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 15px;">
        <input id="user-name" type="text" placeholder="なまえ" style="background: #222; border: 1px solid #444; color: white; padding: 8px; width: 100px;">
        <input id="room-input" type="text" placeholder="部屋名" style="background: #222; border: 1px solid #444; color: white; padding: 8px; width: 100px;">
        <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 8px 20px; font-weight: bold;">参加</button>
        <button id="exit-btn" style="background: #ea4335; color: white; border: none; padding: 8px 20px; font-weight: bold;">退出</button>
      </div>
      <div style="display: flex; align-items: center; justify-content: center; gap: 20px;">
        <button id="mic-btn" class="tool-btn">🎤</button>
        <button id="cam-btn" class="tool-btn">📹</button>
        <label class="tool-btn">🎭<input type="file" id="mask-upload" accept="image/*" style="display:none;"></label>
        <button id="chat-toggle-btn" class="tool-btn">💬</button>
      </div>
    </div>
    <div id="video-grid" style="height: 120px; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto;"></div>
  </div>
`

// スタイル
const style = document.createElement('style');
style.textContent = `.tool-btn { background: #333; border: none; color: white; font-size: 20px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; } .off { background: #ea4335 !important; }`;
document.head.appendChild(style);

// 変数
const canvas = document.querySelector<HTMLCanvasElement>('#output-canvas')!;
const ctx = canvas.getContext('2d')!;
const v = document.createElement('video');
let localStream: MediaStream;
let maskImg: HTMLImageElement | null = null;
let faceDetector: any;
let lastDetections: any[] = [];

// ★ 顔認識のセットアップ
async function setupFaceDetection() {
  // @ts-ignore
  faceDetector = new window.FaceDetection({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}` });
  faceDetector.setOptions({ model: 'short', minDetectionConfidence: 0.5 });
  faceDetector.onResults((results: any) => { lastDetections = results.detections; });
}

// 描画ループ
async function draw() {
  if (v.paused || v.ended) return;
  canvas.width = v.videoWidth; canvas.height = v.videoHeight;

  const videoTrack = localStream?.getVideoTracks()[0];
  const name = (document.getElementById('user-name') as HTMLInputElement).value || "自分";

  if (videoTrack && videoTrack.enabled) {
    // AIで顔を検出し、その結果を使って描画
    await faceDetector.send({ image: v });
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

    if (maskImg && lastDetections.length > 0) {
      const face = lastDetections[0].boundingBox;
      const x = face.xCenter * canvas.width;
      const y = face.yCenter * canvas.height;
      const w = face.width * canvas.width * 1.5; // 少し大きめに調整
      const h = face.height * canvas.height * 1.5;
      ctx.drawImage(maskImg, x - w/2, y - h/2, w, h);
    }
  } else {
    // カメラOFF：名前を表示
    ctx.fillStyle = "#222"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white"; ctx.font = "bold 50px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(name, canvas.width/2, canvas.height/2);
  }
  requestAnimationFrame(draw);
}

// 初期化
async function init() {
  await setupFaceDetection();
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  v.srcObject = localStream; v.play();
  v.onloadedmetadata = () => draw();
}

// --- 以下、チャット・通信ボタンの処理 ---
let peer: Peer | null = null;
const conns = new Map<string, any>();
document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value;
  if (!room) return alert("部屋名を入れてね");
  peer = new Peer();
  peer.on('call', (call) => { call.answer(canvas.captureStream(30)); setupRemote(call); });
  peer.on('connection', (c) => { 
    c.on('data', (d: any) => { if(d.type==='chat') addChat(d.name, d.text); });
    const call = peer!.call(c.peer, canvas.captureStream(30)); setupRemote(call);
    conns.set(c.peer, c);
  });
});
function setupRemote(call: any) {
  call.on('stream', (s: any) => {
    if(document.getElementById(call.peer)) return;
    const rv = document.createElement('video'); rv.id = call.peer; rv.srcObject = s; rv.autoplay = true;
    rv.style.height = "100%"; document.querySelector('#video-grid')?.appendChild(rv);
  });
}
function addChat(n: string, t: string) {
  const d = document.createElement('div'); d.innerHTML = `<strong>${n}:</strong> ${t}`;
  document.querySelector('#chat-messages')?.appendChild(d);
}
document.querySelector('#chat-send-btn')?.addEventListener('click', () => {
  const i = document.querySelector('#chat-input') as HTMLInputElement;
  const n = (document.querySelector('#user-name') as HTMLInputElement).value || "自分";
  addChat(n, i.value); conns.forEach(c => c.send({type:'chat', name:n, text:i.value})); i.value = "";
});
document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off');
});
document.querySelector('#mask-upload')?.addEventListener('change', (e: any) => {
  const f = e.target.files[0];
  if(f) { const r = new FileReader(); r.onload = (ev) => { maskImg = new Image(); maskImg.src = ev.target?.result as string; }; r.readAsDataURL(f); }
});
document.querySelector('#chat-toggle-btn')?.addEventListener('click', () => {
  const b = document.querySelector('#chat-box') as HTMLElement; b.style.display = b.style.display==='none'?'flex':'none';
});
document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

init();