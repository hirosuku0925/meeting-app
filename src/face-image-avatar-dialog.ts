/**
 * 顔画像アバターダイアログ
 * 顔画像のアップロードと選択UI
 */

import faceImageAvatarManager from './face-image-avatar-manager';

export function createFaceImageAvatarDialog(): HTMLDivElement {
  const dialog = document.createElement('div');
  dialog.id = 'face-avatar-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const container = document.createElement('div');
  container.style.cssText = `
    background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
    border: 2px solid #4facfe;
    border-radius: 12px;
    padding: 30px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    color: white;
    font-family: sans-serif;
  `;

  // タイトル
  const title = document.createElement('h2');
  title.textContent = '顔画像アバター';
  title.style.cssText = 'margin: 0 0 20px 0; font-size: 22px; text-align: center; color: #4facfe;';

  // アップロードセクション
  const uploadSection = document.createElement('div');
  uploadSection.style.cssText = `
    background: rgba(0, 0, 0, 0.3);
    border: 2px dashed #4facfe;
    border-radius: 8px;
    padding: 20px;
    text-align: center;
    margin-bottom: 20px;
    cursor: pointer;
    transition: 0.3s;
  `;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';

  const uploadText = document.createElement('div');
  uploadText.innerHTML = `
    <p style="font-size: 16px; margin: 10px 0;">📸 顔画像をアップロード</p>
    <p style="font-size: 12px; color: #aaa; margin: 0;">クリックするか、ドラッグ＆ドロップで画像を選択</p>
  `;

  uploadSection.appendChild(uploadText);
  uploadSection.appendChild(fileInput);

  uploadSection.addEventListener('click', () => fileInput.click());
  uploadSection.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadSection.style.background = 'rgba(79, 172, 254, 0.2)';
  });
  uploadSection.addEventListener('dragleave', () => {
    uploadSection.style.background = 'rgba(0, 0, 0, 0.3)';
  });
  uploadSection.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadSection.style.background = 'rgba(0, 0, 0, 0.3)';
    
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      await handleFileUpload(files[0]);
    }
  });

  // 名前入力
  const nameInputContainer = document.createElement('div');
  nameInputContainer.style.cssText = 'margin-bottom: 15px; display: none;';
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'アバターの名前：';
  nameLabel.style.cssText = 'display: block; margin-bottom: 5px; font-size: 12px; font-weight: bold;';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'アバターの名前を入力';
  nameInput.style.cssText = `
    width: 100%;
    padding: 8px;
    background: #222;
    border: 1px solid #555;
    color: white;
    border-radius: 4px;
    font-size: 12px;
    box-sizing: border-box;
  `;

  const uploadBtn = document.createElement('button');
  uploadBtn.textContent = 'このアバターをアップロード';
  uploadBtn.style.cssText = `
    background: #4facfe;
    border: none;
    color: white;
    padding: 8px 15px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
    width: 100%;
    transition: 0.2s;
    margin-top: 10px;
  `;
  uploadBtn.onmouseover = () => (uploadBtn.style.background = '#60b8ff');
  uploadBtn.onmouseout = () => (uploadBtn.style.background = '#4facfe');
  uploadBtn.style.display = 'none';

  nameInputContainer.appendChild(nameLabel);
  nameInputContainer.appendChild(nameInput);
  nameInputContainer.appendChild(uploadBtn);

  // プレビュー
  const previewContainer = document.createElement('div');
  previewContainer.style.cssText = `
    margin-bottom: 15px;
    text-align: center;
    display: none;
  `;
  const previewImage = document.createElement('img');
  previewImage.style.cssText = `
    max-width: 100%;
    max-height: 200px;
    border-radius: 8px;
    border: 2px solid #4facfe;
  `;
  previewContainer.appendChild(previewImage);

  let selectedFile: File | null = null;

  async function handleFileUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください');
      return;
    }

    selectedFile = file;
    nameInput.value = file.name.replace(/\.[^/.]+$/, ''); // ファイル名から拡張子を削除

    // プレビュー表示
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target?.result as string;
      previewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);

    // UI更新
    nameInputContainer.style.display = 'block';
    uploadBtn.style.display = 'block';
  }

  fileInput.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      await handleFileUpload(file);
    }
  });

  uploadBtn.addEventListener('click', async () => {
    if (!selectedFile || !nameInput.value.trim()) {
      alert('名前を入力してください');
      return;
    }

    try {
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'アップロード中...';

      const avatar = await faceImageAvatarManager.uploadFaceImage(
        selectedFile,
        nameInput.value.trim()
      );

      faceImageAvatarManager.setCurrentAvatar(avatar.id);
      updateAvatarList();

      // リセット
      selectedFile = null;
      nameInput.value = '';
      previewContainer.style.display = 'none';
      nameInputContainer.style.display = 'none';
      uploadBtn.style.display = 'none';
      fileInput.value = '';
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'このアバターをアップロード';
    } catch (error) {
      console.error('Upload failed:', error);
      alert('アップロードに失敗しました');
    }
  });

  // アバター一覧セクション
  const listSection = document.createElement('div');
  listSection.style.cssText = `
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #444;
  `;

  const listTitle = document.createElement('h3');
  listTitle.textContent = 'アップロード済みアバター';
  listTitle.style.cssText = 'margin: 0 0 15px 0; font-size: 16px; color: #4facfe;';

  const avatarList = document.createElement('div');
  avatarList.id = 'avatar-list';
  avatarList.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px;';

  function updateAvatarList() {
    avatarList.innerHTML = '';
    const avatars = faceImageAvatarManager.getAllAvatars();
    const currentId = faceImageAvatarManager.getCurrentAvatarId();

    if (avatars.length === 0) {
      avatarList.innerHTML = '<p style="color: #888; grid-column: 1/-1; text-align: center;">アバターがまだアップロードされていません</p>';
      return;
    }

    avatars.forEach((avatar) => {
      const avatarItem = document.createElement('div');
      avatarItem.style.cssText = `
        position: relative;
        cursor: pointer;
        border-radius: 8px;
        overflow: hidden;
        aspect-ratio: 1;
        border: 3px solid ${currentId === avatar.id ? '#4facfe' : '#555'};
        transition: 0.2s;
      `;

      const img = document.createElement('img');
      img.src = avatar.imageDataUrl;
      img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';

      const label = document.createElement('div');
      label.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 5px;
        font-size: 11px;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `;
      label.textContent = avatar.name;

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '✕';
      deleteBtn.style.cssText = `
        position: absolute;
        top: 2px;
        right: 2px;
        background: #ea4335;
        border: none;
        color: white;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 12px;
        display: none;
      `;

      avatarItem.appendChild(img);
      avatarItem.appendChild(label);
      avatarItem.appendChild(deleteBtn);

      avatarItem.addEventListener('mouseenter', () => {
        deleteBtn.style.display = 'block';
        avatarItem.style.opacity = '0.8';
      });
      avatarItem.addEventListener('mouseleave', () => {
        deleteBtn.style.display = 'none';
        avatarItem.style.opacity = '1';
      });

      avatarItem.addEventListener('click', () => {
        faceImageAvatarManager.setCurrentAvatar(avatar.id);
        updateAvatarList();
      });

      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('このアバターを削除しますか？')) {
          faceImageAvatarManager.deleteAvatar(avatar.id);
          updateAvatarList();
        }
      });

      avatarList.appendChild(avatarItem);
    });
  }

  listSection.appendChild(listTitle);
  listSection.appendChild(avatarList);

  // 閉じるボタン
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    position: absolute;
    top: 15px;
    right: 15px;
    background: #ea4335;
    border: none;
    color: white;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 24px;
  `;
  closeBtn.onclick = () => dialog.remove();

  // 組み立て
  container.appendChild(title);
  container.appendChild(uploadSection);
  container.appendChild(previewContainer);
  container.appendChild(nameInputContainer);
  container.appendChild(listSection);
  container.appendChild(closeBtn);

  dialog.appendChild(container);

  // 初期化
  updateAvatarList();

  // ダイアログ外クリックで閉じる
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      dialog.remove();
    }
  });

  return dialog;
}

export function setupFaceAvatarButtonHandler(buttonId: string = 'avatar-btn'): void {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  btn.addEventListener('click', () => {
    const existing = document.getElementById('face-avatar-dialog');
    if (existing) {
      existing.remove();
      return;
    }

    const dialog = createFaceImageAvatarDialog();
    document.body.appendChild(dialog);
  });
}
