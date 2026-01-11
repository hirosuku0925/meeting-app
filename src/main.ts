import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #000; color: white; overflow: hidden;">
    <div style="width: 220px; background: #151515; padding: 15px; display: flex; flex-direction: column; gap: 10px; border-right: 1px solid #333;">
      <h2 style="color: #00d4ff; font-size: 16px; margin: 0;">🌐 超軽量モード</h2>
      <input id="room-id-input" type="text" placeholder="ルーム名" style="padding: 8px; border-radius: 5px; background: #222; border: 1px solid #444; color: white; font-size: 12px;">
      <button id="join-room-btn" style="background: #00d4ff; color: black; border: none; padding: 10px; border-radius: 5px; cursor: pointer; font-weight: bold;">参加</button>
      <div id="status-area" style="font-size: 11px; color: #00ff00; padding: 5px; background: rgba(0,255,0,0.1);">待機中</div>
      <div style="margin-top: auto;">
        <video id="local-video" autoplay playsinline muted style="width: 100%; border-radius: 5px; border: 1px solid #00d4ff;"></video>
      </div>
      <button id="hangup-btn" style="background: #ff4b2b; color: white; border: none; padding: 8px; border-radius: 5px; cursor: pointer; font-size: 12px;">リセット</button>
    </div>
    <div id="video-grid" style="flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); grid-auto-rows: 80px; gap: 5px; padding: 10px; overflow-y: auto;">
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
    // 400人のために画質を限界まで落とす（これで軽くなる！）
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 80, height: 60, frameRate: 5 }, 
      audio: true 
    });
    (document.querySelector('#local-video') as HTMLVideoElement).srcObject = localStream;
  } catch (e) { statusArea.innerText = "カメラエラー"; }
}

function join() {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  if (!room) return;

  if (peer) peer.destroy();
  connectedPeers.clear();
  videoGrid.innerHTML = '';

  const myNum = Math.floor(Math.random() * 400) + 1;
  const roomKey = `lite-${room}`; // IDを短くして通信を安定させる
  
  peer = new Peer(`${roomKey}-${myNum}`);

  peer.on('open', (id) => {
    statusArea.innerHTML = `✅ 入室: No.${myNum}`;
    
    // 【重要】少しずつ繋いでいくことで「重さ」と「失敗」を防ぐ
    let currentIdx = 1;
    const scanTimer = setInterval(() => {
      if (!peer || peer.destroyed) return clearInterval(scanTimer);
      
      for (let i = 0; i < 10; i++) { // 1回につき10人分だけ探す
        const target = `${roomKey}-${currentIdx}`;
        if (currentIdx !== myNum && !connectedPeers.has(target)) {
          const call = peer.call(target, localStream);
          if (call) handleCall(call);
        }
        currentIdx = (currentIdx % 400) + 1;
      }
    }, 3000); // 3秒おきに探す（回線のパンクを防ぐ）
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
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
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; background: #222; border-radius: 3px;";
    videoGrid.appendChild(v);
    statusArea.innerText = `接続中: ${connectedPeers.size + 1}名`;
  });
}

document.querySelector('#join-room-btn')?.addEventListener('click', join);
document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());
init();