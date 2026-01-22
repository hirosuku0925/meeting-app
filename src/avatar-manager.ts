/**
 * アバター管理システム
 * 複数のアバターを管理し、切り替え機能を提供
 */

// ベースパスを動的に決定
// Vite の base path か、現在の URL のパスプレフィックスを使用
const getBasePath = (): string => {
  const baseUrl = import.meta.env.BASE_URL;
  if (baseUrl && baseUrl !== '/') {
    return baseUrl;
  }
  
  // 開発環境での検出: location.pathname から判断
  const pathname = window.location.pathname;
  if (pathname.includes('/meeting-app/')) {
    return '/meeting-app/';
  }
  
  // デフォルト
  return '/';
};

const BASE_PATH = getBasePath();

export interface Avatar {
  id: string;
  name: string;
  emoji: string;
  description: string;
  modelPath: string; // VRM ファイルのパス
}

export const AVATARS: Avatar[] = [
  {
    id: 'fox',
    name: 'キツネ',
    emoji: '🦊',
    description: 'かわいいキツネアバター',
    modelPath: BASE_PATH + 'avatars/fox.vrm'
  },
  {
    id: 'cat',
    name: 'ネコ',
    emoji: '🐱',
    description: 'かわいいネコアバター',
    modelPath: BASE_PATH + 'avatars/cat.vrm'
  },
  {
    id: 'dog',
    name: 'イヌ',
    emoji: '🐶',
    description: 'かわいいイヌアバター',
    modelPath: BASE_PATH + 'avatars/dog.vrm'
  },
  {
    id: 'rabbit',
    name: 'ウサギ',
    emoji: '🐰',
    description: 'かわいいウサギアバター',
    modelPath: BASE_PATH + 'avatars/rabbit.vrm'
  },
  {
    id: 'bear',
    name: 'クマ',
    emoji: '🐻',
    description: 'かわいいクマアバター',
    modelPath: BASE_PATH + 'avatars/bear.vrm'
  },
  {
    id: 'robot',
    name: 'ロボット',
    emoji: '🤖',
    description: 'クールなロボットアバター',
    modelPath: BASE_PATH + 'avatars/robot.vrm'
  },
  {
    id: 'alien',
    name: 'エイリアン',
    emoji: '👽',
    description: 'ユニークなエイリアンアバター',
    modelPath: BASE_PATH + 'avatars/alien.vrm'
  },
  {
    id: 'default',
    name: 'デフォルト',
    emoji: '👤',
    description: 'デフォルトアバター',
    modelPath: BASE_PATH + 'vroid-avatar.vrm'
  }
];

export class AvatarManager {
  private currentAvatarId: string = 'default';
  private avatarChangeCallback: ((avatar: Avatar) => void) | null = null;

  constructor() {}

  /**
   * アバター変更時のコールバックを登録
   */
  onAvatarChange(callback: (avatar: Avatar) => void) {
    this.avatarChangeCallback = callback;
  }

  /**
   * 現在のアバターを取得
   */
  getCurrentAvatar(): Avatar {
    const avatar = AVATARS.find(a => a.id === this.currentAvatarId);
    return avatar || AVATARS[AVATARS.length - 1]; // デフォルトを返す
  }

  /**
   * アバターを切り替え
   */
  setAvatar(avatarId: string) {
    const avatar = AVATARS.find(a => a.id === avatarId);
    if (avatar) {
      this.currentAvatarId = avatarId;
      if (this.avatarChangeCallback) {
        this.avatarChangeCallback(avatar);
      }
    }
  }

  /**
   * すべてのアバターを取得
   */
  getAvatars(): Avatar[] {
    return AVATARS;
  }

  /**
   * ID でアバターを取得
   */
  getAvatarById(id: string): Avatar | undefined {
    return AVATARS.find(a => a.id === id);
  }

  /**
   * 現在のアバターID を取得
   */
  getCurrentAvatarId(): string {
    return this.currentAvatarId;
  }
}

export default new AvatarManager();
