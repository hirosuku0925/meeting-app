import './style.css'
import { Peer, MediaConnection } from 'peerjs'
import { SelfieSegmentation } from '@mediapipe/selfie_segmentation'

// 名前を保持する変数
let myName = "";

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>AIバーチャル背景 & 画面共有 会議室</h1>
    <div id="video-grid" style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; padding: 20px;">
      <div class="video-container" style="position: relative;">
        <canvas id="local-canvas" width="480" height="360" style="width: 300px; border: 2px solid #646cff; border-radius: 10px;"></canvas>
        <div id="my-name-label" style="position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.5); color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">自分</div>
      </div>
    </div>
    <div class="card">
      <div style="margin-bottom: 10px; display: flex; flex-direction: column; gap: 10px; align-items: center;">
        <input id="name-input" type="text" placeholder="あなたの表示名を入力" style="padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
        <div style="display: flex; gap: 5px; flex-wrap: wrap; justify-content: center;">
          <button id="blur-btn" style="background-color: #4CAF50;">背景ぼかし: OFF</button>
          <button id="share-btn" style="background-color: #2196F3;">画面・音声を共有</button>
          <button id="hangup-btn" style="background-color: #f44336;">退出する</button>
        </div>
        <div style="background: #f0f0f0; padding: 10px; border-radius: 8px; font-size: 14px;">
          <label>背景画像：</label>
          <input type="file" id="bg-upload" accept="image/*" style="font-size: 12px;">
        </div>
      </div>
      <input id="remote-id-input" type="text" placeholder="相手のIDを入力">
      <button id="connect-btn">接続</button>
      <p id="status">あなたのID: 取得中...</p>
    </div>
    <video id="hidden-video" style="display:none" autoplay playsinline muted></video>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#local-canvas')!;
const ctx = canvas.getContext('2d')!;
const video = document.querySelector<HTMLVideoElement>('#hidden-video')!;
const statusDisplay = document.querySelector<HTMLParagraphElement>('#status')!;
const bgInput = document.querySelector<HTMLInputElement>('#bg-upload')!;
const shareBtn = document.querySelector<HTMLButtonElement>('#share-btn')!;
const nameInput = document.querySelector<HTMLInputElement>('#name-input')!;

let isBlurred = false;
let isScreenSharing = false;
let customBgImage: HTMLImageElement | null = null;
let processedStream: MediaStream;
let activeCalls: MediaConnection[] = [];
let localCameraStream: MediaStream;

const selfieSegmentation = new SelfieSegmentation({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
});
selfieSegmentation.setOptions({ modelSelection: 0 });

selfieSegmentation.onResults((results) => {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (isScreenSharing) {
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-out';
    if (customBgImage) {
      ctx.drawImage(customBgImage, 0, 0, canvas.width, canvas.height);
    } else if (isBlurred) {
      ctx.filter = 'blur(8px)';
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      ctx.filter = 'none';
    } else {
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    }
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  }
  ctx.restore();
});

async function startCamera() {
  localCameraStream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: true });
  video.srcObject = localCameraStream;
  video.onloadedmetadata = () => {
    video.play();
    processedStream = canvas.captureStream(20);
    localCameraStream.getAudioTracks().forEach(track => processedStream.addTrack(track));
    
    const sendVideo = async () => {
      if (video.srcObject) {
        await selfieSegmentation.send({ image: video });
        requestAnimationFrame(sendVideo);
      }
    };
    sendVideo();
  };
}
startCamera();

// 名前の更新
nameInput.addEventListener('input', () => {
  myName = nameInput.value;
  document.querySelector('#my-name-label')!.textContent = myName || "自分";
});

// 画面共有ボタンの修正
shareBtn.addEventListener('click', async () => {
  if (!isScreenSharing) {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      
      // 送信ストリームの映像を画面共有のものに差し替える
      const videoTrack = screenStream.getVideoTracks()[0];
      const sender = processedStream.getVideoTracks()[0];
      if (sender) processedStream.removeTrack(sender);
      processedStream.addTrack(videoTrack);

      video.srcObject = screenStream;
      isScreenSharing = true;
      shareBtn.innerText = "共有を停止";
      shareBtn.style.backgroundColor = "#ff9800";

      videoTrack.onended = () => stopScreenShare();
    } catch (err) {
      console.error("画面共有に失敗:", err);
    }
  } else {
    stopScreenShare();
  }
});

function stopScreenShare() {
  // 元のカメラ映像トラックに戻す
  const videoTrack = localCameraStream.getVideoTracks()[0];
  const sender = processedStream.getVideoTracks()[0];
  if (sender) processedStream.removeTrack(sender);
  processedStream.addTrack(videoTrack);

  video.srcObject = localCameraStream;
  isScreenSharing = false;
  shareBtn.innerText = "画面・音声を共有";
  shareBtn.style.backgroundColor = "#2196F3";
}

bgInput.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => { customBgImage = img; isBlurred = false; };
    img.src = event.target?.result as string;
  };
  reader.readAsDataURL(file);
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => {
  activeCalls.forEach(call => call.close());
  const stream = video.srcObject as MediaStream;
  stream?.getTracks().forEach(track => track.stop());
  window.location.reload();
});

document.querySelector('#blur-btn')?.addEventListener('click', () => {
  customBgImage = null;
  isBlurred = !isBlurred;
  const btn = document.querySelector<HTMLButtonElement>('#blur-btn')!;
  btn.innerText = isBlurred ? "背景ぼかし: ON" : "背景ぼかし: OFF";
  btn.style.backgroundColor = isBlurred ? '#f44336' : '#4CAF50';
});

const peer = new Peer();
peer.on('open', id => { statusDisplay.innerText = `あなたのID: ${id}`; });

// 着信時：名前データも受け取れるように拡張
peer.on('call', (call) => {
  // 相手の名前をmetadataから取得（後述の接続側で送る）
  const remoteName = (call.metadata && call.metadata.name) ? call.metadata.name : "ゲスト";
  call.answer(processedStream);
  activeCalls.push(call);
  setupVideoCall(call, remoteName);
});

// 接続時：自分の名前を一緒に送る
document.querySelector('#connect-btn')?.addEventListener('click', () => {
  const remoteId = (document.querySelector<HTMLInputElement>('#remote-id-input')!).value;
  if (!remoteId) return alert('IDを入力してください');
  
  // 名前をmetadataに載せて送る
  const call = peer.call(remoteId, processedStream, {
    metadata: { name: myName || "ゲスト" }
  });
  
  activeCalls.push(call);
  setupVideoCall(call, "相手"); 
});

function setupVideoCall(call: MediaConnection, name: string) {
  const videoGrid = document.querySelector('#video-grid')!;
  
  // ビデオと名前をセットにするコンテナ
  const container = document.createElement('div');
  container.style.position = "relative";
  
  const remoteVideo = document.createElement('video');
  remoteVideo.style.width = "300px";
  remoteVideo.style.borderRadius = "10px";
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;

  const nameLabel = document.createElement('div');
  nameLabel.innerText = name;
  nameLabel.style.cssText = "position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.5); color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;";

  container.appendChild(remoteVideo);
  container.appendChild(nameLabel);

  call.on('stream', (stream: MediaStream) => {
    remoteVideo.srcObject = stream;
    videoGrid.appendChild(container);
  });
  call.on('close', () => container.remove());
}