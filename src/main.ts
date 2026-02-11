import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'
import voiceChangerManager from './voice-changer-manager'
import { setupVoiceChangerButtonHandler } from './voice-changer-dialog'
import { setupFaceAvatarButtonHandler } from './face-image-avatar-dialog'
import SettingsManager from './settings-manager'

/* ===============================
   1. グローバルスタイル
================================ */
const globalStyle = document.createElement('style');
globalStyle.textContent = `
*{box-sizing:border-box;margin:0;padding:0;}
body,html{width:100%;height:100%;overflow:hidden;background:#000;color:white;font-family:sans-serif;}
.tool-btn{background:#333;border:none;color:white;font-size:18px;width:45px;height:45px;border-radius:50%;cursor:pointer;transition:.2s;display:flex;align-items:center;justify-content:center;}
.tool-btn:hover{background:#444;transform:scale(1.1);}
.ctrl-group{display:flex;flex-direction:column;align-items:center;font-size:10px;color:#888;gap:4px;}
.off{background:#ea4335!important;}
.active{background:#4facfe!important;}
.chat-msg{margin-bottom:5px;word-break:break-all;}
.chat-msg.me{color:#4facfe;}
.video-container{position:relative;height:100%;min-width:180px;background:#222;border-radius:8px;overflow:hidden;cursor:pointer;border:1px solid #333;}
`;
document.head.appendChild(globalStyle);

/* ===============================
   2. DOM取得
================================ */
const app = document.querySelector<HTMLDivElement>('#app')!;
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const videoGrid = document.querySelector<HTMLDivElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLDivElement>('#status-badge')!;
const chatBox = document.querySelector<HTMLDivElement>('#chat-box')!;
const chatMessages = document.querySelector<HTMLDivElement>('#chat-messages')!;
const micBtn = document.querySelector<HTMLButtonElement>('#mic-btn')!;
const camBtn = document.querySelector<HTMLButtonElement>('#cam-btn')!;
const shareBtn = document.querySelector<HTMLButtonElement>('#share-btn')!;
const recordBtn = document.querySelector<HTMLButtonElement>('#record-btn')!;
const chatToggleBtn = document.querySelector<HTMLButtonElement>('#chat-toggle-btn')!;

/* ===============================
   3. 変数管理
================================ */
let localStream: MediaStream;
let screenStream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];

let peer: Peer | null = null;
let myName = "ゲスト";

const connectedPeers = new Set<string>();
const dataConnections = new Map<string, DataConnection>();
const mediaConnections = new Map<string, MediaConnection>();

/* ===============================
   4. 初期化
================================ */
async function init() {
  if (localStream) return;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    statusBadge.innerText = "準備完了";

    setupFaceAvatarButtonHandler('avatar-btn');
    setupVoiceChangerButtonHandler();

  } catch {
    statusBadge.innerText = "カメラを許可してください";
  }
}

/* ===============================
   5. Peer接続
================================ */
function tryNextSeat(roomKey: string, seat: number) {
  if (peer) peer.destroy();
  peer = new Peer(`${roomKey}-${seat}`);

  peer.on('open', () => {
    statusBadge.innerText = `席${seat}で接続中...`;
    setTimeout(() => {
      for (let i = 1; i < seat; i++) {
        const target = `${roomKey}-${i}`;
        const call = peer!.call(target, screenStream || localStream);
        if (call) handleCall(call);
        const conn = peer!.connect(target);
        if (conn) handleDataConnection(conn);
      }
    }, 1000);
  });

  peer.on('call', (call) => {
    call.answer(screenStream || localStream);
    handleCall(call);
  });

  peer.on('connection', handleDataConnection);
  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') tryNextSeat(roomKey, seat + 1);
  });
}

function handleCall(call: MediaConnection) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);
  mediaConnections.set(call.peer, call);

  call.on('stream', (stream) => {
    const container = document.createElement('div');
    container.className = "video-container";
    const v = document.createElement('video');
    v.srcObject = stream;
    v.autoplay = true;
    v.playsInline = true;
    v.style.width = "100%";
    v.style.height = "100%";
    v.style.objectFit = "cover";
    container.appendChild(v);
    videoGrid.appendChild(container);

    container.onclick = () => {
      bigVideo.srcObject = stream;
      bigVideo.muted = false;
    };
  });

  call.on('close', () => {
    mediaConnections.delete(call.peer);
    connectedPeers.delete(call.peer);
  });
}

function handleDataConnection(conn: DataConnection) {
  dataConnections.set(conn.peer, conn);
  conn.on('data', (data: any) => {
    if (data?.name) appendMessage(data.name, data.message);
  });
}

/* ===============================
   6. ストリーム差し替え
================================ */
function replaceStream(stream: MediaStream) {
  mediaConnections.forEach(call => {
    call.peerConnection.getSenders().forEach(sender => {
      const track = stream.getTracks().find(t => t.kind === sender.track?.kind);
      if (track) sender.replaceTrack(track);
    });
  });
}

/* ===============================
   7. UIイベント
================================ */

// 🎤 マイク
micBtn.onclick = () => {
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  micBtn.classList.toggle('off', !track.enabled);
};

// 📹 カメラ
camBtn.onclick = () => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  camBtn.classList.toggle('off', !track.enabled);
};

// 📺 画面共有
shareBtn.onclick = async () => {
  if (!screenStream) {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    bigVideo.srcObject = screenStream;
    replaceStream(screenStream);
    shareBtn.classList.add('active');

    screenStream.getVideoTracks()[0].onended = () => stopScreenShare();
  } else {
    stopScreenShare();
  }
};

function stopScreenShare() {
  screenStream?.getTracks().forEach(t => t.stop());
  screenStream = null;
  bigVideo.srcObject = localStream;
  replaceStream(localStream);
  shareBtn.classList.remove('active');
}

// 🔴 録画
recordBtn.onclick = () => {
  if (!recorder) {
    recorder = new MediaRecorder(screenStream || localStream);
    recorder.ondataavailable = e => recordedChunks.push(e.data);
    recorder.onstop = saveRecording;
    recorder.start();
    recordBtn.classList.add('active');
  } else {
    recorder.stop();
    recorder = null;
    recordBtn.classList.remove('active');
  }
};

function saveRecording() {
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `record-${Date.now()}.webm`;
  a.click();
  recordedChunks = [];
}

// 💬 チャット
chatToggleBtn.onclick = () => {
  chatBox.style.display = chatBox.style.display === 'none' ? 'flex' : 'none';
};

function appendMessage(sender: string, text: string, isMe = false) {
  const div = document.createElement('div');
  div.className = `chat-msg ${isMe ? 'me' : ''}`;
  div.innerText = `${sender}: ${text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 🚀 参加
document.querySelector('#join-btn')?.addEventListener('click', () => {
  const room = (document.querySelector('#room-input') as HTMLInputElement).value.trim();
  myName = (document.querySelector('#name-input') as HTMLInputElement).value.trim() || "名無し";
  if (!room) return alert("部屋名を入れてね");
  tryNextSeat(`vFINAL-${room}`, 1);
});

// ❌ 終了
document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

init();
