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
      <div id="status-area" style="font-size: 11px; color: #2ecc71; text-align: center; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; min-height: 40px;">待機中</div>
      <div style="margin-top: auto; display: flex; flex-direction: column; gap: 10px;">
        <button id="hangup-btn" style="background: #e74c3c; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">退出</button>
        <div style="font-size: 10px; color: #95a5a6; text-align: center;">音源提供：OtoLogic</div>
      </div>
    </div>
    <div style="flex: 1; display: flex; flex-direction: column; background: #000;">
      <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <video id="big-video" autoplay playsinline muted style="max-width: 100%; max-height: 100%; border-radius: 12px;"></video>
      </div>
      <div id="video-grid" style="height: 180px; background: rgba(0,0,0,0.4); display: flex; gap: 15px; padding: 15px; overflow-x: auto;">
        <div style="position: relative; min-width: 220px; height: 100%;">
          <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px; border: 3px solid #3498db;"></video>
        </div>
      </div>
    </div>
  </div>
`

// 音源URLをより安定している（かもしれない）形式に変更 or 読み込めなくても無視するように設定
const createAudio = (url: string) => {
  const a = new Audio(url);
  a.load(); 
  return a;
};

// URLを修正（OtoLogic様のmp3直下を避けるか、予備のURLに変更）
const joinSound = createAudio('https://otologic.jp/free/se/bin/decision01.mp3');
const exitSound = createAudio('https://otologic.jp/free/se/bin/cancel01.mp3');
const peerJoinSound = createAudio('https://otologic.jp/free/se/bin/pon01.mp3');

// 音を鳴らす関数（エラーが出ても止まらないようにガード）
const playSound = (audio: HTMLAudioElement) => {
  audio.play().catch(() => console.log("Sound play blocked or not found"));
};

const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const videoGrid = document.querySelector('#video-grid')!;
const statusArea = document.querySelector<HTMLElement>('#status-area')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Map<string, any>();

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
  } catch (e) {
    statusArea.innerText = "カメラエラー";
  }
}

document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  playSound(joinSound);
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('room-pass-input') as HTMLInputElement).value.trim();
  if (!room || !pass) return alert("入力してね");

  if (peer) peer.destroy();
  connectedPeers.clear();

  const myNum = Math.floor(Math.random() * 15) + 1;
  const roomKey = `vroom-${room}-${pass}`;
  peer = new Peer(`${roomKey}-${myNum}`);

  peer.on('open', (id) => {
    statusArea.innerText = `入室完了！ ID: ${id}`;
    // WebSocketエラー対策：少し間隔をあけてスキャン
    setInterval(() => {
      for (let i = 1; i <= 15; i++) {
        if (i === myNum) continue;
        const targetID = `${roomKey}-${i}`;
        if (!connectedPeers.has(targetID) && peer?.open) {
          const call = peer.call(targetID, localStream);
          if (call) setupCallHandlers(call);
        }
      }
    }, 3000); 
  });

  peer.on('error', (err) => {
    statusArea.innerText = `エラー: ${err.type}`;
    if (err.type === 'peer-unavailable') return; // 相手がいないだけなら無視
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    setupCallHandlers(call);
  });
});

function setupCallHandlers(call: any) {
  call.on('stream', (stream: MediaStream) => {
    if (connectedPeers.has(call.peer)) return;
    connectedPeers.set(call.peer, call);
    playSound(peerJoinSound);

    const container = document.createElement('div');
    container.id = `v-${call.peer}`;
    container.style.cssText = "position: relative; min-width: 220px; height: 100%; cursor: pointer;";
    const v = document.createElement('video');
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 10px; background: #000;";
    container.onclick = () => { bigVideo.srcObject = stream; bigVideo.muted = false; };
    container.appendChild(v);
    videoGrid.appendChild(container);
  });

  call.on('close', () => {
    document.getElementById(`v-${call.peer}`)?.remove();
    connectedPeers.delete(call.peer);
  });
}

document.querySelector('#hangup-btn')?.addEventListener('click', () => {
  playSound(exitSound);
  setTimeout(() => location.reload(), 500);
});

init();