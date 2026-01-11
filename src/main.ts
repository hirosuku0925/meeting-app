import './style.css'
import { Peer } from 'peerjs'

// 全体の余白を消す
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; }
  .off { background: #ea4335 !important; }
`;
document.head.appendChild(globalStyle);

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="flex: 1; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center;">
      <video id="big-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: contain;"></video>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">
        カメラを起動しています...
      </div>
    </div>

    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 15px; border-top: 1px solid #333; flex-shrink: 0;">
      <button id="mic-btn" class="tool-btn">🎤</button>
      <button id="cam-btn" class="tool-btn">📹</button>
      <div style="width: 1px; height: 40px; background: #444;"></div>
      <input id="room-input" type="text" placeholder="ルーム名" style="background: #222; border: 1px solid #444; color: white; padding: 10px; border-radius: 5px; width: 120px;">
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

// 初期化
async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    statusBadge.innerText = "準備完了！ルーム名を入力してください";
  } catch (e) {
    statusBadge.innerText = "カメラが見つかりません";
  }
}

// 参加処理
function join() {
  const room = (document.querySelector<HTMLInputElement>('#room-input')!).value.trim();
  if (!room) return alert("ルーム名を入力してください");

  const roomKey = `room-${room}`;
  statusBadge.innerText = "サーバー接続中...";
  
  // 1番から順に空いている席を探す
  tryNextSeat(roomKey, 1);
}

function tryNextSeat(roomKey: string, seat: number) {
  if (peer) peer.destroy();
  peer = new Peer(`${roomKey}-${seat}`);

  peer.on('open', () => {
    statusBadge.innerText = `${seat}番席で入室しました。相手を探しています...`;
    
    // 相手を探して自分から電話をかける（これが重要！）
    const searcher = setInterval(() => {
      if (!peer || peer.destroyed) return clearInterval(searcher);
      
      // 自分より若い番号の人（先にいる人）全員にコールする
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
      tryNextSeat(roomKey, seat + 1); // 席が埋まってたら次へ
    } else {
      console.error(err);
      statusBadge.innerText = "エラーが発生しました";
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
    statusBadge.innerText = `通話中: 相手を発見しました！`;
  });

  call.on('close', () => {
    document.getElementById(call.peer)?.remove();
    connectedPeers.delete(call.peer);
  });
}

document.querySelector('#join-btn')?.addEventListener('click', join);
document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

init();