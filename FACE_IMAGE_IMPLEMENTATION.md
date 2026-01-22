# 顔に画像を貼り付けるアバター機能

このプロジェクトに、ユーザーの顔の表情に応じて異なる画像を表示するアバター機能を実装しました。

## 新しく追加されたファイル

### 1. `src/face-image-manager.ts`
顔に画像を貼り付けるためのコアマネージャークラス

**主な機能:**
- 複数の表情（通常、笑顔、驚き、怒り、悲しみ）に対応した画像管理
- MediaPipeのブレンドシェイプを顔の表情に自動変換
- 表情の重みに基づいた画像のブレンド合成
- テクスチャキャッシングによるパフォーマンス最適化
- VRMモデルの顔メッシュへのテクスチャ適用

**クラスメソッド:**
```typescript
setImageSet(imageSet: Partial<FaceImageSet>): void
// 各表情に対応した画像URLを設定

applyFaceTexture(vrm: any): Promise<void>
// VRMモデルの顔にテクスチャを適用

updateExpressionWeights(blendshapes: any[]): void
// MediaPipeの結果から表情を更新

dispose(): void
// リソースをクリーンアップ
```

### 2. `components/FaceAvatar.tsx` (更新)
既存のコンポーネントにFaceImageManagerを統合

**変更点:**
- FaceImageManagerの初期化
- サンプル画像セットの設定
- 顔認識結果を画像マネージャーに渡すロジックの追加
- クリーンアップ処理の追加

### 3. `src/face-image-dialog.ts`
ユーザーが顔画像をアップロード・管理するUIダイアログ

**機能:**
- 各表情（5種類）ごとに画像をアップロード可能
- リアルタイムプレビュー
- 画像のクリア機能
- Data URLを使用したブラウザ内画像管理

**使用方法:**
```typescript
import { createFaceImageDialog } from '../src/face-image-dialog';

const dialog = createFaceImageDialog({
  onUpload: (imageSet) => {
    // 画像セットを処理
    faceImageManager.setImageSet(imageSet);
  },
  onCancel: () => {
    // キャンセル処理
  }
});
```

### 4. `src/generate-sample-faces.js`
テスト用の表情画像を自動生成するスクリプト

**実行方法:**
```bash
node src/generate-sample-faces.js
```

**生成される画像:**
- `public/faces/neutral.png` - 通常の顔
- `public/faces/happy.png` - 笑顔
- `public/faces/surprised.png` - 驚き顔
- `public/faces/angry.png` - 怒った顔
- `public/faces/sad.png` - 悲しい顔

### 5. `FACE_IMAGE_SETUP.md`
詳細なセットアップガイド

**内容:**
- 概要と機能説明
- 画像の準備方法
- セットアップ手順
- API リファレンス
- トラブルシューティング

## 使用方法

### 基本的な使用例

```typescript
import { FaceImageManager, FaceImageSet } from '../src/face-image-manager';

// マネージャーを初期化
const faceImageManager = new FaceImageManager();

// 画像セットを定義
const faceImages: FaceImageSet = {
  neutral: '/path/to/neutral.png',
  happy: '/path/to/happy.png',
  surprised: '/path/to/surprised.png',
  angry: '/path/to/angry.png',
  sad: '/path/to/sad.png'
};

// 画像セットを設定
faceImageManager.setImageSet(faceImages);

// VRMモデルに適用
await faceImageManager.applyFaceTexture(vrmModel);

// MediaPipeの結果から表情を更新
faceImageManager.updateExpressionWeights(blendshapes);

// 終了時にクリーンアップ
faceImageManager.dispose();
```

## 動作仕組み

### 1. 表情認識フロー

```
カメラ映像
    ↓
MediaPipe FaceLandmarker
    ↓
ブレンドシェイプ出力（各表情のスコア）
    ↓
FaceImageManager.updateExpressionWeights()
    ↓
表情スコアを内部的に変換・正規化
    ↓
複数の画像をブレンド合成
    ↓
Canvas に描画
    ↓
3D テクスチャとして表示
```

### 2. 表情マッピング

MediaPipeの以下のブレンドシェイプが自動的に表情に変換されます：

| MediaPipe | 対応表情 | 説明 |
|-----------|----------|------|
| mouthSmileLeft/Right, cheekRaiser | happy | 笑顔 |
| eyeWideLeft/Right, mouthOpen | surprised | 驚き |
| eyeSquintLeft/Right, browDownLeft/Right | angry | 怒り |
| mouthFrown, eyeClosedLeft/Right | sad | 悲しみ |

### 3. 画像ブレンド

複数の表情が同時に検出された場合、その重みに基づいて画像がブレンドされます：

```
最終画像 = ∑ (表情画像_i × 重み_i)
```

例：
- 笑顔スコア: 0.8 → happy画像を80%
- 驚きスコア: 0.2 → surprised画像を20%

## パフォーマンス最適化

1. **テクスチャキャッシング**: 同じURLの画像は一度だけ読み込まれます
2. **プリロード**: 画像セット設定時にすべての画像を事前ロード
3. **Canvas合成**: GPU上でブレンド処理を実行
4. **適応的なフレームレート**: RequestAnimationFrameで効率的な更新

## 対応表情

以下の5種類の表情に対応しています：

| 表情 | キー | 用途 |
|------|-----|------|
| 😐 通常 | `neutral` | 何もしていない状態 |
| 😊 笑顔 | `happy` | 笑っている状態 |
| 😲 驚き | `surprised` | 驚いている状態 |
| 😠 怒り | `angry` | 怒っている状態 |
| 😢 悲しみ | `sad` | 悲しい状態 |

## トラブルシューティング

### 画像が表示されない

1. **ブラウザコンソールでエラーを確認**: F12キーを押して開発者ツールを開く
2. **画像URLを確認**: CORSエラーが出ていないか確認
3. **ファイルの存在確認**: public フォルダに画像が存在するか確認

### 表情が切り替わらない

1. **カメラ権限**: ブラウザの設定でカメラへのアクセスを許可
2. **光の環境**: 十分な照明があるか確認
3. **MediaPipe**: 画面左下のデバッグ情報を確認

### パフォーマンス低下

1. **画像サイズを縮小**: 1024x1024を超える場合は縮小
2. **ブラウザキャッシュをクリア**: Ctrl+Shift+Del でキャッシュ削除
3. **使用中のタブを減らす**: 他のタブを閉じてリソースを解放

## コード例

### カスタム画像セットの作成

```typescript
const customImages: FaceImageSet = {
  neutral: 'https://example.com/faces/neutral.png',
  happy: 'https://example.com/faces/happy.png',
  surprised: 'https://example.com/faces/surprised.png',
  angry: 'https://example.com/faces/angry.png',
  sad: 'https://example.com/faces/sad.png'
};

faceImageManager.setImageSet(customImages);
```

### アップロードダイアログの使用

```typescript
import { createFaceImageDialog } from '../src/face-image-dialog';

// ダイアログを開く
createFaceImageDialog({
  onUpload: (imageSet) => {
    faceImageManager.setImageSet(imageSet);
    console.log('画像がアップロードされました！');
  },
  onCancel: () => {
    console.log('キャンセルされました');
  }
});
```

## 今後の拡張可能性

- 🎭 **表情の追加**: さらに多くの表情タイプに対応
- 🎨 **フィルター**: 画像エフェクトの追加（モザイク、セピアなど）
- 📹 **ビデオ対応**: 静止画の代わりにビデオを使用
- 🌍 **多言語対応**: UIを多言語化
- 💾 **セッション保存**: 設定をローカルストレージに保存
- 🔗 **クラウド連携**: 画像をクラウドに保存・共有

## ライセンス

MIT License

## 参考資料

- [Three.js 公式ドキュメント](https://threejs.org/docs/)
- [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker)
- [VRM仕様](https://vrm.dev/)
- [Pixiv Three VRM Plugin](https://github.com/pixiv/three-vrm)
