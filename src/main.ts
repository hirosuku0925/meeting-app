import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'
import { setupVoiceChangerButtonHandler } from './voice-changer-dialog'
import { setupFaceAvatarButtonHandler } from './face-image-avatar-dialog'

// --- 1. デザイン（マイク・チャット用を追加） ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: 2px solid #444; color: white; font-size: 20px; width: 50px; height: 50px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
  .tool-btn.active { background: #4facfe !important; }
  .tool-btn.off { background: #ea4335 !important; }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; gap: 5px; font-size: 10px; }
  #chat-box { position: absolute; bottom: 130px; right: 20px; width: 250px; height: 300px; background: rgba(0,0,0,0.8); border: 1px solid #444; display: none; flex-direction: column; z-index: 100; border-radius: 8px; }
  #chat-messages { flex: 1; overflow-y: auto; padding: 10px; font-size: 14px; }
  #chat-input { background: #222; border: none; border-top: 1px solid #444; color: white; padding: 10px; outline: none; }
  .video-container { position: relative; height: 100%; min-width: 200px; background: #222; border-radius: 8px; overflow: hidden; border: 1px solid #333; }
  #needle-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; z-index: 5; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML構造（マイク・チャットボタン追加） ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="height: 60vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain; z-index: 2;"></video>
      <iframe id="needle-frame" src="https://engine.needle.tools/samples-uploads/facefilter/?" allow="camera; microphone; fullscreen"></iframe>
      <div id="chat-box"><div id="chat-messages"></div><input id="chat-input" placeholder="メッセージ..."></div>
    </div>

    <div id="toolbar" style="height: 110px; background: #111; display: flex; align-items: center; justify-content: center; gap: 15px;">
      <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>CAM</span></div>
      <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>MIC</span></div>
      <div class="ctrl-group"><button id="avatar-btn" class="tool-btn">🎭</button><span>AVATAR</span></div>
      <div class="ctrl-group"><button id="chat-btn" class="tool-btn">💬</button><span>CHAT</span></div>
      <div style="display: flex; flex-direction: column; gap: 5px;"><input id="name-input" placeholder="名前" style="width: 80px;"><input id="room-input" placeholder="部屋" style="width: 80px;"></div>
      <button id="join-btn" style="background: #2ecc71; color: white; padding: 10px; border-radius: 5px;">参加</button>
    </div>

    <div id="video-grid" style="flex: 1; display: flex; gap: 10px; padding: 10px; overflow-x: auto;">
      <div id="local-container" class="video-container">
        <video id="local-video" autoplay playsinline muted style="height: 100%; width: 100%; object-fit: cover;"></video>
      </div>
    </div>
  </div>
`;

// --- 3. プログラム ---
let localStream: MediaStream;
let peer: Peer | null = null;
let isAvatarActive = false;
const calls = new Map<string, MediaConnection>();

const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const needleFrame = document.querySelector<HTMLIFrameElement>('#needle-frame')!;

// 【重要】アバターの映像を「自分の小さい画面」にも反映させるための処理
function updateAllLocalVideos(stream: MediaStream) {
  localVideo.srcObject = stream;
  bigVideo.srcObject = stream;
}

function getAvatarStream(): MediaStream | null {
  const canvas = needleFrame.contentWindow?.document.querySelector('canvas');
  return canvas ? (canvas as any).captureStream(30) : null;
}

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  updateAllLocalVideos(localStream);
  setupFaceAvatarButtonHandler('avatar-btn');
  setupVoiceChangerButtonHandler('voice-btn');
}

// ボタン：マイク
document.querySelector('#mic-btn')?.addEventListener('click', (e) => {
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !audioTrack.enabled);
});

// ボタン：チャット
document.querySelector('#chat-btn')?.addEventListener('click', () => {
  const box = document.getElementById('chat-box')!;
  box.style.display = box.style.display === 'flex' ? 'none' : 'flex';
});

// ボタン：アバター（自分の小画面も変えるように修正）
document.querySelector('#avatar-btn')?.addEventListener('click', (e) => {
  isAvatarActive = !isAvatarActive;
  needleFrame.style.display = isAvatarActive ? 'block' : 'none';
  (e.currentTarget as HTMLElement).classList.toggle('active', isAvatarActive);
  
  if (isAvatarActive) {
    // 1秒待ってからアバターの映像を取得して「自分」の画面にセット
    setTimeout(() => {
      const avStream = getAvatarStream();
      if (avStream) updateAllLocalVideos(avStream);
    }, 1000);
  } else {
    updateAllLocalVideos(localStream);
  }
});

init();