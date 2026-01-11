import './style.css'
import { Peer } from 'peerjs'

// 1. まずページ全体の余白を消すための設定を注入
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; }
  body, html { 
    margin: 0; 
    padding: 0; 
    width: 100%; 
    height: 100%; 
    overflow: hidden; 
    background: #000;
  }
  #app { width: 100%; height: 100%; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; margin-bottom: 4px; }
  .tool-btn:hover { background: #444; }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; font-size: 10px; color: #888; }
  .off { background: #ea4335 !important; }
`;
document.head.appendChild(globalStyle);

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="conference-root" style="display: flex; height: 100vh; width: 100%; font-family: sans-serif; background: #000; color: white; overflow: hidden; flex-direction: column;">
    
    <div id="main-display" style="flex: 1; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden; width: 100%;">
      <video id="big-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: contain;"></video>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.6); padding: 4px 12px; border-radius: 20px; border: 1px solid #4facfe; font-size: 11px; z-index: 10;">待機中</div>
      
      <div id="chat-box" style="display:none; position: absolute; right: 10px; top: 10px; bottom: 10px; width: 220px; background: rgba(30,30,30,0.9); border-radius: 8px; flex-direction: column; border: 1px solid #444; z-index: 100;">
        <div style="padding: 8px; border-bottom: 1px solid #444; font-size: 12px; font-weight: bold;">チャット</div>
        <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 11px;"></div>
        <div style="padding: 8px; display: flex; gap: 5px;">
          <input id="chat-input" type="text" style="flex: 1; background: #222; border: 1px solid #555; color: white; border-radius: 4px; padding: 5px; font-size: 11px;">
          <button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 5px; border-radius: 4px; font-size: 11px;">送信</button>
        </div>
      </div>
    </div>

    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 12px; border-top: 1px solid #333; flex-shrink: 0; width: 100%;">
      <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>マイク</span></div>
      <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>カメラ</span></div>
      <div class="ctrl-group"><button id="record-btn" class="tool-btn">🔴</button><span>録画</span></div>
      <div class="ctrl-group"><button id="chat-toggle-btn" class="tool-btn">💬</button><span>チャット</span></div>
      
      <div style="width: 1px; height: 40px; background: #444; margin: 0 10px;"></div>
      
      <input id="room-input" type="text" placeholder="ルーム名" style="background: #222; border: 1px solid #444; color: white; padding: 10px; border-radius: 5px; width: 100px;">
      <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 10px 18px; border-radius: 5px; cursor: pointer; font-weight: bold;">参加</button>
      <button id="exit-btn" style="background: #ea4335; color: white; border: none; padding: 10px 18px; border-radius: 5px; cursor: pointer;">退出</button>
    </div>

    <div id="video-grid" style="height: 140px; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; align-items: center; justify-content: center; width: 100%;">
      <div style="height: 100%; min-width: 180px; position: relative; border-radius: 8px; overflow: hidden; border: 2px solid #4facfe; flex-shrink: 0;">
        <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover;"></video>
      </div>
    </div>
  </div>
`

// --------------------------------------------------
// 以下、ロジック部分は前回の型エラー修正済みを継承
// --------------------------------------------------

const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const videoGrid = document.querySelector<HTMLElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLElement>('#status-badge')!;
const chatBox = document.querySelector<HTMLElement>('#chat-box')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
  } catch (e) { 
    if (statusBadge) statusBadge.innerText = "カメラエラー"; 
  }
}

document.querySelector('#mic-btn')?.addEventListener('click', (e) => {
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
});

document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
});

document.querySelector('#chat-toggle-btn')?.addEventListener('click', () => {
  chatBox.style.display = chatBox.style.display === 'none' ? 'flex' : 'none';
});

function join() {
  const roomInput = document.querySelector<HTMLInputElement>('#room-input');
  const room = roomInput ? roomInput.value.trim() : "";
  if (!room) return;

  const roomKey = `v5-center-${room}`;
  const mySeat = Math.floor(Math.random() * 20) + 1;
  peer = new Peer(`${roomKey}-${mySeat}`);
  
  peer.on('open', (id) => {
    if (statusBadge) statusBadge.innerText = `参加中: ${id}`;
    setInterval(() => {
      if (!peer || peer.destroyed) return;
      for(let i=1; i<=20; i++){
        const target = `${roomKey}-${i}`;
        if(id !== target && !connectedPeers.has(target)){
          const call = peer.call(target, localStream);
          if(call) handleCall(call);
        }
      }
    }, 4000);
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
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
    v.style.cssText = "height: 100%; min-width: 180px; border-radius: 8px; background: #222; cursor: pointer; object-fit: cover; flex-shrink: 0;";
    v.onclick = () => { bigVideo.srcObject = stream; };
    videoGrid.appendChild(v);
    bigVideo.srcObject = stream;
  });
}

document.querySelector('#join-btn')?.addEventListener('click', join);
document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

init();