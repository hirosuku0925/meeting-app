/**
 * 美顔フィルター＆メイク機能
 * Canvas上で顔を綺麗にするフィルターとメイク効果を適用
 */

export interface BeautySettings {
  enabled: boolean;
  smoothing: number; // 0 to 1 (肌の滑らかさ)
  brightness: number; // -50 to 50 (明るさ)
  contrast: number; // -50 to 50 (コントラスト)
  whiteningEffect: number; // 0 to 1 (美白効果)
  lipstick: boolean; // リップスティック
  lipstickColor: string; // #RRGGBB
  eyeshadow: boolean; // アイシャドウ
  eyeshadowColor: string; // #RRGGBB
  blush: boolean; // チーク
  blushColor: string; // #RRGGBB
}

interface FaceLandmarks {
  lips?: any[];
  leftEye?: any[];
  rightEye?: any[];
  face?: { x: number; y: number; width: number; height: number };
}

class BeautyFilterManager {
  private canvasFilter: HTMLCanvasElement | null = null;
  private _ctxFilter: CanvasRenderingContext2D | null = null;

  private settings: BeautySettings = {
    enabled: false,
    smoothing: 0.3,
    brightness: 10,
    contrast: 5,
    whiteningEffect: 0.2,
    lipstick: false,
    lipstickColor: '#ff69b4',
    eyeshadow: false,
    eyeshadowColor: '#8b4789',
    blush: false,
    blushColor: '#ffb6c1'
  };

  init(): void {
    if (!this.canvasFilter) {
      this.canvasFilter = document.createElement('canvas');
      const ctx = this.canvasFilter.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas context not available');
      this._ctxFilter = ctx;
    }
  }

  applyFilter(imageData: ImageData): ImageData {
    if (!this.settings.enabled) return imageData;

    const data = imageData.data;
    const { width, height } = imageData;

    if (this.settings.smoothing > 0) {
      this.applySkinSmoothing(data, width, height, this.settings.smoothing);
    }
    if (this.settings.whiteningEffect > 0) {
      this.applyWhitening(data, this.settings.whiteningEffect);
    }
    this.applyBrightnessContrast(data, this.settings.brightness, this.settings.contrast);

    return imageData;
  }

  private applySkinSmoothing(data: Uint8ClampedArray, width: number, height: number, strength: number): void {
    const kernelSize = Math.floor(3 + strength * 4);
    const kernel = new Float32Array(kernelSize * kernelSize);
    const center = Math.floor(kernelSize / 2);
    let sum = 0;

    for (let y = 0; y < kernelSize; y++) {
      for (let x = 0; x < kernelSize; x++) {
        const dx = x - center;
        const dy = y - center;
        const value = Math.exp(-(dx * dx + dy * dy) / (2 * strength * strength));
        kernel[y * kernelSize + x] = value;
        sum += value;
      }
    }
    for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

    const tempData = new Uint8ClampedArray(data);
    for (let i = 0; i < data.length; i += 4) {
      const idx = i / 4;
      const x = idx % width;
      const y = Math.floor(idx / width);
      if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1) continue;

      let r = 0, g = 0, b = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nIdx = ((y + dy) * width + (x + dx)) * 4;
          const w = kernel[(dy + 1) * 3 + (dx + 1)] || 0.1;
          r += tempData[nIdx] * w;
          g += tempData[nIdx + 1] * w;
          b += tempData[nIdx + 2] * w;
        }
      }
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }

  private applyWhitening(data: Uint8ClampedArray, strength: number): void {
    for (let i = 0; i < data.length; i += 4) {
      const val = strength * 50;
      data[i] = Math.min(255, data[i] + val);
      data[i + 1] = Math.min(255, data[i + 1] + val);
      data[i + 2] = Math.min(255, data[i + 2] + val);
    }
  }

  private applyBrightnessContrast(data: Uint8ClampedArray, brightness: number, contrast: number): void {
    const bFact = 1 + brightness / 100;
    const cFact = 1 + contrast / 100;
    for (let i = 0; i < data.length; i += 4) {
      for (let j = 0; j < 3; j++) {
        let v = (data[i + j] - 128) * cFact + 128;
        data[i + j] = Math.max(0, Math.min(255, v * bFact));
      }
    }
  }

  drawMakeup(ctx: CanvasRenderingContext2D, landmarks: any, _w: number, _h: number): void {
    if (!this.settings.enabled || !landmarks) return;
    const m = landmarks as FaceLandmarks;
    if (this.settings.lipstick && m.lips) this.drawLipstick(ctx, m.lips, this.settings.lipstickColor);
    if (this.settings.eyeshadow && m.leftEye && m.rightEye) {
      this.drawEyeshadow(ctx, m.leftEye, this.settings.eyeshadowColor);
      this.drawEyeshadow(ctx, m.rightEye, this.settings.eyeshadowColor);
    }
    if (this.settings.blush && m.face) this.drawBlush(ctx, m.face, this.settings.blushColor);
  }

  private drawLipstick(ctx: CanvasRenderingContext2D, lips: any[], color: string): void {
    ctx.fillStyle = color; ctx.globalAlpha = 0.4; ctx.beginPath();
    lips.forEach((p, i) => {
      const x = p.x * ctx.canvas.width, y = p.y * ctx.canvas.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1.0;
  }

  private drawEyeshadow(ctx: CanvasRenderingContext2D, eye: any[], color: string): void {
    ctx.fillStyle = color; ctx.globalAlpha = 0.3;
    const ex = eye.reduce((s, p) => s + p.x, 0) / eye.length;
    const ey = eye.reduce((s, p) => s + p.y, 0) / eye.length;
    ctx.beginPath();
    ctx.ellipse(ex * ctx.canvas.width, (ey - 0.02) * ctx.canvas.height, 0.03 * ctx.canvas.width, 0.02 * ctx.canvas.height, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.globalAlpha = 1.0;
  }

  private drawBlush(ctx: CanvasRenderingContext2D, face: any, color: string): void {
    ctx.fillStyle = color; ctx.globalAlpha = 0.2;
    const fw = face.width || 0.3, fh = face.height || 0.4;
    const cx = face.x || 0.5, cy = face.y || 0.5;
    [ -0.35, 0.35 ].forEach(off => {
      ctx.beginPath();
      ctx.ellipse((cx + fw * off) * ctx.canvas.width, (cy + fh * 0.2) * ctx.canvas.height, fw * 0.15 * ctx.canvas.width, fh * 0.1 * ctx.canvas.height, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;
  }

  updateSettings(s: Partial<BeautySettings>): void { this.settings = { ...this.settings, ...s }; }
  getSettings(): BeautySettings { return { ...this.settings }; }
  reset(): void {
    this.settings = { enabled: false, smoothing: 0.3, brightness: 10, contrast: 5, whiteningEffect: 0.2, lipstick: false, lipstickColor: '#ff69b4', eyeshadow: false, eyeshadowColor: '#8b4789', blush: false, blushColor: '#ffb6c1' };
  }
}

export default new BeautyFilterManager();