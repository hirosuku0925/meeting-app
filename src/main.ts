import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #1a1a1a; color: white; overflow: hidden;">
    <div style="width: 260px; background: #2c3e50; padding: 20px; display: flex; flex-direction: column; gap: 15px; z-index: 10;">
      <h2 style="color: #3498db; margin: 0; font-size: 20px;">🌐 超速会議室</h2>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <input id="room-id-input" type="text" placeholder="ルーム名" style="padding: 10px; border-radius: 5px; border: none; color: #333;">
        <input id="room-pass-input" type="password" placeholder="パスワード" style="padding: 10px; border-radius: 5px; border: none; color: #333;">
        <button id="join-room-btn" style="background: #3498db; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 16px;">今すぐ参加</button>
      </div>
      <div id="status-area" style="font-size: 11px; color: #2ecc71; text-align: center; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; min-height: 40px;">待機中</div>
      <div style="margin-top: auto; display: flex; flex-direction: column; gap: 10px;">
        <button id="hangup-btn" style="background: #e74c3c; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">退出</button>
        <div style="font-size: 10px; color: #95a5a6; text-align: center;">音源引用: OtoLogic</div>
      </div>
    </div>
    <div style="flex: 1; display: flex; flex-direction: column; background: #000;">
      <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <video id="big-video" autoplay playsinline muted style="max-width: 100%; max-height: 100%; border-radius: 12px; border: 1px solid #333;"></video>
      </div>
      <div id="video-grid" style="display: flex; gap: 10px; padding: 15px; background: rgba(0,0,0,0.5); overflow-x: auto; min-height: 160px;">
        <div style="position: relative; min-width: 200px; height: 130px;">
          <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 2px solid #3498db;"></video>
        </div>
      </div>
    </div>
  </div>
`

// 音源エラーで止まらないように空の関数でガード
const playSnd = (url: string) => {
  const a = new Audio(url);
  a.play().catch(() => {});
};

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
  } catch (e) { statusArea.innerText = "カメラを許可してください"; }
}

document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  playSnd('https://otologic.jp/free/se/bin/decision01.mp3');
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('room-pass-input') as HTMLInputElement).value.trim();
  if (!room || !pass) return alert("入力してね");

  if (peer) peer.destroy();
  connectedPeers.clear();

  // 1〜10番の席を高速スキャン
  const myNum = Math.floor(Math.random() * 10) + 1;
  const roomKey = `vroom-${room}-${pass}`;
  peer = new Peer(`${roomKey}-${myNum}`);

  peer.on('open', () => {
    statusArea.innerText = `入室完了！(席:${myNum})`;
    
    // 入室直後に、他の1〜10番全員に「同時に」接続を試みる
    for (let i = 1; i <= 10; i++) {
      if (i === myNum) continue;
      const targetID = `${roomKey}-${i}`;
      callTo(targetID);
    }
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
  });

  peer.on('error', () => { statusArea.innerText = "接続中..."; });
});

function callTo(id: string) {
  if (!peer || connectedPeers.has(id)) return;
  const call = peer.call(id, localStream);
  if (call) handleCall(call);
}

function handleCall(call: any) {
  call.on('stream', (stream: MediaStream) => {
    if (connectedPeers.has(call.peer)) return;
    connectedPeers.add(call.peer);
    playSnd('https://otologic.jp/free/se/bin/pon01.mp3');

    const container = document.createElement('div');
    container.id = `v-${call.peer}`;
    container.style.cssText = "min-width: 200px; height: 130px; cursor: pointer; position: relative;";
    const v = document.createElement('video');
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 8px; background: #000;";
    
    container.onclick = () => { bigVideo.srcObject = stream; bigVideo.muted = false; };
    container.appendChild(v);
    videoGrid.appendChild(container);
    statusArea.innerText = `現在 ${connectedPeers.size + 1}名`;
  });

  call.on('close', () => {
    document.getElementById(`v-${call.peer}`)?.remove();
    connectedPeers.delete(call.peer);
    statusArea.innerText = `現在 ${connectedPeers.size + 1}名`;
  });
}

document.querySelector('#hangup-btn')?.addEventListener('click', () => {
  playSnd('https://otologic.jp/free/se/bin/cancel01.mp3');
  setTimeout(() => location.reload(), 400);
});

init();