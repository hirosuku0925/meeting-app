import './style.css'
import { Peer, MediaConnection, DataConnection } from 'peerjs'
import avatarManager from './avatar-manager'
import { createAvatarDialog, setupAvatarCardClickHandler } from './avatar-dialog'
import SettingsManager from './settings-manager'

// --- 1. スタイル設定 ---
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, html { width: 100%; height: 100%; overflow: hidden; background: #000; color: white; font-family: sans-serif; }
  .tool-btn { background: #333; border: none; color: white; font-size: 18px; width: 45px; height: 45px; border-radius: 50%; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
  .tool-btn:hover { background: #444; transform: scale(1.1); }
  .ctrl-group { display: flex; flex-direction: column; align-items: center; font-size: 10px; color: #888; gap: 4px; }
  .off { background: #ea4335 !important; }
  .active { background: #4facfe !important; }
  .chat-msg { margin-bottom: 5px; word-break: break-all; }
  .chat-msg.me { color: #4facfe; }
`;
document.head.appendChild(globalStyle);

// --- 2. HTML構造 ---
const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.innerHTML = `
    <div style="display: flex; height: 100vh; width: 100%; flex-direction: column;">
      <div id="main-display" style="height: 60vh; position: relative; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
        <video id="big-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: contain;"></video>
        <div id="status-badge" style="position: absolute; top: 15px; left: 15px; background: rgba(0,0,0,0.7); padding: 5px 15px; border-radius: 20px; border: 1px solid #4facfe; font-size: 12px; z-index: 10;">準備中...</div>
        
        <div id="chat-box" style="display:none; position: absolute; right: 10px; top: 10px; bottom: 10px; width: 220px; background: rgba(30,30,30,0.9); border-radius: 8px; flex-direction: column; border: 1px solid #444; z-index: 100;">
          <div style="padding: 8px; border-bottom: 1px solid #444; font-size: 12px; font-weight: bold;">チャット</div>
          <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; font-size: 11px; display:flex; flex-direction:column;"></div>
          <div style="padding: 8px; display: flex; gap: 5px;">
            <input id="chat-input" type="text" placeholder="メッセージ..." style="flex: 1; background: #222; border: 1px solid #555; color: white; border-radius: 4px; padding: 5px; font-size: 11px;">
            <button id="chat-send-btn" style="background: #4facfe; border: none; color: white; padding: 5px; border-radius: 4px; font-size: 11px; cursor:pointer;">送信</button>
          </div>
        </div>
      </div>

      <div id="toolbar" style="height: 100px; background: #111; display: flex; align-items: center; justify-content: center; gap: 12px; border-top: 1px solid #333; flex-shrink: 0; padding: 0 10px;">
        <div class="ctrl-group"><button id="mic-btn" class="tool-btn">🎤</button><span>マイク</span></div>
        <div class="ctrl-group"><button id="cam-btn" class="tool-btn">📹</button><span>カメラ</span></div>
        <div class="ctrl-group"><button id="share-btn" class="tool-btn">📺</button><span>画面共有</span></div>
        <div class="ctrl-group"><button id="chat-toggle-btn" class="tool-btn">💬</button><span>チャット</span></div>
        <div class="ctrl-group"><button id="record-btn" class="tool-btn">🔴</button><span>録画</span></div>
        <div class="ctrl-group"><button id="avatar-btn" class="tool-btn">🎭</button><span>アバター</span></div>
        
        <div style="width: 1px; height: 40px; background: #444; margin: 0 5px;"></div>
        
        <input id="name-input" type="text" placeholder="あなたの名前" value="ゲスト" style="background: #222; border: 1px solid #444; color: white; padding: 10px; border-radius: 5px; width: 90px; font-size: 12px;">
        <input id="room-input" type="text" placeholder="ルーム名" style="background: #222; border: 1px solid #444; color: white; padding: 10px; border-radius: 5px; width: 90px; font-size: 12px;">
        <button id="join-btn" style="background: #2ecc71; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 12px;">参加</button>
        <button id="exit-btn" style="background: #ea4335; color: white; border: none; padding: 10px 15px; border-radius: 5px; cursor: pointer; font-size: 12px;">終了</button>
      </div>

      <div id="video-grid" style="flex: 1; background: #000; display: flex; gap: 10px; padding: 10px; overflow-x: auto; align-items: center; justify-content: center;">
        <video id="local-video" autoplay playsinline muted style="height: 100%; border-radius: 8px; border: 2px solid #4facfe; object-fit: cover;"></video>
      </div>
    </div>
  `;
}

// --- 3. プログラム処理 ---
const bigVideo = document.querySelector<HTMLVideoElement>('#big-video')!;
const localVideo = document.querySelector<HTMLVideoElement>('#local-video')!;
const videoGrid = document.querySelector<HTMLDivElement>('#video-grid')!;
const statusBadge = document.querySelector<HTMLDivElement>('#status-badge')!;
const chatBox = document.querySelector<HTMLDivElement>('#chat-box')!;
const chatMessages = document.querySelector<HTMLDivElement>('#chat-messages')!;

let localStream: MediaStream;
let screenStream: MediaStream | null = null;
let peer: Peer | null = null;
let myName = "ゲスト"; // ★自分の名前を保持する変数
const connectedPeers = new Set<string>();
const dataConnections = new Map<string, DataConnection>();
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: { echoCancellation: true, noiseSuppression: true }
    });
    localVideo.srcObject = localStream;
    bigVideo.srcObject = localStream;
    statusBadge.innerText = "準備完了！名前とルーム名を入力して参加してください";

    // 前回の設定を復元
    const savedUserName = SettingsManager.getUserName();
    const savedRoomName = SettingsManager.getLastRoomName();
    const savedAvatarId = SettingsManager.getSelectedAvatarId();

    const nameInput = document.querySelector<HTMLInputElement>('#name-input');
    const roomInput = document.querySelector<HTMLInputElement>('#room-input');

    if (nameInput) nameInput.value = savedUserName;
    if (roomInput) roomInput.value = savedRoomName;

    // アバターマネージャーを初期化
    avatarManager.setAvatar(savedAvatarId);

  } catch (e) {
    statusBadge.innerText = "カメラエラー！許可してください";
  }
}

function appendMessage(sender: string, text: string, isMe = false) {
  const div = document.createElement('div');
  div.className = `chat-msg ${isMe ? 'me' : ''}`;
  div.innerText = `${sender}: ${text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChatMessage() {
  const input = document.querySelector<HTMLInputElement>('#chat-input')!;
  const msg = input.value.trim();
  if (!msg) return;

  // 送信データに自分の名前を含める
  const data = { name: myName, message: msg };
  dataConnections.forEach(conn => {
    if (conn.open) conn.send(data);
  });

  appendMessage("自分", msg, true);
  input.value = "";
}

document.querySelector('#chat-send-btn')?.addEventListener('click', sendChatMessage);
document.querySelector<HTMLInputElement>('#chat-input')?.addEventListener('keypress', (e: KeyboardEvent) => {
  if (e.key === 'Enter') sendChatMessage();
});

document.querySelector('#chat-toggle-btn')?.addEventListener('click', () => {
  chatBox.style.display = chatBox.style.display === 'none' ? 'flex' : 'none';
});

document.querySelector('#avatar-btn')?.addEventListener('click', async (e: Event) => {
  const btn = e.currentTarget as HTMLElement;
  
  // アバター選択ダイアログを表示
  const dialog = createAvatarDialog();
  
  // アバター選択時のコールバック
  setupAvatarCardClickHandler(dialog, async (avatarId: string) => {
    btn.classList.add('active');
    
    // 選択されたアバターに切り替えて保存
    avatarManager.setAvatar(avatarId);
    SettingsManager.setSelectedAvatarId(avatarId);
    const selectedAvatar = avatarManager.getCurrentAvatar();
    
    // アバター表示モーダルを表示
    const modal = document.createElement('div');
    modal.id = 'avatar-modal';
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
      background: rgba(0,0,0,0.9); display: flex; align-items: center; 
      justify-content: center; z-index: 200;
    `;
    modal.innerHTML = `
      <div style="background: #1a1a1a; border: 2px solid #4facfe; border-radius: 10px; 
                  padding: 20px; width: 95%; height: 95%; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h2 style="color: #4facfe;">${selectedAvatar.emoji} ${selectedAvatar.name} - ${selectedAvatar.description}</h2>
          <button id="close-avatar-btn" style="background: #ea4335; color: white; border: none; 
                  padding: 8px 15px; border-radius: 5px; cursor: pointer; font-size: 14px;">
            閉じる
          </button>
        </div>
        <div id="avatar-container" style="flex: 1; background: #000; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center;">
          <div style="color: #4facfe; text-align: center; font-size: 18px;">
            <p>${selectedAvatar.emoji}</p>
            <p>${selectedAvatar.name}アバター</p>
            <p style="font-size: 12px; color: #888; margin-top: 10px;">モデルの読み込み中...</p>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // VRM アバターをロード
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { VRMLoaderPlugin } = await import('@pixiv/three-vrm');
      const THREE = await import('three');
      
      const container = document.querySelector('#avatar-container')!;
      container.innerHTML = '';
      
      // Three.js シーンセットアップ
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setClearColor(0x000000, 1);
      container.appendChild(renderer.domElement);
      
      camera.position.set(0, 1, 2);
      scene.add(new THREE.AmbientLight(0xffffff, 0.8));
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(5, 5, 5);
      scene.add(directionalLight);
      
      // VRM ロード
      const loader = new GLTFLoader();
      loader.register((ext: any) => new VRMLoaderPlugin(ext));
      
      try {
        console.log('Loading avatar model:', selectedAvatar.modelPath);
        const model = await loader.loadAsync(selectedAvatar.modelPath);
        scene.add(model.scene);
        console.log('Avatar model loaded successfully');
        
        const animate = () => {
          requestAnimationFrame(animate);
          model.scene.rotation.y += 0.005; // アバターを回転させて表示
          renderer.render(scene, camera);
        };
        animate();
      } catch (vrmError) {
        console.error('Avatar loading error:', vrmError);
        const errorMessage = vrmError instanceof Error ? vrmError.message : String(vrmError);
        container.innerHTML = `<p style="color: #ff6b6b; text-align: center; padding-top: 50px;">
          ${selectedAvatar.emoji}<br>
          ${selectedAvatar.name}のモデルが見つかりません。<br>
          <small style="color: #888;">パス: ${selectedAvatar.modelPath}</small><br>
          <small style="color: #ff9999; margin-top: 10px;">エラー: ${errorMessage}</small>
        </p>`;
      }
    } catch (error) {
      console.error('アバター読み込みエラー:', error);
      const container = document.querySelector('#avatar-container')!;
      container.innerHTML = `<p style="color: #ff6b6b; text-align: center; padding-top: 50px;">
        アバターの読み込みに失敗しました。<br>
        <small>${error}</small>
      </p>`;
    }
    
    // 閉じるボタン
    document.querySelector('#close-avatar-btn')?.addEventListener('click', () => {
      modal.remove();
      btn.classList.remove('active');
    });
    
    // モーダル外クリックで閉じる
    modal.addEventListener('click', (event: Event) => {
      if (event.target === modal) {
        modal.remove();
        btn.classList.remove('active');
      }
    });
  });
});

document.querySelector('#mic-btn')?.addEventListener('click', (e: Event) => {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
});

document.querySelector('#cam-btn')?.addEventListener('click', (e: Event) => {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  (e.currentTarget as HTMLElement).classList.toggle('off', !track.enabled);
});

document.querySelector('#share-btn')?.addEventListener('click', async (e: Event) => {
  const btn = e.currentTarget as HTMLElement;
  if (!screenStream) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      btn.classList.add('active');
      bigVideo.srcObject = screenStream;
      replaceVideoTrack(screenStream.getVideoTracks()[0]);
      screenStream.getVideoTracks()[0].onended = () => stopScreenShare(btn);
    } catch (err) { console.error(err); }
  } else {
    stopScreenShare(btn);
  }
});

function stopScreenShare(btn: HTMLElement) {
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  btn.classList.remove('active');
  bigVideo.srcObject = localStream;
  replaceVideoTrack(localStream.getVideoTracks()[0]);
}

function replaceVideoTrack(newTrack: MediaStreamTrack) {
  if (!peer) return;
  Object.values(peer.connections).forEach((conns: any) => {
    conns.forEach((conn: any) => {
      if (conn.peerConnection) {
        const sender = conn.peerConnection.getSenders().find((s: any) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(newTrack);
      }
    });
  });
}

document.querySelector('#record-btn')?.addEventListener('click', (e: Event) => {
  const btn = e.currentTarget as HTMLElement;
  if (!recorder || recorder.state === 'inactive') {
    chunks = [];
    const streamToRecord = screenStream || localStream;
    recorder = new MediaRecorder(streamToRecord);
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

function join() {
  const nameInput = document.querySelector<HTMLInputElement>('#name-input');
  const roomInput = document.querySelector<HTMLInputElement>('#room-input');
  
  myName = nameInput?.value.trim() || "名無し"; // ★名前を取得
  const room = roomInput?.value.trim();
  
  if (!room) return alert("ルーム名を入力してください");
  
  // 設定を保存
  SettingsManager.setUserName(myName);
  SettingsManager.setLastRoomName(room);
  SettingsManager.setSelectedAvatarId(avatarManager.getCurrentAvatarId());
  
  statusBadge.innerText = `${myName}として接続中...`;
  tryNextSeat(`vFINAL-${room}`, 1);
}

function tryNextSeat(roomKey: string, seat: number) {
  if (peer) peer.destroy();
  peer = new Peer(`${roomKey}-${seat}`);

  peer.on('open', () => {
    statusBadge.innerText = `入室完了: ${myName}`;
    
    setInterval(() => {
      if (!peer || peer.destroyed) return;
      for (let i = 1; i < seat; i++) {
        const targetId = `${roomKey}-${i}`;
        if (!connectedPeers.has(targetId)) {
          const call = peer.call(targetId, screenStream || localStream);
          if (call) handleCall(call);
          const conn = peer.connect(targetId);
          if (conn) handleDataConnection(conn);
        }
      }
    }, 4000);
  });

  peer.on('call', (call: MediaConnection) => {
    call.answer(screenStream || localStream);
    handleCall(call);
  });

  peer.on('connection', (conn: DataConnection) => {
    handleDataConnection(conn);
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') tryNextSeat(roomKey, seat + 1);
  });
}

function handleCall(call: MediaConnection) {
  if (connectedPeers.has(call.peer)) return;
  connectedPeers.add(call.peer);

  call.on('stream', (stream: MediaStream) => {
    if (document.getElementById(call.peer)) return;
    const v = document.createElement('video');
    v.id = call.peer;
    v.srcObject = stream; v.autoplay = true; v.playsInline = true;
    v.style.cssText = "height: 100%; min-width: 180px; border-radius: 8px; background: #222; object-fit: cover; cursor: pointer;";
    v.onclick = () => { 
      bigVideo.srcObject = stream; 
      bigVideo.muted = false; 
    };
    videoGrid.appendChild(v);
    bigVideo.srcObject = stream;
    bigVideo.muted = false;
  });
}

function handleDataConnection(conn: DataConnection) {
  dataConnections.set(conn.peer, conn);
  
  conn.on('data', (data: any) => {
    // データがオブジェクト（名前とメッセージ）の場合に対応
    if (typeof data === 'object' && data.name) {
      appendMessage(data.name, data.message);
    } else {
      appendMessage("不明なユーザー", data as string);
    }
  });

  conn.on('close', () => {
    dataConnections.delete(conn.peer);
  });
}

document.querySelector('#join-btn')?.addEventListener('click', join);
document.querySelector('#exit-btn')?.addEventListener('click', () => location.reload());

init();