import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'
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
  .off { background: #ea4335 !important; }
  #needle-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; z-index: 5; }
  video { background: #222; border-radius: 8px; transition: opacity 0.3s; }
  
  /* プライバシー保護：自分の素顔（local-video）を画面から完全に消す */
  #local-video { display: none !important; }
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

      <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 12px; border-top: 1px solid #333; flex-shrink: 0; padding: 0 10px;">
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

// --- 3. 変数管理 ---
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const videoGrid = document.querySelector<HTMLDivElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLDivElement>('#status-badge')!;
const needleFrame = document.querySelector<HTMLIFrameElement>('#needle-frame')!;

let localStream: MediaStream;
let screenStream: MediaStream | null = null;
let peer: Peer | null = null;
let myName = "ゲスト";
const connectedPeers = new Set<string>();
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

// --- 4. 接続メインロジック ---

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: true, 
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
    });

    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    
    // ハウリング防止
    localVideo.muted = true;
    bigVideo.muted = true;

    statusBadge.innerText = "準備完了！";

    setupVoiceChangerButtonHandler();
    setupFaceAvatarButtonHandler('avatar-btn');
    
    const changedStream = await voiceChangerManager.init(localStream);
    const audioTrack = changedStream.getAudioTracks()[0];
    if (audioTrack) {
      localStream.removeTrack(localStream.getAudioTracks()[0]);
      localStream.addTrack(audioTrack);
    }
  } catch (e) { statusBadge.innerText = "カメラを許可してください"; }
}

function handleCall(call: MediaConnection) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);

  call.on('stream', (remoteStream) => {
    if (document.getElementById(call.peer)) return;
    const v = document.createElement('video');
    v.id = call.peer;
    v.srcObject = remoteStream;
    v.autoplay = true;
    v.playsInline = true;
    v.style.cssText = "height: 100%; min-width: 150px; cursor: pointer;";
    v.onclick = () => { 
      bigVideo.srcObject = remoteStream;
      // 相手を映すときはアバターを隠して音を出す
      needleFrame.style.display = 'none';
      bigVideo.style.opacity = '1';
      bigVideo.muted = false;
      document.querySelector('#avatar-btn')?.classList.remove('active');
    };
    videoGrid.appendChild(v);
  });

  call.on('close', () => {
    document.getElementById(call.peer)?.remove();
    connectedPeers.delete(call.peer);
  });
}

function startConnection(room: string) {
  if (peer) peer.destroy();
  const tryJoin = (index: number) => {
    const peerId = `vFINAL-${room}-${index}`;
    peer = new Peer(peerId);
    peer.on('open', () => {
      statusBadge.innerText = `入室中: ${myName} (席:${index})`;
      for (let i = 1; i < index; i++) {
        const targetId = `vFINAL-${room}-${i}`;
        const call = peer!.call(targetId, localStream);
        if (call) handleCall(call);
      }
    });
    peer.on('call', (call) => {
      call.answer(localStream);
      handleCall(call);
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') tryJoin(index + 1);
    });
  };
  tryJoin(1);
}

// --- 5. UIイベント ---

document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value;
  myName = (document.querySelector('#name-input') as HTMLInputElement).value || "ゲスト";
  if (!room) return alert("部屋名を入力してください");
  SettingsManager.setUserName(myName);
  SettingsManager.setLastRoomName(room);
  startConnection(room);
});

// アバターボタンの処理をプライバシー重視に改造
document.querySelector('#avatar-btn')?.addEventListener('click', (e) => {
  const isCurrentlyVisible = needleFrame.style.display === 'block';
  
  if (!isCurrentlyVisible) {
    // アバターを出すとき：iframeを表示し、背後の素顔(bigVideo)を透明にする
    needleFrame.style.display = 'block';
    bigVideo.style.opacity = '0';
    (e.currentTarget as HTMLElement).classList.add('active');
  } else {
    // アバターを消すとき：iframeを隠し、素顔を表示する
    needleFrame.style.display = 'none';
    bigVideo.style.opacity = '1';
    (e.currentTarget as HTMLElement).classList.remove('active');
  }
});

document.querySelector('#share-btn')?.addEventListener('click', async (e) => {
  if (!screenStream) {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    bigVideo.srcObject = screenStream;
    bigVideo.style.opacity = '1'; // 画面共有中は表示する
    needleFrame.style.display = 'none';
    (e.currentTarget as HTMLElement).classList.add('active');
  } else {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
    bigVideo.srcObject = localStream;
    (e.currentTarget as HTMLElement).classList.remove('active');
  }
});

document.querySelector('#record-btn')?.addEventListener('click', (e) => {
  const btn = e.currentTarget as HTMLElement;
  if (!recorder || recorder.state === 'inactive') {
    chunks = [];
    recorder = new MediaRecorder(localStream);
    recorder.ondataavailable = (ev) => chunks.push(ev.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'meeting-record.webm';
      a.click();
    };
    recorder.start();
    btn.classList.add('active');
  } else {
    recorder.stop();
    btn.classList.remove('active');
  }
});

init();