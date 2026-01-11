import './style.css'
import { Peer } from 'peerjs'

const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; transition: 0.2s; }
  .tool-btn:hover { background: #444; }
  .off { background: #ea4335 !important; }
`;
document.head.appendChild(globalStyle);

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="flex: 1; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center;">
      <video id="big-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: contain;"></video>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">
        カメラ起動中...
      </div>
    </div>

    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 15px; border-top: 1px solid #333; flex-shrink: 0;">
      <button id="mic-btn" class="tool-btn">🎤</button>
      <button id="cam-btn" class="tool-btn">📹</button>
      <div style="width: 1px; height: 40px; background: #444;"></div>
      <input id="room-input" type="text" placeholder="例: room777" style="background: #222; border: 1px solid #444; color: white; padding: 10px; border-radius: 5px; width: 120px;">
      <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold;">参加</button>
      <button id="exit-btn" style="background: #444; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">リセット</button>
    </div>

    <div id="video-grid" style="height: 140px; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; align-items: center; justify-content: center;">
      <video id="local-video" autoplay playsinline muted style="height: 100%; border-radius: 8px; border: 2px solid #4facfe;"></video>
    </div>
  </div>
`

const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const videoGrid = document.querySelector<HTMLElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLElement>('#status-badge')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    statusBadge.innerText = "準備完了。ルーム名を入れてください";
  } catch (e) {
    statusBadge.innerText = "カメラエラー！許可が必要です";
  }
}

function join() {
  const room = (document.querySelector<HTMLInputElement>('#room-input')!).value.trim();
  if (!room) return alert("ルーム名を入力してください");

  statusBadge.innerText = "接続中...";
  const roomKey = `vF-${room}`;
  // 3人目が確実に繋がるよう、席番号は 1, 2, 3... と試行する
  tryJoin(roomKey, 1);
}

function tryJoin(roomKey: string, seat: number) {
  if (peer) peer.destroy();
  peer = new Peer(`${roomKey}-${seat}`);

  peer.on('open', () => {
    statusBadge.innerText = `入室成功 (${seat}番席)。相手を探しています...`;
    
    // 【重要】自分より前の番号の人全員に電話をかける
    setInterval(() => {
      if (!peer || peer.destroyed) return;
      for (let i = 1; i < seat; i++) {
        const targetId = `${roomKey}-${i}`;
        if (!connectedPeers.has(targetId)) {
          const call = peer.call(targetId, localStream);
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
    if (err.type === 'unavailable-id') {
      tryJoin(roomKey, seat + 1); // 席が埋まっていたら次の席へ
    } else {
      statusBadge.innerText = "接続エラー";
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
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "height: 100%; min-width: 180px; border-radius: 8px; background: #222; object-fit: cover; cursor: pointer;";
    v.onclick = () => { bigVideo.srcObject = stream; };
    videoGrid.appendChild(v);
    bigVideo.srcObject = stream;
    statusBadge.innerText = `接続中: ${connectedPeers.size + 1}名`;
  });

  call.on('close', () => {
    document.getElementById(call.peer)?.remove();
    connectedPeers.delete(call.peer);
  });
}

document.querySelector('#join-btn')?.addEventListener('click', join);
document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

init();