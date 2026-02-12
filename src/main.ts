import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #1a1a1a; color: white; overflow: hidden;">
    <div style="width: 260px; background: #2c3e50; padding: 20px; display: flex; flex-direction: column; gap: 15px; z-index: 10;">
      <h2 style="color: #3498db; margin: 0; font-size: 20px;">🌐 AI会議室</h2>
      
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <input id="room-id-input" type="text" placeholder="ルーム名" style="padding: 10px; border-radius: 5px; border: none; color: #333;">
        <input id="room-pass-input" type="password" placeholder="パスワード" style="padding: 10px; border-radius: 5px; border: none; color: #333;">
        <button id="join-room-btn" style="background: #3498db; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">会議に参加する</button>
      </div>

      <div id="status-area" style="font-size: 12px; color: #2ecc71; text-align: center; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px;">待機中</div>

      <div style="margin-top: auto;">
        <button id="hangup-btn" style="background: #e74c3c; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%;">退出（終了）</button>
      </div>
    </div>

    <div style="flex: 1; display: flex; flex-direction: column; background: #000;">
      <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <video id="big-video" autoplay playsinline muted style="max-width: 100%; max-height: 100%; border-radius: 12px;"></video>
      </div>
      <div id="video-grid" style="height: 180px; background: rgba(0,0,0,0.4); display: flex; gap: 15px; padding: 15px; overflow-x: auto; border-top: 1px solid #333;">
        <div style="position: relative; min-width: 220px; height: 100%;">
          <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px; border: 3px solid #3498db;"></video>
        </div>
      </div>
    </div>
  </div>
`

// --- 効果音の設定 ---
// 効果音ラボなどのURLを指定してください。
const joinSound = new Audio('https://otologic.jp/free/se/bin/decision01.mp3'); // 決定音
const exitSound = new Audio('https://otologic.jp/free/se/bin/cancel01.mp3');   // キャンセル音
const peerJoinSound = new Audio('https://otologic.jp/free/se/bin/pon01.mp3'); // 誰かが来た音

const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const videoGrid = document.querySelector('#video-grid')!;
const statusArea = document.querySelector<HTMLElement>('#status-area')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Map<string, any>();

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  bigVideo.srcObject = localStream;
}

// 参加ボタン
document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  joinSound.play(); // ★入室音を鳴らす
  
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.replace(/[^a-zA-Z0-9]/g, "");
  const pass = (document.getElementById('room-pass-input') as HTMLInputElement).value.replace(/[^a-zA-Z0-9]/g, "");
  if (!room || !pass) return;

  if (peer) peer.destroy();
  const myNum = Math.floor(Math.random() * 15) + 1;
  peer = new Peer(`room_${room}_${pass}_${myNum}`);

  peer.on('open', () => {
    statusArea.innerText = `入室しました (席:${myNum})`;
    setInterval(() => {
      for (let i = 1; i <= 15; i++) {
        if (i === myNum) continue;
        const targetID = `room_${room}_${pass}_${i}`;
        if (!connectedPeers.has(targetID)) {
          const call = peer!.call(targetID, localStream);
          if (call) setupCallHandlers(call);
        }
      }
    }, 3000);
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    setupCallHandlers(call);
  });
});

function setupCallHandlers(call: any) {
  call.on('stream', (remoteStream: MediaStream) => {
    if (connectedPeers.has(call.peer)) return;
    connectedPeers.set(call.peer, call);
    
    peerJoinSound.play(); // ★誰かが入ってきた時にポンと鳴らす

    const container = document.createElement('div');
    container.id = `v-${call.peer}`;
    container.style.cssText = "position: relative; min-width: 220px; height: 100%; cursor: pointer;";
    const v = document.createElement('video');
    v.srcObject = remoteStream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 10px; background: #000;";
    
    container.onclick = () => {
      bigVideo.srcObject = remoteStream;
      bigVideo.muted = false;
    };
    container.appendChild(v);
    videoGrid.appendChild(container);
  });
}

// 退出ボタン
document.querySelector('#hangup-btn')?.addEventListener('click', () => {
  exitSound.play(); // ★退出音を鳴らす
  setTimeout(() => location.reload(), 500); // 音を鳴らす時間を少し待ってからリロード
});

init();