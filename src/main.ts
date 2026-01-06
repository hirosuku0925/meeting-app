import './style.css'
import { Peer, DataConnection } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; overflow: hidden; background: #f0f2f5;">
    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333; margin-bottom: 20px;">マルチ会議室</h1>
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; padding: 10px; width: 100%;">
        <div id="local-container" style="text-align: center;">
          <p style="font-size: 12px; color: #666; margin-bottom: 5px;">自分</p>
          <canvas id="local-canvas" width="480" height="360" style="width: 280px; border: 3px solid #646cff; border-radius: 15px; background: #222; box-shadow: 0 8px 16px rgba(0,0,0,0.2);"></canvas>
        </div>
      </div>
      <div class="card" style="width: 100%; max-width: 500px; margin-top: 20px; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
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
          <div style="display: flex; gap: 5px; margin-top: 5px;">
            <input type="file" id="avatar-close" accept="image/*" title="通常" style="font-size: 9px; width: 33%;">
            <input type="file" id="avatar-open" accept="image/*" title="口開" style="font-size: 9px; width: 33%;">
            <input type="file" id="avatar-blink" accept="image/*" title="瞬き" style="font-size: 9px; width: 33%;">
          </div>
        </div>
        <div style="background: #f8f9fa; padding: 15px; border-radius: 12px;">
          <input type="text" id="user-name-input" placeholder="名前" value="User Name" style="width: 100%; padding: 8px; margin-bottom: 10px; border-radius: 5px; border: 1px solid #ddd;">
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
        <input type="text" id="chat-input" placeholder="..." style="flex: 1; padding: 5px;">
        <button id="send-btn" style="background: #646cff; color: white; border: none; padding: 5px 10px; border-radius: 4px;">送信</button>
      </div>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

// --- グローバル設定 ---
const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const chatBox = document.querySelector<HTMLDivElement>('#chat-box')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;

let isMicOn = true, isAvatarMode = false;
let imgClose: HTMLImageElement | null = null, imgOpen: HTMLImageElement | null = null, imgBlink: HTMLImageElement | null = null, backgroundImg: HTMLImageElement | null = null;
let processedStream: MediaStream;
const connections: Set<DataConnection> = new Set();
let reactions: { emoji: string, time: number }[] = [];

// AI描画エンジン
const selfie = new SelfieSegmentation({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}` });
selfie.setOptions({ modelSelection: 1 });
const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
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
      const isBlinking = Math.abs(landmarks[159].y - landmarks[145].y) < 0.012;
      ctx.save(); ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.clip();
      let targetImg = (isBlinking && imgBlink) ? imgBlink : (isMouthOpen && isMicOn ? imgOpen : imgClose);
      ctx.drawImage(targetImg, centerX - radius, centerY - radius, radius * 2, radius * 2); ctx.restore();
    }

    const now = Date.now();
    reactions = reactions.filter(r => now - r.time < 2000);
    reactions.forEach((r, i) => {
      ctx.save(); ctx.scale(-1, 1); ctx.font = "40px serif"; ctx.textAlign = "center";
      ctx.fillText(r.emoji, -centerX, centerY - radius - 20 - (i * 40)); 
      ctx.restore();
    });
  }
  ctx.restore();
});

// 通信処理
const peer = new Peer();
peer.on('open', (id) => statusEl.innerText = `あなたのID: ${id}`);

function addRemoteVideo(stream: MediaStream, remoteId: string) {
  if (document.getElementById(`remote-${remoteId}`)) return;
  const div = document.createElement('div');
  div.id = `remote-${remoteId}`;
  div.innerHTML = `<p style="font-size:10px; color:#666;">User: ${remoteId.slice(0,4)}</p>`;
  const v = document.createElement('video');
  v.style.width = "280px"; v.style.borderRadius = "15px"; v.autoplay = true; v.playsInline = true;
  v.srcObject = stream;
  div.appendChild(v);
  document.querySelector('#video-grid')!.appendChild(div);
}

function setupDataConnection(conn: DataConnection) {
  connections.add(conn);
  conn.on('data', (data: any) => {
    if (data.type === 'chat') {
      const p = document.createElement('p'); p.innerText = `${data.name}: ${data.content}`;
      chatBox.appendChild(p); chatBox.scrollTop = chatBox.scrollHeight;
    }
    if (data.type === 'reaction') reactions.push({ emoji: data.content, time: Date.now() });
  });
}

peer.on('connection', setupDataConnection);
peer.on('call', (call) => {
  call.answer(processedStream);
  call.on('stream', (stream) => addRemoteVideo(stream, call.peer));
});

document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const remoteId = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value.trim();
  if (!remoteId || remoteId === peer.id) return;
  setupDataConnection(peer.connect(remoteId));
  const call = peer.call(remoteId, processedStream);
  call.on('stream', (stream) => addRemoteVideo(stream, remoteId));
});

// 起動処理
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  processedStream = canvas.captureStream(30);
  stream.getAudioTracks().forEach(t => processedStream.addTrack(t));
  video.srcObject = stream;
  video.play();
  const loop = async () => {
    await selfie.send({ image: video });
    await faceMesh.send({ image: video });
    requestAnimationFrame(loop);
  };
  loop();
});

// イベントリスナー
document.querySelectorAll('.react-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const emoji = (btn as HTMLElement).dataset.emoji!;
    reactions.push({ emoji, time: Date.now() });
    connections.forEach(c => c.send({ type: 'reaction', content: emoji }));
  });
});

document.querySelector('#send-btn')?.addEventListener('click', () => {
  const input = (document.querySelector<HTMLInputElement>('#chat-input')!);
  const name = (document.querySelector<HTMLInputElement>('#user-name-input')!).value;
  if (!input.value) return;
  const data = { type: 'chat', name, content: input.value };
  connections.forEach(c => c.send(data));
  const p = document.createElement('p'); p.innerText = `自分: ${input.value}`;
  chatBox.appendChild(p); input.value = "";
});

const setImg = (id: string, target: string) => {
  document.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('change', (e: any) => {
    const f = e.target.files[0]; if(!f) return;
    const i = new Image(); i.onload = () => {
      if(target==='close') imgClose=i; else if(target==='open') imgOpen=i;
      else if(target==='blink') imgBlink=i; else backgroundImg=i;
    };
    i.src = URL.createObjectURL(f);
  });
};
setImg('avatar-close', 'close'); setImg('avatar-open', 'open'); setImg('avatar-blink', 'blink'); setImg('bg-upload', 'bg');

document.querySelector('#camera-btn')?.addEventListener('click', () => {
  const track = (video.srcObject as MediaStream).getVideoTracks()[0];
  track.enabled = !track.enabled;
  document.querySelector<HTMLButtonElement>('#camera-btn')!.innerText = track.enabled ? "📹 カメラ: ON" : "📹 カメラ: OFF";
});
document.querySelector('#mic-btn')?.addEventListener('click', () => {
  isMicOn = !isMicOn;
  (video.srcObject as MediaStream).getAudioTracks()[0].enabled = isMicOn;
  document.querySelector<HTMLButtonElement>('#mic-btn')!.innerText = isMicOn ? "🎤 マイク: ON" : "🎤 マイク: OFF";
});
document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!.innerText = isAvatarMode ? "👤 アバター: ON" : "👤 アバター: OFF";
});
document.querySelector('#hangup-btn')?.addEventListener('click', () => window.location.reload());