import { AVATARS } from '../src/avatar-manager';

/**
 * アバター選択ダイアログを作成
 */
export function createAvatarDialog(): HTMLDivElement {
  const dialog = document.createElement('div');
  dialog.id = 'avatar-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(20, 20, 30, 0.95);
    border: 2px solid #4facfe;
    border-radius: 12px;
    padding: 20px;
    z-index: 1000;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(10px);
    max-height: 80vh;
    overflow-y: auto;
  `;

  // タイトル
  const title = document.createElement('h2');
  title.innerText = 'アバターを選択';
  title.style.cssText = `
    margin-bottom: 20px;
    color: #4facfe;
    font-size: 18px;
    text-align: center;
    border-bottom: 1px solid #333;
    padding-bottom: 15px;
  `;
  dialog.appendChild(title);

  // アバター選択グリッド
  const grid = document.createElement('div');
  grid.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 20px;
  `;

  AVATARS.forEach(avatar => {
    const card = document.createElement('div');
    card.className = 'avatar-card';
    card.style.cssText = `
      background: #1a1a2e;
      border: 2px solid #333;
      border-radius: 8px;
      padding: 12px;
      cursor: pointer;
      transition: all 0.3s;
      text-align: center;
    `;

    card.onmouseover = () => {
      card.style.borderColor = '#4facfe';
      card.style.transform = 'translateY(-4px)';
      card.style.boxShadow = '0 4px 16px rgba(79, 172, 254, 0.3)';
    };

    card.onmouseout = () => {
      card.style.borderColor = '#333';
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = 'none';
    };

    const emoji = document.createElement('div');
    emoji.innerText = avatar.emoji;
    emoji.style.cssText = `
      font-size: 36px;
      margin-bottom: 8px;
    `;

    const name = document.createElement('div');
    name.innerText = avatar.name;
    name.style.cssText = `
      color: #fff;
      font-weight: bold;
      margin-bottom: 4px;
      font-size: 13px;
    `;

    const description = document.createElement('div');
    description.innerText = avatar.description;
    description.style.cssText = `
      color: #888;
      font-size: 11px;
    `;

    card.appendChild(emoji);
    card.appendChild(name);
    card.appendChild(description);

    card.dataset.avatarId = avatar.id;

    grid.appendChild(card);
  });

  dialog.appendChild(grid);

  // クローズボタン
  const closeBtn = document.createElement('button');
  closeBtn.innerText = '閉じる';
  closeBtn.style.cssText = `
    width: 100%;
    background: #333;
    border: 1px solid #555;
    color: white;
    padding: 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: 0.3s;
    font-size: 12px;
  `;

  closeBtn.onmouseover = () => {
    closeBtn.style.background = '#444';
  };

  closeBtn.onmouseout = () => {
    closeBtn.style.background = '#333';
  };

  closeBtn.onclick = () => {
    dialog.remove();
  };

  dialog.appendChild(closeBtn);

  // 背景のクリックで閉じる
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
  `;

  overlay.onclick = () => {
    dialog.remove();
    overlay.remove();
  };

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  return dialog;
}

/**
 * アバター選択カード上でのクリック処理
 */
export function setupAvatarCardClickHandler(
  dialog: HTMLDivElement,
  onAvatarSelect: (avatarId: string) => void
) {
  const cards = dialog.querySelectorAll('.avatar-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const avatarId = card.getAttribute('data-avatar-id');
      if (avatarId) {
        onAvatarSelect(avatarId);
        dialog.remove();
        // オーバーレイも削除
        const overlay = document.querySelector('[style*="fixed"][style*="rgba(0, 0, 0, 0.5)"]');
        if (overlay) overlay.remove();
      }
    });
  });
}
