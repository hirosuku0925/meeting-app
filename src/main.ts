import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #000; color: white; overflow: hidden;">
    <div style="width: 250px; background: #1a1a1a; padding: 20px; display: flex; flex-direction: column; gap: 15px; border-right: 1px solid #333;">
      <h2 style="color: #00d4ff; font-size: 18px; margin: 0;">🌐 オリジナル会議</h2>
      <input id="room-id-input" type="text" placeholder="ルーム名を入力" style="padding: 10px; border-radius: 5px; background: #222; border: 1px solid #444; color: white;">
      <button id="join-room-btn" style="background: #00d4ff; color: black; border: none; padding: 12px; border-radius: 5px; cursor: pointer; font-weight: bold;">参加する</button>
      <div id="status-area" style="font-size: 12px; color: #00ff00; background: rgba(0,255,0,0.1); padding: 10px; border-radius: 5px;">待機中</div>
      <div style="margin-top: auto;">
        <video id="local-video" autoplay playsinline muted style="width: 100%; border-radius: 5px; border: 1px solid #00d4ff;"></video>
      </div>
      <button id="hangup-btn" style="background: #ff4b2b; color: white; border: none; padding: 8px; border-radius: 5px; cursor: pointer;">退出 / リセット</button>
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
    // 画質を「中」に設定（400人設計のために重くしない）
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 320, height: 240, frameRate: 15 }, 
      audio: true 
    });
    (document.querySelector('#local-video') as HTMLVideoElement).srcObject = localStream;
    statusArea.innerText = "準備完了";
  } catch (e) { statusArea.innerText = "カメラを許可してください"; }
}

function join() {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  if (!room) return alert("ルーム名を入れてね");

  if (peer) peer.destroy();
  connectedPeers.clear();
  videoGrid.innerHTML = '';

  // 400人まで対応できるID設計（1-400のランダム席）
  const myNum = Math.floor(Math.random() * 400) + 1;
  const roomKey = `final-room-${room}`; 
  
  peer = new Peer(`${roomKey}-${myNum}`);

  peer.on('open', (id) => {
    statusArea.innerHTML = `✅ 参加中<br>あなたの席: ${myNum}番`;
    
    // 負荷分散：1秒ごとに少しずつ周りを探す（一気にやらないから軽い！）
    let searchIdx = 1;
    const timer = setInterval(() => {
      if (!peer || peer.destroyed) return clearInterval(timer);
      for (let i = 0; i < 5; i++) { // 一度に5人ずつ探す
        const target = `${roomKey}-${searchIdx}`;
        if (searchIdx !== myNum && !connectedPeers.has(target)) {
          const call = peer.call(target, localStream);
          if (call) handleCall(call);
        }
        searchIdx = (searchIdx % 400) + 1;
      }
    }, 1000);
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') join(); // 席が被ったら自動移動
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
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; background: #222; border-radius: 10px; border: 1px solid #333;";
    videoGrid.appendChild(v);
    statusArea.innerText = `接続人数: ${connectedPeers.size + 1}名`;
  });

  call.on('close', () => {
    document.getElementById(call.peer)?.remove();
    connectedPeers.delete(call.peer);
    statusArea.innerText = `接続人数: ${connectedPeers.size + 1}名`;
  });
}

document.querySelector('#join-room-btn')?.addEventListener('click', join);
document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());
init();