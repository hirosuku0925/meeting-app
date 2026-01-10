import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #1a1a1a; color: white;">
    <div style="width: 260px; background: #2c3e50; padding: 20px; display: flex; flex-direction: column; gap: 15px;">
      <h2 style="color: #3498db; margin: 0; font-size: 18px;">🌐 シンプル会議</h2>
      
      <div style="background: #34495e; padding: 10px; border-radius: 5px; font-size: 12px;">
        1. 部屋名を決めて「開始」<br>
        2. 相手も同じ部屋名で「開始」
      </div>

      <input id="room-id-input" type="text" placeholder="部屋名（英数字のみ）" style="padding: 10px; border-radius: 5px; border: none; color: #333;">
      <button id="join-room-btn" style="background: #3498db; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">会議を開始する</button>

      <div id="status-area" style="font-size: 12px; color: #f1c40f; margin-top: 10px; white-space: pre-wrap;">待機中...</div>
      
      <button id="hangup-btn" style="background: #e74c3c; color: white; border: none; padding: 10px; border-radius: 8px; cursor: pointer; margin-top: auto;">リセット（退出）</button>
    </div>

    <div style="flex: 1; display: flex; flex-direction: column; background: #000;">
      <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <video id="big-video" autoplay playsinline muted style="max-width: 100%; max-height: 100%; border-radius: 12px; border: 1px solid #333;"></video>
      </div>
      <div id="video-grid" style="height: 180px; background: rgba(0,0,0,0.5); display: flex; gap: 10px; padding: 15px; overflow-x: auto;">
        <div style="position: relative; min-width: 200px; height: 100%;">
          <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px; border: 2px solid #3498db;"></video>
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
    statusArea.innerText = "エラー: カメラが見つかりません";
  }
}

document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.replace(/[^a-zA-Z0-9]/g, "");
  if (!room) return alert("部屋名を英数字で入力してください");

  if (peer) peer.destroy();
  
  // 自分の番号を1〜5に絞って当たりやすくする
  const myNum = Math.floor(Math.random() * 5) + 1;
  peer = new Peer(`simple-${room}-${myNum}`);

  peer.on('open', (id) => {
    statusArea.innerText = `あなたのID: ${id}\n接続中...`;
    
    // 他の1〜5番の人に一回だけ電話をかける
    for (let i = 1; i <= 5; i++) {
      if (i === myNum) continue;
      const call = peer!.call(`simple-${room}-${i}`, localStream);
      if (call) handleCall(call);
    }
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
  });

  peer.on('error', (err) => {
    statusArea.innerText = `エラー発生: ${err.type}`;
    console.error(err);
  });
});

function handleCall(call: any) {
  call.on('stream', (stream: MediaStream) => {
    if (connectedPeers.has(call.peer)) return;
    connectedPeers.add(call.peer);

    const v = document.createElement('video');
    v.srcObject = stream;
    v.autoplay = true; v.playsInline = true;
    v.style.cssText = "min-width: 200px; height: 100%; object-fit: cover; border-radius: 10px; border: 1px solid #fff; cursor: pointer;";
    v.onclick = () => { bigVideo.srcObject = stream; bigVideo.muted = false; };
    
    videoGrid.appendChild(v);
    statusArea.innerText = "相手と繋がりました！";
  });
}

document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());

init();