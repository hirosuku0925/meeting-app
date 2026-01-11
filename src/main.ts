import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #1a1a1a; color: white; overflow: hidden;">
    <div style="width: 260px; background: #2c3e50; padding: 20px; display: flex; flex-direction: column; gap: 15px; z-index: 10;">
      <h2 style="color: #3498db; margin: 0; font-size: 20px;">🌐 安定版・AI会議室</h2>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <input id="room-id-input" type="text" placeholder="ルーム名" style="padding: 10px; border-radius: 5px; border: none; color: #333;">
        <input id="room-pass-input" type="password" placeholder="パスワード" style="padding: 10px; border-radius: 5px; border: none; color: #333;">
        <button id="join-room-btn" style="background: #3498db; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">参加する</button>
      </div>
      <div id="status-area" style="font-size: 11px; padding: 10px; border-radius: 5px; background: rgba(0,0,0,0.3); border-left: 4px solid #95a5a6; min-height: 60px;">
        カメラ準備中...
      </div>
      <div style="margin-top: auto;">
        <button id="hangup-btn" style="background: #e74c3c; color: white; border: none; padding: 10px; border-radius: 8px; cursor: pointer; width: 100%;">ページをリセット</button>
      </div>
    </div>
    <div style="flex: 1; display: flex; flex-direction: column; background: #000;">
      <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <video id="big-video" autoplay playsinline muted style="max-width: 100%; max-height: 100%; border-radius: 12px;"></video>
      </div>
      <div id="video-grid" style="display: flex; gap: 10px; padding: 15px; background: rgba(0,0,0,0.5); overflow-x: auto; min-height: 160px;">
        <div style="position: relative; min-width: 200px; height: 130px;">
          <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 2px solid #3498db;"></video>
        </div>
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
    statusArea.innerText = "準備完了！ルーム名を入れて参加してね";
  } catch (e) { statusArea.innerText = "カメラ許可エラー"; }
}

function join() {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('room-pass-input') as HTMLInputElement).value.trim();
  if (!room || !pass) return alert("入力してね");

  if (peer) { peer.destroy(); connectedPeers.clear(); }

  statusArea.innerText = "接続を開始します...";
  const myNum = Math.floor(Math.random() * 20) + 1;
  const roomKey = `vroom-${room}-${pass}`;
  
  peer = new Peer(`${roomKey}-${myNum}`);

  peer.on('open', (id) => {
    statusArea.innerHTML = `<b style="color:#2ecc71">入室成功！</b><br>ID: ${id}`;
    
    // スキャン開始
    const scan = setInterval(() => {
      if (!peer || peer.destroyed || peer.disconnected) { clearInterval(scan); return; }
      for (let i = 1; i <= 20; i++) {
        const targetID = `${roomKey}-${i}`;
        if (i !== myNum && !connectedPeers.has(targetID)) {
          const call = peer.call(targetID, localStream);
          if (call) handleCall(call);
        }
      }
    }, 4000);
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
  });

  // ★切断時の自動復活機能
  peer.on('disconnected', () => {
    statusArea.innerHTML = `<b style="color:#f1c40f">再接続中...</b>`;
    peer?.reconnect();
  });

  peer.on('error', (err) => {
    console.error(err.type);
    statusArea.innerHTML = `<b style="color:#e74c3c">エラー: ${err.type}</b>`;
    if (err.type === 'unavailable-id') { join(); } // 被ったらやり直し
  });
}

function handleCall(call: any) {
  call.on('stream', (stream: MediaStream) => {
    if (connectedPeers.has(call.peer)) return;
    connectedPeers.add(call.peer);
    const container = document.createElement('div');
    container.id = `v-${call.peer}`;
    container.style.cssText = "min-width: 200px; height: 130px; cursor: pointer;";
    const v = document.createElement('video');
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 8px; background: #000;";
    container.onclick = () => { bigVideo.srcObject = stream; bigVideo.muted = false; };
    container.appendChild(v);
    videoGrid.appendChild(container);
  });
  call.on('close', () => {
    document.getElementById(`v-${call.peer}`)?.remove();
    connectedPeers.delete(call.peer);
  });
}

document.querySelector('#join-room-btn')?.addEventListener('click', () => join());
document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());

init();