import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="conference-root" style="display: flex; height: 100vh; width: 100vw; font-family: sans-serif; background: #000; color: white; overflow: hidden; flex-direction: column;">
    
    <div id="main-display" style="flex: 1; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center;">
      <video id="big-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: contain;"></video>
      <canvas id="avatar-canvas" style="display:none; position:absolute; width:100%; height:100%; object-fit:contain;"></canvas>
      <div id="status-badge" style="position: absolute; top: 20px; left: 20px; background: rgba(0,0,0,0.6); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px;">待機中</div>
      
      <div id="chat-box" style="display:none; position: absolute; right: 20px; top: 20px; bottom: 100px; width: 250px; background: rgba(30,30,30,0.9); border-radius: 10px; flex-direction: column; border: 1px solid #444; z-index: 100;">
        <div style="padding: 10px; border-bottom: 1px solid #444; font-weight: bold; font-size: 14px;">チャット</div>
        <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 12px;"></div>
        <div style="padding: 10px; display: flex; gap: 5px;">
          <input id="chat-input" type="text" style="flex: 1; background: #222; border: 1px solid #555; color: white; border-radius: 4px; padding: 5px;">
          <button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 5px 10px; border-radius: 4px; cursor: pointer;">送信</button>
        </div>
      </div>
    </div>

    <div id="toolbar" style="height: 80px; background: #111; display: flex; align-items: center; justify-content: center; gap: 15px; border-top: 1px solid #333; z-index: 110;">
      <div style="display: flex; flex-direction: column; align-items: center;">
        <button id="mic-btn" class="tool-btn">🎤</button>
        <span style="font-size: 10px;">マイク</span>
      </div>
      <div style="display: flex; flex-direction: column; align-items: center;">
        <button id="cam-btn" class="tool-btn">📹</button>
        <span style="font-size: 10px;">カメラ</span>
      </div>
      <div style="display: flex; flex-direction: column; align-items: center;">
        <button id="bg-btn" class="tool-btn">🖼️</button>
        <span style="font-size: 10px;">背景</span>
      </div>
      <div style="display: flex; flex-direction: column; align-items: center;">
        <button id="avatar-btn" class="tool-btn">🎭</button>
        <span style="font-size: 10px;">アバター</span>
      </div>
      <div style="display: flex; flex-direction: column; align-items: center;">
        <button id="chat-toggle-btn" class="tool-btn">💬</button>
        <span style="font-size: 10px;">チャット</span>
      </div>
      <div style="display: flex; flex-direction: column; align-items: center;">
        <button id="record-btn" class="tool-btn">🔴</button>
        <span style="font-size: 10px;">録画</span>
      </div>
      <div style="width: 1px; height: 40px; background: #444;"></div>
      <input id="room-input" type="text" placeholder="ルーム名" style="background: #222; border: 1px solid #444; color: white; padding: 8px; border-radius: 4px; width: 100px;">
      <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold;">参加</button>
      <button id="exit-btn" style="background: #ea4335; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold;">退出</button>
    </div>

    <div id="video-grid" style="height: 120px; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; align-items: center; border-top: 1px solid #222;">
      <video id="local-video" autoplay playsinline muted style="height: 100%; border-radius: 8px; border: 2px solid #4facfe;"></video>
    </div>
  </div>
`

// CSSの追加
const style = document.createElement('style');
style.textContent = `
  .tool-btn { background: #333; border: none; color: white; font-size: 20px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; transition: 0.2s; }
  .tool-btn:hover { background: #444; transform: scale(1.1); }
  .active { background: #4facfe !important; }
  .off { background: #ea4335 !important; }
`;
document.head.appendChild(style);

// 要素の取得
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const videoGrid = document.querySelector('#video-grid')!;
const statusBadge = document.querySelector('#status-badge')!;
const chatBox = document.querySelector<HTMLElement>('#chat-box')!;
const chatMessages = document.querySelector('#chat-messages')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Map<string, any>();
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

// カメラ・マイク初期化
async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  bigVideo.srcObject = localStream;
}

// ボタンイベント：カメラ・マイク
document.querySelector('#mic-btn')?.addEventListener('click', (e) => {
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  (e.target as HTMLElement).classList.toggle('off', !audioTrack.enabled);
});

document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  const videoTrack = localStream.getVideoTracks()[0];
  videoTrack.enabled = !videoTrack.enabled;
  (e.target as HTMLElement).classList.toggle('off', !videoTrack.enabled);
});

// チャット機能
document.querySelector('#chat-toggle-btn')?.addEventListener('click', () => {
  chatBox.style.display = chatBox.style.display === 'none' ? 'flex' : 'none';
});

document.querySelector('#chat-send-btn')?.addEventListener('click', sendMsg);
function sendMsg() {
  const input = document.querySelector<HTMLInputElement>('#chat-input')!;
  if (!input.value) return;
  const msg = document.createElement('div');
  msg.innerText = `自分: ${input.value}`;
  chatMessages.appendChild(msg);
  // 本来はPeer経由で送信する処理が必要
  input.value = "";
}

// 録画機能
document.querySelector('#record-btn')?.addEventListener('click', (e) => {
  const btn = e.target as HTMLElement;
  if (!recorder || recorder.state === 'inactive') {
    chunks = [];
    recorder = new MediaRecorder(localStream);
    recorder.ondataavailable = (ev) => chunks.push(ev.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'record.webm'; a.click();
    };
    recorder.start();
    btn.classList.add('active');
    btn.innerText = "⏹️";
  } else {
    recorder.stop();
    btn.classList.remove('active');
    btn.innerText = "🔴";
  }
});

// 背景・アバター（デモ用。本来はAIモデル読み込みが必要）
document.querySelector('#bg-btn')?.addEventListener('click', () => {
  alert("背景ぼかし機能を起動します（このデモではUIのみ）");
});
document.querySelector('#avatar-btn')?.addEventListener('click', () => {
  alert("アバターモードに切り替えます（AIモデル準備中）");
});

// 接続ロジック
function join() {
  const room = (document.querySelector<HTMLInputElement>('#room-input')!).value;
  if (!room) return;
  const roomKey = `zoom-ultra-${room}`;
  peer = new Peer(`${roomKey}-${Math.floor(Math.random()*10)}`);
  
  peer.on('open', (id) => {
    statusBadge.innerText = `参加中: ${id}`;
    setInterval(() => {
      for(let i=1; i<10; i++){
        const target = `${roomKey}-${i}`;
        if(id !== target && !connectedPeers.has(target)){
          const call = peer!.call(target, localStream);
          if(call) handleCall(call);
        }
      }
    }, 5000);
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
  });
}

function handleCall(call: any) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.set(call.peer, call);

  call.on('stream', (stream: MediaStream) => {
    if (document.getElementById(call.peer)) return;
    const v = document.createElement('video');
    v.id = call.peer;
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "height: 100%; border-radius: 8px; background: #222; cursor: pointer;";
    v.onclick = () => { bigVideo.srcObject = stream; };
    videoGrid.appendChild(v);
    bigVideo.srcObject = stream;
  });
}

document.querySelector('#join-btn')?.addEventListener('click', join);
document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

init();