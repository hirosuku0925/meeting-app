/**
 * 美顔フィルター設定ダイアログ
 */

import beautyFilterManager, { BeautySettings } from './beauty-filter-manager';

export function createBeautyFilterDialog(): HTMLDivElement {
  const dialog = document.createElement('div');
  dialog.id = 'beauty-filter-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
    border: 2px solid #ff69b4;
    border-radius: 12px;
    padding: 20px;
    z-index: 10000;
    width: 90%;
    max-width: 420px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    font-family: sans-serif;
    color: white;
    max-height: 80vh;
    overflow-y: auto;
  `;

  const title = document.createElement('h2');
  title.textContent = '✨ 美顔フィルター & メイク';
  title.style.cssText = 'margin: 0 0 20px 0; font-size: 20px; text-align: center; color: #ff69b4;';

  // 有効化トグル
  const enableSection = document.createElement('div');
  enableSection.style.cssText = 'margin-bottom: 20px; display: flex; align-items: center; gap: 10px;';

  const enableToggle = document.createElement('input');
  enableToggle.type = 'checkbox';
  enableToggle.id = 'beauty-filter-enable';
  enableToggle.style.cssText = 'width: 20px; height: 20px; cursor: pointer;';
  enableToggle.checked = false;

  const enableLabel = document.createElement('label');
  enableLabel.htmlFor = 'beauty-filter-enable';
  enableLabel.textContent = '美顔フィルターを有効にする';
  enableLabel.style.cssText = 'cursor: pointer; font-weight: bold;';

  enableSection.appendChild(enableToggle);
  enableSection.appendChild(enableLabel);

  // フィルター設定セクション
  const filterSection = document.createElement('div');
  filterSection.style.cssText = `
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 20px;
  `;

  const filterTitle = document.createElement('h3');
  filterTitle.textContent = 'フィルター設定';
  filterTitle.style.cssText = 'margin: 0 0 15px 0; font-size: 14px; color: #ffb6c1;';

  const smoothingSection = createSliderControl(
    'smoothing',
    '肌の滑らかさ',
    0,
    1,
    0.3,
    0.05,
    (value) => `${(value * 100).toFixed(0)}%`
  );

  const brightnessSection = createSliderControl(
    'brightness',
    '明るさ',
    -50,
    50,
    10,
    5,
    (value) => `${value > 0 ? '+' : ''}${value}`
  );

  const contrastSection = createSliderControl(
    'contrast',
    'コントラスト',
    -50,
    50,
    5,
    5,
    (value) => `${value > 0 ? '+' : ''}${value}`
  );

  const whiteningSection = createSliderControl(
    'whiteningEffect',
    '美白効果',
    0,
    1,
    0.2,
    0.05,
    (value) => `${(value * 100).toFixed(0)}%`
  );

  filterSection.appendChild(filterTitle);
  filterSection.appendChild(smoothingSection);
  filterSection.appendChild(brightnessSection);
  filterSection.appendChild(contrastSection);
  filterSection.appendChild(whiteningSection);

  // メイク設定セクション
  const makeupSection = document.createElement('div');
  makeupSection.style.cssText = `
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 20px;
  `;

  const makeupTitle = document.createElement('h3');
  makeupTitle.textContent = 'メイク';
  makeupTitle.style.cssText = 'margin: 0 0 15px 0; font-size: 14px; color: #ffb6c1;';

  // リップスティック
  const lipstickToggleSection = createToggleControl('lipstick', 'リップスティック 💋');
  const lipstickColorSection = createColorControl('lipstickColor', 'リップの色');

  // アイシャドウ
  const eyeshadowToggleSection = createToggleControl('eyeshadow', 'アイシャドウ ✨');
  const eyeshadowColorSection = createColorControl('eyeshadowColor', 'アイシャドウの色');

  // チーク
  const blushToggleSection = createToggleControl('blush', 'チーク 🌸');
  const blushColorSection = createColorControl('blushColor', 'チークの色');

  makeupSection.appendChild(makeupTitle);
  makeupSection.appendChild(lipstickToggleSection);
  makeupSection.appendChild(lipstickColorSection);
  makeupSection.appendChild(eyeshadowToggleSection);
  makeupSection.appendChild(eyeshadowColorSection);
  makeupSection.appendChild(blushToggleSection);
  makeupSection.appendChild(blushColorSection);

  // プリセットボタン
  const presetsSection = document.createElement('div');
  presetsSection.style.cssText = 'margin-top: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;';

  const presets = [
    {
      name: 'ナチュラル',
      settings: {
        smoothing: 0.3,
        brightness: 10,
        contrast: 5,
        whiteningEffect: 0.1,
        lipstick: false,
        eyeshadow: false,
        blush: false
      }
    },
    {
      name: 'グラマラス',
      settings: {
        smoothing: 0.6,
        brightness: 20,
        contrast: 15,
        whiteningEffect: 0.4,
        lipstick: true,
        eyeshadow: true,
        blush: true
      }
    }
  ];

  presets.forEach((preset) => {
    const btn = document.createElement('button');
    btn.textContent = preset.name;
    btn.style.cssText = `
      background: #ff69b4;
      border: none;
      color: white;
      padding: 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: bold;
      transition: 0.2s;
    `;
    btn.onmouseover = () => (btn.style.background = '#ff85c1');
    btn.onmouseout = () => (btn.style.background = '#ff69b4');
    btn.onclick = () => {
      applyPreset(preset.settings);
      updateAllControls();
    };
    presetsSection.appendChild(btn);
  });

  // 閉じるボタン
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    background: #ea4335;
    border: none;
    color: white;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 18px;
  `;
  closeBtn.onclick = () => dialog.remove();

  // コンテナに追加
  dialog.appendChild(title);
  dialog.appendChild(enableSection);
  dialog.appendChild(filterSection);
  dialog.appendChild(makeupSection);
  dialog.appendChild(presetsSection);
  dialog.appendChild(closeBtn);

  // イベントハンドラー
  enableToggle.addEventListener('change', () => {
    if (enableToggle.checked) {
      beautyFilterManager.updateSettings({ enabled: true });
    } else {
      beautyFilterManager.updateSettings({ enabled: false });
    }
    updateAllControls();
  });

  // スライダー変更イベント
  dialog.addEventListener('input', (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.type === 'range') {
      const value = parseFloat(target.value);
      const settingKey = target.dataset.setting as keyof BeautySettings;

      if (settingKey) {
        beautyFilterManager.updateSettings({
          [settingKey]: value
        });
      }

      const label = target.parentElement?.querySelector('.slider-value');
      if (label && target.dataset.format) {
        const formatter = new Function('value', `return \`${target.dataset.format}\``);
        label.textContent = (formatter as any)(value);
      }
    }

    // トグル変更イベント
    if (target.type === 'checkbox' && target.id !== 'beauty-filter-enable') {
      const settingKey = target.dataset.setting as keyof BeautySettings;
      if (settingKey) {
        beautyFilterManager.updateSettings({
          [settingKey]: target.checked
        });
      }
    }

    // カラーピッカー変更イベント
    if (target.type === 'color') {
      const settingKey = target.dataset.setting as keyof BeautySettings;
      if (settingKey) {
        beautyFilterManager.updateSettings({
          [settingKey]: target.value
        });
      }
    }
  });

  // 初期値を反映
  updateAllControls();

  function updateAllControls() {
    const settings = beautyFilterManager.getSettings();
    enableToggle.checked = settings.enabled;

    const sliders = dialog.querySelectorAll('input[type="range"]') as NodeListOf<HTMLInputElement>;
    sliders.forEach((slider) => {
      const key = slider.dataset.setting as keyof BeautySettings;
      if (key && key in settings) {
        slider.value = String(settings[key]);
        const label = slider.parentElement?.querySelector('.slider-value');
        if (label && slider.dataset.format) {
          const formatter = new Function('value', `return \`${slider.dataset.format}\``);
          label.textContent = (formatter as any)(settings[key]);
        }
      }
    });

    const toggles = dialog.querySelectorAll('input[type="checkbox"]:not(#beauty-filter-enable)') as NodeListOf<HTMLInputElement>;
    toggles.forEach((toggle) => {
      const key = toggle.dataset.setting as keyof BeautySettings;
      if (key && key in settings) {
        toggle.checked = settings[key] as boolean;
      }
    });

    const colors = dialog.querySelectorAll('input[type="color"]') as NodeListOf<HTMLInputElement>;
    colors.forEach((color) => {
      const key = color.dataset.setting as keyof BeautySettings;
      if (key && key in settings) {
        color.value = settings[key] as string;
      }
    });
  }

  function applyPreset(preset: Partial<BeautySettings>) {
    beautyFilterManager.updateSettings(preset);
  }

  return dialog;
}

function createSliderControl(
  settingKey: string,
  label: string,
  min: number,
  max: number,
  defaultValue: number,
  step: number,
  formatValue: (value: number) => string
): HTMLDivElement {
  const section = document.createElement('div');
  section.style.cssText = 'margin-bottom: 12px;';

  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  labelEl.style.cssText = 'display: block; margin-bottom: 5px; font-size: 12px; font-weight: bold;';

  const controlContainer = document.createElement('div');
  controlContainer.style.cssText = 'display: flex; gap: 10px; align-items: center;';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(defaultValue);
  slider.dataset.setting = settingKey;
  slider.dataset.format = formatValue(defaultValue).replace(/`/g, '\\`');
  slider.style.cssText = 'flex: 1; height: 6px; background: linear-gradient(to right, #ffb6c1, #ff69b4); border-radius: 3px; outline: none; cursor: pointer;';

  const valueLabel = document.createElement('span');
  valueLabel.className = 'slider-value';
  valueLabel.textContent = formatValue(defaultValue);
  valueLabel.style.cssText = 'min-width: 60px; text-align: right; font-size: 12px; color: #ffb6c1;';

  controlContainer.appendChild(slider);
  controlContainer.appendChild(valueLabel);

  section.appendChild(labelEl);
  section.appendChild(controlContainer);

  return section;
}

function createToggleControl(settingKey: string, label: string): HTMLDivElement {
  const section = document.createElement('div');
  section.style.cssText = 'margin-bottom: 10px; display: flex; align-items: center; gap: 8px;';

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.id = `beauty-${settingKey}`;
  toggle.dataset.setting = settingKey;
  toggle.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';
  toggle.checked = false;

  const labelEl = document.createElement('label');
  labelEl.htmlFor = `beauty-${settingKey}`;
  labelEl.textContent = label;
  labelEl.style.cssText = 'cursor: pointer; font-size: 12px; flex: 1;';

  section.appendChild(toggle);
  section.appendChild(labelEl);

  return section;
}

function createColorControl(settingKey: string, label: string): HTMLDivElement {
  const section = document.createElement('div');
  section.style.cssText = 'margin-left: 30px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;';

  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  labelEl.style.cssText = 'font-size: 11px; width: 80px;';

  const colorPicker = document.createElement('input');
  colorPicker.type = 'color';
  colorPicker.id = `beauty-color-${settingKey}`;
  colorPicker.dataset.setting = settingKey;
  colorPicker.value = '#ff69b4';
  colorPicker.style.cssText = 'width: 40px; height: 30px; border: none; border-radius: 4px; cursor: pointer;';

  section.appendChild(labelEl);
  section.appendChild(colorPicker);

  return section;
}

export function setupBeautyFilterButtonHandler(buttonId: string = 'beauty-btn'): void {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  btn.addEventListener('click', () => {
    const existing = document.getElementById('beauty-filter-dialog');
    if (existing) {
      existing.remove();
      return;
    }

    const dialog = createBeautyFilterDialog();
    document.body.appendChild(dialog);

    document.addEventListener('click', (e: MouseEvent) => {
      if (e.target === dialog.parentElement) {
        dialog.remove();
      }
    });
  });
}
