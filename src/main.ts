import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'

const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  
  /* メイン画面のレイアウト */
  #app-container { display: flex; height: 100vh; width: 100%; flex-direction: column; }
  #middle-section { display: flex; flex: 1; height: 60vh; overflow: hidden; }
  
  /* 映像エリア */
  #video-area { flex: 1; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; }
  canvas { height: 100%; max-width: 100%; object-fit: contain; }

  /* ★チャットエリア（右側に固定） */
  #chat-sidebar { width: 300px; background: #222; border-left: 1px solid #444; display: flex; flex-direction: column; }
  #chat-messages { flex: 1; overflow-y: auto; padding: 15px; font-size: 14px; line-height: 1.5; }
  #chat-input-area { padding: 10px; border-top: 1px solid #444; display: flex; gap: 5px; }
  #chat-msg-input { flex: 1; background: #333; border: 1px solid #555; color: white; padding: 8px; border-radius: 4px; }
  .chat-item { margin-bottom: 10px; padding: 5px 10px; background: #333; border-radius: 5px; }

  /* 下のボタンたち */
  #toolbar { height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 15px; border-top: 1px solid #333; }
  .tool-btn { background: #333; border: none; color: white; font-size: 20px; width: 50px; height: 50px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .active { background: #2ecc71 !important; }

  #video-grid { height: 150px; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; }
  .remote-container { height: 100%; min-width: 180px; background: #222; border-radius: 8px; overflow: hidden; }
`;
document.head.appendChild(globalStyle);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div id="app-container">
    <div id="middle-section">
      <div id="video-area">
        <canvas id="output-canvas"></canvas>
      </div>
      <div id="chat-sidebar">
        <div style="padding: 10px; background: #333; font-weight: bold; text-align: center;">チャット</div>
        <div id="chat-messages"></div>
        <div id="chat-input-area">
          <input id="chat-msg-input" type="text" placeholder="メッセージを入力...">
        </div>
      </div>
    </div>

    <div id="toolbar">
      <button id="cam-btn" class="tool-btn">📹</button>
      <button id="mic-btn" class="tool-btn">🎤</button>
      <label class="tool-btn" title="お面を選ぶ">🖼️
        <input type="file" id="mask-upload" accept="image/*" style="display:none;">
      </label>
      <button id="join-btn" style="background: #2ecc71; color: white; padding: 12px 25px; border-radius: 8px; font-weight: bold; border:none; cursor:pointer;">授業に参加する</button>
    </div>

    <div id="video-grid"></div>
  </div>
`;

// --- 変数管理 ---
let localStream: MediaStream | null = null;
let peer: Peer | null = null;
let maskImg: HTMLImageElement | null = null;
const canvas = document.getElementById('output-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const v = document.createElement('video');
const dataConns = new Map<string, DataConnection>();

// 映像の描画ループ
function draw() {
  if (v.paused || v.ended) return;
  canvas.width = v.videoWidth;
  canvas.height = v.videoHeight;
  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
  if (maskImg) {
    const size = canvas.height * 0.6;
    ctx.drawImage(maskImg, (canvas.width - size) / 2, (canvas.height - size) / 2, size, size);
  }
  requestAnimationFrame(draw);
}

// チャットを表示する関数
function addChat(name: string, text: string) {
  const msgArea = document.getElementById('chat-messages')!;
  const div = document.createElement('div');
  div.className = 'chat-item';
  div.innerHTML = `<strong>${name}:</strong> ${text}`;
  msgArea.appendChild(div);
  msgArea.scrollTop = msgArea.scrollHeight;
}

// 参加処理
function joinRoom() {
  peer = new Peer();
  peer.on('open', (id) => {
    document.getElementById('join-btn')!.innerText = "入室中...";
    document.getElementById('join-btn')!.style.background = "#555";
    console.log("My ID:", id);
  });

  peer.on('call', (call) => {
    call.answer(canvas.captureStream(30));
    setupRemote(call);
  });

  peer.on('connection', (conn) => {
    dataConns.set(conn.peer, conn);
    conn.on('data', (data: any) => {
      if (data.type === 'chat') addChat("あいて", data.text);
    });
    const call = peer!.call(conn.peer, canvas.captureStream(30));
    setupRemote(call);
  });
}

function setupRemote(call: MediaConnection) {
  call.on('stream', (remoteStream) => {
    if (document.getElementById(`remote-${call.peer}`)) return;
    const rv = document.createElement('video');
    rv.id = `remote-${call.peer}`;
    rv.autoplay = true; rv.playsInline = true;
    rv.style.height = "100%";
    const container = document.createElement('div');
    container.className = 'remote-container';
    container.appendChild(rv);
    document.getElementById('video-grid')?.appendChild(container);
    rv.srcObject = remoteStream;
  });
}

// --- イベント ---
document.getElementById('mask-upload')?.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => { maskImg = img; };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
});

document.getElementById('chat-msg-input')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const input = e.target as HTMLInputElement;
    if (!input.value) return;
    addChat("じぶん", input.value);
    dataConns.forEach(conn => conn.send({ type: 'chat', text: input.value }));
    input.value = "";
  }
});

document.getElementById('join-btn')?.addEventListener('click', joinRoom);

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  v.srcObject = localStream;
  v.play();
  v.onloadedmetadata = () => { draw(); };
}
init();