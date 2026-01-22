/**
 * 顔に画像を貼り付けるマネージャー
 * 表情によって異なる画像を表示する機能を提供
 */

import * as THREE from 'three';

export interface FaceImageSet {
  neutral: string;      // 通常時の画像
  happy: string;        // 笑顔時の画像
  surprised: string;    // 驚き時の画像
  angry: string;        // 怒り時の画像
  sad: string;          // 悲しい時の画像
}

export class FaceImageManager {
  private textureLoader: THREE.TextureLoader;
  private faceMaterial: THREE.MeshBasicMaterial | null = null;
  private currentImageSet: FaceImageSet | null = null;
  private expressionWeights: { [key: string]: number } = {
    neutral: 0,
    happy: 0,
    surprised: 0,
    angry: 0,
    sad: 0
  };
  private blendCanvas: HTMLCanvasElement;
  private blendCanvasTexture: THREE.CanvasTexture;
  private cachedTextures: Map<string, THREE.Texture> = new Map();

  constructor() {
    this.textureLoader = new THREE.TextureLoader();
    this.blendCanvas = document.createElement('canvas');
    this.blendCanvas.width = 1024;
    this.blendCanvas.height = 1024;
    this.blendCanvasTexture = new THREE.CanvasTexture(this.blendCanvas);
    this.blendCanvasTexture.magFilter = THREE.LinearFilter;
    this.blendCanvasTexture.minFilter = THREE.LinearFilter;
  }

  /**
   * 画像セットを設定
   */
  setImageSet(imageSet: Partial<FaceImageSet>) {
    this.currentImageSet = {
      neutral: imageSet.neutral || '',
      happy: imageSet.happy || imageSet.neutral || '',
      surprised: imageSet.surprised || imageSet.neutral || '',
      angry: imageSet.angry || imageSet.neutral || '',
      sad: imageSet.sad || imageSet.neutral || ''
    };
    
    // 画像をプリロード
    this.preloadImages();
  }

  /**
   * VRMモデルの顔にマテリアルを適用
   */
  async applyFaceTexture(vrm: any): Promise<void> {
    if (!vrm?.scene) return;

    // 顔のメッシュを探す
    vrm.scene.traverse((node: any) => {
      if (node.isMesh) {
        const materialName = node.material?.name || '';
        // VRMの顔メッシュを特定（通常「Face」や「顔」という名前）
        if (materialName.includes('Face') || materialName.includes('顔') || 
            node.name.includes('Face') || node.name.includes('顔')) {
          
          // 顔用のマテリアルを作成
          this.faceMaterial = new THREE.MeshBasicMaterial({
            map: this.blendCanvasTexture,
            transparent: true,
            side: THREE.DoubleSide,
            alphaTest: 0.5
          });
          
          node.material = this.faceMaterial;
        }
      }
    });

    // 初期画像を表示
    if (this.currentImageSet?.neutral) {
      await this.updateFaceImage('neutral');
    }
  }

  /**
   * 表情スコアを更新（MediaPipeの結果から）
   */
  updateExpressionWeights(blendshapes: any[]) {
    const newWeights = { ...this.expressionWeights };
    newWeights.neutral = 1; // デフォルトは通常

    blendshapes.forEach((shape: any) => {
      const { categoryName, score } = shape;
      const expressionName = this.mapToExpression(categoryName);
      if (expressionName && expressionName !== 'neutral') {
        newWeights[expressionName] = Math.max(newWeights[expressionName], score);
        newWeights.neutral = Math.max(0, newWeights.neutral - score * 0.3);
      }
    });

    // 合計値を1に正規化
    const total = Object.values(newWeights).reduce((a, b) => a + b, 0);
    if (total > 0) {
      Object.keys(newWeights).forEach(key => {
        newWeights[key] /= total;
      });
    }

    this.expressionWeights = newWeights;
    this.updateFaceImageBlend();
  }

  /**
   * MediaPipeの表情分類をカスタム表情にマップ
   */
  private mapToExpression(mediaPipeName: string): string {
    const expressionMappings: { [key: string]: string } = {
      // 笑顔
      'mouthSmileLeft': 'happy',
      'mouthSmileRight': 'happy',
      'cheekRaiser': 'happy',
      
      // 驚き
      'eyeWideLeft': 'surprised',
      'eyeWideRight': 'surprised',
      'mouthOpen': 'surprised',
      'mouthApeLeft': 'surprised',
      'mouthApeRight': 'surprised',
      
      // 怒り
      'eyeSquintLeft': 'angry',
      'eyeSquintRight': 'angry',
      'browDownLeft': 'angry',
      'browDownRight': 'angry',
      'noseScrunch': 'angry',
      
      // 悲しみ
      'mouthFrown': 'sad',
      'mouthFrownLeft': 'sad',
      'mouthFrownRight': 'sad',
      'eyeClosedLeft': 'sad',
      'eyeClosedRight': 'sad'
    };

    return expressionMappings[mediaPipeName] || 'neutral';
  }

  /**
   * 顔画像をブレンド更新（表情の重みに基づいて複数の画像を合成）
   */
  private async updateFaceImageBlend() {
    if (!this.currentImageSet) return;

    const canvas = this.blendCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // キャンバスをクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 重みの高い順に表情を処理
    const expressionEntries = Object.entries(this.expressionWeights)
      .sort(([, a], [, b]) => b - a);

    for (const [expression, weight] of expressionEntries) {
      if (weight < 0.01) continue; // 重みが小さすぎたらスキップ

      const imageUrl = (this.currentImageSet as any)[expression];
      if (!imageUrl) continue;

      try {
        const img = await this.loadImageToCanvas(imageUrl);
        ctx.globalAlpha = weight;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      } catch (e) {
        console.warn(`画像の読み込みに失敗: ${imageUrl}`, e);
      }
    }

    ctx.globalAlpha = 1;
    this.blendCanvasTexture.needsUpdate = true;
  }

  /**
   * 画像をカンバスに読み込む（HTMLImageElementを返す）
   */
  private loadImageToCanvas(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * 単一の表情画像に更新
   */
  private async updateFaceImage(expression: string) {
    if (!this.currentImageSet || !this.faceMaterial) return;

    const imageUrl = (this.currentImageSet as any)[expression];
    if (!imageUrl) return;

    try {
      const texture = await this.loadTexture(imageUrl);
      if (this.faceMaterial) {
        this.faceMaterial.map = texture;
        this.faceMaterial.needsUpdate = true;
      }
    } catch (e) {
      console.error(`顔画像の読み込みエラー: ${imageUrl}`, e);
    }
  }

  /**
   * テクスチャをロード（キャッシュ付き）
   */
  private loadTexture(url: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      if (this.cachedTextures.has(url)) {
        resolve(this.cachedTextures.get(url)!);
        return;
      }

      this.textureLoader.load(
        url,
        (texture: THREE.Texture) => {
          texture.magFilter = THREE.LinearFilter;
          texture.minFilter = THREE.LinearFilter;
          this.cachedTextures.set(url, texture);
          resolve(texture);
        },
        undefined,
        (err) => reject(err)
      );
    });
  }

  /**
   * 画像をプリロード
   */
  private async preloadImages() {
    if (!this.currentImageSet) return;

    const images = Object.values(this.currentImageSet).filter(url => url);
    for (const url of images) {
      try {
        await this.loadTexture(url);
      } catch (e) {
        console.warn(`プリロード失敗: ${url}`);
      }
    }
  }

  /**
   * クリーンアップ
   */
  dispose() {
    this.cachedTextures.forEach(texture => texture.dispose());
    this.cachedTextures.clear();
    this.blendCanvasTexture.dispose();
    if (this.faceMaterial) {
      this.faceMaterial.dispose();
    }
  }
}
