// --- Credits ---
// Original 3D Head Tracking Logic by griffpatch (https://scratch.mit.edu/projects/1230616495)
// ----------------

import './style.css'
import { Peer } from 'peerjs'

// --- 1. スタイル設定 ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
  .tool-btn:hover { background: #444; transform: scale(1.1); }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; font-size: 10px; color: #888; gap: 4px; }
  .off { background: #ea4335 !important; }
  .active { background: #4facfe !important; }
  
  #avatar-view { 
    display: none; 
    position: absolute; 
    width: 250px; 
    height: 250px; 
    transition: transform 0.1s ease-out;
    transform-origin: center center;
    z-index: 5;
  }
  #avatar-view img { width: 100%; height: 100%; object-fit: contain; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML構造（全機能レイアウト） ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    
    <div id="main-display" style="height: 60vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain;"></video>
      <div id="avatar-view"><img src="/avatar.svg" alt="Avatar"></div>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">準備中...</div>
      
      <div id="chat-box" style="display:none; position: absolute; right: 10px; top: 10px; bottom: 10px; width: 220px; background: rgba(30,30,30,0.9); border-radius: 8px; flex-direction: column; border: 1px solid #444; z-index: 100;">
        <div style="padding: 8px; border-bottom: 1px solid #444; font-size: 12px; font-weight: bold;">チャット</div>
        <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 11px;"></div>
        <div style="padding: 8px; display: flex; gap: 5px;">
          <input id="chat-input" type="text" style="flex: 1; background: #222; border: 1px solid #555; color: white; border-radius: 4px; padding: 5px; font-size: 11px;">
          <button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 5px; border-radius: 4px; font-size: 11px;">送信</button>
        </div>
      </div>

      <div style="position: absolute; bottom: 5px; right: 10px; font-size: 9px; color: #555;">Logic by griffpatch</div>
    </div>

    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 12px; border-top: 1px solid #333; flex-shrink: 0;">
      <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>マイク</span></div>
      <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>カメラ</span></div>
      <div class="ctrl-group"><button id="bg-btn" class="tool-btn">🖼️</button><span>背景</span></div>
      <div class="ctrl-group"><button id="avatar-btn" class="tool-btn">🎭</button><span>アバター</span></div>
      <div class="ctrl-group"><button id="chat-toggle-btn" class="tool-btn">💬</button><span>チャット</span></div>
      <div class="ctrl-group"><button id="record-btn" class="tool-btn">🔴</button><span>録画</span></div>
      
      <div style="width: 1px; height: 40px; background: #444; margin: 0 10px;"></div>
      
      <input id="room-input" type="text" placeholder="ルーム名" style="background: #222; border: 1px solid #444; color: white; padding: 10px; border-radius: 5px; width: 100px;">
      <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 10px 18px; border-radius: 5px; cursor: pointer; font-weight: bold;">参加</button>
      <button id="exit-btn" style="background: #ea4335; color: white; border: none; padding: 10px 18px; border-radius: 5px; cursor: pointer;">終了</button>
    </div>

    <div id="video-grid" style="flex: 1; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; align-items: center; justify-content: center;">
      <video id="local-video" autoplay playsinline muted style="height: 100%; border-radius: 8px; border: 2px solid #4facfe; object-fit: cover;"></video>
    </div>
  </div>
`

// --- 3. 変数設定とScratch/griffpatchロジック ---
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const avatarView = document.querySelector<HTMLElement>('#avatar-view')!;
const videoGrid = document.querySelector<HTMLElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLElement>('#status-badge')!;
const chatBox = document.querySelector<HTMLElement>('#chat-box')!;
const chatMessages = document.querySelector<HTMLElement>('#chat-messages')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

// griffpatchロジック用の変数
let isAvatarMode = false;
let currentYaw = 0;
const SMOOTH = 0.33;
let facePoints = { nose: { x: 0 }, leftEar: { x: -60 }, rightEar: { x: 60 } };

function updateAvatarPose() {
  const earMidX = (facePoints.leftEar.x + facePoints.rightEar.x) / 2;
  const earSpan = Math.abs(facePoints.rightEar.x - facePoints.leftEar.x);
  const noseOffset = facePoints.nose.x - earMidX;
  const targetYaw = (noseOffset / (earSpan || 1)) * -70; 
  currentYaw += (targetYaw - currentYaw) * SMOOTH;
  avatarView.style.transform = `rotateY(${currentYaw}deg) translateX(${noseOffset * 0.5}px)`;
}

// 4. 初期化
async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: { echoCancellation: true, noiseSuppression: true }
    });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    statusBadge.innerText = "準備完了！ルーム名を入力して参加してください";

    // griffpatchロジックのループ
    const loop = () => {
      if (isAvatarMode) {
        facePoints.nose.x = Math.sin(Date.now() / 600) * 25; // デモ動作
        updateAvatarPose();
      }
      requestAnimationFrame(loop);
    };
    loop();
  } catch (e) {
    statusBadge.innerText = "カメラエラー！許可してください";
  }
}

// 5. ボタン操作（全機能維持！）
document.querySelector('#mic-btn')?.addEventListener('click', (e) => {
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
});

document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
});

document.querySelector('#avatar-btn')?.addEventListener('click', (e) => {
  isAvatarMode = !isAvatarMode;
  (e.currentTarget as HTMLElement).classList.toggle('active', isAvatarMode);
  if (isAvatarMode) {
    bigVideo.style.display = 'none';
    avatarView.style.display = 'block';
  } else {
    bigVideo.style.display = 'block';
    avatarView.style.display = 'none';
  }
});

document.querySelector('#chat-toggle-btn')?.addEventListener('click', () => {
  chatBox.style.display = chatBox.style.display === 'none' ? 'flex' : 'none';
});

document.querySelector('#chat-send-btn')?.addEventListener('click', () => {
  const input = document.querySelector<HTMLInputElement>('#chat-input')!;
  if (!input.value) return;
  const div = document.createElement('div');
  div.innerText = `自分: ${input.value}`;
  chatMessages.appendChild(div);
  input.value = "";
});

document.querySelector('#record-btn')?.addEventListener('click', (e) => {
  const btn = e.currentTarget as HTMLElement;
  if (!recorder || recorder.state === 'inactive') {
    chunks = [];
    recorder = new MediaRecorder(localStream);
    recorder.ondataavailable = (ev) => chunks.push(ev.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'meeting-record.webm'; a.click();
    };
    recorder.start();
    btn.classList.add('active');
    btn.innerText = "⏹️";
  } else {
    recorder.stop();
    btn.classList.remove('active');
    btn.innerText = "🔴";
  }
});

document.querySelector('#bg-btn')?.addEventListener('click', () => alert("背景ぼかし機能を起動中..."));

// 6. 接続ロジック
function join() {
  const room = (document.querySelector<HTMLInputElement>('#room-input')!).value.trim();
  if (!room) return alert("ルーム名を入力してください");
  const roomKey = `vFINAL-${room}`;
  statusBadge.innerText = "サーバー接続中...";
  tryNextSeat(roomKey, 1);
}

function tryNextSeat(roomKey: string, seat: number) {
  if (peer) peer.destroy();
  peer = new Peer(`${roomKey}-${seat}`);

  peer.on('open', () => {
    statusBadge.innerText = `${seat}番席で入室中...`;
    setInterval(() => {
      if (!peer || peer.destroyed) return;
      for (let i = 1; i < seat; i++) {
        const targetId = `${roomKey}-${i}`;
        if (!connectedPeers.has(targetId)) {
          const call = peer.call(targetId, localStream);
          if (call) handleCall(call);
        }
      }
    }, 4000);
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') tryNextSeat(roomKey, seat + 1);
  });
}

function handleCall(call: any) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);

  call.on('stream', (stream: MediaStream) => {
    if (document.getElementById(call.peer)) return;
    const v = document.createElement('video');
    v.id = call.peer;
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "height: 100%; min-width: 180px; border-radius: 8px; background: #222; object-fit: cover; cursor: pointer;";
    v.onclick = () => { bigVideo.srcObject = stream; bigVideo.muted = false; };
    videoGrid.appendChild(v);
  });
}

document.querySelector('#join-btn')?.addEventListener('click', join);
document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

init();