import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #000; color: white; overflow: hidden;">
    <div style="width: 240px; background: #111; padding: 20px; display: flex; flex-direction: column; gap: 15px; border-right: 1px solid #333;">
      <h2 style="color: #00d4ff; font-size: 16px;">🚀 高速・大規模モード</h2>
      <p style="font-size: 10px; color: #888;">負荷を抑えて400人接続をシミュレート</p>
      <input id="room-id-input" type="text" placeholder="ルーム名" style="padding: 10px; border-radius: 5px; background: #222; border: 1px solid #444; color: white;">
      <button id="join-room-btn" style="background: #00d4ff; color: black; border: none; padding: 12px; border-radius: 5px; cursor: pointer; font-weight: bold;">入室</button>
      <div id="status-area" style="font-size: 11px; color: #00ff00;">待機中</div>
      <div style="margin-top: auto;">
        <video id="local-video" autoplay playsinline muted style="width: 100%; border-radius: 5px; border: 1px solid #00d4ff;"></video>
      </div>
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
    // 画質を極限まで下げて「軽さ」を優先
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
  videoGrid.innerHTML = ''; // 画面をクリア

  const myNum = Math.floor(Math.random() * 400) + 1;
  peer = new Peer(`sfu-${room}-${myNum}`);

  peer.on('open', () => {
    statusArea.innerHTML = `✅ 入室: No.${myNum}`;
    
    // 【軽量化の工夫】一気に400人探さず、少しずつ探す
    let currentSearch = 1;
    const scanTimer = setInterval(() => {
      if (!peer || peer.destroyed) return clearInterval(scanTimer);
      
      // 一度に3人分だけチェックして負荷を分散
      for (let i = 0; i < 3; i++) {
        const targetNum = (currentSearch + i) % 400 + 1;
        const targetID = `sfu-${room}-${targetNum}`;
        
        if (targetNum !== myNum && !connectedPeers.has(targetID)) {
          const call = peer.call(targetID, localStream);
          if (call) handleCall(call);
        }
      }
      currentSearch = (currentSearch + 3) % 400;
    }, 1000); // 1秒ごとに少しずつ探す
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
    v.autoplay = true;
    v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; background: #222; border-radius: 3px;";
    videoGrid.appendChild(v);
    statusArea.innerText = `接続: ${connectedPeers.size + 1}人`;
  });

  call.on('close', () => {
    document.getElementById(call.peer)?.remove();
    connectedPeers.delete(call.peer);
  });
}

document.querySelector('#join-room-btn')?.addEventListener('click', join);
init();