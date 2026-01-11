import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #121212; color: white; overflow: hidden;">
    <div style="width: 280px; background: #1e1e1e; padding: 25px; display: flex; flex-direction: column; gap: 20px; border-right: 1px solid #333;">
      <h2 style="color: #4facfe; margin: 0; font-size: 20px;">🌐 3人以上対応会議</h2>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <input id="room-id-input" type="text" placeholder="ルーム名" style="padding: 12px; border-radius: 8px; border: 1px solid #444; background: #2a2a2a; color: white;">
        <input id="room-pass-input" type="password" placeholder="パスワード" style="padding: 12px; border-radius: 8px; border: 1px solid #444; background: #2a2a2a; color: white;">
        <button id="join-room-btn" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; border: none; padding: 15px; border-radius: 10px; cursor: pointer; font-weight: bold;">参加する</button>
      </div>
      <div id="status-area" style="font-size: 13px; padding: 15px; border-radius: 8px; background: rgba(255,255,255,0.05); border-left: 4px solid #4facfe;">待機中...</div>
      <div style="margin-top: auto;">
        <button id="hangup-btn" style="background: #ff4b2b; color: white; border: none; padding: 10px; border-radius: 8px; cursor: pointer; width: 100%;">退出 / リセット</button>
      </div>
    </div>
    <div style="flex: 1; display: flex; flex-direction: column; background: #000;">
      <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <video id="big-video" autoplay playsinline style="max-width: 100%; max-height: 100%; border-radius: 15px;"></video>
      </div>
      <div id="video-grid" style="height: 180px; background: #111; display: flex; gap: 15px; padding: 15px; overflow-x: auto; border-top: 1px solid #333;">
        <div style="position: relative; min-width: 220px; height: 100%;">
          <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px; border: 2px solid #4facfe;"></video>
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
    statusArea.innerText = "準備完了";
  } catch (e) { statusArea.innerText = "カメラ許可エラー"; }
}

function join() {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('room-pass-input') as HTMLInputElement).value.trim();
  if (!room || !pass) return alert("入力してね");

  if (peer) peer.destroy();
  connectedPeers.clear();

  const myNum = Math.floor(Math.random() * 30) + 1;
  const roomKey = `vroom-${room}-${pass}`;
  peer = new Peer(`${roomKey}-${myNum}`);

  peer.on('open', () => {
    statusArea.innerHTML = "✅ 入室成功<br>他メンバーを自動検索中...";
    setInterval(() => {
      if (!peer || peer.destroyed || peer.disconnected) return;
      for (let i = 1; i <= 30; i++) {
        const targetID = `${roomKey}-${i}`;
        if (i !== myNum && !connectedPeers.has(targetID)) {
          const call = peer.call(targetID, localStream);
          if (call) setupCall(call);
        }
      }
    }, 5000);
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    setupCall(call);
  });

  peer.on('error', (err) => {
    if (err.type === 'peer-unavailable') return;
    statusArea.innerText = "エラー: " + err.type;
    if (err.type === 'unavailable-id') join();
  });
}

function setupCall(call: any) {
  call.on('stream', (stream: MediaStream) => {
    if (connectedPeers.has(call.peer)) return;
    connectedPeers.add(call.peer);
    const container = document.createElement('div');
    container.id = `v-${call.peer}`;
    container.style.cssText = "min-width: 220px; height: 100%; cursor: pointer;";
    const v = document.createElement('video');
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 10px; background: #000;";
    container.onclick = () => { bigVideo.srcObject = stream; bigVideo.muted = false; };
    container.appendChild(v);
    videoGrid.appendChild(container);
    statusArea.innerText = `接続中: ${connectedPeers.size + 1}名`;
  });
  call.on('close', () => {
    document.getElementById(`v-${call.peer}`)?.remove();
    connectedPeers.delete(call.peer);
  });
}

document.querySelector('#join-room-btn')?.addEventListener('click', join);
document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());
init();