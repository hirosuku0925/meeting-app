import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #1a1a1a; color: white;">
    <div style="width: 260px; background: #2c3e50; padding: 20px; display: flex; flex-direction: column; gap: 15px; z-index: 10;">
      <h3 style="color: #3498db; margin: 0;">🌐 多人数会議室</h3>
      <input id="room-id-input" type="text" placeholder="部屋名" style="width: 100%; padding: 10px; border-radius: 5px; border: none;">
      <input id="room-pass-input" type="password" placeholder="パスワード" style="width: 100%; padding: 10px; border-radius: 5px; border: none;">
      <button id="join-room-btn" style="background: #3498db; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">部屋に入室</button>
      
      <div style="border-top: 1px solid #34495e; padding-top: 15px; display: flex; flex-direction: column; gap: 10px;">
        <button id="toggle-mic" style="background: #2ecc71; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">🎤 マイク: ON</button>
        <button id="toggle-video" style="background: #2ecc71; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">📹 カメラ: ON</button>
        <button id="share-screen-btn" style="background: #9b59b6; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">🖥 画面共有</button>
      </div>
      <div id="status-area" style="font-size: 12px; color: #2ecc71; margin-top: auto;">待機中...</div>
    </div>

    <div style="flex: 1; display: flex; flex-direction: column; position: relative; background: #000;">
      <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 10px;">
        <video id="big-video" autoplay playsinline style="max-width: 100%; max-height: 100%; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.5);"></video>
        <div id="main-placeholder" style="position: absolute; color: #444; font-size: 20px;">メイン映像</div>
      </div>

      <div id="video-grid" style="height: 180px; background: rgba(0,0,0,0.3); display: flex; gap: 10px; padding: 10px; overflow-x: auto; border-top: 1px solid #333;">
        <div style="position: relative; min-width: 200px; height: 100%;">
          <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 2px solid #646cff;"></video>
          <span style="position: absolute; bottom: 5px; left: 5px; font-size: 10px; background: rgba(0,0,0,0.5); padding: 2px 5px;">あなた</span>
        </div>
      </div>
    </div>

    <div style="position: fixed; bottom: 20px; right: 20px; display: flex; gap: 10px;">
        <button id="record-btn" style="background: #ff9800; color: white; border: none; padding: 10px 20px; border-radius: 30px; cursor: pointer; font-weight: bold; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">🔴 録画</button>
        <button id="hangup-btn" style="background: #e74c3c; color: white; border: none; padding: 10px 20px; border-radius: 30px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">退出</button>
    </div>
  </div>
`

const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const videoGrid = document.querySelector('#video-grid')!;
const statusArea = document.querySelector<HTMLElement>('#status-area')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers: { [key: string]: any } = {};

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  // 初期状態では自分のカメラを大画面に
  bigVideo.srcObject = localStream;
}

document.querySelector('#join-room-btn')?.addEventListener('click', async () => {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('room-pass-input') as HTMLInputElement).value.trim();
  if (!room || !pass) return alert("部屋名とパスワードを入力してください");

  if (peer) peer.destroy();
  
  // 自分のIDを「room_pass_ランダム」にする
  const myID = `room_${room}_${pass}_${Math.floor(Math.random() * 10000)}`;
  peer = new Peer(myID);

  peer.on('open', () => {
    statusArea.innerText = `部屋「${room}」に参加中...`;
    // 1. 他の参加者を探す（この簡易版ではPeerJSのListAPIを使えないため、
    // 実用的にはシグナリングサーバーが必要ですが、ここでは着信を待機する設計にします）
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    setupRemoteVideo(call);
  });
});

// 画面共有ボタン
document.querySelector('#share-screen-btn')?.addEventListener('click', async () => {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    bigVideo.srcObject = screenStream;
    document.querySelector<HTMLElement>('#main-placeholder')!.style.display = 'none';

    // 参加者全員に画面共有を送信（既存の接続を更新）
    Object.values(connectedPeers).forEach(call => {
        // 実際には一度切ってかけ直すのが確実
        const sender = call.peerConnection.getSenders().find((s: any) => s.track.kind === 'video');
        if (sender) sender.replaceTrack(screenStream.getVideoTracks()[0]);
    });

    screenStream.getVideoTracks()[0].onended = () => {
      bigVideo.srcObject = localStream;
    };
  } catch (err) { console.error(err); }
});

function setupRemoteVideo(call: any) {
  if (connectedPeers[call.peer]) return;
  connectedPeers[call.peer] = call;

  call.on('stream', (stream: MediaStream) => {
    if (document.getElementById(`v-${call.peer}`)) return;
    
    const container = document.createElement('div');
    container.id = `v-${call.peer}`;
    container.style.cssText = "position: relative; min-width: 200px; height: 100%; cursor: pointer;";
    
    const v = document.createElement('video');
    v.srcObject = stream;
    v.autoplay = true;
    v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 8px; background: #000;";
    
    // クリックしたら大画面に切り替え
    container.onclick = () => {
        bigVideo.srcObject = stream;
    };

    container.appendChild(v);
    videoGrid.appendChild(container);
  });

  call.on('close', () => {
    document.getElementById(`v-${call.peer}`)?.remove();
    delete connectedPeers[call.peer];
  });
}

init();
document.querySelector('#hangup-btn')?.addEventListener('click', () => location.reload());