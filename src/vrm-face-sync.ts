/**
 * VRM アバター モーション同期エンジン
 * MediaPipe の顔ランドマーク検出結果を VRM ブレンドシェイプにマッピング
 */

export class VRMFaceSync {
  private vrm: any;
  private smoothingFactor = 0.7; // スムージング（0-1）

  constructor(vrmModel: any) {
    this.vrm = vrmModel;
  }

  /**
   * MediaPipe のブレンドシェイプを VRM に適用
   */
  applyBlendshapes(blendshapes: any[]) {
    if (!this.vrm?.expressionManager) return;

    blendshapes.forEach((shape) => {
      const { categoryName, score } = shape;
      const vrmuName = this.mapMediaPipeToVRM(categoryName);
      
      if (vrmuName) {
        this.setExpressionSmoothed(vrmuName, score);
      }
    });
  }

  /**
   * MediaPipe の表情名を VRM の表現名にマッピング
   */
  private mapMediaPipeToVRM(mediapipeName: string): string | null {
    const mappings: { [key: string]: string } = {
      // 笑顔
      'mouthSmileLeft': 'joy',
      'mouthSmileRight': 'joy',
      
      // 驚き
      'eyeWideLeft': 'surprised',
      'eyeWideRight': 'surprised',
      'mouthOpen': 'surprised',
      
      // 怒り
      'eyeSquintLeft': 'angry',
      'eyeSquintRight': 'angry',
      'browDownLeft': 'angry',
      'browDownRight': 'angry',
      
      // 悲しみ
      'mouthFrown': 'sorrow',
      'eyeSquint': 'sorrow',
      
      // 中立
      'mouthClose': 'neutral',
      
      // その他
      'tongueOut': 'fun',
      'cheekPuff': 'fun'
    };

    return mappings[mediapipeName] || null;
  }

  /**
   * スムージング付きで表現を設定
   */
  private setExpressionSmoothed(expressionName: string, value: number) {
    if (!this.vrm?.expressionManager) return;

    try {
      const expression = this.vrm.expressionManager.getExpressionWeight(expressionName);
      const smoothedValue = expression * (1 - this.smoothingFactor) + value * this.smoothingFactor;
      this.vrm.expressionManager.setValue(expressionName, Math.min(1, smoothedValue));
    } catch (e) {
      // 表現が存在しない場合
      console.debug(`表現 "${expressionName}" は存在しません`);
    }
  }

  /**
   * 頭部のボーンを回転（頭の向きを制御）
   */
  applyHeadRotation(headRotation: { x: number; y: number; z: number }) {
    if (!this.vrm?.humanoid?.getBoneNode) return;

    const headBone = this.vrm.humanoid.getBoneNode('head');
    if (headBone) {
      headBone.rotation.x = headRotation.x;
      headBone.rotation.y = headRotation.y;
      headBone.rotation.z = headRotation.z;
    }
  }

  /**
   * 全ての表現をリセット
   */
  resetExpressions() {
    if (!this.vrm?.expressionManager) return;

    const expressions = ['joy', 'angry', 'sorrow', 'fun', 'surprised', 'neutral'];
    expressions.forEach(expr => {
      try {
        this.vrm.expressionManager.setValue(expr, 0);
      } catch (e) {
        // 無視
      }
    });
  }

  /**
   * スムージング係数を設定（0 = リアルタイム、1 = 完全スムーズ）
   */
  setSmoothingFactor(factor: number) {
    this.smoothingFactor = Math.max(0, Math.min(1, factor));
  }
}

export default VRMFaceSync;
