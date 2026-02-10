import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #000; color: white; overflow: hidden; flex-direction: column;">
    
    <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; background: #000; position: relative; overflow: hidden;">
      <video id="big-video" autoplay playsinline style="max-width: 100%; max-height: 100%; object-fit: contain;"></video>
      <div id="status-area" style="position: absolute; top: 20px; left: 20px; font-size: 12px; color: #2ecc71; background: rgba(0,0,0,0.6); padding: 8px 15px; border-radius: 20px; border: 1px solid #4facfe;">待機中</div>
      
      <div style="position: absolute; bottom: 20px; display: flex; gap: 10px; background: rgba(255,255,255,0.1); padding: 10px; border-radius: 15px; backdrop-filter: blur(5px);">
        <input id="room-id-input" type="text" placeholder="ルーム名" style="padding: 8px; border-radius: 5px; border: none; background: #333; color: white; width: 120px;">
        <button id="join-room-btn" style="background: #4facfe; color: white; border: none; padding: 8px 15px; border-radius: 8px; cursor: pointer; font-weight: bold;">参加</button>
        <button id="hangup-btn" style="background: #ff4b2b; color: white; border: none; padding: 8px 15px; border-radius: 8px; cursor: pointer;">リセット</button>
      </div>
    </div>

    <div id="video-grid" style="height: 160px; background: #151515; display: flex; gap: 10px; padding: 10px; overflow-x: auto; border-top: 1px solid #333; align-items: center;">
      <div style="min-width: 180px; height: 100%; position: relative;">
        <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 2px solid #4facfe; cursor: pointer;"></video>
        <div style="position: absolute; bottom: 5px; left: 5px; font-size: 10px; background: rgba(0,0,0,0.5); padding: 2px 5px;">自分</div>
      </div>
    </div>
  </div>
`

const videoGrid = document.querySelector('#video-grid')!;
const statusArea = document.querySelector<HTMLElement>('#status-area')!;
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream; // 最初は自分を大きく映す
  } catch (e) { statusArea.innerText = "カメラエラー"; }
}

// 映像をメイン画面に切り替える関数
function switchToBig(stream: MediaStream) {
  bigVideo.srcObject = stream;
}

// 自分の映像をクリックしたとき
localVideo.onclick = () => switchToBig(localStream);

function tryJoin(room: string, seatNumber: number) {
  if (seatNumber > 20) return;
  const roomKey = `fullscreen-room-${room}`;
  const myID = `${roomKey}-${seatNumber}`;
  
  if (peer) peer.destroy();
  peer = new Peer(myID);

  peer.on('open', () => {
    statusArea.innerHTML = `✅ ${seatNumber}番席で入室中...`;
    setInterval(() => {
      if (!peer || peer.destroyed) return;
      for (let i = 1; i < seatNumber; i++) {
        const target = `${roomKey}-${i}`;
        if (!connectedPeers.has(target)) {
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
    
    // サムネイルコンテナ作成
    const container = document.createElement('div');
    container.id = call.peer;
    container.style.cssText = "min-width: 180px; height: 100%; position: relative; cursor: pointer;";
    
    const v = document.createElement('video');
    v.srcObject = stream;
    v.autoplay = true; v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 8px; background: #222;";
    
    // サムネイルをクリックしたらメイン画面に表示
    container.onclick = () => switchToBig(stream);
    
    container.appendChild(v);
    videoGrid.appendChild(container);
    statusArea.innerText = `接続中: ${connectedPeers.size + 1}名`;
    
    // 3人目が来たら、自動でその人をメインに映す
    switchToBig(stream);
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