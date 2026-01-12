import './style.css'

import { Peer } from 'peerjs'



// --- スタイル設定（Zoom風・全画面） ---

const globalStyle = document.createElement('style');

globalStyle.textContent = `

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }

  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }

  .tool-btn:hover { background: #444; transform: scale(1.1); }

  .ctrl-group { display: flex; flex-direction: column; align-items: center; font-size: 10px; color: #888; gap: 4px; }

  .off { background: #ea4335 !important; }

  .active { background: #4facfe !important; }

`;

document.head.appendChild(globalStyle);



// --- HTML構造（全部入りレイアウト） ---

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `

  <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">

   

    <div id="main-display" style="height: 60vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">

      <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain;"></video>

      <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">準備中...</div>

     

      <div id="chat-box" style="display:none; position: absolute; right: 10px; top: 10px; bottom: 10px; width: 220px; background: rgba(30,30,30,0.9); border-radius: 8px; flex-direction: column; border: 1px solid #444; z-index: 100;">

        <div style="padding: 8px; border-bottom: 1px solid #444; font-size: 12px; font-weight: bold;">チャット</div>

        <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 11px;"></div>

        <div style="padding: 8px; display: flex; gap: 5px;">

          <input id="chat-input" type="text" style="flex: 1; background: #222; border: 1px solid #555; color: white; border-radius: 4px; padding: 5px; font-size: 11px;">

          <button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 5px; border-radius: 4px; font-size: 11px;">送信</button>

        </div>

      </div>

    </div>



    <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 12px; border-top: 1px solid #333; flex-shrink: 0;">

      <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>マイク</span></div>

      <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>カメラ</span></div>

      <div class="ctrl-group"><button id="bg-btn" class="tool-btn">🖼️</button><span>背景</span></div>

      <div class="ctrl-group"><button id="avatar-btn" class="tool-btn">🎭</button><span>アバター</span></div>

      <div class="ctrl-group"><button id="chat-toggle-btn" class="tool-btn">💬</button><span>チャット</span></div>

      <div class="ctrl-group"><button id="record-btn" class="tool-btn">🔴</button><span>録画</span></div>

     

      <div style="width: 1px; height: 40px; background: #444; margin: 0 10px;"></div>

     

      <input id="room-input" type="text" placeholder="ルーム名" style="background: #222; border: 1px solid #444; color: white; padding: 10px; border-radius: 5px; width: 100px;">

      <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 10px 18px; border-radius: 5px; cursor: pointer; font-weight: bold;">参加</button>

      <button id="exit-btn" style="background: #ea4335; color: white; border: none; padding: 10px 18px; border-radius: 5px; cursor: pointer;">終了</button>

    </div>



    <div id="video-grid" style="flex: 1; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; align-items: center; justify-content: center;">

      <video id="local-video" autoplay playsinline muted style="height: 100%; border-radius: 8px; border: 2px solid #4facfe; object-fit: cover;"></video>

    </div>

  </div>

`



// --- プログラム処理 ---

const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;

const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;

const videoGrid = document.querySelector<HTMLElement>('#video-grid')!;

const statusBadge = document.querySelector<HTMLElement>('#status-badge')!;

const chatBox = document.querySelector<HTMLElement>('#chat-box')!;

const chatMessages = document.querySelector<HTMLElement>('#chat-messages')!;



let localStream: MediaStream;

let peer: Peer | null = null;

const connectedPeers = new Set<string>();

let recorder: MediaRecorder | null = null;

let chunks: Blob[] = [];



// 1. 初期化（ハウリング防止設定）

async function init() {

  try {

    localStream = await navigator.mediaDevices.getUserMedia({

      video: true,

      audio: { echoCancellation: true, noiseSuppression: true }

    });

    localVideo.srcObject = localStream;

    bigVideo.srcObject = localStream;

    statusBadge.innerText = "準備完了！ルーム名を入力して参加してください";

  } catch (e) {

    statusBadge.innerText = "カメラエラー！許可してください";

  }

}



// 2. ボタン操作（マイク・カメラ）

document.querySelector('#mic-btn')?.addEventListener('click', (e) => {

  const track = localStream.getAudioTracks()[0];

  track.enabled = !track.enabled;

  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);

});

document.querySelector('#cam-btn')?.addEventListener('click', (e) => {

  const track = localStream.getVideoTracks()[0];

  track.enabled = !track.enabled;

  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);

});



// 3. チャット機能

document.querySelector('#chat-toggle-btn')?.addEventListener('click', () => {

  chatBox.style.display = chatBox.style.display === 'none' ? 'flex' : 'none';

});

document.querySelector('#chat-send-btn')?.addEventListener('click', () => {

  const input = document.querySelector<HTMLInputElement>('#chat-input')!;

  if (!input.value) return;

  const div = document.createElement('div');

  div.innerText = `自分: ${input.value}`;

  chatMessages.appendChild(div);

  input.value = "";

});



// 4. 録画機能

document.querySelector('#record-btn')?.addEventListener('click', (e) => {

  const btn = e.currentTarget as HTMLElement;

  if (!recorder || recorder.state === 'inactive') {

    chunks = [];

    recorder = new MediaRecorder(localStream);

    recorder.ondataavailable = (ev) => chunks.push(ev.data);

    recorder.onstop = () => {

      const blob = new Blob(chunks, { type: 'video/webm' });

      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');

      a.href = url; a.download = 'meeting-record.webm'; a.click();

    };

    recorder.start();

    btn.classList.add('active');

    btn.innerText = "⏹️";

  } else {

    recorder.stop();

    btn.classList.remove('active');

    btn.innerText = "🔴";

  }

});



// 5. 背景・アバター（デモ）

document.querySelector('#bg-btn')?.addEventListener('click', () => alert("背景ぼかし機能を起動中..."));

document.querySelector('#avatar-btn')?.addEventListener('click', () => alert("アバターモード準備中..."));



// 6. 接続ロジック（強化版）

function join() {

  const room = (document.querySelector<HTMLInputElement>('#room-input')!).value.trim();

  if (!room) return alert("ルーム名を入力してください");

  const roomKey = `vFINAL-${room}`;

  statusBadge.innerText = "サーバー接続中...";

  tryNextSeat(roomKey, 1);

}



function tryNextSeat(roomKey: string, seat: number) {

  if (peer) peer.destroy();

  peer = new Peer(`${roomKey}-${seat}`);



  peer.on('open', () => {

    statusBadge.innerText = `${seat}番席で入室。相手を探しています...`;

    const interval = setInterval(() => {

      if (!peer || peer.destroyed) return clearInterval(interval);

      for (let i = 1; i < seat; i++) {

        const targetId = `${roomKey}-${i}`;

        if (!connectedPeers.has(targetId)) {

          const call = peer.call(targetId, localStream);

          if (call) handleCall(call);

        }

      }

    }, 4000);

  });



  peer.on('call', (call) => {

    call.answer(localStream);

    handleCall(call);

  });



  peer.on('error', (err) => {

    if (err.type === 'unavailable-id') tryNextSeat(roomKey, seat + 1);

  });

}



function handleCall(call: any) {

  if (connectedPeers.has(call.peer)) return;

  connectedPeers.add(call.peer);



  call.on('stream', (stream: MediaStream) => {

    if (document.getElementById(call.peer)) return;

    const v = document.createElement('video');

    v.id = call.peer;

    v.srcObject = stream; v.autoplay = true; v.playsInline = true;

    v.style.cssText = "height: 100%; min-width: 180px; border-radius: 8px; background: #222; object-fit: cover; cursor: pointer;";

    v.onclick = () => { bigVideo.srcObject = stream; bigVideo.muted = false; };

    videoGrid.appendChild(v);

    bigVideo.srcObject = stream;

    bigVideo.muted = false; // 相手の映像は音を出す

  });

}



document.querySelector('#join-btn')?.addEventListener('click', join);

document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());



init();