import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #121212; color: white; overflow: hidden;">
    <div style="width: 280px; background: #1e1e1e; padding: 25px; display: flex; flex-direction: column; gap: 20px; border-right: 1px solid #333;">
      <h2 style="color: #4facfe; margin: 0; font-size: 22px; letter-spacing: 1px;">🌐 マルチ会議システム</h2>
      
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <label style="font-size: 12px; color: #888;">ルーム名</label>
        <input id="room-id-input" type="text" placeholder="例: class1" style="padding: 12px; border-radius: 8px; border: 1px solid #444; background: #2a2a2a; color: white;">
        <label style="font-size: 12px; color: #888;">パスワード</label>
        <input id="room-pass-input" type="password" placeholder="例: 1234" style="padding: 12px; border-radius: 8px; border: 1px solid #444; background: #2a2a2a; color: white;">
        <button id="join-room-btn" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; border: none; padding: 15px; border-radius: 10px; cursor: pointer; font-weight: bold; font-size: 16px; margin-top: 10px;">会議に参加する</button>
      </div>

      <div id="status-area" style="font-size: 13px; padding: 15px; border-radius: 8px; background: rgba(255,255,255,0.05); border-left: 4px solid #4facfe; line-height: 1.6;">
        カメラを起動しています...
      </div>

      <div style="margin-top: auto;">
        <button id="hangup-btn" style="background: #ff4b2b; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; width: 100%; font-weight: bold;">退出 / リセット</button>
      </div>
    </div>

    <div style="flex: 1; display: flex; flex-direction: column; background: #000;">
      <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px; position: relative;">
        <video id="big-video" autoplay playsinline style="max-width: 100%; max-height: 100%; border-radius: 15px; box-shadow: 0 0 30px rgba(0,0,0,0.5);"></video>
        <div style="position: absolute; bottom: 40px; left: 40px; background: rgba(0,0,0,0.5); padding: 5px 15px; border-radius: 20px; font-size: 14px;">メイン画面</div>
      </div>
      
      <div id="video-grid" style="height: 180px; background: #111; display: flex; gap: 15px; padding: 15px; overflow-x: auto; border-top: 1px solid #333;">
        <div style="position: relative; min-width: 220px; height: 100%;">
          <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px; border: 2px solid #4facfe;"></video>
          <div style="position: absolute; bottom: 10px; left: 10px; font-size: 11px; background: rgba(0,0,0,0.6); padding: 2px 8px; border-radius: 4px;">あなた</div>
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

// 1. 初期化：カメラをオンにする
async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 640, height: 480 }, 
      audio: true 
    });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    statusArea.innerHTML = "<span style='color: #2ecc71;'>✅ 準備完了</span><br>ルーム名を入力してください";
  } catch (e) {
    statusArea.innerHTML = "<span style='color: #ff4b2b;'>❌ カメラ許可が必要です</span>";
  }
}

// 2. 参加処理
function joinSession() {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('room-pass-input') as HTMLInputElement).value.trim();
  if (!room || !pass) return alert("ルーム名とパスワードを入力してください");

  if (peer) peer.destroy();
  connectedPeers.clear();

  // 1〜30番まで席を増やして3人以上の衝突を回避
  const myNum = Math.floor(Math.random() * 30) + 1;
  const roomKey = `v-room-${room}-${pass}`;
  
  peer = new Peer(`${roomKey}-${myNum}`);

  peer.on('open', (id) => {
    statusArea.innerHTML = `<span style='color: #2ecc71;'>✅ 入室成功</span><br>席番号: ${myNum}<br>他メンバーを検索中...`;
    
    // 5秒おきに30人分を自動スキャンして接続
    setInterval(() => {
      if (!peer || peer.destroyed || peer.disconnected) return;
      for (let i = 1; i <= 30; i++) {
        if (i === myNum) continue;
        const targetID = `${roomKey}-${i}`;
        if (!connectedPeers.has(targetID)) {
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
    if (err.type === 'peer-unavailable') return; // 相手がいないだけのエラーは無視
    if (err.type === 'unavailable-id') joinSession(); // 席被りは自動入り直し
    console.error("PeerJS:", err.type);
  });
}

// 3. 通信ハンドリング
function setupCall(call: any) {
  call.on('stream', (stream: MediaStream) => {
    if (connectedPeers.has(call.peer)) return;
    connectedPeers.add(call.peer);

    const container = document.createElement('div');
    container.id = `v-${call.peer}`;
    container.style.cssText = "position: relative; min-width: 220px; height: 100%; cursor: pointer;";
    
    const v = document.createElement('video');
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 10px; background: #000;";
    
    container.onclick = () => {
      bigVideo.srcObject = stream;
      bigVideo.muted = false;
    };
    
    container.appendChild(v);
    videoGrid.appendChild(container);
    statusArea.innerHTML = `<span style='color: #2ecc71;'>✅ 接続中</span><br>参加人数: ${connectedPeers.size + 1}名`;
  });

  call.on('close', () => {
    document.getElementById(`v-${call.peer}`)?.remove();
    connectedPeers.delete(call.peer);
    statusArea.innerHTML = `<span style='color: #2ecc71;'>✅ 接続中</span><br>参加人数: ${connectedPeers.size + 1}名`;
  });
}

document.querySelector('#join-room-btn')?.addEventListener('click', joinSession);
document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());

init();