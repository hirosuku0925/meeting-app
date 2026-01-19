/**
 * ローカルストレージを使用した設定管理
 */

const STORAGE_KEY = 'meeting-app-settings';

export interface AppSettings {
  selectedAvatarId: string;
  userName: string;
  lastRoomName: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  selectedAvatarId: 'default',
  userName: 'ゲスト',
  lastRoomName: ''
};

export class SettingsManager {
  /**
   * 設定を取得
   */
  static getSettings(): AppSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn('Failed to load settings from localStorage:', error);
    }
    return DEFAULT_SETTINGS;
  }

  /**
   * 設定を保存
   */
  static saveSettings(settings: Partial<AppSettings>) {
    try {
      const current = this.getSettings();
      const updated = { ...current, ...settings };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      console.warn('Failed to save settings to localStorage:', error);
    }
  }

  /**
   * 選択されたアバターID を取得
   */
  static getSelectedAvatarId(): string {
    return this.getSettings().selectedAvatarId;
  }

  /**
   * 選択されたアバターID を保存
   */
  static setSelectedAvatarId(avatarId: string) {
    this.saveSettings({ selectedAvatarId: avatarId });
  }

  /**
   * ユーザー名を取得
   */
  static getUserName(): string {
    return this.getSettings().userName;
  }

  /**
   * ユーザー名を保存
   */
  static setUserName(userName: string) {
    this.saveSettings({ userName });
  }

  /**
   * 最後のルーム名を取得
   */
  static getLastRoomName(): string {
    return this.getSettings().lastRoomName;
  }

  /**
   * 最後のルーム名を保存
   */
  static setLastRoomName(roomName: string) {
    this.saveSettings({ lastRoomName: roomName });
  }

  /**
   * すべての設定をリセット
   */
  static resetSettings() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to reset settings:', error);
    }
  }
}

export default SettingsManager;
