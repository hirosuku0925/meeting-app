import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>多人数ビデオ会議室</h1>
    <div id="video-grid" style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; padding: 20px;">
      <video id="local-video" autoplay playsinline muted style="width: 200px; border: 2px solid #646cff; border-radius: 10px;"></video>
    </div>
    <div class="card">
      <input id="remote-id-input" type="text" placeholder="つなぎたい相手のIDを入力" style="padding: 10px; border-radius: 5px;">
      <button id="connect-btn">相手を追加する</button>
      <p id="status" style="font-weight: bold; color: #646cff;">あなたのID: 取得中...</p>
    </div>
  </div>
`

const videoGrid = document.querySelector<HTMLDivElement>('#video-grid')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const statusDisplay = document.querySelector<HTMLParagraphElement>('#status')!;
const peer = new Peer();
let localStream: MediaStream;

// 1. 自分のカメラを準備
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localStream = stream;
  localVideo.srcObject = stream;
});

// 2. 自分のIDを表示
peer.on('open', (id) => {
  statusDisplay.innerText = `あなたのID: ${id}`;
});

// 3. 相手から着信があった時（ビデオ枠を自動で増やして追加）
peer.on('call', (call) => {
  call.answer(localStream);
  const remoteVideo = document.createElement('video');
  remoteVideo.style.width = "200px";
  remoteVideo.style.borderRadius = "10px";
  remoteVideo.style.border = "2px solid #ff6464";
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;

  call.on('stream', (remoteStream) => {
    remoteVideo.srcObject = remoteStream;
    videoGrid.appendChild(remoteVideo);
  });
});

// 4. ボタンを押して自分から相手を増やす時
document.querySelector<HTMLButtonElement>('#connect-btn')!.addEventListener('click', () => {
  const remoteIdInput = document.querySelector<HTMLInputElement>('#remote-id-input')!;
  const remoteId = remoteIdInput.value;
  if (!remoteId) return alert('相手のIDを入力してください');

  const call = peer.call(remoteId, localStream);
  const remoteVideo = document.createElement('video');
  remoteVideo.style.width = "200px";
  remoteVideo.style.borderRadius = "10px";
  remoteVideo.style.border = "2px solid #ff6464";
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;

  call.on('stream', (remoteStream) => {
    remoteVideo.srcObject = remoteStream;
    videoGrid.appendChild(remoteVideo);
  });
  
  remoteIdInput.value = ""; // 入力欄を空にする
});