import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>無料ビデオ会議アプリ</h1>
    <div class="video-container" style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
      <video id="local-video" autoplay playsinline muted style="width: 300px; border: 2px solid #646cff; border-radius: 10px;"></video>
      <video id="remote-video" autoplay playsinline style="width: 300px; border: 2px solid #ff6464; border-radius: 10px;"></video>
    </div>
    <div class="card">
      <input id="room-id-input" type="text" placeholder="相手のIDを入力" style="padding: 10px; border-radius: 5px; border: 1px solid #ccc;">
      <button id="connect-btn" type="button">相手とつなぐ</button>
      <p id="my-id-display" style="font-weight: bold; color: #646cff;">あなたの接続ID: 取得中...</p>
    </div>
  </div>
`

const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const remoteVideo = document.querySelector<HTMLVideoElement>('#remote-video')!;
const peer = new Peer();
let localStream: MediaStream;

// 1. 自分のカメラ映像を表示
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    localStream = stream;
    localVideo.srcObject = stream;
  });

// 2. 自分のIDを表示
peer.on('open', (id) => {
  document.querySelector<HTMLParagraphElement>('#my-id-display')!.innerText = `あなたの接続ID: ${id}`;
});

// 3. 相手からかかってきた電話を取る処理
peer.on('call', (call) => {
  call.answer(localStream); // 自分の映像を送る
  call.on('stream', (remoteStream) => {
    remoteVideo.srcObject = remoteStream; // 相手の映像を表示
  });
});

// 4. ボタンを押して相手に電話をかける処理
document.querySelector<HTMLButtonElement>('#connect-btn')!.addEventListener('click', () => {
  const remoteId = (document.querySelector<HTMLInputElement>('#room-id-input')!).value;
  if (!remoteId) return alert('相手のIDを入力してください');
  
  const call = peer.call(remoteId, localStream);
  call.on('stream', (remoteStream) => {
    remoteVideo.srcObject = remoteStream;
  });
});