import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="conference-root" style="display: flex; height: 100vh; font-family: sans-serif; background: #000; color: white; overflow: hidden; flex-direction: column;">
    
    <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; background: #000; position: relative;">
      <video id="big-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: contain;"></video>
      
      <div id="status-area" style="position: absolute; top: 20px; left: 20px; font-size: 14px; background: rgba(0,0,0,0.7); padding: 10px 20px; border-radius: 30px; border: 1px solid #4facfe; z-index: 10;">
        ルーム名を入力して「参加」してください
      </div>

      <div id="controls" style="position: absolute; bottom: 30px; display: flex; gap: 10px; background: rgba(0,0,0,0.6); padding: 15px; border-radius: 15px; backdrop-filter: blur(10px); z-index: 10; transition: opacity 0.3s;">
        <input id="room-id-input" type="text" placeholder="ルーム名" style="padding: 10px; border-radius: 5px; border: none; background: #333; color: white; width: 150px;">
        <button id="join-room-btn" style="background: #4facfe; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold;">参加して全画面にする</button>
        <button id="hangup-btn" style="background: #ff4b2b; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">終了</button>
      </div>
    </div>

    <div id="video-grid" style="height: 140px; background: #111; display: flex; gap: 10px; padding: 10px; overflow-x: auto; border-top: 1px solid #333; align-items: center;">
      <div style="min-width: 160px; height: 100%; position: relative;">
        <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 2px solid #4facfe; cursor: pointer;"></video>
      </div>
    </div>
  </div>
`

const root = document.querySelector<HTMLElement>('#conference-root')!;
const videoGrid = document.querySelector('#video-grid')!;
const statusArea = document.querySelector<HTMLElement>('#status-area')!;
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
  } catch (e) { statusArea.innerText = "カメラエラー"; }
}

// 参加ボタンを押した時に全画面化と接続を同時に行う
document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  if (!room) return alert("ルーム名を入れてね");

  // 【重要】ユーザーのクリック直後なら全画面化が許可される
  if (!document.fullscreenElement) {
    root.requestFullscreen().catch(() => {
      console.log("全画面化に失敗しましたが、接続は継続します");
    });
  }

  // 接続開始
  tryJoin(room, 1);
  
  // 操作パネルを少し透明にして邪魔にならないようにする
  (document.querySelector('#controls') as HTMLElement).style.opacity = "0.3";
});

function tryJoin(room: string, seatNumber: number) {
  if (seatNumber > 20) return;
  const roomKey = `fs-room-${room}`;
  const myID = `${roomKey}-${seatNumber}`;
  
  if (peer) peer.destroy();
  peer = new Peer(myID);

  peer.on('open', () => {
    statusArea.innerHTML = `✅ ${seatNumber}番席で入室成功！他の人をスキャン中...`;
    setInterval(() => {
      if (!peer || peer.destroyed) return;
      for (let i = 1; i <= 20; i++) {
        const target = `${roomKey}-${i}`;
        if (i !== seatNumber && !connectedPeers.has(target)) {
          const call = peer.call(target, localStream);
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
    if (err.type === 'unavailable-id') tryJoin(room, seatNumber + 1);
  });
}

function handleCall(call: any) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);

  call.on('stream', (stream: MediaStream) => {
    if (document.getElementById(call.peer)) return;
    const container = document.createElement('div');
    container.id = call.peer;
    container.style.cssText = "min-width: 160px; height: 100%; position: relative; cursor: pointer;";
    const v = document.createElement('video');
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 8px; background: #222;";
    container.onclick = () => { bigVideo.srcObject = stream; };
    container.appendChild(v);
    videoGrid.appendChild(container);
    bigVideo.srcObject = stream;
  });
}

document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());
init();