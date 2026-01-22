# 顔に画像を貼り付けるアバター設定ガイド

このガイドでは、顔アバターに画像を貼り付け、表情によって異なる画像を表示する方法を説明します。

## 概要

`FaceImageManager`を使用して、以下の機能を実装できます：

- ✨ 顔に画像を貼り付ける
- 😊 表情に応じて異なる画像を表示
- 🎨 複数の表情（通常、笑顔、驚き、怒り、悲しみ）に対応
- 🔄 スムーズな表情切り替わり

## 機能

### サポートされる表情

| 表情 | 説明 |
|------|------|
| `neutral` | 通常時の表情 |
| `happy` | 笑顔時の表情 |
| `surprised` | 驚き時の表情 |
| `angry` | 怒り時の表情 |
| `sad` | 悲しい時の表情 |

## セットアップ方法

### 1. 画像の準備

各表情に対応した画像ファイルを準備します。推奨仕様：

- **形式**: PNG, JPG, WebP
- **サイズ**: 1024x1024px以上（推奨）
- **背景**: 透過 (PNG推奨)
- **アルファチャンネル**: あり（表情画像の自然な表示のため）

画像ファイル例：
- `sample-neutral.png` - 通常時の顔画像
- `sample-happy.png` - 笑顔
- `sample-surprised.png` - 驚き顔
- `sample-angry.png` - 怒り顔
- `sample-sad.png` - 悲しい顔

### 2. 画像をプロジェクトにアップロード

画像を以下のディレクトリにアップロードしてください：

```
/public/faces/
├── neutral.png
├── happy.png
├── surprised.png
├── angry.png
└── sad.png
```

### 3. FaceAvatar.tsxで画像セットを設定

`FaceAvatar.tsx`内で、以下のように画像パスを設定します：

```typescript
// サンプル画像セットを設定
const faceImages: FaceImageSet = {
  neutral: '/meeting-app/public/faces/neutral.png',
  happy: '/meeting-app/public/faces/happy.png',
  surprised: '/meeting-app/public/faces/surprised.png',
  angry: '/meeting-app/public/faces/angry.png',
  sad: '/meeting-app/public/faces/sad.png'
};

faceImageManagerRef.current.setImageSet(faceImages);
```

### 4. プレビュー

ブラウザを開いて、アバターの表情が変わるとともに、顔の画像も切り替わることを確認します。

## 使用方法

### 基本的な使用例

```typescript
import { FaceImageManager, FaceImageSet } from '../src/face-image-manager';

// マネージャーを初期化
const faceImageManager = new FaceImageManager();

// 表情に対応した画像セットを設定
const imageSet: FaceImageSet = {
  neutral: 'path/to/neutral.png',
  happy: 'path/to/happy.png',
  surprised: 'path/to/surprised.png',
  angry: 'path/to/angry.png',
  sad: 'path/to/sad.png'
};

faceImageManager.setImageSet(imageSet);

// VRMモデルに適用
await faceImageManager.applyFaceTexture(vrmModel);

// 表情を更新（MediaPipeのブレンドシェイプから）
faceImageManager.updateExpressionWeights(blendshapes);

// クリーンアップ
faceImageManager.dispose();
```

## API リファレンス

### `FaceImageManager` クラス

#### コンストラクタ

```typescript
constructor()
```

#### メソッド

##### `setImageSet(imageSet: Partial<FaceImageSet>): void`

表情に対応した画像セットを設定します。

**パラメータ:**
- `imageSet` - 各表情に対応した画像URLのオブジェクト

**例:**
```typescript
manager.setImageSet({
  neutral: '/images/neutral.png',
  happy: '/images/happy.png'
});
```

##### `applyFaceTexture(vrm: any): Promise<void>`

VRMモデルの顔にテクスチャを適用します。

**パラメータ:**
- `vrm` - VRMモデルオブジェクト

**例:**
```typescript
await manager.applyFaceTexture(vrmModel);
```

##### `updateExpressionWeights(blendshapes: any[]): void`

MediaPipeのブレンドシェイプ結果から表情を更新します。

**パラメータ:**
- `blendshapes` - MediaPipeから取得したブレンドシェイプの配列

**例:**
```typescript
manager.updateExpressionWeights(results.faceBlendshapes[0]);
```

##### `dispose(): void`

リソースをクリーンアップします。

```typescript
manager.dispose();
```

## 高度な使用方法

### カスタム表情マッピング

`FaceImageManager`は自動的にMediaPipeのブレンドシェイプを以下のように変換します：

```typescript
const expressionMappings = {
  'mouthSmileLeft': 'happy',
  'mouthSmileRight': 'happy',
  'cheekRaiser': 'happy',
  'eyeWideLeft': 'surprised',
  'eyeWideRight': 'surprised',
  'mouthOpen': 'surprised',
  // ... 他の表情
};
```

### 表情の重みづけ

表情の重みは0.0-1.0で管理され、複数の表情が同時に表示される場合は、重みに基づいて画像がブレンドされます。

例：
- 笑顔: 0.8
- 驚き: 0.2

この場合、80%は笑顔画像、20%は驚き画像が合成されます。

### パフォーマンス最適化

- **テクスチャキャッシング**: 同じURLの画像は複数回読み込まれません
- **プリロード**: `setImageSet`呼び出し時にすべての画像がバックグラウンドでプリロードされます
- **スムーズな切り替わり**: `fadeSpeed`プロパティで表情の切り替わり速度を調整できます

## トラブルシューティング

### 画像が表示されない場合

1. **画像パスを確認**: URLが正しいか確認してください
2. **CORS設定**: 別のドメインから画像を読み込む場合、CORSの設定を確認してください
3. **ブラウザコンソール**: エラーメッセージを確認してください

### 表情が切り替わらない場合

1. **カメラ権限**: ブラウザの設定でカメラへのアクセスを許可しているか確認してください
2. **光の環境**: 十分な照明環境を確認してください
3. **MediaPipe**: MediaPipeが正しく読み込まれているか確認してください

### パフォーマンスが低下している場合

1. **画像サイズ**: 画像サイズを縮小してください（1024x1024以下を推奨）
2. **キャッシュクリア**: ブラウザキャッシュをクリアしてください
3. **使用中の表情数**: 不要な表情画像を削除してください

## サンプルコード

完全な実装例は[FaceAvatar.tsx](../components/FaceAvatar.tsx)を参照してください。

## ライセンス

このコンポーネントはMIT Licenseの下で提供されています。
