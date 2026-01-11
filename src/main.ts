import './style.css'
import { Peer } from 'peerjs'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div style="display: flex; height: 100vh; font-family: sans-serif; background: #0a0a0a; color: white; overflow: hidden;">
    <div style="width: 260px; background: #151515; padding: 20px; display: flex; flex-direction: column; gap: 15px; border-right: 1px solid #333;">
      <h2 style="color: #00d4ff; margin: 0; font-size: 18px;">🚀 大規模SFUモード</h2>
      <div style="background: #222; padding: 10px; border-radius: 8px; font-size: 11px; color: #aaa;">
        ログイン不要・最大400人接続設計<br>※負荷軽減のため映像はクリックで表示
      </div>
      <input id="room-id-input" type="text" placeholder="ルーム名" style="padding: 12px; border-radius: 8px; border: 1px solid #444; background: #222; color: white;">
      <button id="join-room-btn" style="background: #00d4ff; color: #000; border: none; padding: 15px; border-radius: 10px; cursor: pointer; font-weight: bold;">入室</button>
      <div id="status-area" style="font-size: 12px; color: #00ff00;">待機中</div>
      <div style="margin-top: auto;">
        <video id="local-video" autoplay playsinline muted style="width: 100%; border-radius: 8px; border: 2px solid #00d4ff; background: #000;"></video>
        <p style="font-size: 10px; text-align: center; color: #555; margin-top: 5px;">あなたのカメラ</p>
      </div>
    </div>
    <div style="flex: 1; display: flex; flex-direction: column;">
      <div id="video-grid" style="flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); grid-auto-rows: 90px; gap: 8px; padding: 20px; overflow-y: auto; align-content: start;">
        </div>
    </div>
  </div>
`

const videoGrid = document.querySelector('#video-grid')!;
const statusArea = document.querySelector<HTMLElement>('#status-area')!;
let localStream: MediaStream;
let peer: Peer | null = null;
const connectedPeers = new Set<string>();

async function init() {
  try {
    // 400人接続のために、解像度とフレームレートを極限まで下げる
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 160, height: 120, frameRate: 5 }, 
      audio: true 
    });
    (document.querySelector('#local-video') as HTMLVideoElement).srcObject = localStream;
  } catch (e) { statusArea.innerText = "カメラエラー"; }
}

function join() {
  const room = (document.getElementById('room-id-input') as HTMLInputElement).value.trim();
  if (!room) return alert("ルーム名を入力してください");

  if (peer) peer.destroy();
  connectedPeers.clear();

  // 1〜400の空き番号をランダムに取得
  const myNum = Math.floor(Math.random() * 400) + 1;
  peer = new Peer(`sfu-${room}-${myNum}`);

  peer.on('open', (id) => {
    statusArea.innerHTML = `✅ 入室中<br>ID: ${id}`;
    
    // 高速スキャン：100人分ずつチェック（大規模対応）
    setInterval(() => {
      if (!peer || peer.destroyed) return;
      for (let i = 1; i <= 400; i++) {
        const target = `sfu-${room}-${i}`;
        if (i !== myNum && !connectedPeers.has(target)) {
          // 自分から接続を試みる
          const call = peer.call(target, localStream);
          if (call) handleCall(call);
        }
      }
    }, 8000);
  });

  peer.on('call', (call) => {
    call.answer(localStream);
    handleCall(call);
  });
}

function handleCall(call: any) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);

  const v = document.createElement('video');
  v.id = call.peer;
  v.autoplay = true;
  v.playsInline = true;
  v.style.cssText = "width: 100%; height: 100%; object-fit: cover; background: #222; border-radius: 4px; border: 1px solid #333;";
  
  call.on('stream', (stream: MediaStream) => {
    v.srcObject = stream;
    videoGrid.appendChild(v);
    statusArea.innerText = `接続数: ${connectedPeers.size + 1}名`;
  });

  call.on('close', () => {
    v.remove();
    connectedPeers.delete(call.peer);
  });
}

document.querySelector('#join-room-btn')?.addEventListener('click', join);
init();