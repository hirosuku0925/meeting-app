import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #1a1a1a; color: white;">
    <div style="width: 280px; background: #2c3e50; padding: 20px; display: flex; flex-direction: column; gap: 15px; box-shadow: 2px 0 10px rgba(0,0,0,0.5);">
      <h2 style="color: #3498db; margin: 0; font-size: 20px;">🌐 AI会議室</h2>
      
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 11px; color: #bdc3c7;">ルーム名（英数字）</label>
        <input id="room-id-input" type="text" placeholder="例: teamA" style="padding: 10px; border-radius: 5px; border: none; color: #333;">
        
        <label style="font-size: 11px; color: #bdc3c7;">パスワード（英数字）</label>
        <input id="room-pass-input" type="password" placeholder="****" style="padding: 10px; border-radius: 5px; border: none; color: #333;">
        
        <button id="join-room-btn" style="background: #3498db; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold; margin-top: 5px;">入室・開始</button>
      </div>

      <div id="status-area" style="font-size: 12px; color: #f1c40f; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 5px; min-height: 50px; white-space: pre-wrap;">待機中...</div>

      <div style="margin-top: auto; border-top: 1px solid #34495e; padding-top: 15px;">
        <button id="hangup-btn" style="background: #e74c3c; color: white; border: none; padding: 10px; border-radius: 8px; cursor: pointer; width: 100%;">退出（リセット）</button>
      </div>
    </div>

    <div style="flex: 1; display: flex; flex-direction: column; background: #000; position: relative;">
      <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <video id="big-video" autoplay playsinline muted style="max-width: 100%; max-height: 100%; border-radius: 12px; background: #111;"></video>
      </div>
      
      <div id="video-grid" style="height: 160px; background: rgba(0,0,0,0.4); display: flex; gap: 10px; padding: 10px; overflow-x: auto; border-top: 1px solid #333;">
        <div style="position: relative; min-width: 180px; height: 100%;">
          <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 2px solid #3498db;"></video>
          <div style="position: absolute; bottom: 5px; left: 5px; font-size: 10px; background: rgba(0,0,0,0.5); padding: 2px 5px;">あなた</div>
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
  } catch (e) {
    statusArea.innerText = "⚠️ カメラが見つかりません。許可してください。";
  }
}

document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  // 入力を英数字のみにクリーンアップ（エラー防止）
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.replace(/[^a-zA-Z0-9]/g, "");
  const pass = (document.getElementById('room-pass-input') as HTMLInputElement).value.replace(/[^a-zA-Z0-9]/g, "");
  
  if (!room || !pass) return alert("ルーム名とパスワードを英数字で入力してください");

  if (peer) peer.destroy();
  connectedPeers.clear();

  // 1〜8番の席を用意（少ないほうが相手を見つけやすい）
  const myNum = Math.floor(Math.random() * 8) + 1;
  const myID = `vroom${room}${pass}${myNum}`;
  
  peer = new Peer(myID);

  peer.on('open', (id) => {
    statusArea.innerText = `✅ 入室成功\nID: ${id}\n相手を探しています...`;
    
    // 他の1〜8番の人に一斉に電話をかける
    for (let i = 1; i <= 8; i++) {
      if (i === myNum) continue;
      const targetID = `vroom${room}${pass}${i}`;
      const call = peer!.call(targetID, localStream);
      if (call) handleCall(call);
    }
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      statusArea.innerText = "❌ 席が埋まっていました。もう一度「入室」を押してください。";
    } else {
      statusArea.innerText = `❌ エラー: ${err.type}`;
    }
  });
});

function handleCall(call: any) {
  call.on('stream', (stream: MediaStream) => {
    if (connectedPeers.has(call.peer)) return;
    connectedPeers.add(call.peer);

    const container = document.createElement('div');
    container.id = `v-${call.peer}`;
    container.style.cssText = "position: relative; min-width: 180px; height: 100%; cursor: pointer;";

    const v = document.createElement('video');
    v.srcObject = stream;
    v.autoplay = true; v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 1px solid #fff;";
    
    container.onclick = () => {
      bigVideo.srcObject = stream;
      bigVideo.muted = false; // 相手の声は鳴らす
    };
    
    container.appendChild(v);
    videoGrid.appendChild(container);
    statusArea.innerText = `👥 接続中: ${connectedPeers.size}人の参加者`;
  });

  call.on('close', () => {
    document.getElementById(`v-${call.peer}`)?.remove();
    connectedPeers.delete(call.peer);
  });
}

document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());

init();