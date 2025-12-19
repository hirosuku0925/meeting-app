import './style.css'
import { Peer, MediaConnection } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>多人数ビデオ会議室 (高機能版)</h1>
    <div id="video-grid" style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; padding: 20px;">
      <div style="position: relative;">
        <video id="local-video" autoplay playsinline muted style="width: 200px; border: 2px solid #646cff; border-radius: 10px; transition: 0.3s;"></video>
        <p style="position: absolute; top: 5px; left: 10px; color: white; background: rgba(0,0,0,0.5); font-size: 12px; padding: 2px 5px;">自分</p>
      </div>
    </div>
    
    <div class="card">
      <div style="margin-bottom: 10px; display: flex; gap: 5px; justify-content: center;">
        <button id="blur-btn" style="background-color: #4CAF50;">ぼかし: OFF</button>
        <button id="mic-btn" style="background-color: #2196F3;">マイク: ON</button>
        <button id="camera-btn" style="background-color: #2196F3;">カメラ: ON</button>
      </div>
      <input id="remote-id-input" type="text" placeholder="相手のIDを入力" style="padding: 10px; border-radius: 5px;">
      <button id="connect-btn">相手を追加する</button>
      <p id="status" style="font-weight: bold; color: #646cff;">あなたのID: 取得中...</p>
    </div>
  </div>
`

const videoGrid = document.querySelector<HTMLDivElement>('#video-grid')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const statusDisplay = document.querySelector<HTMLParagraphElement>('#status')!;
const blurBtn = document.querySelector<HTMLButtonElement>('#blur-btn')!;
const micBtn = document.querySelector<HTMLButtonElement>('#mic-btn')!;
const cameraBtn = document.querySelector<HTMLButtonElement>('#camera-btn')!;

const peer = new Peer();
let localStream: MediaStream;
let isBlurred = false;

// 1. 自分のカメラを準備
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  localStream = stream;
  localVideo.srcObject = stream;
});

// 2. ぼかしボタンの機能
blurBtn.addEventListener('click', () => {
  isBlurred = !isBlurred;
  localVideo.style.filter = isBlurred ? 'blur(10px)' : 'none';
  blurBtn.innerText = isBlurred ? 'ぼかし: ON' : 'ぼかし: OFF';
  blurBtn.style.backgroundColor = isBlurred ? '#f44336' : '#4CAF50';
});

// 3. マイクON/OFFボタン
micBtn.addEventListener('click', () => {
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  micBtn.innerText = audioTrack.enabled ? 'マイク: ON' : 'マイク: OFF';
  micBtn.style.backgroundColor = audioTrack.enabled ? '#2196F3' : '#f44336';
});

// 4. カメラON/OFFボタン
cameraBtn.addEventListener('click', () => {
  const videoTrack = localStream.getVideoTracks()[0];
  videoTrack.enabled = !videoTrack.enabled;
  cameraBtn.innerText = videoTrack.enabled ? 'カメラ: ON' : 'カメラ: OFF';
  cameraBtn.style.backgroundColor = videoTrack.enabled ? '#2196F3' : '#f44336';
});

// 5. 自分のIDを表示
peer.on('open', (id) => {
  statusDisplay.innerText = `あなたのID: ${id}`;
});

// 相手のビデオを追加・削除する関数
function addRemoteVideo(call: MediaConnection) {
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

  // ここで修正：正しい変数名 remoteVideo.remove() を使用
  call.on('close', () => {
    remoteVideo.remove();
  });
}

// 6. 着信・発信処理
peer.on('call', (call) => {
  call.answer(localStream);
  addRemoteVideo(call);
});

document.querySelector<HTMLButtonElement>('#connect-btn')!.addEventListener('click', () => {
  const remoteIdInput = document.querySelector<HTMLInputElement>('#remote-id-input')!;
  const remoteId = remoteIdInput.value;
  if (!remoteId) return alert('相手のIDを入力してください');
  const call = peer.call(remoteId, localStream);
  addRemoteVideo(call);
  remoteIdInput.value = "";
});