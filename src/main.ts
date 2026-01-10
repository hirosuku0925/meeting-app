import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #1a1a1a; color: white;">
    <div style="width: 260px; background: #2c3e50; padding: 20px; display: flex; flex-direction: column; gap: 15px; z-index: 10;">
      <h3 style="color: #3498db; margin: 0;">🌐 グループ会議</h3>
      <input id="room-id-input" type="text" placeholder="部屋名" style="width: 100%; padding: 10px; border-radius: 5px; border: none; color: #333;">
      <input id="room-pass-input" type="password" placeholder="パスワード" style="width: 100%; padding: 10px; border-radius: 5px; border: none; color: #333;">
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
        <video id="big-video" autoplay playsinline style="max-width: 100%; max-height: 100%; border-radius: 10px;"></video>
      </div>

      <div id="video-grid" style="height: 180px; background: rgba(0,0,0,0.3); display: flex; gap: 10px; padding: 10px; overflow-x: auto; border-top: 1px solid #333;">
        <div style="position: relative; min-width: 200px; height: 100%;">
          <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 2px solid #646cff;"></video>
          <span style="position: absolute; bottom: 5px; left: 5px; font-size: 10px; background: rgba(0,0,0,0.5); padding: 2px 5px;">あなた</span>
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
}

document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('room-pass-input') as HTMLInputElement).value.trim();
  if (!room || !pass) return alert("部屋名とパスワードを入れてください");

  if (peer) peer.destroy();

  // 1〜10の「席番号」のうち、自分をランダムな番号で登録
  const myNum = Math.floor(Math.random() * 10) + 1;
  const myID = `room_${room}_${pass}_${myNum}`;
  
  peer = new Peer(myID);

  // 警告を消すため id を使用するか、_id に変更
  peer.on('open', (id) => {
    console.log("Joined with ID:", id);
    statusArea.innerText = `入室完了: 席番号 ${myNum}`;
    
    // 全ての「席」に電話をかけて、誰かいたら繋ぐ
    for (let i = 1; i <= 10; i++) {
      if (i === myNum) continue; 
      const targetID = `room_${room}_${pass}_${i}`;
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
  call.on('stream', (stream: MediaStream) => {
    if (connectedPeers.has(call.peer)) return;
    connectedPeers.add(call.peer);

    const container = document.createElement('div');
    container.id = `v-${call.peer}`;
    container.style.cssText = "position: relative; min-width: 200px; height: 100%; cursor: pointer;";
    
    const v = document.createElement('video');
    v.srcObject = stream;
    v.autoplay = true; v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 8px; background: #000;";
    
    container.onclick = () => { bigVideo.srcObject = stream; };
    container.appendChild(v);
    videoGrid.appendChild(container);
  });

  // 相手が切断した時の処理
  call.on('close', () => {
    const el = document.getElementById(`v-${call.peer}`);
    if (el) el.remove();
    connectedPeers.delete(call.peer);
  });
}

// 画面共有ボタン
document.querySelector('#share-screen-btn')?.addEventListener('click', async () => {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    bigVideo.srcObject = screenStream;
    // 自分自身の画面共有プレビューを表示
    screenStream.getVideoTracks()[0].onended = () => {
      bigVideo.srcObject = localStream;
    };
  } catch (err) { console.error(err); }
});

init();