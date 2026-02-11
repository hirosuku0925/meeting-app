import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'
import voiceChangerManager from './voice-changer-manager'
import { setupVoiceChangerButtonHandler } from './voice-changer-dialog'
import { setupFaceAvatarButtonHandler } from './face-image-avatar-dialog'
import SettingsManager from './settings-manager'

/* ===============================
   1. スタイル
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
.name-label{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:24px;font-weight:bold;color:white;display:none;z-index:2;text-shadow:0 0 10px rgba(0,0,0,.8);}
.camera-off .name-label{display:block;}
.camera-off video{opacity:0;}
#needle-frame{position:absolute;top:0;left:0;width:100%;height:100%;border:none;display:none;z-index:5;}
#needle-guard{position:absolute;top:0;left:0;width:100%;height:100%;display:none;z-index:6;}
`;
document.head.appendChild(globalStyle);

/* ===============================
   2. HTML（削らない元構造）
================================ */
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<div style="display:flex;height:100vh;width:100%;flex-direction:column;">
  <div id="main-display" style="height:60vh;position:relative;background:#1a1a1a;display:flex;align-items:center;justify-content:center;">
    <video id="big-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:contain;"></video>
    <iframe id="needle-frame" src="https://engine.needle.tools/samples-uploads/facefilter/?" allow="camera; microphone; fullscreen"></iframe>
    <div id="needle-guard"></div>
    <div id="status-badge" style="position:absolute;top:15px;left:15px;background:rgba(0,0,0,0.7);padding:5px 15px;border-radius:20px;border:1px solid #4facfe;font-size:12px;z-index:10;">準備中...</div>
  </div>

  <div id="toolbar" style="height:100px;background:#111;display:flex;align-items:center;justify-content:center;gap:12px;">
    <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>マイク</span></div>
    <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>カメラ</span></div>
    <div class="ctrl-group"><button id="share-btn" class="tool-btn">📺</button><span>画面共有</span></div>
    <div class="ctrl-group"><button id="record-btn" class="tool-btn">🔴</button><span>録画</span></div>
    <div class="ctrl-group"><button id="avatar-btn" class="tool-btn">🎭</button><span>アバター</span></div>
    <div class="ctrl-group"><button id="voice-changer-btn" class="tool-btn">🎙️</button><span>ボイス</span></div>
    <input id="name-input" placeholder="名前">
    <input id="room-input" placeholder="部屋名">
    <button id="join-btn">参加</button>
    <button id="exit-btn">終了</button>
  </div>

  <div id="video-grid" style="flex:1;background:#000;display:flex;gap:10px;padding:10px;">
    <div id="local-container" class="video-container">
      <video id="local-video" autoplay playsinline muted style="height:100%;width:100%;object-fit:cover;"></video>
      <div id="local-name-label" class="name-label"></div>
    </div>
  </div>
</div>
`;

/* ===============================
   3. DOM取得（必ずHTMLの後）
================================ */
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const micBtn = document.querySelector<HTMLButtonElement>('#mic-btn')!;
const camBtn = document.querySelector<HTMLButtonElement>('#cam-btn')!;
const shareBtn = document.querySelector<HTMLButtonElement>('#share-btn')!;
const recordBtn = document.querySelector<HTMLButtonElement>('#record-btn')!;
const needleFrame = document.querySelector<HTMLIFrameElement>('#needle-frame')!;
const needleGuard = document.querySelector<HTMLDivElement>('#needle-guard')!;
const localContainer = document.querySelector('#local-container')!;
const localNameLabel = document.querySelector('#local-name-label')!;

/* ===============================
   4. 変数
================================ */
let localStream: MediaStream;
let screenStream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];
let peer: Peer | null = null;
let myName = "ゲスト";
const mediaConnections = new Map<string, MediaConnection>();

/* ===============================
   5. 初期化
================================ */
async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
  localVideo.srcObject = localStream;
  bigVideo.srcObject = localStream;
  setupFaceAvatarButtonHandler('avatar-btn');
  setupVoiceChangerButtonHandler();
}

/* ===============================
   6. ストリーム差し替え
================================ */
function replaceStream(stream: MediaStream){
  mediaConnections.forEach(call=>{
    call.peerConnection.getSenders().forEach(sender=>{
      const track = stream.getTracks().find(t=>t.kind===sender.track?.kind);
      if(track) sender.replaceTrack(track);
    });
  });
}

/* ===============================
   7. UI
================================ */

// 🎤
micBtn.onclick = ()=>{
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  micBtn.classList.toggle('off',!track.enabled);
};

// 📹
camBtn.onclick = ()=>{
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  camBtn.classList.toggle('off',!track.enabled);
  localContainer.classList.toggle('camera-off',!track.enabled);
  localNameLabel.textContent = myName;
};

// 📺
shareBtn.onclick = async ()=>{
  if(!screenStream){
    screenStream = await navigator.mediaDevices.getDisplayMedia({video:true});
    bigVideo.srcObject = screenStream;
    replaceStream(screenStream);
    shareBtn.classList.add('active');
    screenStream.getVideoTracks()[0].onended = stopShare;
  }else{
    stopShare();
  }
};

function stopShare(){
  screenStream?.getTracks().forEach(t=>t.stop());
  screenStream=null;
  bigVideo.srcObject=localStream;
  replaceStream(localStream);
  shareBtn.classList.remove('active');
}

// 🔴
recordBtn.onclick=()=>{
  if(!recorder){
    recorder = new MediaRecorder(screenStream||localStream);
    recorder.ondataavailable=e=>recordedChunks.push(e.data);
    recorder.onstop=()=>{
      const blob=new Blob(recordedChunks,{type:'video/webm'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      a.download=`record-${Date.now()}.webm`;
      a.click();
      recordedChunks=[];
    };
    recorder.start();
    recordBtn.classList.add('active');
  }else{
    recorder.stop();
    recorder=null;
    recordBtn.classList.remove('active');
  }
};

// 🎭 Needle
document.querySelector('#avatar-btn')!.addEventListener('click',(e)=>{
  const isOn = needleFrame.style.display==='block';
  needleFrame.style.display=isOn?'none':'block';
  needleGuard.style.display=isOn?'none':'block';
  bigVideo.style.opacity=isOn?'1':'0';
  (e.currentTarget as HTMLElement).classList.toggle('active',!isOn);
});

// 🚀 参加
document.querySelector('#join-btn')!.addEventListener('click',()=>{
  myName=(document.querySelector('#name-input') as HTMLInputElement).value||"名無し";
  const room=(document.querySelector('#room-input') as HTMLInputElement).value;
  if(!room)return alert("部屋名を入れてね");
  if(peer)peer.destroy();
  peer=new Peer(`vFINAL-${room}-${Math.floor(Math.random()*1000)}`);
});

// ❌
document.querySelector('#exit-btn')!.addEventListener('click',()=>location.reload());

init();
