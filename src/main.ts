import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100vw; font-family: sans-serif; background: #000; color: white; overflow: hidden; flex-direction: column;">
    
    <div id="main-display" style="flex: 1; position: relative; display: flex; align-items: center; justify-content: center; background: #1a1a1a;">
      <video id="big-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: contain;"></video>
      
      <div id="status-overlay" style="position: absolute; top: 15px; left: 15px; z-index: 10; display: flex; gap: 10px; align-items: center;">
        <span id="status-badge" style="background: #ea4335; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold;">オフライン</span>
        <span id="room-display" style="font-size: 14px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);"></span>
      </div>

      <div id="control-panel" style="position: absolute; bottom: 20px; z-index: 20; display: flex; gap: 12px; background: rgba(30, 30, 30, 0.9); padding: 12px 20px; border-radius: 50px; border: 1px solid #444; backdrop-filter: blur(10px); box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
        <input id="room-input" type="text" placeholder="ルーム名を入力" style="background: transparent; border: none; border-bottom: 1px solid #4facfe; color: white; padding: 5px; outline: none; width: 120px;">
        <button id="join-btn" style="background: #4facfe; color: white; border: none; padding: 8px 16px; border-radius: 20px; cursor: pointer; font-weight: bold;">参加</button>
        <button id="reset-btn" style="background: #444; color: white; border: none; padding: 8px 16px; border-radius: 20px; cursor: pointer;">リセット</button>
      </div>
    </div>

    <div id="video-grid" style="height: 180px; background: #000; display: flex; gap: 12px; padding: 15px; overflow-x: auto; align-items: center; border-top: 1px solid #222;">
      <div style="min-width: 220px; height: 100%; position: relative; flex-shrink: 0; background: #222; border-radius: 12px; overflow: hidden; border: 2px solid #4facfe;">
        <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover;"></video>
        <div style="position: absolute; bottom: 10px; left: 10px; font-size: 12px; background: rgba(0,0,0,0.6); padding: 2px 8px; border-radius: 4px;">自分</div>
      </div>
    </div>
  </div>
`

const videoGrid = document.querySelector('#video-grid')!;
const statusBadge = document.querySelector<HTMLElement>('#status-badge')!;
const roomDisplay = document.querySelector<HTMLElement>('#room-display')!;
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
  } catch (e) { statusBadge.innerText = "カメラエラー"; }
}

function join() {
  const room = (document.getElementById('room-input') as HTMLInputElement).value.trim();
  if (!room) return;

  statusBadge.style.background = "#f1c40f";
  statusBadge.innerText = "接続中...";
  roomDisplay.innerText = `Room: ${room}`;

  tryJoin(room, 1);
}

function tryJoin(room: string, seat: number) {
  const roomKey = `max-v-${room}`;
  if (peer) peer.destroy();
  peer = new Peer(`${roomKey}-${seat}`);

  peer.on('open', () => {
    statusBadge.style.background = "#2ecc71";
    statusBadge.innerText = `入室済み (${seat})`;
    
    setInterval(() => {
      if (!peer || peer.destroyed) return;
      for (let i = 1; i < seat; i++) {
        const target = `${roomKey}-${i}`;
        if (!connectedPeers.has(target)) {
          const call = peer.call(target, localStream);
          if (call) handleCall(call);
        }
      }
    }, 3000);
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') tryJoin(room, seat + 1);
  });
}

function handleCall(call: any) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);

  call.on('stream', (stream: MediaStream) => {
    if (document.getElementById(call.peer)) return;
    
    const container = document.createElement('div');
    container.id = call.peer;
    container.style.cssText = "min-width: 220px; height: 100%; position: relative; flex-shrink: 0; background: #222; border-radius: 12px; overflow: hidden; cursor: pointer;";
    
    const v = document.createElement('video');
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
    
    container.onclick = () => { bigVideo.srcObject = stream; };
    container.appendChild(v);
    videoGrid.appendChild(container);
    
    // 自動で新しく来た人をメインに
    bigVideo.srcObject = stream;
  });
}

document.querySelector('#join-btn')?.addEventListener('click', join);
document.querySelector('#reset-btn')?.addEventListener('click', () => location.reload());
init();