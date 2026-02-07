/**
 * 美顔フィルター設定ダイアログ
 */

// ↓ ここを「type BeautySettings」に修正しました
import beautyFilterManager, { type BeautySettings } from './beauty-filter-manager';

export function createBeautyFilterDialog(): HTMLDivElement {
  const dialog = document.createElement('div');
  dialog.id = 'beauty-filter-dialog';
  dialog.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
    border: 2px solid #ff69b4; border-radius: 12px; padding: 20px;
    z-index: 10000; width: 90%; max-width: 420px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); font-family: sans-serif;
    color: white; max-height: 80vh; overflow-y: auto;
  `;

  const title = document.createElement('h2');
  title.textContent = '✨ 美顔フィルター & メイク';
  title.style.cssText = 'margin: 0 0 20px 0; font-size: 20px; text-align: center; color: #ff69b4;';

  const enableSection = document.createElement('div');
  enableSection.style.cssText = 'margin-bottom: 20px; display: flex; align-items: center; gap: 10px;';
  const enableToggle = document.createElement('input');
  enableToggle.type = 'checkbox';
  enableToggle.id = 'beauty-filter-enable';
  enableToggle.style.cssText = 'width: 20px; height: 20px; cursor: pointer;';
  const enableLabel = document.createElement('label');
  enableLabel.htmlFor = 'beauty-filter-enable';
  enableLabel.textContent = '美顔フィルターを有効にする';
  enableSection.appendChild(enableToggle);
  enableSection.appendChild(enableLabel);

  const filterSection = document.createElement('div');
  filterSection.style.cssText = 'background: rgba(0, 0, 0, 0.2); border-radius: 8px; padding: 15px; margin-bottom: 20px;';
  
  filterSection.appendChild(createSliderControl('smoothing', '肌の滑らかさ', 0, 1, 0.3, 0.05, (v) => `${(v * 100).toFixed(0)}%`));
  filterSection.appendChild(createSliderControl('brightness', '明るさ', -50, 50, 10, 5, (v) => `${v > 0 ? '+' : ''}${v}`));
  filterSection.appendChild(createSliderControl('contrast', 'コントラスト', -50, 50, 5, 5, (v) => `${v > 0 ? '+' : ''}${v}`));
  filterSection.appendChild(createSliderControl('whiteningEffect', '美白効果', 0, 1, 0.2, 0.05, (v) => `${(v * 100).toFixed(0)}%`));

  const makeupSection = document.createElement('div');
  makeupSection.style.cssText = 'background: rgba(0, 0, 0, 0.2); border-radius: 8px; padding: 15px; margin-bottom: 20px;';
  makeupSection.appendChild(createToggleControl('lipstick', 'リップスティック 💋'));
  makeupSection.appendChild(createColorControl('lipstickColor', 'リップの色'));
  makeupSection.appendChild(createToggleControl('eyeshadow', 'アイシャドウ ✨'));
  makeupSection.appendChild(createColorControl('eyeshadowColor', 'アイシャドウの色'));
  makeupSection.appendChild(createToggleControl('blush', 'チーク 🌸'));
  makeupSection.appendChild(createColorControl('blushColor', 'チークの色'));

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'position: absolute; top: 10px; right: 10px; background: #ea4335; border: none; color: white; width: 30px; height: 30px; border-radius: 50%; cursor: pointer;';
  closeBtn.onclick = () => dialog.remove();

  dialog.appendChild(title);
  dialog.appendChild(enableSection);
  dialog.appendChild(filterSection);
  dialog.appendChild(makeupSection);
  dialog.appendChild(closeBtn);

  enableToggle.addEventListener('change', () => {
    beautyFilterManager.updateSettings({ enabled: enableToggle.checked });
    updateAllControls();
  });

  dialog.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    const key = target.dataset.setting as keyof BeautySettings;
    if (!key) return;

    if (target.type === 'range') beautyFilterManager.updateSettings({ [key]: parseFloat(target.value) });
    else if (target.type === 'checkbox') beautyFilterManager.updateSettings({ [key]: target.checked });
    else if (target.type === 'color') beautyFilterManager.updateSettings({ [key]: target.value });
    
    updateAllControls();
  });

  function updateAllControls() {
    const settings = beautyFilterManager.getSettings();
    enableToggle.checked = settings.enabled;
    dialog.querySelectorAll('input').forEach(input => {
      const key = input.dataset.setting as keyof BeautySettings;
      if (key && key in settings) {
        if (input.type === 'range') input.value = String(settings[key]);
        else if (input.type === 'checkbox') input.checked = settings[key] as boolean;
        else if (input.type === 'color') input.value = settings[key] as string;
      }
    });
  }

  return dialog;
}

// 補助関数群 (createSliderControl, createToggleControl, createColorControl は元のロジックを維持)
function createSliderControl(key: string, label: string, min: number, max: number, def: number, step: number, format: (v: number) => string) {
  const div = document.createElement('div');
  div.style.margin = '10px 0';
  div.innerHTML = `<label style="display:block;font-size:12px">${label}</label>
                   <div style="display:flex;align-items:center;gap:10px">
                     <input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${def}" style="flex:1">
                     <span class="slider-value" style="font-size:12px;width:40px">${format(def)}</span>
                   </div>`;
  return div;
}

function createToggleControl(key: string, label: string) {
  const div = document.createElement('div');
  div.style.margin = '5px 0';
  div.innerHTML = `<input type="checkbox" data-setting="${key}" id="chk-${key}"> <label for="chk-${key}" style="font-size:12px">${label}</label>`;
  return div;
}

function createColorControl(key: string, label: string) {
  const div = document.createElement('div');
  div.style.margin = '5px 0 5px 25px';
  div.innerHTML = `<label style="font-size:11px">${label}</label> <input type="color" data-setting="${key}" value="#ff69b4">`;
  return div;
}

export function setupBeautyFilterButtonHandler(buttonId: string = 'beauty-btn'): void {
  document.getElementById(buttonId)?.addEventListener('click', () => {
    const existing = document.getElementById('beauty-filter-dialog');
    if (existing) existing.remove();
    else document.body.appendChild(createBeautyFilterDialog());
  });
}