import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #121212; color: white; overflow: hidden;">
    <div style="width: 250px; background: #1e1e1e; padding: 20px; display: flex; flex-direction: column; gap: 15px; border-right: 1px solid #333;">
      <h2 style="color: #4facfe; font-size: 18px; margin: 0;">🌐 3人以上・絶対合流</h2>
      <input id="room-id-input" type="text" placeholder="ルーム名" style="padding: 10px; border-radius: 5px; background: #222; border: 1px solid #444; color: white;">
      <button id="join-room-btn" style="background: #4facfe; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">参加する</button>
      <div id="status-area" style="font-size: 12px; color: #2ecc71; padding: 10px; background: rgba(46,204,113,0.1); border-radius: 5px;">待機中</div>
      <div style="margin-top: auto;">
        <video id="local-video" autoplay playsinline muted style="width: 100%; border-radius: 8px; border: 2px solid #4facfe;"></video>
      </div>
      <button id="hangup-btn" style="background: #ff4b2b; color: white; border: none; padding: 8px; border-radius: 5px; cursor: pointer; margin-top: 10px;">リセット</button>
    </div>
    <div id="video-grid" style="flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); grid-auto-rows: 150px; gap: 15px; padding: 20px; overflow-y: auto;">
    </div>
  </div>
`

const videoGrid = document.querySelector('#video-grid')!;
const statusArea = document.querySelector<HTMLElement>('#status-area')!;
let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    (document.querySelector('#local-video') as HTMLVideoElement).srcObject = localStream;
  } catch (e) { statusArea.innerText = "カメラ許可が必要です"; }
}

// 席（ID）を探して参加する関数
function tryJoin(room: string, seatNumber: number) {
  if (seatNumber > 20) {
    statusArea.innerText = "満員です";
    return;
  }

  const roomKey = `fixroom-${room}`;
  const myID = `${roomKey}-${seatNumber}`;
  
  if (peer) peer.destroy();
  peer = new Peer(myID);

  peer.on('open', () => {
    statusArea.innerHTML = `✅ ${seatNumber}番席で入室成功！<br>他の人をスキャン中...`;
    
    // 3秒おきに1〜20番の全員に電話をかけまくる
    setInterval(() => {
      if (!peer || peer.destroyed) return;
      for (let i = 1; i <= 20; i++) {
        const target = `${roomKey}-${i}`;
        if (i !== seatNumber && !connectedPeers.has(target)) {
          const call = peer.call(target, localStream);
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
    // 席が被っていたら、次の番号を試す（これが重要！）
    if (err.type === 'unavailable-id') {
      tryJoin(room, seatNumber + 1);
    } else {
      console.error(err.type);
    }
  });
}

function handleCall(call: any) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);

  call.on('stream', (stream: MediaStream) => {
    if (document.getElementById(call.peer)) return;
    const v = document.createElement('video');
    v.id = call.peer;
    v.srcObject = stream;
    v.autoplay = true; v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 10px; background: #222;";
    videoGrid.appendChild(v);
    statusArea.innerText = `接続中: ${connectedPeers.size + 1}名`;
  });

  call.on('close', () => {
    document.getElementById(call.peer)?.remove();
    connectedPeers.delete(call.peer);
  });
}

document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  if (room) tryJoin(room, 1); // 1番から順に空席を探す
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());
init();