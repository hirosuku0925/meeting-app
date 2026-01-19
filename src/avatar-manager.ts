/**
 * アバター管理システム
 * 複数のアバターを管理し、切り替え機能を提供
 */

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
    modelPath: '/meeting-app/avatars/fox.vrm'
  },
  {
    id: 'cat',
    name: 'ネコ',
    emoji: '🐱',
    description: 'かわいいネコアバター',
    modelPath: '/meeting-app/avatars/cat.vrm'
  },
  {
    id: 'dog',
    name: 'イヌ',
    emoji: '🐶',
    description: 'かわいいイヌアバター',
    modelPath: '/meeting-app/avatars/dog.vrm'
  },
  {
    id: 'rabbit',
    name: 'ウサギ',
    emoji: '🐰',
    description: 'かわいいウサギアバター',
    modelPath: '/meeting-app/avatars/rabbit.vrm'
  },
  {
    id: 'bear',
    name: 'クマ',
    emoji: '🐻',
    description: 'かわいいクマアバター',
    modelPath: '/meeting-app/avatars/bear.vrm'
  },
  {
    id: 'robot',
    name: 'ロボット',
    emoji: '🤖',
    description: 'クールなロボットアバター',
    modelPath: '/meeting-app/avatars/robot.vrm'
  },
  {
    id: 'alien',
    name: 'エイリアン',
    emoji: '👽',
    description: 'ユニークなエイリアンアバター',
    modelPath: '/meeting-app/avatars/alien.vrm'
  },
  {
    id: 'default',
    name: 'デフォルト',
    emoji: '👤',
    description: 'デフォルトアバター',
    modelPath: '/meeting-app/vroid-avatar.vrm'
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
