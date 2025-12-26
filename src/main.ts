import './style.css'
import { Peer, DataConnection } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; overflow: hidden; background: #f0f2f5;">
    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333; margin-bottom: 20px;">バーチャル会議室</h1>
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; padding: 10px;">
        <canvas id="local-canvas" width="480" height="360" style="width: 320px; border: 3px solid #646cff; border-radius: 15px; background: #222; box-shadow: 0 8px 16px rgba(0,0,0,0.2);"></canvas>
      </div>
      <div class="card" style="width: 100%; max-width: 500px; margin-top: 20px; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
        <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 15px; flex-wrap: wrap;">
          <button id="camera-btn" style="background-color: #2196F3; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">📹 カメラ: ON</button>
          <button id="mic-btn" style="background-color: #4CAF50; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">🎤 マイク: ON</button>
          <button id="voice-btn" style="background-color: #9C27B0; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">🔊 ボイス: 通常</button>
          <button id="avatar-mode-btn" style="background-color: #555; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">👤 アバター: OFF</button>
          <button id="hangup-btn" style="background-color: #f44336; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">退出</button>
        </div>
        <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 15px; background: #eee; padding: 10px; border-radius: 10px;">
          <button class="react-btn" data-emoji="👏" style="font-size: 20px; cursor: pointer; background: none; border: none;">👏</button>
          <button class="react-btn" data-emoji="❤️" style="font-size: 20px; cursor: pointer; background: none; border: none;">❤️</button>
          <button class="react-btn" data-emoji="😮" style="font-size: 20px; cursor: pointer; background: none; border: none;">😮</button>
          <button class="react-btn" data-emoji="🔥" style="font-size: 20px; cursor: pointer; background: none; border: none;">🔥</button>
        </div>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 12px; text-align: left; margin-bottom: 15px;">
          <label style="font-size: 11px; font-weight: bold; color: #1976D2;">🏞 背景画像を設定</label>
          <input type="file" id="bg-upload" accept="image/*" style="width: 100%; font-size: 10px; margin-top: 5px;">
          <hr style="border: 0; border-top: 1px solid #ddd; margin: 10px 0;">
          <label style="font-size: 11px; font-weight: bold; color: #666;">👤 アバター画像設定</label>
          <div style="display: flex; gap: 5px; margin-top: 5px;">
            <input type="file" id="avatar-close" accept="image/*" title="ふだん" style="font-size: 9px; width: 33%;">
            <input type="file" id="avatar-open" accept="image/*" title="しゃべる" style="font-size: 9px; width: 33%;">
            <input type="file" id="avatar-blink" accept="image/*" title="まばたき" style="font-size: 9px; width: 33%;">
          </div>
        </div>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 12px; text-align: left;">
          <input type="text" id="user-name-input" placeholder="名前" value="User Name" style="width: 100%; padding: 8px; margin-bottom: 10px; border-radius: 5px; border: 1px solid #ddd;">
          <div style="display: flex; gap: 10px;">
             <input id="remote-id-input" type="text" placeholder="相手のIDを入力" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
             <button id="connect-btn" style="flex: 1; background-color: #646cff; color: white; border-radius: 5px; border: none; cursor: pointer;">接続</button>
          </div>
        </div>
        <p id="status" style="font-size: 12px; color: #d32f2f; font-weight: bold; margin-top: 10px;">ID: 取得中...</p>
      </div>
    </div>
    <div style="width: 300px; background: #fff; border-left: 1px solid #ddd; display: flex; flex-direction: column;">
      <div style="padding: 15px; background: #646cff; color: white; font-weight: bold;">チャット</div>
      <div id="chat-box" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 14px; display: flex; flex-direction: column; gap: 8px;"></div>
      <div style="padding: 10px; border-top: 1px solid #eee; display: flex; gap: 5px;">
        <input type="text" id="chat-input" placeholder="メッセージを入力..." style="flex: 1; padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
        <button id="send-btn" style="background: #646cff; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;">送信</button>
      </div>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

// --- グローバル変数 ---
const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const nameInput = document.querySelector<HTMLInputElement>('#user-name-input')!;
const chatBox = document.querySelector<HTMLDivElement>('#chat-box')!;
const chatInput = document.querySelector<HTMLInputElement>('#chat-input')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;

let isCameraOn = true, isMicOn = true, isVoiceEffect = false, isAvatarMode = false;
let imgClose: HTMLImageElement | null = null, imgOpen: HTMLImageElement | null = null, imgBlink: HTMLImageElement | null = null, backgroundImg: HTMLImageElement | null = null;
let localStream: MediaStream, processedStream: MediaStream;
let connections: DataConnection[] = [], reactions: { emoji: string, time: number }[] = [];

// --- ボイスチェンジャー設定 ---
let audioCtx: AudioContext, pitchShifter: DelayNode;
function setupAudioEffect(stream: MediaStream) {
  audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const dest = audioCtx.createMediaStreamDestination();
  pitchShifter = audioCtx.createDelay();
  pitchShifter.delayTime.value = 0; 
  source.connect(pitchShifter);
  pitchShifter.connect(dest);
  return dest.stream.getAudioTracks()[0];
}

// --- 背景・人物描画処理 ---
const offCanvas = document.createElement('canvas');
offCanvas.width = 480; offCanvas.height = 360;
const offCtx = offCanvas.getContext('2d')!;

const setupImageUpload = (id: string, cb: (img: HTMLImageElement) => void) => {
  document.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) { const img = new Image(); img.onload = () => cb(img); img.src = URL.createObjectURL(file); }
  });
};
setupImageUpload('avatar-close', (img) => imgClose = img);
setupImageUpload('avatar-open', (img) => imgOpen = img);
setupImageUpload('avatar-blink', (img) => imgBlink = img);
setupImageUpload('bg-upload', (img) => backgroundImg = img);

const selfieSegmentation = new SelfieSegmentation({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}` });
selfieSegmentation.setOptions({ modelSelection: 1 });
const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5 });

let currentMask: any = null;
selfieSegmentation.onResults((res) => { currentMask = res.segmentationMask; });

faceMesh.onResults((res) => {
  ctx.save(); ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (backgroundImg) ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
  if (res.image) {
    if (currentMask && backgroundImg && !isAvatarMode) {
      offCtx.save(); offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
      offCtx.drawImage(currentMask, 0, 0, offCanvas.width, offCanvas.height);
      offCtx.globalCompositeOperation = 'source-in'; offCtx.drawImage(res.image, 0, 0, offCanvas.width, offCanvas.height); offCtx.restore();
      ctx.drawImage(offCanvas, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.save(); if (isAvatarMode) ctx.globalAlpha = 0.2; ctx.drawImage(res.image, 0, 0, canvas.width, canvas.height); ctx.restore();
    }
  }
  if (res.multiFaceLandmarks && res.multiFaceLandmarks.length > 0) {
    const landmarks = res.multiFaceLandmarks[0];
    const centerX = landmarks[1].x * canvas.width, centerY = landmarks[1].y * canvas.height;
    const radius = ((landmarks[454].x - landmarks[234].x) * canvas.width * 1.8) / 2;
    if (isAvatarMode && imgClose && imgOpen) {
      const isMouthOpen = Math.abs(landmarks[13].y - landmarks[14].y) > 0.025;
      const isBlinking = Math.abs(landmarks[159].y - landmarks[145].y) < 0.012;
      ctx.save(); ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.clip();
      let targetImg = imgClose;
      if (isBlinking && imgBlink) targetImg = imgBlink; else if (isMouthOpen && isMicOn) targetImg = imgOpen;
      ctx.drawImage(targetImg, centerX - radius, centerY - radius, radius * 2, radius * 2); ctx.restore();
    }
    const now = Date.now(); reactions = reactions.filter(r => now - r.time < 2000);
    reactions.forEach((r, i) => {
      ctx.save(); ctx.scale(-1, 1); ctx.font = "40px serif"; ctx.textAlign = "center";
      ctx.fillText(r.emoji, -centerX, centerY - radius - 20 - (i * 40)); ctx.restore();
    });
  }
  ctx.restore();
});

// --- 通信コア機能 ---
const updateStatus = (msg: string) => { statusEl.innerText = msg; console.log(msg); };

function setupRemoteVideo(call: any) {
  call.on('stream', (stream: MediaStream) => {
    const id = `video-${call.peer}`;
    if (document.getElementById(id)) return;
    const v = document.createElement('video');
    v.id = id; v.style.width = "320px"; v.style.borderRadius = "15px"; v.autoplay = true; v.playsInline = true; v.srcObject = stream;
    document.querySelector('#video-grid')!.appendChild(v);
    updateStatus("接続完了！");
  });
  call.on('close', () => document.getElementById(`video-${call.peer}`)?.remove());
}

const handleData = (conn: DataConnection) => {
  conn.on('data', (data: any) => {
    if (data.type === 'chat') {
      const el = document.createElement('div'); el.innerText = `${data.name}: ${data.content}`;
      el.style.background = "#f0f0f0"; el.style.padding = "5px 10px"; el.style.borderRadius = "5px";
      chatBox.appendChild(el); chatBox.scrollTop = chatBox.scrollHeight;
    }
    if (data.type === 'reaction') reactions.push({ emoji: data.content, time: Date.now() });
  });
  conn.on('close', () => document.getElementById(`video-${conn.peer}`)?.remove());
};

// --- 初期化 ---
navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: true }).then(stream => {
  localStream = stream;
  const audioTrack = setupAudioEffect(stream);
  processedStream = canvas.captureStream(25);
  processedStream.addTrack(audioTrack);
  video.srcObject = stream;
  video.onloadedmetadata = () => { video.play(); 
    const predict = async () => { await selfieSegmentation.send({ image: video }); await faceMesh.send({ image: video }); requestAnimationFrame(predict); };
    predict(); 
  };
});

const peer = new Peer();
peer.on('open', (id) => updateStatus(`あなたのID: ${id}`));
peer.on('connection', (conn) => { updateStatus(`接続中...`); connections.push(conn); handleData(conn); });
peer.on('call', (call) => { updateStatus(`着信中...`); call.answer(processedStream); setupRemoteVideo(call); });

// --- ボタンイベント ---
document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const id = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value.trim();
  if(!id || id === peer.id) return;
  updateStatus("接続を試みています...");
  const conn = peer.connect(id);
  connections.push(conn); handleData(conn);
  setupRemoteVideo(peer.call(id, processedStream));
});

document.querySelector('#send-btn')?.addEventListener('click', () => {
  if (chatInput.value) {
    const msg = { type: 'chat', name: nameInput.value, content: chatInput.value };
    connections.forEach(c => c.send(msg));
    const el = document.createElement('div'); el.innerText = `自分: ${chatInput.value}`;
    el.style.background = "#e3f2fd"; el.style.padding = "5px 10px"; el.style.borderRadius = "5px";
    chatBox.appendChild(el); chatBox.scrollTop = chatBox.scrollHeight; chatInput.value = "";
  }
});

document.querySelector('#voice-btn')?.addEventListener('click', () => {
  isVoiceEffect = !isVoiceEffect;
  pitchShifter.delayTime.value = isVoiceEffect ? 0.015 : 0; // 0.015で高い声
  document.querySelector<HTMLButtonElement>('#voice-btn')!.innerText = isVoiceEffect ? "🔊 ボイス: 高音" : "🔊 ボイス: 通常";
});

document.querySelectorAll('.react-btn').forEach(b => {
  b.addEventListener('click', () => {
    const emoji = (b as HTMLElement).dataset.emoji!;
    reactions.push({ emoji, time: Date.now() });
    connections.forEach(c => c.send({ type: 'reaction', content: emoji }));
  });
});

document.querySelector('#camera-btn')?.addEventListener('click', () => {
  isCameraOn = !isCameraOn; localStream.getVideoTracks()[0].enabled = isCameraOn;
  document.querySelector<HTMLButtonElement>('#camera-btn')!.innerText = isCameraOn ? "📹 カメラ: ON" : "📹 カメラ: OFF";
});

document.querySelector('#mic-btn')?.addEventListener('click', () => {
  isMicOn = !isMicOn; localStream.getAudioTracks()[0].enabled = isMicOn;
  document.querySelector<HTMLButtonElement>('#mic-btn')!.innerText = isMicOn ? "🎤 マイク: ON" : "🎤 マイク: OFF";
});

document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!.innerText = isAvatarMode ? "👤 アバター: ON" : "👤 アバター: OFF";
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => window.location.reload());