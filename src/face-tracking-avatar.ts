/**
 * 顔トラッキングアバター表示
 * MediaPipeで顔を検出し、アップロードされた画像を顔に重ねて表示
 */

import faceImageAvatarManager from './face-image-avatar-manager';

interface FaceDetectionResult {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export class FaceTrackingAvatarRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private videoElement: HTMLVideoElement;
  private faceDetectionWorker: Worker | null = null;
  private animationFrameId: number | null = null;
  private lastFaceDetection: FaceDetectionResult | null = null;

  constructor(canvas: HTMLCanvasElement, videoElement: HTMLVideoElement) {
    this.canvas = canvas;
    this.videoElement = videoElement;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context not available');
    this.ctx = context;

    // キャンバスサイズを設定
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  private resizeCanvas(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /**
   * 簡易版：顔領域検出（MediaPipe用）
   */
  private async detectFace(): Promise<FaceDetectionResult | null> {
    try {
      // MediaPipe Face Detection API
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');

      if (!window.__faceDetector) {
        const filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm'
        );
        window.__faceDetector = await FaceDetector.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite'
          },
          runningMode: 'VIDEO'
        });
      }

      const results = window.__faceDetector.detectForVideo(this.videoElement, Date.now());
      
      if (results.detections && results.detections.length > 0) {
        const detection = results.detections[0];
        const boundingBox = detection.boundingBox;

        return {
          x: boundingBox.originX * this.canvas.width,
          y: boundingBox.originY * this.canvas.height,
          width: boundingBox.width * this.canvas.width,
          height: boundingBox.height * this.canvas.height,
          rotation: 0
        };
      }
    } catch (error) {
      // 簡易フォールバック：顔が見つからない場合
      console.debug('Face detection error:', error);
    }

    return null;
  }

  /**
   * 描画開始
   */
  async start(): Promise<void> {
    const render = async () => {
      // キャンバスをクリア
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // ビデオ映像を描画
      if (this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
        this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);
      }

      // 顔を検出
      const faceDetection = await this.detectFace();
      if (faceDetection) {
        this.lastFaceDetection = faceDetection;
      }

      // アバター画像を描画
      if (this.lastFaceDetection) {
        this.drawAvatarImage(this.lastFaceDetection);
      }

      this.animationFrameId = requestAnimationFrame(render);
    };

    this.animationFrameId = requestAnimationFrame(render);
  }

  /**
   * アバター画像を顔位置に描画
   */
  private drawAvatarImage(face: FaceDetectionResult): void {
    const currentAvatar = faceImageAvatarManager.getCurrentAvatar();
    if (!currentAvatar) return;

    const img = new Image();
    img.onload = () => {
      // 顔領域に合わせて拡大（少し大きく）
      const scale = 1.2;
      const x = face.x - (face.width * (scale - 1)) / 2;
      const y = face.y - (face.height * (scale - 1)) / 2;
      const width = face.width * scale;
      const height = face.height * scale;

      // 回転を適用
      this.ctx.save();
      this.ctx.translate(x + width / 2, y + height / 2);
      if (face.rotation) {
        this.ctx.rotate((face.rotation * Math.PI) / 180);
      }

      // 画像を描画
      this.ctx.drawImage(img, -width / 2, -height / 2, width, height);
      this.ctx.restore();
    };
    img.src = currentAvatar.imageDataUrl;
  }

  /**
   * 停止
   */
  stop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * クリーンアップ
   */
  dispose(): void {
    this.stop();
    if (this.faceDetectionWorker) {
      this.faceDetectionWorker.terminate();
    }
  }
}

// グローバルにFaceDetectorを保存（再初期化を避ける）
declare global {
  interface Window {
    __faceDetector?: any;
  }
}
