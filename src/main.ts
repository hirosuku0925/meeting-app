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
          <button id="camera-btn" style="background-color: #2196F3; color: white; padding: 10px 15px; border-radius: 8px;">📹 カメラ</button>
          <button id="mic-btn" style="background-color: #4CAF50; color: white; padding: 10px 15px; border-radius: 8px;">🎤 マイク</button>
          <button id="avatar-mode-btn" style="background-color: #555; color: white; padding: 10px 15px; border-radius: 8px;">👤 アバター</button>
          <button id="hangup-btn" style="background-color: #f44336; color: white; padding: 10px 15px; border-radius: 8px;">退出</button>
        </div>

        <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 15px; background: #eee; padding: 10px; border-radius: 10px;">
          <button class="react-btn" data-emoji="👏">👏</button>
          <button class="react-btn" data-emoji="❤️">❤️</button>
          <button class="react-btn" data-emoji="😮">😮</button>
          <button class="react-btn" data-emoji="🔥">🔥</button>
          <button class="react-btn" data-emoji="✅">✅</button>
        </div>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 12px; text-align: left;">
          <input type="text" id="user-name-input" placeholder="名前" value="User Name" style="width: 100%; padding: 8px; margin-bottom: 10px; border-radius: 5px; border: 1px solid #ddd;">
          <div style="display: flex; gap: 10px;">
             <input id="remote-id-input" type="text" placeholder="相手のIDを入力" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
             <button id="connect-btn" style="flex: 1; background-color: #646cff; color: white; border-radius: 5px;">接続</button>
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
  </div>
`

// --- 以下、ロジック（リアクションとチャットの通信を含む） ---
const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video') || document.createElement('video');
const nameInput = document.querySelector<HTMLInputElement>('#user-name-input')!;
const chatBox = document.querySelector<HTMLDivElement>('#chat-box')!;
const chatInput = document.querySelector<HTMLInputElement>('#chat-input')!;

let isCameraOn = true;
let isMicOn = true;
let isAvatarMode = false;
let imgClose: HTMLImageElement | null = null;
let imgOpen: HTMLImageElement | null = null;
let localStream: MediaStream;
let connections: DataConnection[] = []; 
let reactions: { emoji: string, x: number, y: number, time: number }[] = [];

// FaceMesh 描画設定
const faceMesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

faceMesh.onResults((results) => {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (isAvatarMode) {
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (isCameraOn && results.image) {
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];
    const centerX = landmarks[1].x * canvas.width;
    const centerY = landmarks[1].y * canvas.height;
    const radius = ((landmarks[454].x - landmarks[234].x) * canvas.width * 1.8) / 2;

    if (isAvatarMode && imgClose) {
      const leftEye = landmarks[33], rightEye = landmarks[263];
      const angle = Math.atan2((rightEye.y - leftEye.y) * canvas.height, (rightEye.x - leftEye.x) * canvas.width);
      const isMouthOpen = Math.sqrt(Math.pow(landmarks[13].x - landmarks[14].x, 2) + Math.pow(landmarks[13].y - landmarks[14].y, 2)) > 0.025;
      
      if (isMouthOpen && isMicOn) {
        ctx.beginPath(); ctx.arc(centerX, centerY, radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 4; ctx.stroke();
      }

      ctx.save();
      ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.clip();
      ctx.translate(centerX, centerY); ctx.rotate(angle);
      ctx.drawImage((isMouthOpen && imgOpen) ? imgOpen : imgClose, -radius, -radius, radius * 2, radius * 2);
      ctx.restore();

      const userName = nameInput.value || "User";
      ctx.font = "bold 14px sans-serif";
      const tw = ctx.measureText(userName).width;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.beginPath(); ctx.roundRect(centerX - (tw+16)/2, centerY + radius + 10, tw+16, 24, 12); ctx.fill();
      ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.fillText(userName, centerX, centerY + radius + 27);
    }

    // リアクションのアニメーション描画
    const now = Date.now();
    reactions = reactions.filter(r => now - r.time < 2000);
    reactions.forEach(r => {
      const elapsed = now - r.time;
      const moveUp = (elapsed / 2000) * 100;
      ctx.globalAlpha = 1 - (elapsed / 2000);
      ctx.font = "40px serif";
      ctx.fillText(r.emoji, centerX, centerY - radius - 20 - moveUp);
    });
    ctx.globalAlpha = 1.0;
  }
  ctx.restore();
});

// 通信準備
navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: true }).then(stream => {
  localStream = stream;
  video.srcObject = stream;
  video.onloadedmetadata = () => { video.play(); const predict = async () => { await faceMesh.send({ image: video }); requestAnimationFrame(predict); }; predict(); };
});

function sendData(type: string, content: string) {
  const data = { type, name: nameInput.value, content };
  connections.forEach(conn => conn.send(data));
  if (type === 'chat') addChatLog(`${nameInput.value} (自分): ${content}`);
}

function addChatLog(text: string) {
  const el = document.createElement('div');
  el.innerText = text;
  el.style.background = "#f0f0f0"; el.style.padding = "5px 10px"; el.style.borderRadius = "5px";
  chatBox.appendChild(el);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// UIイベント
document.querySelector('#send-btn')?.addEventListener('click', () => {
  if (chatInput.value.trim()) { sendData('chat', chatInput.value); chatInput.value = ""; }
});

document.querySelectorAll('.react-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const emoji = (btn as HTMLElement).dataset.emoji!;
    reactions.push({ emoji, x: 0, y: 0, time: Date.now() });
    sendData('reaction', emoji);
  });
});

const peer = new Peer();
peer.on('open', (id) => document.querySelector<HTMLElement>('#status')!.innerText = `あなたのID: ${id}`);

function handleDataConnection(conn: DataConnection) {
  conn.on('data', (data: any) => {
    if (data.type === 'chat') addChatLog(`${data.name}: ${data.content}`);
    if (data.type === 'reaction') reactions.push({ emoji: data.content, x: 0, y: 0, time: Date.now() });
  });
}

peer.on('connection', (conn) => {
  connections.push(conn);
  handleDataConnection(conn);
});

peer.on('call', (call) => {
  if (call.peer === peer.id) return;
  const processedStream = canvas.captureStream(25);
  localStream.getAudioTracks().forEach(track => processedStream.addTrack(track));
  call.answer(processedStream);
  setupRemoteVideo(call);
});

document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const remoteId = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value.trim();
  if (!remoteId || remoteId === peer.id) return alert("IDを確認してください");
  
  const conn = peer.connect(remoteId);
  connections.push(conn);
  handleDataConnection(conn);

  const processedStream = canvas.captureStream(25);
  localStream.getAudioTracks().forEach(track => processedStream.addTrack(track));
  const call = peer.call(remoteId, processedStream);
  setupRemoteVideo(call);
});

function setupRemoteVideo(call: any) {
  call.on('stream', (stream: MediaStream) => {
    if (document.getElementById(`video-${call.peer}`)) return;
    const remoteVideo = document.createElement('video');
    remoteVideo.id = `video-${call.peer}`;
    remoteVideo.style.width = "320px"; remoteVideo.style.borderRadius = "15px";
    remoteVideo.autoplay = true; remoteVideo.playsInline = true;
    remoteVideo.srcObject = stream;
    document.querySelector('#video-grid')!.appendChild(remoteVideo);
    call.on('close', () => remoteVideo.remove());
  });
}

// ボタン連動
document.querySelector('#camera-btn')?.addEventListener('click', () => {
  isCameraOn = !isCameraOn;
  const btn = document.querySelector<HTMLButtonElement>('#camera-btn')!;
  btn.style.backgroundColor = isCameraOn ? "#2196F3" : "#f44336";
});
document.querySelector('#mic-btn')?.addEventListener('click', () => {
  isMicOn = !isMicOn;
  if (localStream) localStream.getAudioTracks()[0].enabled = isMicOn;
  const btn = document.querySelector<HTMLButtonElement>('#mic-btn')!;
  btn.style.backgroundColor = isMicOn ? "#4CAF50" : "#f44336";
});
document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  const btn = document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!;
  btn.style.backgroundColor = isAvatarMode ? "#FFC107" : "#555";
});
document.querySelector('#hangup-btn')?.addEventListener('click', () => window.location.reload());