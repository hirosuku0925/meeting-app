import './style.css'
import { Peer, DataConnection } from 'peerjs'
import { FaceMesh } from '@mediapipe/face_mesh'
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; overflow: hidden; background: #f0f2f5;">
    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; padding: 20px; overflow-y: auto;">
      <h1 style="color: #333; margin-bottom: 20px;">マルチ会議室 (3人以上対応版)</h1>
      <div id="video-grid" style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; padding: 10px; width: 100%;">
        <div id="local-container" style="text-align: center;">
          <p style="font-size: 12px; color: #666; margin-bottom: 5px;">自分</p>
          <canvas id="local-canvas" width="480" height="360" style="width: 260px; border: 3px solid #646cff; border-radius: 15px; background: #222; box-shadow: 0 8px 16px rgba(0,0,0,0.2);"></canvas>
        </div>
      </div>
      <div class="card" style="width: 100%; max-width: 500px; margin-top: 20px; padding: 20px; border-radius: 16px; background: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.1);">
        <div style="background: #f8f9fa; padding: 15px; border-radius: 12px; margin-bottom: 15px; text-align: left;">
          <div style="margin-bottom: 10px;">
            <label style="font-size: 11px; font-weight: bold; color: #1976D2;">🏞 背景画像</label>
            <input type="file" id="bg-upload" accept="image/*" style="width: 100%; font-size: 10px; margin-top: 5px;">
          </div>
          <div>
            <label style="font-size: 11px; font-weight: bold; color: #646cff;">👤 アバター画像</label>
            <input type="file" id="avatar-upload" accept="image/*" style="width: 100%; font-size: 10px; margin-top: 5px;">
          </div>
        </div>
        <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 15px;">
          <button id="avatar-mode-btn" style="background-color: #555; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">👤 アバター: OFF</button>
          <button id="hangup-btn" style="background-color: #f44336; color: white; padding: 10px 15px; border-radius: 8px; border:none; cursor: pointer;">退出</button>
        </div>
        <p id="status" style="font-size: 11px; color: #1976D2; font-weight: bold; text-align:center; margin-top:10px;">ID取得中...</p>
        <div style="display: flex; gap: 10px; margin-top:10px;">
             <input id="remote-id-input" type="text" placeholder="相手のID" style="flex: 2; padding: 8px; border-radius: 5px; border: 1px solid #ddd;">
             <button id="connect-btn" style="flex: 1; background-color: #646cff; color: white; border-radius: 5px; border:none; cursor:pointer;">入室</button>
        </div>
      </div>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;

let isAvatarMode = false;
let avatarImg: HTMLImageElement | null = null;
let backgroundImg: HTMLImageElement | null = null;
let processedStream: MediaStream;
const connections: Map<string, DataConnection> = new Map();

// AI描画エンジン
const selfie = new SelfieSegmentation({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
selfie.setOptions({ modelSelection: 1 });
const faceMesh = new FaceMesh({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true });

let currentMask: any = null;
selfie.onResults((res) => { currentMask = res.segmentationMask; });

faceMesh.onResults((res) => {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (backgroundImg) {
    ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);
  }
  ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
  if (res.image) {
    if (isAvatarMode) {
      if (!backgroundImg) { ctx.fillStyle = "#f0f2f5"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    } else if (currentMask && backgroundImg) {
      const offCanvas = document.createElement('canvas'); offCanvas.width = 480; offCanvas.height = 360;
      const offCtx = offCanvas.getContext('2d')!;
      offCtx.drawImage(currentMask, 0, 0, 480, 360);
      offCtx.globalCompositeOperation = 'source-in'; offCtx.drawImage(res.image, 0, 0, 480, 360);
      ctx.drawImage(offCanvas, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.drawImage(res.image, 0, 0, canvas.width, canvas.height);
    }
  }
  if (isAvatarMode && res.multiFaceLandmarks?.[0]) {
    const landmarks = res.multiFaceLandmarks[0];
    const centerX = landmarks[1].x * canvas.width;
    const centerY = landmarks[1].y * canvas.height;
    const faceWidth = Math.abs(landmarks[454].x - landmarks[234].x) * canvas.width * 2.0;
    if (avatarImg) {
      ctx.drawImage(avatarImg, centerX - faceWidth/2, centerY - faceWidth/2, faceWidth, faceWidth);
    } else {
      ctx.fillStyle = "#646cff"; ctx.beginPath(); ctx.arc(centerX, centerY, 40, 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.restore();
});

// --- 通信処理 (バグ修正の肝) ---
const peer = new Peer();
peer.on('open', (id) => statusEl.innerText = `あなたのID: ${id}`);

function addRemoteVideo(stream: MediaStream, remoteId: string) {
  if (document.getElementById(`remote-${remoteId}`)) return;
  const div = document.createElement('div');
  div.id = `remote-${remoteId}`;
  div.style.textAlign = "center";
  div.innerHTML = `<p style="font-size:10px; color:#666; margin-bottom:5px;">User: ${remoteId.slice(0,4)}</p>`;
  const v = document.createElement('video');
  v.style.width = "260px"; v.style.borderRadius = "15px"; v.autoplay = true; v.playsInline = true;
  v.srcObject = stream;
  div.appendChild(v);
  document.querySelector('#video-grid')!.appendChild(div);
}

// 接続イベントのセットアップ
function setupConnection(conn: DataConnection) {
  if (connections.has(conn.peer)) return;
  connections.set(conn.peer, conn);

  conn.on('open', () => {
    // 💡 繋がった相手に、自分が知っているメンバー全員を教える
    const members = Array.from(connections.keys()).concat(peer.id);
    conn.send({ type: 'sync-members', members });
  });

  conn.on('data', (data: any) => {
    if (data.type === 'sync-members') {
      // 💡 知らないメンバーがいたら自分から繋ぎに行く
      data.members.forEach((mId: string) => {
        if (mId !== peer.id && !connections.has(mId)) {
          connectTo(mId);
        }
      });
    }
  });

  conn.on('close', () => {
    connections.delete(conn.peer);
    document.getElementById(`remote-${conn.peer}`)?.remove();
  });
}

// 自分から繋ぎに行く関数
function connectTo(id: string) {
  if (connections.has(id) || id === peer.id) return;
  const conn = peer.connect(id);
  setupConnection(conn);
  
  const call = peer.call(id, processedStream);
  call.on('stream', (s) => addRemoteVideo(s, id));
}

// 相手からの接続を待ち受ける
peer.on('connection', setupConnection);
peer.on('call', (call) => {
  call.answer(processedStream);
  call.on('stream', (s) => addRemoteVideo(s, call.peer));
});

document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const id = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value.trim();
  if (id) connectTo(id);
});

// カメラ・AI起動
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  processedStream = canvas.captureStream(30);
  stream.getAudioTracks().forEach(t => processedStream.addTrack(t));
  video.srcObject = stream; video.play();
  const loop = async () => { await selfie.send({ image: video }); await faceMesh.send({ image: video }); requestAnimationFrame(loop); };
  loop();
});

// ファイル・ボタン処理
const handleFile = (id: string, cb: (i: HTMLImageElement) => void) => {
  document.querySelector(`#${id}`)?.addEventListener('change', (e: any) => {
    const f = e.target.files[0]; if (!f) return;
    const i = new Image(); i.onload = () => cb(i); i.src = URL.createObjectURL(f);
  });
};
handleFile('bg-upload', (i) => backgroundImg = i);
handleFile('avatar-upload', (i) => avatarImg = i);

document.querySelector('#avatar-mode-btn')?.addEventListener('click', () => {
  isAvatarMode = !isAvatarMode;
  const btn = document.querySelector<HTMLButtonElement>('#avatar-mode-btn')!;
  btn.innerText = isAvatarMode ? "👤 アバター: ON" : "👤 アバター: OFF";
  btn.style.backgroundColor = isAvatarMode ? "#646cff" : "#555";
});
document.querySelector('#hangup-btn')?.addEventListener('click', () => window.location.reload());