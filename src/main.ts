import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'
import { setupVoiceChangerButtonHandler } from './voice-changer-dialog'
import { setupFaceAvatarButtonHandler } from './face-image-avatar-dialog'

// --- スタイルは元のシンプルさに戻しました ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .active { background: #4facfe !important; }
  .off { background: #ea4335 !important; }
  .name-overlay { 
    position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
    display: none; align-items: center; justify-content: center; 
    background: #222; font-size: 24px; font-weight: bold; z-index: 10;
  }
  .camera-off .name-overlay { display: flex; }
  .video-container { position: relative; height: 100%; min-width: 180px; background: #222; border-radius: 8px; overflow: hidden; }
  #needle-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; z-index: 5; }
`;
document.head.appendChild(globalStyle);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
    <div id="main-display" style="height: 60vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center;">
      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain; z-index: 2;"></video>
      <iframe id="needle-frame" src="https://engine.needle.tools/samples-uploads/facefilter/?" allow="camera; microphone; fullscreen"></iframe>
      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; font-size: 12px; z-index: 10;">準備OK</div>
    </div>
    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 12px;">
      <button id="cam-btn" class="tool-btn">📹</button>
      <button id="mic-btn" class="tool-btn">🎤</button>
      <button id="avatar-btn" class="tool-btn">🎭</button>
      <button id="chat-btn" class="tool-btn">💬</button>
      <input id="name-input" type="text" placeholder="名前" style="background: #222; border: 1px solid #444; color: white; padding: 10px; width: 85px;">
      <input id="room-input" type="text" placeholder="部屋名" style="background: #222; border: 1px solid #444; color: white; padding: 10px; width: 85px;">
      <button id="join-btn" style="background: #2ecc71; color: white; padding: 10px 15px; border-radius: 5px; font-weight: bold;">参加</button>
    </div>
    <div id="video-grid" style="flex: 1; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto;">
      <div id="local-container" class="video-container">
        <video id="local-video" autoplay playsinline muted style="height: 100%; width: 100%; object-fit: cover;"></video>
        <div id="local-name-tag" class="name-overlay">自分</div>
      </div>
    </div>
  </div>
`;

let localStream: MediaStream;
let peer: Peer | null = null;
let myName = "ゲスト";
let isAvatarActive = false;
const dataConns = new Map<string, DataConnection>();

const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const needleFrame = document.querySelector<HTMLIFrameElement>('#needle-frame')!;

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  bigVideo.srcObject = localStream;
  setupFaceAvatarButtonHandler('avatar-btn');
  setupVoiceChangerButtonHandler('voice-btn');
}

// カメラボタンの機能（修正：自分と相手に状態を伝える）
document.querySelector('#cam-btn')?.addEventListener('click', (e) => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  const btn = e.currentTarget as HTMLElement;
  btn.classList.toggle('off', !track.enabled);
  
  // 自分の画面に「名前」を出す
  document.getElementById('local-container')?.classList.toggle('camera-off', !track.enabled);
  
  // 相手にカメラの状態を送る
  dataConns.forEach(conn => conn.send({ type: 'state', cam: track.enabled }));
});

// アバターボタンの機能（修正：自分側の小画面も変える）
document.querySelector('#avatar-btn')?.addEventListener('click', (e) => {
  isAvatarActive = !isAvatarActive;
  needleFrame.style.display = isAvatarActive ? 'block' : 'none';
  (e.currentTarget as HTMLElement).classList.toggle('active', isAvatarActive);
  
  if (isAvatarActive) {
    setTimeout(() => {
      const canvas = needleFrame.contentWindow?.document.querySelector('canvas');
      const avStream = canvas ? (canvas as any).captureStream(30) : null;
      if (avStream) {
        localVideo.srcObject = avStream;
        bigVideo.srcObject = avStream;
      }
    }, 1000);
  } else {
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
  }
});

// マイクボタン（機能追加）
document.querySelector('#mic-btn')?.addEventListener('click', (e) => {
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !audioTrack.enabled);
});

init();