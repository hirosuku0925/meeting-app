import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="conference-root" style="display: flex; height: 100vh; font-family: sans-serif; background: #000; color: white; overflow: hidden; flex-direction: column;">
    
    <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; background: #000; position: relative;">
      <video id="big-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: contain;"></video>
      
      <div id="status-area" style="position: absolute; top: 20px; left: 20px; font-size: 14px; background: rgba(0,0,0,0.7); padding: 10px 20px; border-radius: 30px; border: 1px solid #4facfe; z-index: 10;">
        カメラ準備中...
      </div>

      <div id="controls" style="position: absolute; bottom: 30px; display: flex; gap: 10px; background: rgba(0,0,0,0.6); padding: 15px; border-radius: 15px; backdrop-filter: blur(10px); z-index: 10;">
        <input id="room-id-input" type="text" placeholder="ルーム名" style="padding: 10px; border-radius: 5px; border: none; background: #333; color: white; width: 150px;">
        <button id="join-room-btn" style="background: #4facfe; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold;">参加</button>
        <button id="fullscreen-btn" style="background: #555; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">🔲 全画面</button>
        <button id="hangup-btn" style="background: #ff4b2b; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">リセット</button>
      </div>
    </div>

    <div id="video-grid" style="height: 140px; background: #111; display: flex; gap: 10px; padding: 10px; overflow-x: auto; border-top: 1px solid #333; align-items: center;">
      <div style="min-width: 160px; height: 100%; position: relative;">
        <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 2px solid #4facfe; cursor: pointer;"></video>
        <div style="position: absolute; bottom: 5px; left: 8px; font-size: 11px;">自分</div>
      </div>
    </div>
  </div>
`

const root = document.querySelector<HTMLElement>('#conference-root')!;
const videoGrid = document.querySelector('#video-grid')!;
const statusArea = document.querySelector<HTMLElement>('#status-area')!;
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();

// 初期化
async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    statusArea.innerText = "ルーム名を入力して「参加」してください";
  } catch (e) { statusArea.innerText = "カメラエラー！許可してください"; }
}

// 全画面切り替え機能
document.querySelector('#fullscreen-btn')?.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    root.requestFullscreen().catch(err => {
      alert(`全画面エラー: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
});

function tryJoin(room: string, seatNumber: number) {
  if (seatNumber > 20) return;
  const roomKey = `zoom-style-${room}`;
  const myID = `${roomKey}-${seatNumber}`;
  
  if (peer) peer.destroy();
  peer = new Peer(myID);

  peer.on('open', () => {
    statusArea.innerHTML = `✅ ${seatNumber}番席 / 3人目を探しています...`;
    
    // 他の人を探すループ
    const scanner = setInterval(() => {
      if (!peer || peer.destroyed) return clearInterval(scanner);
      for (let i = 1; i < 20; i++) {
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
    if (err.type === 'unavailable-id') tryJoin(room, seatNumber + 1);
  });
}

function handleCall(call: any) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);

  call.on('stream', (stream: MediaStream) => {
    if (document.getElementById(call.peer)) return;
    
    const container = document.createElement('div');
    container.id = call.peer;
    container.style.cssText = "min-width: 160px; height: 100%; position: relative; cursor: pointer;";
    
    const v = document.createElement('video');
    v.srcObject = stream;
    v.autoplay = true; v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 8px; background: #222;";
    
    container.onclick = () => { bigVideo.srcObject = stream; };
    container.appendChild(v);
    videoGrid.appendChild(container);
    
    statusArea.innerText = `接続中: ${connectedPeers.size + 1}名`;
    bigVideo.srcObject = stream; // 3人目が来たらその人を映す
  });

  call.on('close', () => {
    document.getElementById(call.peer)?.remove();
    connectedPeers.delete(call.peer);
  });
}

document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  if (room) tryJoin(room, 1);
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());
init();