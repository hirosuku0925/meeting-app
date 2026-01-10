import './style.css'
import { Peer, DataConnection } from 'peerjs' // MediaConnectionは型推論に任せて削除
import { FaceMesh } from '@mediapipe/face_mesh'
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'
import * as webllm from "@mlc-ai/web-llm"

// --- UI構築 ---
document.querySelector('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; overflow: hidden; background: #f0f2f5;">
    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333; margin-bottom: 20px;">AIマルチ会議室 @nijinai</h1>
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; padding: 10px; width: 100%;">
        <div id="local-container" style="text-align: center;">
          <p style="font-size: 12px; color: #666; margin-bottom: 5px;">自分</p>
          <canvas id="local-canvas" width="480" height="360" style="width: 280px; border: 3px solid #646cff; border-radius: 15px; background: #222; box-shadow: 0 8px 16px rgba(0,0,0,0.2);"></canvas>
        </div>
      </div>
      <div class="card" style="width: 100%; max-width: 500px; margin-top: 20px; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
        <p id="ai-status" style="font-size: 11px; color: #ff4d97; text-align: center; margin-bottom: 10px;">🤖 AI準備中...</p>
        <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 15px; flex-wrap: wrap;">
          <button id="camera-btn" style="background-color: #2196F3; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">📹 カメラ: ON</button>
          <button id="mic-btn" style="background-color: #4CAF50; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">🎤 マイク: ON</button>
          <button id="avatar-mode-btn" style="background-color: #555; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">👤 アバター: OFF</button>
          <button id="hangup-btn" style="background-color: #f44336; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">退出</button>
        </div>
        <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 15px; background: #eee; padding: 10px; border-radius: 10px;">
          <button class="react-btn" data-emoji="👏" style="font-size: 20px; border:none; background:none; cursor:pointer;">👏</button>
          <button class="react-btn" data-emoji="❤️" style="font-size: 20px; border:none; background:none; cursor:pointer;">❤️</button>
          <button class="react-btn" data-emoji="😮" style="font-size: 20px; border:none; background:none; cursor:pointer;">😮</button>
          <button class="react-btn" data-emoji="🔥" style="font-size: 20px; border:none; background:none; cursor:pointer;">🔥</button>
        </div>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 12px; text-align: left; margin-bottom: 15px;">
          <label style="font-size: 11px; font-weight: bold; color: #1976D2;">🏞 背景・アバター設定</label>
          <input type="file" id="bg-upload" accept="image/*" style="width: 100%; font-size: 10px; margin-top: 5px;">
        </div>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 12px;">
          <input type="text" id="user-name-input" placeholder="名前" value="User-${Math.floor(Math.random()*100)}" style="width: 100%; padding: 8px; margin-bottom: 10px; border-radius: 5px; border: 1px solid #ddd;">
          <div style="display: flex; gap: 10px;">
             <input id="remote-id-input" type="text" placeholder="入室するIDを入力" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
             <button id="connect-btn" style="flex: 1; background-color: #646cff; color: white; border-radius: 5px;">入室</button>
          </div>
        </div>
        <p id="status" style="font-size: 12px; color: #1976D2; font-weight: bold; margin-top: 10px; text-align:center;">ID: 取得中...</p>
      </div>
    </div>
    <div style="width: 250px; background: #fff; border-left: 1px solid #ddd; display: flex; flex-direction: column;">
      <div style="padding: 15px; background: #646cff; color: white; font-weight: bold;">チャット</div>
      <div id="chat-box" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 13px; display: flex; flex-direction: column; gap: 5px;"></div>
      <div style="padding: 10px; border-top: 1px solid #eee; display: flex; gap: 5px;">
        <input type="text" id="chat-input" placeholder="@nijinai 質問してね" style="flex: 1; padding: 5px;">
        <button id="send-btn" style="background: #646cff; color: white; border: none; padding: 5px 10px; border-radius: 4px;">送信</button>
      </div>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

// --- グローバル変数 ---
const canvas = document.querySelector('#local-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector('#hidden-video') as HTMLVideoElement;
const chatBox = document.querySelector('#chat-box') as HTMLDivElement;
const statusEl = document.querySelector('#status') as HTMLElement;
const aiStatus = document.getElementById("ai-status")!;
const videoGrid = document.querySelector('#video-grid')!;

let isMicOn = true, isAvatarMode = false;
let imgClose: HTMLImageElement | null = null, imgOpen: HTMLImageElement | null = null, backgroundImg: HTMLImageElement | null = null;
let processedStream: MediaStream | null = null;
const connections: Map<string, DataConnection> = new Map();
const remoteStreams: Set<string> = new Set();
let reactions: { emoji: string, time: number }[] = [];

// --- AI準備 ---
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

// --- メディア処理 (MediaPipe) ---
const selfie = new SelfieSegmentation({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
selfie.setOptions({ modelSelection: 1 });
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

let currentMask: any = null;
selfie.onResults((res) => { currentMask = res.segmentationMask; });

faceMesh.onResults((res) => {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (backgroundImg) ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
  
  if (res.image) {
    if (currentMask && backgroundImg && !isAvatarMode) {
      const offCanvas = document.createElement('canvas'); offCanvas.width = 480; offCanvas.height = 360;
      const offCtx = offCanvas.getContext('2d')!;
      offCtx.drawImage(currentMask, 0, 0, 480, 360);
      offCtx.globalCompositeOperation = 'source-in'; offCtx.drawImage(res.image, 0, 0, 480, 360);
      ctx.drawImage(offCanvas, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.drawImage(res.image, 0, 0, canvas.width, canvas.height);
    }
  }

  if (res.multiFaceLandmarks?.[0]) {
    const landmarks = res.multiFaceLandmarks[0];
    const centerX = landmarks[1].x * canvas.width, centerY = landmarks[1].y * canvas.height;
    const radius = ((landmarks[454].x - landmarks[234].x) * canvas.width * 1.8) / 2;

    if (isAvatarMode && imgClose && imgOpen) {
      const isMouthOpen = Math.abs(landmarks[13].y - landmarks[14].y) > 0.025;
      ctx.save(); ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(isMouthOpen && isMicOn ? imgOpen : imgClose, centerX - radius, centerY - radius, radius * 2, radius * 2); ctx.restore();
    }
    const now = Date.now();
    reactions = reactions.filter(r => now - r.time < 2000);
    reactions.forEach((r, i) => {
      ctx.save(); ctx.scale(-1, 1); ctx.font = "40px serif"; ctx.textAlign = "center";
      ctx.fillText(r.emoji, -centerX, centerY - radius - 20 - (i * 40)); ctx.restore();
    });
  }
  ctx.restore();
});

// --- 多人数対応 通信ロジック ---
const peer = new Peer();

const addVideoToGrid = (peerId: string, stream: MediaStream) => {
  if (remoteStreams.has(peerId)) return;
  remoteStreams.add(peerId);
  const container = document.createElement('div');
  container.id = `remote-container-${peerId}`;
  container.innerHTML = `<p style="font-size:12px;">ID: ${peerId.slice(0, 5)}</p>`;
  const v = document.createElement('video');
  v.srcObject = stream; v.autoplay = true; v.playsInline = true;
  v.style.width = "280px"; v.style.borderRadius = "15px";
  container.appendChild(v); videoGrid.appendChild(container);
};

const connectToPeer = (remoteId: string) => {
  if (!remoteId || remoteId === peer.id || connections.has(remoteId)) return;
  const conn = peer.connect(remoteId);
  setupDataConn(conn);
  if (processedStream) {
    const call = peer.call(remoteId, processedStream);
    call.on('stream', (stream) => addVideoToGrid(remoteId, stream));
  }
};

const setupDataConn = (conn: DataConnection) => {
  connections.set(conn.peer, conn);
  conn.on('open', () => {
    // 参加者リストを送って多人数接続を自動化
    const allIds = Array.from(connections.keys());
    conn.send({ type: 'intro', peers: allIds });
    addChatMessage("System", `${conn.peer.slice(0,5)}が入室しました`);
  });
  conn.on('data', (data: any) => {
    if (data.type === 'chat') addChatMessage(data.name, data.content);
    if (data.type === 'reaction') reactions.push({ emoji: data.content, time: Date.now() });
    if (data.type === 'intro') {
      data.peers.forEach((pid: string) => connectToPeer(pid));
    }
  });
  conn.on('close', () => {
    connections.delete(conn.peer);
    remoteStreams.delete(conn.peer);
    document.getElementById(`remote-container-${conn.peer}`)?.remove();
  });
};

peer.on('open', (id) => statusEl.innerText = `あなたのID: ${id}`);
peer.on('connection', setupDataConn);
peer.on('call', (call) => {
  if (processedStream) {
    call.answer(processedStream);
    call.on('stream', (stream) => addVideoToGrid(call.peer, stream));
  }
});

// --- イベント ---
function addChatMessage(name: string, content: string) {
  const p = document.createElement('p');
  p.innerHTML = `<b>${name}:</b> ${content}`;
  chatBox.appendChild(p); chatBox.scrollTop = chatBox.scrollHeight;
}

document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const input = document.querySelector('#remote-id-input') as HTMLInputElement;
  connectToPeer(input.value.trim());
});

document.querySelector('#send-btn')?.addEventListener('click', async () => {
  const input = document.querySelector('#chat-input') as HTMLInputElement;
  const name = (document.querySelector('#user-name-input') as HTMLInputElement).value;
  if (!input.value) return;
  const msg = input.value;
  addChatMessage("自分", msg);
  connections.forEach(c => c.send({ type: 'chat', name, content: msg }));
  if (msg.includes("@nijinai") && engine) {
    const reply = await engine.chat.completions.create({ messages: [{ role: "user", content: msg.replace("@nijinai","") }] as any });
    const aiTxt = reply.choices[0].message.content || "にゃ？";
    addChatMessage("nijinai", aiTxt);
    connections.forEach(c => c.send({ type: 'chat', name: "nijinai", content: aiTxt }));
  }
  input.value = "";
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

document.querySelector('#bg-upload')?.addEventListener('change', (e: any) => {
  const f = e.target.files[0]; if(!f) return;
  const i = new Image(); i.onload = () => backgroundImg = i; i.src = URL.createObjectURL(f);
});

document.querySelectorAll('.react-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const emoji = (btn as HTMLElement).dataset.emoji!;
    reactions.push({ emoji, time: Date.now() });
    connections.forEach(c => c.send({ type: 'reaction', content: emoji }));
  });
});

document.querySelector('#camera-btn')?.addEventListener('click', () => {
  const t = (video.srcObject as MediaStream).getVideoTracks()[0]; t.enabled = !t.enabled;
});
document.querySelector('#mic-btn')?.addEventListener('click', () => {
  isMicOn = !isMicOn; (video.srcObject as MediaStream).getAudioTracks()[0].enabled = isMicOn;
});
document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => isAvatarMode = !isAvatarMode);
document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());