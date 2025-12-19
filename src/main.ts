import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>無料ビデオ会議アプリ</h1>
    <div class="video-container">
      <video id="local-video" autoplay playsinline muted style="width: 300px; border: 2px solid #646cff; border-radius: 10px;"></video>
      <video id="remote-video" autoplay playsinline style="width: 300px; border: 2px solid #ff6464; border-radius: 10px;"></video>
    </div>
    <div class="card">
      <button id="create-room" type="button">ルームを作成</button>
      <p id="my-id-display">あなたの接続ID: 読み込み中...</p>
    </div>
  </div>
`

// 自分のカメラ映像を取得
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    localVideo.srcObject = stream;
  });

// PeerJSの起動（登録不要でこれだけで使えます）
const peer = new Peer();

peer.on('open', (id) => {
  document.querySelector<HTMLParagraphElement>('#my-id-display')!.innerText = `あなたの接続ID: ${id}`;
});

// 相手から電話がかかってきた時の処理（準備だけ）
peer.on('call', (call) => {
  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
      call.answer(stream); // 自分の映像を返す
      call.on('stream', (remoteStream) => {
        const remoteVideo = document.querySelector<HTMLVideoElement>('#remote-video')!;
        remoteVideo.srcObject = remoteStream; // 相手の映像を表示
      });
    });
});