import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #1a1a1a; color: white; overflow: hidden;">
    <div style="width: 260px; background: #2c3e50; padding: 20px; display: flex; flex-direction: column; gap: 15px; z-index: 10;">
      <h2 style="color: #3498db; margin: 0; font-size: 20px;">🌐 AI会議室</h2>
      
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <input id="room-id-input" type="text" placeholder="ルーム名" style="padding: 10px; border-radius: 5px; border: none; color: #333;">
        <input id="room-pass-input" type="password" placeholder="パスワード" style="padding: 10px; border-radius: 5px; border: none; color: #333;">
        <button id="join-room-btn" style="background: #3498db; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">入室する</button>
      </div>

      <div style="border-top: 1px solid #34495e; padding-top: 15px; display: flex; flex-direction: column; gap: 10px;">
        <button id="toggle-mic" style="background: #2ecc71; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">🎤 マイク: ON</button>
        <button id="toggle-video" style="background: #2ecc71; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">📹 カメラ: ON</button>
        <button id="share-screen-btn" style="background: #9b59b6; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">🖥 画面共有</button>
      </div>

      <div style="margin-top: auto; display: flex; flex-direction: column; gap: 10px;">
        <button id="record-btn" style="background: #ff9800; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">🔴 録画保存</button>
        <button id="hangup-btn" style="background: #e74c3c; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">退出</button>
      </div>
      <div id="status-area" style="font-size: 11px; color: #2ecc71; text-align: center;">待機中</div>
    </div>

    <div style="flex: 1; display: flex; flex-direction: column; background: #000; position: relative;">
      <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <video id="big-video" autoplay playsinline muted style="max-width: 100%; max-height: 100%; border-radius: 12px;"></video>
      </div>

      <div id="video-grid" style="height: 180px; background: rgba(0,0,0,0.5); display: flex; gap: 15px; padding: 15px; overflow-x: auto; border-top: 1px solid #333;">
        <div id="local-video-container" style="position: relative; min-width: 220px; height: 100%; cursor: pointer;">
          <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px; border: 3px solid #646cff;"></video>
          <div style="position: absolute; bottom: 8px; left: 8px; font-size: 11px; background: rgba(0,0,0,0.6); padding: 2px 8px; border-radius: 4px;">あなた</div>
        </div>
      </div>
    </div>
  </div>
`

const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const videoGrid = document.querySelector('#video-grid')!;
const statusArea = document.querySelector<HTMLElement>('#status-area')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  bigVideo.srcObject = localStream;
  bigVideo.muted = true; // 自分の時は必ずミュート
}

// 自分を大画面に映すボタン（タイルの「あなた」をクリックした時）
document.querySelector('#local-video-container')?.addEventListener('click', () => {
  bigVideo.srcObject = localStream;
  bigVideo.muted = true; // 自分の声がスピーカーから出ないようにする
});

document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('room-pass-input') as HTMLInputElement).value.trim();
  if (!room || !pass) return alert("入力してください");

  if (peer) peer.destroy();
  const myID = `room_${room}_${pass}_${Math.floor(Math.random() * 15) + 1}`;
  peer = new Peer(myID);

  peer.on('open', () => {
    statusArea.innerText = "入室しました";
    for (let i = 1; i <= 15; i++) {
      const targetID = `room_${room}_${pass}_${i}`;
      if (targetID === myID) continue;
      const call = peer!.call(targetID, localStream);
      if (call) setupRemoteVideo(call);
    }
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    setupRemoteVideo(call);
  });
});

function setupRemoteVideo(call: any) {
  call.on('stream', (remoteStream: MediaStream) => {
    if (document.getElementById(`v-${call.peer}`)) return;
    connectedPeers.add(call.peer);

    const container = document.createElement('div');
    container.id = `v-${call.peer}`;
    container.style.cssText = "position: relative; min-width: 220px; height: 100%; cursor: pointer;";
    
    const v = document.createElement('video');
    v.srcObject = remoteStream;
    v.autoplay = true; v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 10px; background: #000;";
    
    // ★ 相手をクリックした時は、音を聞きたいので muted = false にする
    container.onclick = () => {
      bigVideo.srcObject = remoteStream;
      bigVideo.muted = false; 
    };
    
    container.appendChild(v);
    videoGrid.appendChild(container);
  });
}

// --- ボタン類 ---
document.querySelector('#toggle-mic')?.addEventListener('click', () => {
  localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
  const btn = document.querySelector<HTMLButtonElement>('#toggle-mic')!;
  btn.innerText = localStream.getAudioTracks()[0].enabled ? "🎤 マイク: ON" : "🎙️ マイク: OFF";
  btn.style.background = localStream.getAudioTracks()[0].enabled ? "#2ecc71" : "#e74c3c";
});

document.querySelector('#toggle-video')?.addEventListener('click', () => {
  localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
  const btn = document.querySelector<HTMLButtonElement>('#toggle-video')!;
  btn.innerText = localStream.getVideoTracks()[0].enabled ? "📹 カメラ: ON" : "🚫 カメラ: OFF";
  btn.style.background = localStream.getVideoTracks()[0].enabled ? "#2ecc71" : "#e74c3c";
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());

init();