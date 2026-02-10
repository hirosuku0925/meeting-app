import './style.css'
import { Peer, type MediaConnection, type DataConnection } from 'peerjs'

const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  
  #app-container { display: flex; height: 100vh; width: 100%; flex-direction: column; }
  #middle-section { display: flex; flex: 1; height: 55vh; overflow: hidden; }
  
  /* メイン映像 */
  #video-area { flex: 1; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; }
  canvas { height: 100%; max-width: 100%; object-fit: contain; }

  /* 右側のチャット */
  #chat-sidebar { width: 280px; background: #222; border-left: 1px solid #444; display: flex; flex-direction: column; }
  #chat-messages { flex: 1; overflow-y: auto; padding: 10px; font-size: 13px; }
  .chat-item { margin-bottom: 8px; padding: 5px; background: #333; border-radius: 4px; word-break: break-all; }

  /* 下側の入力・ボタンエリア */
  #control-panel { background: #111; padding: 10px; border-top: 1px solid #333; }
  .input-group { display: flex; justify-content: center; gap: 10px; margin-bottom: 10px; }
  input[type="text"] { background: #222; border: 1px solid #444; color: white; padding: 8px; border-radius: 4px; width: 120px; }
  
  #toolbar { display: flex; align-items: center; justify-content: center; gap: 15px; }
  .tool-btn { background: #333; border: none; color: white; font-size: 20px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .active { background: #4facfe !important; }
  
  /* 参加・退出ボタン */
  #join-btn { background: #2ecc71; color: white; padding: 10px 20px; border-radius: 6px; font-weight: bold; border: none; cursor: pointer; }
  #leave-btn { background: #ea4335; color: white; padding: 10px 20px; border-radius: 6px; font-weight: bold; border: none; cursor: pointer; display: none; }

  /* 多人数用グリッド（3人以上対応） */
  #video-grid { height: 150px; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; border-top: 1px solid #333; }
  .remote-unit { height: 100%; min-width: 160px; background: #222; border-radius: 6px; position: relative; overflow: hidden; }
  .remote-unit video { width: 100%; height: 100%; object-fit: cover; }
  .name-tag { position: absolute; bottom: 5px; left: 5px; background: rgba(0,0,0,0.5); font-size: 10px; padding: 2px 5px; border-radius: 3px; }
`;
document.head.appendChild(globalStyle);

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div id="app-container">
    <div id="middle-section">
      <div id="video-area"><canvas id="output-canvas"></canvas></div>
      <div id="chat-sidebar">
        <div style="padding: 8px; background: #333; font-size: 12px; font-weight: bold; text-align: center;">チャット</div>
        <div id="chat-messages"></div>
        <div style="padding: 10px; border-top: 1px solid #444;">
          <input id="chat-msg-input" type="text" style="width:100%" placeholder="送信...">
        </div>
      </div>
    </div>

    <div id="control-panel">
      <div class="input-group">
        <input id="user-name" type="text" placeholder="なまえ">
        <input id="room-name" type="text" placeholder="るーむめい">
        <button id="join-btn">参加する</button>
        <button id="leave-btn">退出する</button>
      </div>
      <div id="toolbar">
        <button id="cam-btn" class="tool-btn">📹</button>
        <button id="mic-btn" class="tool-btn">🎤</button>
        <label class="tool-btn" title="おめん">🎭
          <input type="file" id="mask-upload" accept="image/*" style="display:none;">
        </label>
      </div>
    </div>

    <div id="video-grid"></div>
  </div>
`;

// --- 通信・映像処理 ---
let localStream: MediaStream | null = null;
let peer: Peer | null = null;
let maskImg: HTMLImageElement | null = null;
const canvas = document.getElementById('output-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const v = document.createElement('video');
const connections = new Map<string, {call: MediaConnection, data: DataConnection}>();

function draw() {
  if (v.paused || v.ended) return;
  canvas.width = v.videoWidth; canvas.height = v.videoHeight;
  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
  if (maskImg) {
    const size = canvas.height * 0.7;
    ctx.drawImage(maskImg, (canvas.width - size)/2, (canvas.height - size)/2, size, size);
  }
  requestAnimationFrame(draw);
}

function addChat(name: string, text: string) {
  const msgArea = document.getElementById('chat-messages')!;
  const div = document.createElement('div');
  div.className = 'chat-item';
  div.innerHTML = `<strong>${name}:</strong> ${text}`;
  msgArea.appendChild(div);
  msgArea.scrollTop = msgArea.scrollHeight;
}

function joinRoom() {
  const room = (document.getElementById('room-name') as HTMLInputElement).value;
  const name = (document.getElementById('user-name') as HTMLInputElement).value || "ななし";
  if (!room) return alert("るーむめいを入れてね！");

  // 多人数でつながりやすくするためにIDを工夫
  peer = new Peer();
  peer.on('open', (id) => {
    document.getElementById('join-btn')!.style.display = "none";
    document.getElementById('leave-btn')!.style.display = "inline-block";
    addChat("システム", `${room} にはいりました`);
    
    // ここで「自分が入ったよ」と皆に知らせる仕組み（簡易版：同じ部屋名の人に接続試行）
    // 本来はシグナリングサーバが必要ですが、今回は着信をメインに受けます
  });

  // 誰かから電話がきたら（3人以上対応）
  peer.on('call', (call) => {
    call.answer(canvas.captureStream(30));
    setupRemote(call);
  });

  peer.on('connection', (conn) => {
    conn.on('data', (data: any) => {
      if (data.type === 'chat') addChat(data.name, data.text);
    });
    // かけ直して双方向にする
    const call = peer!.call(conn.peer, canvas.captureStream(30));
    setupRemote(call);
    connections.set(conn.peer, {call, data: conn});
  });
}

function setupRemote(call: MediaConnection) {
  call.on('stream', (stream) => {
    if (document.getElementById(`unit-${call.peer}`)) return;
    const unit = document.createElement('div');
    unit.id = `unit-${call.peer}`;
    unit.className = 'remote-unit';
    unit.innerHTML = `<video autoplay playsinline></video><div class="name-tag">あいて</div>`;
    document.getElementById('video-grid')?.appendChild(unit);
    const rv = unit.querySelector('video')!;
    rv.srcObject = stream;
  });
  call.on('close', () => document.getElementById(`unit-${call.peer}`)?.remove());
}

// --- ボタン操作 ---
document.getElementById('leave-btn')?.addEventListener('click', () => {
  location.reload(); // 一番確実に退出・リセットする方法
});

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
    const name = (document.getElementById('user-name') as HTMLInputElement).value || "じぶん";
    if (!input.value) return;
    addChat(name, input.value);
    connections.forEach(c => c.data.send({ type: 'chat', name, text: input.value }));
    input.value = "";
  }
});

document.getElementById('join-btn')?.addEventListener('click', joinRoom);

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  v.srcObject = localStream; v.play();
  v.onloadedmetadata = () => draw();
}
init();