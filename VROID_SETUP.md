# VRoid アバター セットアップガイド

## 1. VRoid Studio からのエクスポート

VRoid Studio で作成したアバターを VRM 形式でエクスポートします：

1. VRoid Studio を開く
2. 作成したアバターを選択
3. **メニュー → ファイル → エクスポート**
4. **VRM 形式** を選択
5. ファイル名を指定して保存（例: `my-avatar.vrm`）

## 2. ファイルの配置

ダウンロードした VRM ファイルを以下の場所に配置します：

```
my-meeting-app/
  ├── public/
  │   └── vroid-avatar.vrm  ← ここに配置
  └── ...
```

## 3. コンポーネントの設定

[FaceAvatar.tsx](components/FaceAvatar.tsx) 内の VRM ファイル読み込み部分：

```typescript
const model = await loader.loadAsync('/vroid-avatar.vrm');
```

ファイル名を変更した場合は、パスを適切に修正してください。

## 4. 機能説明

### 顔隠し機能
- **「カメラ隠す」ボタン**: 自分の顔を表示/非表示に切り替え
- VRM アバターの表情は常に表示され、顔認識と同期

### 顔認識との連携
- MediaPipe の顔ランドマーク検出により、以下を自動認識：
  - **表情**: 笑顔、驚き、悲しみなど
  - **頭の動き**: 傾き、向き
  - **瞼の動き**: 瞬き

### ブレンドシェイプの自動マッピング
VRoid で設定されたブレンドシェイプ（表情変形）が自動的にマッピングされます：
- `joy` → 笑顔
- `angry` → 怒り顔
- `sorrow` → 悲しい顔
- `fun` → 楽しい顔

## 5. トラブルシューティング

### VRMが読み込めない場合
- ファイルのパスが正しいか確認
- VRMファイルが valid な形式か確認
- ブラウザコンソールでエラーメッセージを確認

### 表情が同期しない場合
- MediaPipe のモデルが正しく読み込まれているか確認
- ブレンドシェイプの名前が VRM の定義と一致しているか確認

## 6. カスタマイズ

### 異なる VRM ファイルの使用
`FaceAvatar.tsx` の `setupVRMScene` 関数内で変更：

```typescript
const model = await loader.loadAsync('/your-vroid-avatar.vrm');
```

### 表情マッピングの調整
`expressionMap` オブジェクトを修正して、検出される表情と VRM の表現を対応付けます。
