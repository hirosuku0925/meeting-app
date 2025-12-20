import './style.css'
import { Peer, DataConnection } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'

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
        <p id="status" style="font-size: 12px; color: #999; margin-top: 10px;">ID: 取得中...</p>
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

const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const nameInput = document.querySelector<HTMLInputElement>('#user-name-input')!;
const chatBox = document.querySelector<HTMLDivElement>('#chat-box')!;
const chatInput = document.querySelector<HTMLInputElement>('#chat-input')!;

let isCameraOn = true;
let isMicOn = true;
let isAvatarMode = false;
let imgClose: HTMLImageElement | null = null;
let imgOpen: HTMLImageElement | null = null;
let imgBlink: HTMLImageElement | null = null;
let backgroundImg: HTMLImageElement | null = null;
let localStream: MediaStream;
let connections: DataConnection[] = []; 
let reactions: { emoji: string, time: number }[] = [];

// --- 画像アップロード設定 ---
const setupImageUpload = (id: string, callback: (img: HTMLImageElement) => void) => {
  document.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const img = new Image();
      img.onload = () => callback(img);
      img.src = URL.createObjectURL(file);
    }
  });
};
setupImageUpload('avatar-close', (img) => imgClose = img);
setupImageUpload('avatar-open', (img) => imgOpen = img);
setupImageUpload('avatar-blink', (img) => imgBlink = img);
setupImageUpload('bg-upload', (img) => backgroundImg = img);

const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

faceMesh.onResults((results) => {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 反転処理
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);

  if (backgroundImg) ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);
  if (results.image) {
    if (isAvatarMode) ctx.globalAlpha = 0.3;
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
  }

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];
    const centerX = landmarks[1].x * canvas.width;
    const centerY = landmarks[1].y * canvas.height;
    const radius = ((landmarks[454].x - landmarks[234].x) * canvas.width * 1.8) / 2;

    if (isAvatarMode && imgClose && imgOpen) {
      const isMouthOpen = Math.abs(landmarks[13].y - landmarks[14].y) > 0.025;
      const isBlinking = Math.abs(landmarks[159].y - landmarks[145].y) < 0.012;

      ctx.save();
      ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.clip();
      
      let targetImg = imgClose;
      if (isBlinking && imgBlink) targetImg = imgBlink;
      else if (isMouthOpen && isMicOn) targetImg = imgOpen;
      
      ctx.drawImage(targetImg, centerX - radius, centerY - radius, radius * 2, radius * 2);
      ctx.restore();
    }

    // リアクション描画
    const now = Date.now();
    reactions = reactions.filter(r => now - r.time < 2000);
    reactions.forEach((r, i) => {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.font = "40px serif";
      ctx.fillText(r.emoji, -centerX, centerY - radius - 20 - (i * 40));
      ctx.restore();
    });
  }
  ctx.restore();
});

// カメラ開始
navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: true }).then(stream => {
  localStream = stream;
  video.srcObject = stream;
  video.onloadedmetadata = () => { 
    video.play(); 
    const predict = async () => { await faceMesh.send({ image: video }); requestAnimationFrame(predict); }; 
    predict(); 
  };
});

// PeerJS / チャット / リアクション処理
const peer = new Peer();
peer.on('open', (id) => document.querySelector<HTMLElement>('#status')!.innerText = `あなたのID: ${id}`);

const addChatLog = (text: string) => {
  const el = document.createElement('div');
  el.innerText = text; el.style.background = "#f0f0f0"; el.style.padding = "5px 10px"; el.style.borderRadius = "5px";
  chatBox.appendChild(el); chatBox.scrollTop = chatBox.scrollHeight;
};

const handleData = (conn: DataConnection) => {
  conn.on('data', (data: any) => {
    if (data.type === 'chat') addChatLog(`${data.name}: ${data.content}`);
    if (data.type === 'reaction') reactions.push({ emoji: data.content, time: Date.now() });
  });
};

peer.on('connection', (conn) => { connections.push(conn); handleData(conn); });

peer.on('call', (call) => {
  const stream = canvas.captureStream(25);
  localStream.getAudioTracks().forEach(t => stream.addTrack(t));
  call.answer(stream);
  setupRemoteVideo(call);
});

document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const id = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value;
  const conn = peer.connect(id);
  connections.push(conn);
  handleData(conn);
  const stream = canvas.captureStream(25);
  localStream.getAudioTracks().forEach(t => stream.addTrack(t));
  setupRemoteVideo(peer.call(id, stream));
});

function setupRemoteVideo(call: any) {
  call.on('stream', (s: MediaStream) => {
    const v = document.createElement('video');
    v.style.width = "320px"; v.autoplay = true; v.srcObject = s;
    document.querySelector('#video-grid')!.appendChild(v);
  });
}

document.querySelector('#send-btn')?.addEventListener('click', () => {
  if (chatInput.value) {
    const msg = { type: 'chat', name: nameInput.value, content: chatInput.value };
    connections.forEach(c => c.send(msg));
    addChatLog(`自分: ${chatInput.value}`);
    chatInput.value = "";
  }
});

document.querySelectorAll('.react-btn').forEach(b => {
  b.addEventListener('click', () => {
    const emoji = (b as HTMLElement).dataset.emoji!;
    reactions.push({ emoji, time: Date.now() });
    connections.forEach(c => c.send({ type: 'reaction', content: emoji }));
  });
});

document.querySelector('#camera-btn')?.addEventListener('click', () => {
  isCameraOn = !isCameraOn;
  localStream.getVideoTracks()[0].enabled = isCameraOn;
});

document.querySelector('#mic-btn')?.addEventListener('click', () => {
  isMicOn = !isMicOn;
  localStream.getAudioTracks()[0].enabled = isMicOn;
});

document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!.innerText = isAvatarMode ? "👤 アバター: ON" : "👤 アバター: OFF";
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => window.location.reload());