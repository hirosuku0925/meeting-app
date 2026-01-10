import './style.css'
import { Peer, DataConnection } from 'peerjs'
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
          <canvas id="local-canvas" width="480" height="360" style="width: 320px; border: 3px solid #646cff; border-radius: 15px; background: #000; box-shadow: 0 8px 16px rgba(0,0,0,0.2);"></canvas>
        </div>
      </div>
      <div class="card" style="width: 100%; max-width: 500px; margin-top: 20px; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
        <p id="ai-status" style="font-size: 11px; color: #ff4d97; text-align: center;">🤖 AI準備中...</p>
        <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 15px; flex-wrap: wrap;">
          <button id="avatar-mode-btn" style="background-color: #555; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">👤 アバター: OFF</button>
          <button id="record-btn" style="background-color: #ff9800; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">🔴 録画開始</button>
          <button id="hangup-btn" style="background-color: #f44336; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">退出</button>
        </div>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 12px;">
          <input type="text" id="user-name-input" placeholder="名前" value="なまえ" style="width: 100%; padding: 8px; margin-bottom: 10px; border-radius: 5px; border: 1px solid #ddd;">
          <div style="display: flex; gap: 10px;">
             <input id="remote-id-input" type="text" placeholder="入室するIDを入力" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
             <button id="connect-btn" style="flex: 1; background-color: #646cff; color: white; border-radius: 5px; cursor: pointer;">入室</button>
          </div>
        </div>
        <p id="status" style="font-size: 12px; color: #1976D2; text-align:center; margin-top: 10px; font-weight:bold;">ID: 取得中...</p>
      </div>
    </div>
    <div style="width: 280px; background: #fff; border-left: 1px solid #ddd; display: flex; flex-direction: column;">
      <div style="padding: 15px; background: #646cff; color: white; font-weight: bold;">AIチャット</div>
      <div id="chat-box" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 13px;"></div>
      <div style="padding: 10px; border-top: 1px solid #eee; display: flex; gap: 5px;">
        <input type="text" id="chat-input" placeholder="@nijinai 質問してね" style="flex: 1; padding: 5px;">
        <button id="send-btn" style="background: #646cff; color: white; border: none; padding: 5px 10px; border-radius: 4px;">送信</button>
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
const aiStatus = document.getElementById("ai-status")!;
const statusEl = document.querySelector<HTMLElement>('#status')!;

let processedStream: MediaStream;
const connections: Set<DataConnection> = new Set();
let isAvatarMode = false;
let isThinking = false;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

// --- 3. 軽量AI (WebLLM) 設定 ---
let engine: webllm.MLCEngine | null = null;
async function initAI() {
  try {
    engine = new webllm.MLCEngine();
    engine.setInitProgressCallback((r) => aiStatus.innerText = `🤖 AI準備中: ${Math.round(r.progress * 100)}%`);
    await engine.reload("SmolLM-135M-Instruct-v0.2-q4f16_1-MLC");
    aiStatus.innerText = "🤖 AI準備完了！ @nijinai と呼んでね";
  } catch (e) { aiStatus.innerText = "❌ AI起動失敗(WebGPU)"; }
}
initAI();

// --- 4. 映像処理 (Mediapipe) ---
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

const selfie = new SelfieSegmentation({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
selfie.setOptions({ modelSelection: 1 });

let currentMask: any = null;
selfie.onResults((res) => { currentMask = res.segmentationMask; });

faceMesh.onResults((res) => {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
  if (res.image) {
    // 常に人物を描画するように修正
    ctx.drawImage(res.image, 0, 0, canvas.width, canvas.height);
  }
  ctx.restore();
});

// --- 5. 通信 (PeerJS) 多人数対応 ---
const peer = new Peer();
peer.on('open', (id) => statusEl.innerText = `あなたのID: ${id}`);

const setupConn = (conn: DataConnection) => {
  connections.add(conn);
  conn.on('data', (data: any) => {
    if (data.type === 'chat') addChatMessage(data.name, data.content, data.name === 'nijinai');
  });
  conn.on('close', () => connections.delete(conn));
};

peer.on('connection', (conn) => {
  setupConn(conn);
});

peer.on('call', (call) => {
  call.answer(processedStream);
  handleRemoteStream(call);
});

function handleRemoteStream(call: any) {
  call.on('stream', (stream: MediaStream) => {
    const id = `video-${call.peer}`;
    if (document.getElementById(id)) return;
    const v = document.createElement('video');
    v.id = id; v.style.width = "240px"; v.style.borderRadius = "10px";
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    document.querySelector('#video-grid')?.appendChild(v);
  });
  call.on('close', () => document.getElementById(`video-${call.peer}`)?.remove());
}

document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const id = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value;
  if (!id || id === peer.id) return;
  setupConn(peer.connect(id));
  handleRemoteStream(peer.call(id, processedStream));
});

// --- 6. チャット & AI ---
function addChatMessage(name: string, content: string, isAI = false) {
  const p = document.createElement('p');
  p.style.margin = "4px 0";
  p.style.color = isAI ? "#ff4d97" : "#333";
  p.innerHTML = `<b>${name}:</b> ${content}`;
  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
}

document.querySelector('#send-btn')?.addEventListener('click', async () => {
  const input = document.querySelector<HTMLInputElement>('#chat-input')!;
  const nameInput = document.querySelector<HTMLInputElement>('#user-name-input')!;
  if (!input.value || isThinking) return;

  const msg = input.value;
  addChatMessage("自分", msg);
  connections.forEach(c => c.send({ type: 'chat', name: nameInput.value, content: msg }));

  if (msg.includes("@nijinai") && engine) {
    isThinking = true;
    try {
      const messages: any[] = [{ role: "system", content: "1行で答えて。" }, { role: "user", content: msg }];
      const reply = await engine.chat.completions.create({ messages: messages as any, max_tokens: 30 });
      const aiText = reply.choices[0].message.content || "にゃ？";
      addChatMessage("nijinai", aiText, true);
      connections.forEach(c => c.send({ type: 'chat', name: "nijinai", content: aiText }));
    } catch (e) {} finally { isThinking = false; }
  }
  input.value = "";
});

// --- 7. 録画機能 ---
document.querySelector('#record-btn')?.addEventListener('click', () => {
  const btn = document.querySelector<HTMLButtonElement>('#record-btn')!;
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(processedStream);
    mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `meeting-${Date.now()}.webm`;
      a.click();
    };
    mediaRecorder.start();
    btn.innerText = "⏹ 停止";
  } else {
    mediaRecorder.stop();
    btn.innerText = "🔴 録画開始";
  }
});

// --- 8. 起動処理 (黒画面対策) ---
async function startApp() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: true });
    
    // 加工用ストリーム作成
    processedStream = canvas.captureStream(25);
    stream.getAudioTracks().forEach(t => processedStream.addTrack(t));
    
    video.srcObject = stream;
    await video.play();

    const loop = async () => {
      if (video.readyState >= 2) {
        await selfie.send({ image: video });
        await faceMesh.send({ image: video });
      }
      requestAnimationFrame(loop);
    };
    loop();
  } catch (err) {
    console.error("Camera error:", err);
    alert("カメラを許可してください");
  }
}

startApp();

document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!.innerText = isAvatarMode ? "👤 アバター: ON" : "👤 アバター: OFF";
});
document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());