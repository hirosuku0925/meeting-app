import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #1a1a1a; color: white; overflow: hidden;">
    <div style="width: 260px; background: #2c3e50; padding: 20px; display: flex; flex-direction: column; gap: 15px; z-index: 10;">
      <h2 style="color: #3498db; margin: 0; font-size: 20px;">🌐 AI会議室</h2>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <input id="room-id-input" type="text" placeholder="ルーム名" style="padding: 10px; border-radius: 5px; border: none; color: #333;">
        <input id="room-pass-input" type="password" placeholder="パスワード" style="padding: 10px; border-radius: 5px; border: none; color: #333;">
        <button id="join-room-btn" style="background: #3498db; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">部屋に入室</button>
      </div>
      <div id="status-area" style="font-size: 11px; color: #2ecc71; text-align: center; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 5px; min-height: 40px;">待機中</div>
      <div style="margin-top: auto;">
        <button id="hangup-btn" style="background: #e74c3c; color: white; border: none; padding: 10px; border-radius: 8px; cursor: pointer; width: 100%;">退出してリセット</button>
      </div>
    </div>

    <div style="flex: 1; display: flex; flex-direction: column; background: #000;">
      <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <video id="big-video" autoplay playsinline muted style="max-width: 100%; max-height: 100%; border-radius: 12px; background: #111;"></video>
      </div>
      <div id="video-grid" style="height: 180px; background: rgba(0,0,0,0.5); display: flex; gap: 15px; padding: 15px; overflow-x: auto; border-top: 1px solid #333;">
        <div style="position: relative; min-width: 220px; height: 100%;">
          <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px; border: 3px solid #646cff;"></video>
          <div style="position: absolute; bottom: 8px; left: 8px; font-size: 11px; background: rgba(0,0,0,0.6); padding: 2px 8px;">あなた</div>
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
const activeCalls = new Map<string, any>();
let scanInterval: any = null;

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
  } catch (err) {
    statusArea.innerText = "カメラ・マイクの許可が必要です";
  }
}

document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('room-pass-input') as HTMLInputElement).value.trim();
  if (!room || !pass) return alert("ルーム名とパスワードを入力してください");

  // 前回の接続を徹底的にクリーンアップ
  if (peer) peer.destroy();
  if (scanInterval) clearInterval(scanInterval);
  activeCalls.clear();
  videoGrid.querySelectorAll('div[id^="v-"]').forEach(el => el.remove());

  // IDの衝突を避けるために秒数まで含めたユニークなIDを作成
  const myNum = Math.floor(Math.random() * 20) + 1;
  const myID = `r_${room}_${pass}_${myNum}`;
  
  peer = new Peer(myID);

  peer.on('open', () => {
    statusArea.innerText = `接続完了！席:${myNum}\n相手が来るのを待っています...`;
    
    // 2秒ごとに全スロット(1〜20)をスキャンして未接続なら呼び出す
    scanInterval = setInterval(() => {
      for (let i = 1; i <= 20; i++) {
        if (i === myNum) continue;
        const targetID = `r_${room}_${pass}_${i}`;
        if (!activeCalls.has(targetID)) {
          const call = peer!.call(targetID, localStream);
          if (call) setupCallHandlers(call);
        }
      }
    }, 2000);
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    setupCallHandlers(call);
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      statusArea.innerText = "席が使われています。再入室してください。";
    }
    console.error("PeerError:", err);
  });
});

function setupCallHandlers(call: any) {
  call.on('stream', (remoteStream: MediaStream) => {
    if (activeCalls.has(call.peer)) return;
    activeCalls.set(call.peer, call);

    const container = document.createElement('div');
    container.id = `v-${call.peer}`;
    container.style.cssText = "position: relative; min-width: 220px; height: 100%; cursor: pointer;";
    const v = document.createElement('video');
    v.srcObject = remoteStream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 10px; background: #000; border: 1px solid #444;";
    
    container.onclick = () => {
      bigVideo.srcObject = remoteStream;
      bigVideo.muted = false; // 相手の声は出す
    };
    container.appendChild(v);
    videoGrid.appendChild(container);
    statusArea.innerText = `接続中: ${activeCalls.size}人の参加者`;
  });

  call.on('close', () => {
    document.getElementById(`v-${call.peer}`)?.remove();
    activeCalls.delete(call.peer);
    statusArea.innerText = `接続中: ${activeCalls.size}人の参加者`;
  });
}

document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());

init();