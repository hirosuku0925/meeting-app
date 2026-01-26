import './style.css'
import { Peer, type MediaConnection } from 'peerjs'
import voiceChangerManager from './voice-changer-manager'
import { setupVoiceChangerButtonHandler } from './voice-changer-dialog'
import { setupFaceAvatarButtonHandler } from './face-image-avatar-dialog'
import SettingsManager from './settings-manager'

// --- 1. スタイル設定 ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
  .tool-btn:hover { background: #444; transform: scale(1.1); }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; font-size: 10px; color: #888; gap: 4px; }
  .active { background: #4facfe !important; }
  
  #needle-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; z-index: 5; }
  video { background: #222; border-radius: 8px; transition: opacity 0.3s; }
  #local-video { display: none !important; }

  .video-container { 
    position: relative; 
    width: 220px; 
    height: 165px; 
    background: #222; 
    border-radius: 10px; 
    overflow: hidden; 
    cursor: pointer;
    border: 2px solid #333;
    flex-shrink: 0;
  }
  .video-container:hover { border-color: #4facfe; }
  .remote-video { width: 100%; height: 100%; object-fit: cover; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML構造 ---
const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.innerHTML = `
    <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
      <div id="main-display" style="height: 60vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
        <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain;"></video>
        <iframe id="needle-frame" src="https://engine.needle.tools/samples-uploads/facefilter/?" allow="camera; microphone; fullscreen"></iframe>
        <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">準備中...</div>
      </div>
      <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 12px; border-top: 1px solid #333; flex-shrink: 0;">
        <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>マイク</span></div>
        <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>カメラ</span></div>
        <div class="ctrl-group"><button id="share-btn" class="tool-btn">📺</button><span>画面共有</span></div>
        <div class="ctrl-group"><button id="record-btn" class="tool-btn">🔴</button><span>録画</span></div>
        <div class="ctrl-group"><button id="avatar-btn" class="tool-btn">🎭</button><span>アバター</span></div>
        <div class="ctrl-group"><button id="voice-changer-btn" class="tool-btn">🎙️</button><span>ボイス</span></div>
        <input id="name-input" type="text" placeholder="名前" style="background: #222; color: white; padding: 10px; border-radius: 5px; width: 80px;">
        <input id="room-input" type="text" placeholder="部屋" style="background: #222; color: white; padding: 10px; border-radius: 5px; width: 80px;">
        <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer;">参加</button>
      </div>
      <div id="video-grid" style="flex: 1; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; align-items: center; justify-content: center;">
        <video id="local-video" autoplay playsinline muted></video>
      </div>
    </div>
  `;
}

const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const videoGrid = document.querySelector<HTMLDivElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLDivElement>('#status-badge')!;
const needleFrame = document.querySelector<HTMLIFrameElement>('#needle-frame')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Map<string, MediaConnection>();

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: true, 
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
    });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    bigVideo.style.opacity = '1';
    
    setupVoiceChangerButtonHandler();
    setupFaceAvatarButtonHandler('avatar-btn');
    statusBadge.innerText = "準備完了";
  } catch (e) { statusBadge.innerText = "カメラを許可してください"; }
}

function handleCall(call: MediaConnection) {
  // 自分自身や重複を排除
  if (peer && call.peer === peer.id) return;
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.set(call.peer, call);

  call.on('stream', (remoteStream) => {
    let v = document.getElementById(`video-${call.peer}`) as HTMLVideoElement;
    if (v) return;

    const container = document.createElement('div');
    container.id = `container-${call.peer}`;
    container.className = "video-container";

    v = document.createElement('video');
    v.id = `video-${call.peer}`;
    v.className = "remote-video";
    v.autoplay = true;
    v.playsInline = true;
    v.srcObject = remoteStream;

    // 再生監視
    const playInterval = setInterval(() => {
      if (v.paused && v.readyState >= 2) {
        v.play().catch(() => {});
      } else if (!v.paused) {
        clearInterval(playInterval);
      }
    }, 1000);

    container.appendChild(v);
    videoGrid.appendChild(container);

    container.onclick = () => { 
      bigVideo.srcObject = remoteStream;
      bigVideo.style.opacity = '1';
      needleFrame.style.display = 'none';
      document.querySelector('#avatar-btn')?.classList.remove('active');
    };
  });

  call.on('close', () => {
    document.getElementById(`container-${call.peer}`)?.remove();
    connectedPeers.delete(call.peer);
  });
}

function startConnection(room: string) {
  if (peer) peer.destroy();
  connectedPeers.clear();
  videoGrid.innerHTML = ''; // グリッドを清掃

  const tryJoin = (index: number) => {
    const myId = `vFINAL-${room}-${index}`;
    peer = new Peer(myId);

    peer.on('open', (id) => {
      statusBadge.innerText = `席${index}に入室`;
      
      setTimeout(() => {
        for (let i = 1; i < index; i++) {
          const targetId = `vFINAL-${room}-${i}`;
          if (targetId === id) continue; // 自分なら飛ばす
          const call = peer!.call(targetId, localStream);
          if (call) handleCall(call);
        }
      }, 1000);
    });

    peer.on('call', (call) => {
      call.answer(localStream);
      handleCall(call);
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') tryJoin(index + 1);
      else console.error("Peer Error:", err);
    });
  };
  tryJoin(1);
}

// --- UIイベント ---
document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value;
  if (!room) return alert("部屋名を入力してください");
  startConnection(room);
});

document.querySelector('#avatar-btn')?.addEventListener('click', (e) => {
  const btn = e.currentTarget as HTMLElement;
  const isNowOff = needleFrame.style.display === 'none' || needleFrame.style.display === '';

  if (isNowOff) {
    // アバターON
    needleFrame.style.display = 'block';
    bigVideo.style.opacity = '0';
    btn.classList.add('active');
    // 💡 映像トラックは止めない（黒画面対策）。
    // その代わり、送信側のカメラをミュートにするなどの処理が必要な場合はここで行う
  } else {
    // アバターOFF
    needleFrame.style.display = 'none';
    bigVideo.style.opacity = '1';
    btn.classList.remove('active');
  }
});

init();