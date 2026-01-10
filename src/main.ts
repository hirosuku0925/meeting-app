import './style.css'
import { Peer, DataConnection, MediaConnection } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'
import * as webllm from "@mlc-ai/web-llm"

// --- 1. UI構築 ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; overflow: hidden; background: #f0f2f5;">
    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333; margin-bottom: 20px;">AIマルチ会議室 @nijinai</h1>
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; padding: 10px; width: 100%;">
        <div id="local-container" style="text-align: center;">
          <p style="font-size: 12px; color: #666; margin-bottom: 5px;">自分 (You)</p>
          <canvas id="local-canvas" width="480" height="360" style="width: 280px; border: 3px solid #646cff; border-radius: 15px; background: #222; box-shadow: 0 8px 16px rgba(0,0,0,0.2);"></canvas>
        </div>
      </div>
      <div class="card" style="width: 100%; max-width: 500px; margin-top: 20px; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
        <p id="ai-status" style="font-size: 11px; color: #ff4d97; text-align: center; margin-bottom: 10px;">🤖 AI準備中...</p>
        <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 15px; flex-wrap: wrap;">
          <button id="camera-btn" style="background-color: #2196F3; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">📹 カメラ切替</button>
          <button id="mic-btn" style="background-color: #4CAF50; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">🎤 マイク切替</button>
          <button id="avatar-mode-btn" style="background-color: #555; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">👤 アバター切替</button>
          <button id="hangup-btn" style="background-color: #f44336; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">退出</button>
        </div>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 12px; margin-bottom: 15px;">
          <label style="font-size: 11px; font-weight: bold; color: #1976D2;">🏞 背景設定</label>
          <input type="file" id="bg-upload" accept="image/*" style="width: 100%; font-size: 10px; margin-top: 5px;">
        </div>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 12px;">
          <input type="text" id="user-name-input" placeholder="名前" value="User-${Math.floor(Math.random()*1000)}" style="width: 100%; padding: 8px; margin-bottom: 10px; border-radius: 5px; border: 1px solid #ddd;">
          <div style="display: flex; gap: 10px;">
             <input id="remote-id-input" type="text" placeholder="誰か一人のIDを入力" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
             <button id="connect-btn" style="flex: 1; background-color: #646cff; color: white; border-radius: 5px; cursor:pointer;">入室</button>
          </div>
        </div>
        <p id="status" style="font-size: 12px; color: #1976D2; font-weight: bold; margin-top: 10px; text-align:center;">ID取得中...</p>
      </div>
    </div>
    <div style="width: 250px; background: #fff; border-left: 1px solid #ddd; display: flex; flex-direction: column;">
      <div style="padding: 15px; background: #646cff; color: white; font-weight: bold;">チャット</div>
      <div id="chat-box" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 13px; display: flex; flex-direction: column; gap: 5px;"></div>
      <div style="padding: 10px; border-top: 1px solid #eee; display: flex; gap: 5px;">
        <input type="text" id="chat-input" placeholder="@nijinai 質問してね" style="flex: 1; padding: 5px;">
        <button id="send-btn" style="background: #646cff; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor:pointer;">送信</button>
      </div>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

// --- 2. グローバル変数 ---
const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const chatBox = document.querySelector<HTMLDivElement>('#chat-box')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;
const aiStatus = document.getElementById("ai-status")!;
const videoGrid = document.querySelector('#video-grid')!;

let isMicOn = true, isAvatarMode = false;
let imgClose: HTMLImageElement | null = null, imgOpen: HTMLImageElement | null = null, backgroundImg: HTMLImageElement | null = null;
let processedStream: MediaStream | null = null;
const dataConnections: Map<string, DataConnection> = new Map();
const remoteVideoIds: Set<string> = new Set();

// --- 3. AI (WebLLM) ---
let engine: webllm.MLCEngine | null = null;
async function initAI() {
  try {
    engine = new webllm.MLCEngine();
    engine.setInitProgressCallback((report) => { aiStatus.innerText = `🤖 AI読込中: ${Math.round(report.progress * 100)}%`; });
    await engine.reload("Llama-3.1-8B-Instruct-q4f16_1-MLC");
    aiStatus.innerText = "🤖 AI準備完了！ @nijinai と呼んでね";
  } catch (e) { aiStatus.innerText = "❌ AI起動失敗"; }
}
initAI();

// --- 4. 映像処理 (MediaPipe) ---
const selfie = new SelfieSegmentation({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
selfie.setOptions({ modelSelection: 1 });
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

let currentMask: any = null;
selfie.onResults((res) => { currentMask = res.segmentationMask; });

faceMesh.onResults((res) => {
  ctx.save(); ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (backgroundImg) ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
  if (res.image) {
    if (currentMask && backgroundImg && !isAvatarMode) {
      const off = document.createElement('canvas'); off.width = 480; off.height = 360;
      const oCtx = off.getContext('2d')!;
      oCtx.drawImage(currentMask, 0, 0, 480, 360);
      oCtx.globalCompositeOperation = 'source-in'; oCtx.drawImage(res.image, 0, 0, 480, 360);
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    } else { ctx.drawImage(res.image, 0, 0, canvas.width, canvas.height); }
  }
  if (isAvatarMode && res.multiFaceLandmarks?.[0] && imgClose && imgOpen) {
    const lm = res.multiFaceLandmarks[0];
    const cx = lm[1].x * canvas.width, cy = lm[1].y * canvas.height;
    const r = ((lm[454].x - lm[234].x) * canvas.width * 1.8) / 2;
    const isOpen = Math.abs(lm[13].y - lm[14].y) > 0.025;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(isOpen && isMicOn ? imgOpen : imgClose, cx - r, cy - r, r * 2, r * 2); ctx.restore();
  }
  ctx.restore();
});

// --- 5. 通信コア (多人数対応) ---
const peer = new Peer();

const connectToPeer = (tid: string) => {
  if (tid === peer.id || dataConnections.has(tid)) return;
  console.log("接続開始:", tid);
  const conn = peer.connect(tid);
  setupData(conn);
  if (processedStream) {
    const call = peer.call(tid, processedStream);
    call.on('stream', (s) => addVideo(tid, s));
  }
};

const setupData = (conn: DataConnection) => {
  dataConnections.set(conn.peer, conn);
  conn.on('open', () => {
    // 自分が知っている全員のIDを送信（多人数バケツリレー）
    conn.send({ type: 'signal', peers: Array.from(dataConnections.keys()) });
    addChatMessage("System", `${conn.peer.slice(0,5)}さんが入室しました`);
  });
  conn.on('data', (data: any) => {
    if (data.type === 'chat') addChatMessage(data.name, data.content);
    if (data.type === 'signal') data.peers.forEach((p: string) => connectToPeer(p));
  });
  conn.on('close', () => {
    dataConnections.delete(conn.peer);
    remoteVideoIds.delete(conn.peer);
    document.getElementById(`remote-wrap-${conn.peer}`)?.remove();
  });
};

const addVideo = (pid: string, s: MediaStream) => {
  if (remoteVideoIds.has(pid)) return;
  remoteVideoIds.add(pid);
  const div = document.createElement('div');
  div.id = `remote-wrap-${pid}`;
  div.style.textAlign = "center";
  div.innerHTML = `<p style="font-size:10px; color:#666;">ID: ${pid.slice(0,5)}</p>`;
  const v = document.createElement('video');
  v.style.width="280px"; v.style.borderRadius="15px"; v.srcObject=s; v.autoplay=true; v.playsInline=true;
  div.appendChild(v); videoGrid.appendChild(div);
};

peer.on('open', (id) => statusEl.innerText = `あなたのID: ${id}`);
peer.on('connection', setupData);
peer.on('call', (call: MediaConnection) => {
  if (processedStream) {
    call.answer(processedStream);
    call.on('stream', (s) => addVideo(call.peer, s));
  }
});

function addChatMessage(name: string, content: string) {
  const p = document.createElement('p');
  p.innerHTML = `<b>${name}:</b> ${content}`;
  chatBox.appendChild(p); chatBox.scrollTop = chatBox.scrollHeight;
}

// --- 6. イベント ---
document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const ridInput = document.querySelector<HTMLInputElement>('#remote-id-input');
  const rid = ridInput ? ridInput.value.trim() : "";
  if (rid) connectToPeer(rid);
});

document.querySelector('#send-btn')?.addEventListener('click', async () => {
  const input = document.querySelector<HTMLInputElement>('#chat-input')!;
  const name = (document.querySelector<HTMLInputElement>('#user-name-input')!).value;
  if (!input.value) return;
  addChatMessage("自分", input.value);
  dataConnections.forEach(c => c.send({ type: 'chat', name, content: input.value }));
  if (input.value.includes("@nijinai") && engine) {
    const res = await engine.chat.completions.create({
      messages: [{ role: "system", content: "猫のnijinaiです。語尾に『にゃ』を付けて。" }, { role: "user", content: input.value }]
    });
    addChatMessage("nijinai", res.choices[0].message.content || "にゃ？");
  }
  input.value = "";
});

document.querySelector('#bg-upload')?.addEventListener('change', (e: any) => {
  const f = e.target.files[0]; if (!f) return;
  const i = new Image(); i.onload = () => { backgroundImg = i; }; i.src = URL.createObjectURL(f);
});

navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  processedStream = canvas.captureStream(30);
  stream.getAudioTracks().forEach(t => processedStream!.addTrack(t));
  video.srcObject = stream; video.play();
  const loop = async () => { 
    await selfie.send({ image: video }); 
    await faceMesh.send({ image: video }); 
    requestAnimationFrame(loop); 
  };
  loop();
});

document.querySelector('#camera-btn')?.addEventListener('click', () => {
  const t = (video.srcObject as MediaStream).getVideoTracks()[0]; t.enabled = !t.enabled;
});
document.querySelector('#mic-btn')?.addEventListener('click', () => {
  isMicOn = !isMicOn; (video.srcObject as MediaStream).getAudioTracks()[0].enabled = isMicOn;
});
document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => { isAvatarMode = !isAvatarMode; });
document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());