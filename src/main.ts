import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div>
    <h1>会議アプリ</h1>
    <div class="card">
      <button id="create-room" type="button">ルームコードを発行</button>
      <p id="room-display" style="margin-top: 20px; font-weight: bold; font-size: 1.2em; color: #646cff;"></p>
    </div>
  </div>
`

const createRoomBtn = document.querySelector<HTMLButtonElement>('#create-room');
const roomDisplay = document.querySelector<HTMLParagraphElement>('#room-display');

createRoomBtn?.addEventListener('click', () => {
  // 6桁のランダムなルームコードを作成
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  if (roomDisplay) {
    roomDisplay.innerText = `ルームコード: ${roomCode}`;
  }
  
  // URLにルームIDを付けて、友達に共有しやすくする
  const newUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
  window.history.pushState({ path: newUrl }, '', newUrl);
  
  alert(`ルームを作成しました！\nコード: ${roomCode}`);
});