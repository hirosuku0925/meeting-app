import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #1a1a1a; color: white; overflow: hidden;">
    <div style="width: 260px; background: #2c3e50; padding: 20px; display: flex; flex-direction: column; gap: 15px; z-index: 10;">
      <h2 style="color: #3498db; margin: 0; font-size: 20px;">🌐 AI会議室</h2>
      
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <input id="room-id-input" type="text" placeholder="ルーム名" style="padding: 10px; border-radius: 5px; border: none; color: #333;">
        <input id="room-pass-input" type="password" placeholder="パスワード" style="padding: 10px; border-radius: 5px; border: none; color: #333;">
        <button id="join-room-btn" style="background: #3498db; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">部屋に入室する</button>
      </div>

      <div style="border-top: 1px solid #34495e; padding-top: 15px; display: flex; flex-direction: column; gap: 10px;">
        <button id="toggle-mic" style="background: #2ecc71; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">🎤 マイク: ON</button>
        <button id="toggle-video" style="background: #2ecc71; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">📹 カメラ: ON</button>
        <button id="share-screen-btn" style="background: #9b59b6; color: white; border: none; padding: 10px; border-radius: 5px; cursor: pointer;">🖥 画面共有</button>
      </div>

      <div style="margin-top: auto; display: flex; flex-direction: column; gap: 10px;">
        <button id="record-btn" style="background: #ff9800; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">🔴 録画保存</button>
        <button id="hangup-btn" style="background: #e74c3c; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: bold;">退出（終了）</button>
      </div>

      <div id="status-area" style="font-size: 12px; color: #2ecc71; text-align: center;">待機中</div>
    </div>

    <div style="flex: 1; display: flex; flex-direction: column; background: #000; position: relative;">
      <div id="main-display" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px;">
        <video id="big-video" autoplay playsinline style="max-width: 100%; max-height: 100%; border-radius: 12px; box-shadow: 0 0 30px rgba(0,0,0,0.5);"></video>
      </div>

      <div id="video-grid" style="height: 180px; background: rgba(0,0,0,0.4); display: flex; gap: 15px; padding: 15px; overflow-x: auto; border-top: 1px solid #333;">
        <div style="position: relative; min-width: 220px; height: 100%;">
          <video id="local-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px; border: 3px solid #646cff;"></video>
          <div style="position: absolute; bottom: 8px; left: 8px; font-size: 12px; background: rgba(0,0,0,0.6); padding: 2px 8px; border-radius: 4px;">あなた</div>
        </div>
      </div>
    </div>
  </div>
`

// --- グローバル変数 ---
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const videoGrid = document.querySelector('#video-grid')!;
const statusArea = document.querySelector<HTMLElement>('#status-area')!;

let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

// --- 1. カメラ初期化 ---
async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
  } catch (e) {
    alert("カメラ・マイクを許可してください");
  }
}

// --- 2. 入室ボタン処理 ---
document.querySelector('#join-room-btn')?.addEventListener('click', () => {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('room-pass-input') as HTMLInputElement).value.trim();
  
  if (!room || !pass) return alert("部屋名とパスワードを入れてください");

  if (peer) peer.destroy();

  // 1〜15番の「席」をランダムに選ぶ
  const myNum = Math.floor(Math.random() * 15) + 1;
  const myID = `room_${room}_${pass}_${myNum}`;
  
  peer = new Peer(myID);

  peer.on('open', (id) => {
    console.log("あなたのID:", id);
    statusArea.innerText = `入室中 (席:${myNum})`;
    
    // 1秒おきに他の席を確認して電話をかける（自動リトライ機能）
    for (let i = 1; i <= 15; i++) {
      if (i === myNum) continue; // 自分にはかけない
      const targetID = `room_${room}_${pass}_${i}`;
      
      // 相手に電話をかける
      const call = peer!.call(targetID, localStream);
      if (call) setupRemoteVideo(call);
    }
  });

  peer.on('call', (call) => {
    // 相手からの着信に応答
    call.answer(localStream);
    setupRemoteVideo(call);
  });
});

// --- 3. ビデオ表示処理 ---
function setupRemoteVideo(call: any) {
  call.on('stream', (remoteStream: MediaStream) => {
    // すでにその人のビデオがあれば作らない
    if (document.getElementById(`v-${call.peer}`)) return;
    if (call.peer.includes("undefined")) return;

    connectedPeers.add(call.peer);

    const container = document.createElement('div');
    container.id = `v-${call.peer}`;
    container.style.cssText = "position: relative; min-width: 220px; height: 100%; cursor: pointer;";
    
    const v = document.createElement('video');
    v.srcObject = remoteStream;
    v.autoplay = true;
    v.playsInline = true;
    v.style.cssText = "width: 100%; height: 100%; object-fit: cover; border-radius: 10px; background: #000; border: 1px solid #444;";
    
    // クリックでメイン画面へ
    container.onclick = () => { bigVideo.srcObject = remoteStream; };
    
    container.appendChild(v);
    videoGrid.appendChild(container);
    statusArea.innerText = `接続中 (${connectedPeers.size}人の相手)`;
  });

  call.on('close', () => {
    document.getElementById(`v-${call.peer}`)?.remove();
    connectedPeers.delete(call.peer);
    statusArea.innerText = `接続中 (${connectedPeers.size}人の相手)`;
  });
}

// --- 4. コントロールボタン ---
document.querySelector('#toggle-mic')?.addEventListener('click', () => {
  const t = localStream.getAudioTracks()[0];
  t.enabled = !t.enabled;
  const b = document.querySelector<HTMLButtonElement>('#toggle-mic')!;
  b.innerText = t.enabled ? "🎤 マイク: ON" : "🎙️ マイク: OFF";
  b.style.background = t.enabled ? "#2ecc71" : "#e74c3c";
});

document.querySelector('#toggle-video')?.addEventListener('click', () => {
  const t = localStream.getVideoTracks()[0];
  t.enabled = !t.enabled;
  const b = document.querySelector<HTMLButtonElement>('#toggle-video')!;
  b.innerText = t.enabled ? "📹 カメラ: ON" : "🚫 カメラ: OFF";
  b.style.background = t.enabled ? "#2ecc71" : "#e74c3c";
});

document.querySelector('#share-screen-btn')?.addEventListener('click', async () => {
  try {
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
    bigVideo.srcObject = screen;
    screen.getVideoTracks()[0].onended = () => { bigVideo.srcObject = localStream; };
  } catch (e) { console.error(e); }
});

document.querySelector('#record-btn')?.addEventListener('click', () => {
  const b = document.querySelector<HTMLButtonElement>('#record-btn')!;
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    recordedChunks = [];
    // メイン画面に映っているものを録画
    const stream = (bigVideo.srcObject as MediaStream);
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => { if(e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'meeting.webm'; a.click();
    };
    mediaRecorder.start();
    b.innerText = "⏹ 録画停止";
    b.style.background = "#555";
  } else {
    mediaRecorder.stop();
    b.innerText = "🔴 録画保存";
    b.style.background = "#ff9800";
  }
});

document.querySelector('#hangup-btn')?.addEventListener('click', () => {
  if (confirm("退出しますか？")) location.reload();
});

init();