/**
 * ボイスチェンジャーダイアログ
 * ボイスチェンジャー機能の設定UIを提供
 */

import type { VoiceChangerSettings } from './voice-changer-manager';
import voiceChangerManager from './voice-changer-manager';

export function createVoiceChangerDialog(): HTMLDivElement {
  const dialog = document.createElement('div');
  dialog.id = 'voice-changer-dialog';
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
    border: 2px solid #4facfe;
    border-radius: 12px;
    padding: 20px;
    z-index: 10000;
    width: 90%;
    max-width: 400px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    font-family: sans-serif;
    color: white;
  `;

  const title = document.createElement('h2');
  title.textContent = 'ボイスチェンジャー';
  title.style.cssText = 'margin: 0 0 20px 0; font-size: 20px; text-align: center;';

  // 有効化トグル
  const enableSection = document.createElement('div');
  enableSection.style.cssText = 'margin-bottom: 20px; display: flex; align-items: center; gap: 10px;';

  const enableToggle = document.createElement('input');
  enableToggle.type = 'checkbox';
  enableToggle.id = 'voice-changer-enable';
  enableToggle.style.cssText = 'width: 20px; height: 20px; cursor: pointer;';
  enableToggle.checked = false;

  const enableLabel = document.createElement('label');
  enableLabel.htmlFor = 'voice-changer-enable';
  enableLabel.textContent = 'ボイスチェンジャーを有効にする';
  enableLabel.style.cssText = 'cursor: pointer; font-weight: bold;';

  enableSection.appendChild(enableToggle);
  enableSection.appendChild(enableLabel);

  // ピッチシフトスライダー
  const pitchSection = createSliderControl(
    'pitchShift',
    'ピッチシフト',
    -12,
    12,
    0,
    1,
    (value) => `${value > 0 ? '+' : ''}${value} 半音`
  );

  // スピードスライダー
  const speedSection = createSliderControl(
    'speed',
    '再生速度',
    0.8,
    1.5,
    1.0,
    0.05,
    (value) => `${(value * 100).toFixed(0)}%`
  );

  // ロボティック効果スライダー
  const roboticSection = createSliderControl(
    'roboticEffect',
    'ロボティック効果',
    0,
    1,
    0,
    0.05,
    (value) => `${(value * 100).toFixed(0)}%`
  );

  // エコー効果スライダー
  const echoSection = createSliderControl(
    'echoEffect',
    'エコー効果',
    0,
    1,
    0,
    0.05,
    (value) => `${(value * 100).toFixed(0)}%`
  );

  // プリセットボタン
  const presetsSection = document.createElement('div');
  presetsSection.style.cssText = 'margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;';

  const presets = [
    {
      name: '子供',
      settings: { pitchShift: 7, speed: 1.1, roboticEffect: 0, echoEffect: 0 }
    },
    {
      name: '大人',
      settings: { pitchShift: -5, speed: 0.9, roboticEffect: 0, echoEffect: 0 }
    },
    {
      name: 'ロボット',
      settings: { pitchShift: 0, speed: 1.0, roboticEffect: 0.8, echoEffect: 0 }
    },
    {
      name: 'エコー',
      settings: { pitchShift: 0, speed: 1.0, roboticEffect: 0, echoEffect: 0.6 }
    }
  ];

  presets.forEach((preset) => {
    const btn = document.createElement('button');
    btn.textContent = preset.name;
    btn.style.cssText = `
      background: #4facfe;
      border: none;
      color: white;
      padding: 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: bold;
      transition: 0.2s;
    `;
    btn.onmouseover = () => (btn.style.background = '#60b8ff');
    btn.onmouseout = () => (btn.style.background = '#4facfe');
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
  dialog.appendChild(pitchSection);
  dialog.appendChild(speedSection);
  dialog.appendChild(roboticSection);
  dialog.appendChild(echoSection);
  dialog.appendChild(presetsSection);
  dialog.appendChild(closeBtn);

  // イベントハンドラー
  enableToggle.addEventListener('change', () => {
    if (enableToggle.checked) {
      voiceChangerManager.enable();
    } else {
      voiceChangerManager.disable();
    }
    updateAllControls();
  });

  // スライダー変更イベント
  dialog.addEventListener('input', (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.type === 'range') {
      const value = parseFloat(target.value);
      const settingKey = target.dataset.setting as keyof VoiceChangerSettings;

      if (settingKey && target.value !== undefined) {
        voiceChangerManager.updateSettings({
          [settingKey]: value
        });
      }

      // ラベル更新
      const label = target.parentElement?.querySelector('.slider-value');
      if (label && target.dataset.format) {
        const formatter = new Function('value', `return \`${target.dataset.format}\``);
        label.textContent = (formatter as any)(value);
      }
    }
  });

  // 初期値を反映
  updateAllControls();

  function updateAllControls() {
    const settings = voiceChangerManager.getSettings();
    enableToggle.checked = settings.enabled;

    const sliders = dialog.querySelectorAll('input[type="range"]') as NodeListOf<HTMLInputElement>;
    sliders.forEach((slider) => {
      const key = slider.dataset.setting as keyof VoiceChangerSettings;
      if (key) {
        slider.value = String(settings[key]);
        const label = slider.parentElement?.querySelector('.slider-value');
        if (label && slider.dataset.format) {
          const formatter = new Function('value', `return \`${slider.dataset.format}\``);
          label.textContent = (formatter as any)(settings[key]);
        }
      }
    });
  }

  function applyPreset(preset: Partial<VoiceChangerSettings>) {
    voiceChangerManager.updateSettings(preset);
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
  section.style.cssText = 'margin-bottom: 15px;';

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
  slider.style.cssText = 'flex: 1; height: 6px; background: linear-gradient(to right, #ff6b6b, #4facfe); border-radius: 3px; outline: none; cursor: pointer;';

  const valueLabel = document.createElement('span');
  valueLabel.className = 'slider-value';
  valueLabel.textContent = formatValue(defaultValue);
  valueLabel.style.cssText = 'min-width: 60px; text-align: right; font-size: 12px; color: #4facfe;';

  controlContainer.appendChild(slider);
  controlContainer.appendChild(valueLabel);

  section.appendChild(labelEl);
  section.appendChild(controlContainer);

  return section;
}

export function setupVoiceChangerButtonHandler(): void {
  const btn = document.getElementById('voice-changer-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    // 既存のダイアログがあれば削除
    const existing = document.getElementById('voice-changer-dialog');
    if (existing) {
      existing.remove();
      return;
    }

    const dialog = createVoiceChangerDialog();
    document.body.appendChild(dialog);

    // ダイアログ外をクリックで閉じる
    document.addEventListener('click', (e: MouseEvent) => {
      if (e.target === dialog.parentElement) {
        dialog.remove();
      }
    });
  });
}
