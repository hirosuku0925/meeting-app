import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #121212; color: white; overflow: hidden;">
    <div style="width: 280px; background: #1e1e1e; padding: 25px; display: flex; flex-direction: column; gap: 20px; border-right: 1px solid #333;">
      <h2 style="color: #4facfe; margin: 0; font-size: 18px;">🌐 3人以上・強制合流システム</h2>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <input id="room-id-input" type="text" placeholder="ルーム名" style="padding: 12px; border-radius: 8px; border: 1px solid #444; background: #2a2a2a; color: white;">
        <input id="room-pass-input" type="password" placeholder="パスワード" style="padding: 12px; border-radius: 8px; border: 1px solid #444; background: #2a2a2a; color: white;">
        <button id="join-room-btn" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; border: none; padding: 15px; border-radius: 10px; cursor: pointer; font-weight: bold;">参加する</button>
      </div>
      <div id="status-area" style="font-size: 12px; padding: 15px; border-radius: 8px; background: rgba(255,255,255,0.05); border-left: 4px solid #4facfe;">カメラ準備中...</div>
      <div style="margin-top: auto;">
        <button id="hangup-btn" style="background: #ff4b2b; color: white; border: none; padding: 10px; border-radius: 8px; cursor: pointer; width: 100%;">退出・リセット</button>
      </div>
    </div>
    <div style="flex: 1; display: flex; flex-direction: column; background: #000;">
      <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <video id="big-video" autoplay playsinline muted style="max-width: 100%; max-height: 100%; border-radius: 15px;"></video>
      </div>
      <div id="video-grid" style="height: 160px; background: #111; display: flex; gap: 10px; padding: 10px; overflow-x: auto;">
        <video id="local-video" autoplay playsinline muted style="min-width: 200px; height: 100%; object-fit: cover; border-radius: 10px; border: 2px solid #4facfe;"></video>
      </div>
    </div>
  </div>
`

const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const videoGrid = document.querySelector('#video-grid')!;
const statusArea = document.querySelector<HTMLElement>('#status-area')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    statusArea.innerText = "準備完了！";
  } catch (e) { statusArea.innerText = "カメラエラー"; }
}

function startJoin(room: string, pass: string, attempt = 1) {
  if (attempt > 30) return statusArea.innerText = "満員です";
  
  statusArea.innerText = `席を探しています... (${attempt}/30)`;
  const roomKey = `vr-${room}-${pass}`;
  peer = new Peer(`${roomKey}-${attempt}`);

  peer.on('open', (id) => {
    statusArea.innerHTML = `<span style="color:#2ecc71">✅ 入室成功！</span><br>ID: ${id}`;
    
    // 3秒おきに1〜30番の全員に電話をかけまくる
    const timer = setInterval(() => {
      if (!peer || peer.destroyed) return clearInterval(timer);
      for (let i = 1; i <= 30; i++) {
        const target = `${roomKey}-${i}`;
        if (target !== id && !connectedPeers.has(target)) {
          const call = peer.call(target, localStream);
          if (call) setupCall(call);
        }
      }
    }, 3000);
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    setupCall(call);
  });

  peer.on('error', (err) => {
    // 席が使われていたら、次の番号を試す（これが重要！）
    if (err.type === 'unavailable-id') {
      peer?.destroy();
      startJoin(room, pass, attempt + 1);
    } else if (err.type === 'peer-unavailable') {
      // 相手がいないだけなので無視
    } else {
      statusArea.innerText = "エラー: " + err.type;
    }
  });
}

function setupCall(call: any) {
  call.on('stream', (stream: MediaStream) => {
    if (connectedPeers.has(call.peer)) return;
    connectedPeers.add(call.peer);

    const v = document.createElement('video');
    v.id = `v-${call.peer}`;
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "min-width: 200px; height: 100%; object-fit: cover; border-radius: 10px; cursor: pointer; background: #000;";
    v.onclick = () => { bigVideo.srcObject = stream; bigVideo.muted = false; };
    videoGrid.appendChild(v);
    statusArea.innerText = `接続中: ${connectedPeers.size + 1}名`;
  });

  call.on('close', () => {
    document.getElementById(`v-${call.peer}`)?.remove();
    connectedPeers.delete(call.peer);
  });
}

document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  const r = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  const p = (document.getElementById('room-pass-input') as HTMLInputElement).value.trim();
  if (r && p) startJoin(r, p);
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());
init();