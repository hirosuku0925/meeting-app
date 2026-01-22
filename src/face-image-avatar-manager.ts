/**
 * 顔画像アバターマネージャー
 * ユーザーがアップロードした顔画像をアバターとして管理
 */

export interface FaceImageAvatar {
  id: string;
  name: string;
  imageDataUrl: string; // Base64 data URL
  uploadedAt: number; // タイムスタンプ
}

class FaceImageAvatarManager {
  private avatars: Map<string, FaceImageAvatar> = new Map();
  private currentAvatarId: string | null = null;
  private storageKey = 'face-avatars';

  constructor() {
    this.loadFromStorage();
  }

  /**
   * 顔画像をアップロード
   */
  uploadFaceImage(file: File, name: string): Promise<FaceImageAvatar> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imageDataUrl = event.target?.result as string;
          const avatarId = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          const avatar: FaceImageAvatar = {
            id: avatarId,
            name,
            imageDataUrl,
            uploadedAt: Date.now()
          };

          this.avatars.set(avatarId, avatar);
          this.saveToStorage();
          resolve(avatar);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  /**
   * アバターを削除
   */
  deleteAvatar(id: string): void {
    this.avatars.delete(id);
    if (this.currentAvatarId === id) {
      this.currentAvatarId = null;
    }
    this.saveToStorage();
  }

  /**
   * アバターを取得
   */
  getAvatar(id: string): FaceImageAvatar | undefined {
    return this.avatars.get(id);
  }

  /**
   * すべてのアバターを取得
   */
  getAllAvatars(): FaceImageAvatar[] {
    return Array.from(this.avatars.values()).sort((a, b) => b.uploadedAt - a.uploadedAt);
  }

  /**
   * 現在のアバターを設定
   */
  setCurrentAvatar(id: string): boolean {
    if (this.avatars.has(id)) {
      this.currentAvatarId = id;
      return true;
    }
    return false;
  }

  /**
   * 現在のアバターを取得
   */
  getCurrentAvatar(): FaceImageAvatar | null {
    if (this.currentAvatarId && this.avatars.has(this.currentAvatarId)) {
      return this.avatars.get(this.currentAvatarId) || null;
    }
    return null;
  }

  /**
   * 現在のアバターIDを取得
   */
  getCurrentAvatarId(): string | null {
    return this.currentAvatarId;
  }

  /**
   * ローカルストレージに保存
   */
  private saveToStorage(): void {
    try {
      const data = {
        avatars: Array.from(this.avatars.values()),
        currentAvatarId: this.currentAvatarId
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save avatars to storage:', e);
    }
  }

  /**
   * ローカルストレージから読み込み
   */
  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.avatars && Array.isArray(parsed.avatars)) {
          parsed.avatars.forEach((avatar: FaceImageAvatar) => {
            this.avatars.set(avatar.id, avatar);
          });
        }
        if (parsed.currentAvatarId) {
          this.currentAvatarId = parsed.currentAvatarId;
        }
      }
    } catch (e) {
      console.error('Failed to load avatars from storage:', e);
    }
  }

  /**
   * すべてクリア
   */
  clearAll(): void {
    this.avatars.clear();
    this.currentAvatarId = null;
    localStorage.removeItem(this.storageKey);
  }
}

export default new FaceImageAvatarManager();
