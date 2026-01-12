import './style.css'
import { Peer } from 'peerjs'

// --- 1. スタイル設定 ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
  .tool-btn:hover { background: #444; transform: scale(1.1); }
  .tool-btn.active { background: #4facfe !important; }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; font-size: 10px; color: #888; gap: 4px; }
  .off { background: #ea4335 !important; }
  .screen-label { position: absolute; top: 5px; right: 5px; background: #ea4335; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTMLレイアウト ---
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="flex: 1; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
      <video id="big-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: contain;"></video>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">入室してください</div>
    </div>

    <div id="video-grid" style="height: 150px; background: #111; display: flex; gap: 10px; padding: 10px; overflow-x: auto; align-items: center;">
      <div style="position: relative; height: 100%; flex-shrink: 0;">
        <video id="local-video" autoplay playsinline muted style="height: 100%; border-radius: 8px; border: 2px solid #4facfe; object-fit: cover;"></video>
        <div style="position: absolute; bottom: 5px; left: 5px; font-size: 10px; background: rgba(0,0,0,0.5); padding: 2px 4px;">自分</div>
      </div>
    </div>

    <div id="toolbar" style="height: 100px; background: #000; display: flex; align-items: center; justify-content: center; gap: 12px; border-top: 1px solid #333; flex-shrink: 0;">
      <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>マイク</span></div>
      <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>カメラ</span></div>
      <div class="ctrl-group"><button id="share-btn" class="tool-btn">💻</button><span>画面共有</span></div>
      <div style="width: 1px; height: 40px; background: #444; margin: 0 10px;"></div>
      <input id="room-input" type="text" placeholder="ルーム名" style="background: #222; border: 1px solid #444; color: white; padding: 10px; border-radius: 5px; width: 120px;">
      <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 10px 18px; border-radius: 5px; cursor: pointer; font-weight: bold;">参加</button>
      <button id="exit-btn" style="background: #ea4335; color: white; border: none; padding: 10px 18px; border-radius: 5px; cursor: pointer;">終了</button>
    </div>
  </div>
`

// --- 3. 変数管理 ---
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const videoGrid = document.querySelector<HTMLElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLElement>('#status-badge')!;

let localStream: MediaStream;
let screenStream: MediaStream | null = null;
let peer: Peer | null = null;
let currentRoom = ""; // この変数を後でちゃんと使います！

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
}

// 4. 接続処理
function join() {
  const room = (document.querySelector<HTMLInputElement>('#room-input')!).value.trim();
  if (!room) return alert("部屋名を入れてね");
  
  currentRoom = room; // ここで代入！
  if (peer) peer.destroy();
  
  // IDに部屋名を含める
  peer = new Peer(`nijin-${currentRoom}-${Math.floor(Math.random() * 1000)}`);

  peer.on('open', () => {
    // ここで currentRoom を使って画面表示！これでエラーが消えます
    statusBadge.innerText = `【部屋: ${currentRoom}】 に入室しました`;
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
  });
}

// 5. 映像の受け取り（画面共有の切り替え対応）
function handleCall(call: any) {
  call.on('stream', (remoteStream: MediaStream) => {
    const videoId = `video-${call.peer}`;
    if (document.getElementById(videoId)) return;

    const container = document.createElement('div');
    container.id = videoId;
    container.style.cssText = "position: relative; height: 100%; flex-shrink: 0; cursor: pointer;";

    const v = document.createElement('video');
    v.srcObject = remoteStream;
    v.autoplay = true;
    v.playsInline = true;
    v.style.cssText = "height: 100%; border-radius: 8px; background: #222; border: 2px solid #333;";

    // 画面共有かどうかチェック
    const isScreen = remoteStream.getVideoTracks()[0].label.toLowerCase().includes("screen");
    if (isScreen) {
      const label = document.createElement('div');
      label.className = "screen-label";
      label.innerText = "画面共有";
      container.appendChild(label);
      // 画面共有が来たら自動でメイン画面に！
      bigVideo.srcObject = remoteStream;
      bigVideo.muted = false;
    }

    // クリックで切り替え
    container.onclick = () => {
      bigVideo.srcObject = remoteStream;
      bigVideo.muted = false;
    };

    container.appendChild(v);
    videoGrid.appendChild(container);
  });
}

// 6. 自分の画面共有
async function toggleScreenShare() {
  const btn = document.querySelector('#share-btn') as HTMLElement;
  if (!screenStream) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      btn.classList.add('active');
      statusBadge.innerText = `【部屋: ${currentRoom}】 画面共有中...`;
      
      screenStream.getVideoTracks()[0].onended = () => toggleScreenShare();
    } catch (e) { console.error(e); }
  } else {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
    btn.classList.remove('active');
    statusBadge.innerText = `【部屋: ${currentRoom}】 カメラに戻りました`;
  }
}

document.querySelector('#share-btn')?.addEventListener('click', toggleScreenShare);
document.querySelector('#join-btn')?.addEventListener('click', join);
document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

init();