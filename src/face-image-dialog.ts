/**
 * 顔画像設定ダイアログ
 * ユーザーが各表情に対応した画像をアップロードできるUIを提供
 */

import type { FaceImageSet } from '../src/face-image-manager';

export interface FaceImageUploadConfig {
  onUpload: (imageSet: FaceImageSet) => void;
  onCancel: () => void;
  currentImages?: Partial<FaceImageSet>;
}

export function createFaceImageDialog(config: FaceImageUploadConfig): HTMLDivElement {
  const dialog = document.createElement('div');
  dialog.id = 'face-image-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(20, 20, 30, 0.98);
    border: 2px solid #4facfe;
    border-radius: 12px;
    padding: 30px;
    z-index: 1000;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(10px);
    max-height: 90vh;
    overflow-y: auto;
  `;

  // オーバーレイ
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 999;
  `;
  overlay.onclick = () => config.onCancel();
  document.body.appendChild(overlay);

  // タイトル
  const title = document.createElement('h2');
  title.innerText = '顔画像をアップロード';
  title.style.cssText = `
    margin: 0 0 10px 0;
    color: #4facfe;
    font-size: 20px;
    text-align: center;
    border-bottom: 2px solid #333;
    padding-bottom: 15px;
  `;
  dialog.appendChild(title);

  // 説明
  const description = document.createElement('p');
  description.innerText = '各表情に対応した画像をアップロードしてください。すべて必須ではありません。';
  description.style.cssText = `
    color: #aaa;
    font-size: 12px;
    margin: 10px 0 20px 0;
    line-height: 1.4;
  `;
  dialog.appendChild(description);

  const imageSet: FaceImageSet = {
    neutral: config.currentImages?.neutral || '',
    happy: config.currentImages?.happy || '',
    surprised: config.currentImages?.surprised || '',
    angry: config.currentImages?.angry || '',
    sad: config.currentImages?.sad || ''
  };

  const expressions = [
    { key: 'neutral' as const, label: '😐 通常', emoji: '😐' },
    { key: 'happy' as const, label: '😊 笑顔', emoji: '😊' },
    { key: 'surprised' as const, label: '😲 驚き', emoji: '😲' },
    { key: 'angry' as const, label: '😠 怒り', emoji: '😠' },
    { key: 'sad' as const, label: '😢 悲しみ', emoji: '😢' }
  ];

  const uploadInputs: { [key: string]: HTMLInputElement } = {};

  // アップロードセクション
  expressions.forEach((expr) => {
    const section = document.createElement('div');
    section.style.cssText = `
      margin-bottom: 20px;
      padding: 15px;
      background: #1a1a2e;
      border: 1px solid #333;
      border-radius: 8px;
    `;

    // ラベル
    const label = document.createElement('label');
    label.style.cssText = `
      display: block;
      color: #fff;
      font-weight: bold;
      margin-bottom: 10px;
      cursor: pointer;
      font-size: 13px;
    `;
    label.innerText = `${expr.emoji} ${expr.label}`;
    section.appendChild(label);

    // プレビュー
    const preview = document.createElement('div');
    preview.style.cssText = `
      width: 100%;
      height: 150px;
      background: #0a0a0f;
      border: 1px dashed #444;
      border-radius: 6px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      cursor: pointer;
    `;

    const previewImg = document.createElement('img');
    previewImg.style.cssText = `
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    `;

    if (imageSet[expr.key]) {
      previewImg.src = imageSet[expr.key];
      previewImg.onload = () => {
        preview.appendChild(previewImg);
      };
    } else {
      preview.innerText = 'クリックして画像を選択';
      preview.style.color = '#666';
      preview.style.fontSize = '12px';
    }

    if (!previewImg.parentElement) {
      preview.appendChild(previewImg);
    }
    section.appendChild(preview);

    // ファイル入力
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    uploadInputs[expr.key] = input;

    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          imageSet[expr.key] = dataUrl;
          previewImg.src = dataUrl;
          preview.innerHTML = '';
          preview.appendChild(previewImg);
          preview.style.color = '#fff';
        };
        reader.readAsDataURL(file);
      }
    };
    section.appendChild(input);

    // ボタン
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 10px;
    `;

    const uploadBtn = document.createElement('button');
    uploadBtn.innerText = '選択';
    uploadBtn.style.cssText = `
      flex: 1;
      background: #4facfe;
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 12px;
      font-weight: bold;
      transition: all 0.2s;
    `;
    uploadBtn.onmouseover = () => {
      uploadBtn.style.background = '#5fbfff';
      uploadBtn.style.transform = 'translateY(-2px)';
    };
    uploadBtn.onmouseout = () => {
      uploadBtn.style.background = '#4facfe';
      uploadBtn.style.transform = 'translateY(0)';
    };
    uploadBtn.onclick = () => input.click();
    buttonContainer.appendChild(uploadBtn);

    if (imageSet[expr.key]) {
      const clearBtn = document.createElement('button');
      clearBtn.innerText = 'クリア';
      clearBtn.style.cssText = `
        background: #555;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
      `;
      clearBtn.onmouseover = () => {
        clearBtn.style.background = '#666';
        clearBtn.style.transform = 'translateY(-2px)';
      };
      clearBtn.onmouseout = () => {
        clearBtn.style.background = '#555';
        clearBtn.style.transform = 'translateY(0)';
      };
      clearBtn.onclick = () => {
        imageSet[expr.key] = '';
        previewImg.src = '';
        preview.innerHTML = '';
        preview.innerText = 'クリックして画像を選択';
        preview.style.color = '#666';
      };
      buttonContainer.appendChild(clearBtn);
    }

    section.appendChild(buttonContainer);
  });

  dialog.appendChild(
    (() => {
      const container = document.createElement('div');
      expressions.forEach((expr) => {
        const section = document.createElement('div');
        section.style.cssText = `
          margin-bottom: 20px;
          padding: 15px;
          background: #1a1a2e;
          border: 1px solid #333;
          border-radius: 8px;
        `;

        const label = document.createElement('label');
        label.style.cssText = `
          display: block;
          color: #fff;
          font-weight: bold;
          margin-bottom: 10px;
          cursor: pointer;
          font-size: 13px;
        `;
        label.innerText = `${expr.emoji} ${expr.label}`;
        section.appendChild(label);

        const preview = document.createElement('div');
        preview.style.cssText = `
          width: 100%;
          height: 150px;
          background: #0a0a0f;
          border: 1px dashed #444;
          border-radius: 6px;
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          cursor: pointer;
        `;
        preview.innerText = 'クリックして画像を選択';
        preview.style.color = '#666';
        preview.style.fontSize = '12px';
        section.appendChild(preview);

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        uploadInputs[expr.key] = input;

        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const dataUrl = event.target?.result as string;
              imageSet[expr.key] = dataUrl;
              preview.innerHTML = `<img src="${dataUrl}" style="max-width:100%;max-height:100%;object-fit:contain;">`;
            };
            reader.readAsDataURL(file);
          }
        };
        section.appendChild(input);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
          display: flex;
          gap: 10px;
        `;

        const uploadBtn = document.createElement('button');
        uploadBtn.innerText = '選択';
        uploadBtn.style.cssText = `
          flex: 1;
          background: #4facfe;
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 12px;
          font-weight: bold;
          transition: all 0.2s;
        `;
        uploadBtn.onmouseover = () => {
          uploadBtn.style.background = '#5fbfff';
          uploadBtn.style.transform = 'translateY(-2px)';
        };
        uploadBtn.onmouseout = () => {
          uploadBtn.style.background = '#4facfe';
          uploadBtn.style.transform = 'translateY(0)';
        };
        uploadBtn.onclick = () => input.click();
        buttonContainer.appendChild(uploadBtn);

        section.appendChild(buttonContainer);
        container.appendChild(section);
      });
      return container;
    })()
  );

  // フッター
  const footer = document.createElement('div');
  footer.style.cssText = `
    display: flex;
    gap: 12px;
    margin-top: 30px;
    padding-top: 20px;
    border-top: 1px solid #333;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.innerText = 'キャンセル';
  cancelBtn.style.cssText = `
    flex: 1;
    background: #555;
    color: white;
    border: none;
    padding: 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    transition: all 0.2s;
  `;
  cancelBtn.onmouseover = () => {
    cancelBtn.style.background = '#666';
    cancelBtn.style.transform = 'translateY(-2px)';
  };
  cancelBtn.onmouseout = () => {
    cancelBtn.style.background = '#555';
    cancelBtn.style.transform = 'translateY(0)';
  };
  cancelBtn.onclick = () => {
    config.onCancel();
    overlay.remove();
    dialog.remove();
  };
  footer.appendChild(cancelBtn);

  const uploadBtn = document.createElement('button');
  uploadBtn.innerText = '適用';
  uploadBtn.style.cssText = `
    flex: 1;
    background: #4facfe;
    color: white;
    border: none;
    padding: 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    transition: all 0.2s;
  `;
  uploadBtn.onmouseover = () => {
    uploadBtn.style.background = '#5fbfff';
    uploadBtn.style.transform = 'translateY(-2px)';
  };
  uploadBtn.onmouseout = () => {
    uploadBtn.style.background = '#4facfe';
    uploadBtn.style.transform = 'translateY(0)';
  };
  uploadBtn.onclick = () => {
    config.onUpload(imageSet);
    overlay.remove();
    dialog.remove();
  };
  footer.appendChild(uploadBtn);

  dialog.appendChild(footer);
  document.body.appendChild(dialog);

  return dialog;
}
