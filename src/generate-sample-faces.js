/**
 * テスト用の表情画像を生成するユーティリティ
 * Canvas APIを使用してプログラムで画像を作成します
 * 
 * 使用方法:
 * 1. node src/generate-sample-faces.js を実行
 * 2. 生成された画像が public/faces/ に保存されます
 */

import fs from 'fs';
import path from 'path';
import { createCanvas } from 'canvas';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 出力ディレクトリ
const outputDir = path.join(__dirname, '../public/faces');

// ディレクトリが存在しない場合は作成
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`✓ ディレクトリを作成: ${outputDir}`);
}

/**
 * 目を描画
 */
function drawEyes(ctx, x, y, isOpen = true, isHappy = false, isAngle = false) {
  ctx.fillStyle = '#333333';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;

  // 左目
  if (isOpen) {
    ctx.beginPath();
    ctx.ellipse(x - 40, y, 25, 35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 瞳
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x - 40, y - 5, 12, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(x - 40, y - 3, 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 目を閉じた状態（ハート型または^型）
    ctx.beginPath();
    ctx.moveTo(x - 60, y);
    ctx.quadraticCurveTo(x - 40, y + 20, x - 20, y);
    ctx.stroke();
  }

  // 右目
  if (isOpen) {
    ctx.fillStyle = '#333333';
    ctx.beginPath();
    ctx.ellipse(x + 40, y, 25, 35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 瞳
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x + 40, y - 5, 12, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(x + 40, y - 3, 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 目を閉じた状態
    ctx.beginPath();
    ctx.moveTo(x + 20, y);
    ctx.quadraticCurveTo(x + 40, y + 20, x + 60, y);
    ctx.stroke();
  }

  // まゆを描画
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  if (isAngle) {
    // 怒った眉
    ctx.beginPath();
    ctx.moveTo(x - 60, y - 40);
    ctx.lineTo(x - 20, y - 30);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + 20, y - 30);
    ctx.lineTo(x + 60, y - 40);
    ctx.stroke();
  } else if (isHappy) {
    // 笑った眉
    ctx.beginPath();
    ctx.moveTo(x - 60, y - 50);
    ctx.quadraticCurveTo(x - 40, y - 30, x - 20, y - 40);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + 20, y - 40);
    ctx.quadraticCurveTo(x + 40, y - 30, x + 60, y - 50);
    ctx.stroke();
  } else {
    // 通常の眉
    ctx.beginPath();
    ctx.moveTo(x - 60, y - 45);
    ctx.lineTo(x - 20, y - 45);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + 20, y - 45);
    ctx.lineTo(x + 60, y - 45);
    ctx.stroke();
  }
}

/**
 * 口を描画
 */
function drawMouth(ctx, x, y, type = 'neutral') {
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (type === 'happy') {
    // 笑顔
    ctx.beginPath();
    ctx.arc(x, y, 50, 0, Math.PI, false);
    ctx.stroke();

    // 舌（オプション）
    ctx.fillStyle = '#ffb6c1';
    ctx.beginPath();
    ctx.ellipse(x, y + 25, 20, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'surprised') {
    // 驚き（口を開いた状態）
    ctx.fillStyle = '#ffb6c1';
    ctx.beginPath();
    ctx.ellipse(x, y, 30, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (type === 'angry') {
    // 怒った口
    ctx.beginPath();
    ctx.arc(x, y + 30, 50, Math.PI, 0, false);
    ctx.stroke();
  } else if (type === 'sad') {
    // 悲しい口
    ctx.beginPath();
    ctx.arc(x, y + 50, 50, Math.PI, 0, true);
    ctx.stroke();
  } else {
    // 通常
    ctx.beginPath();
    ctx.moveTo(x - 40, y);
    ctx.lineTo(x + 40, y);
    ctx.stroke();
  }
}

/**
 * 涙を描画
 */
function drawTears(ctx, x, y) {
  ctx.fillStyle = 'rgba(100, 200, 255, 0.6)';
  
  // 左涙
  ctx.beginPath();
  ctx.ellipse(x - 40, y + 50, 8, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  // 右涙
  ctx.beginPath();
  ctx.ellipse(x + 40, y + 50, 8, 20, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * ほおあかりを描画
 */
function drawBlush(ctx, x, y) {
  ctx.fillStyle = 'rgba(255, 100, 150, 0.4)';
  
  // 左頬
  ctx.beginPath();
  ctx.ellipse(x - 100, y + 20, 35, 25, 0, 0, Math.PI * 2);
  ctx.fill();

  // 右頬
  ctx.beginPath();
  ctx.ellipse(x + 100, y + 20, 35, 25, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 顔画像を生成
 */
function generateFaceImage(type, canvas, ctx) {
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;

  // 背景（透過）
  ctx.clearRect(0, 0, width, height);

  // 顔の形（円形）
  ctx.fillStyle = '#FFD1A3';
  ctx.strokeStyle = '#8B6F47';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, 120, 140, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 顔のタイプに応じた表情を描画
  switch (type) {
    case 'neutral':
      // 通常の顔
      drawEyes(ctx, centerX, centerY - 30, true, false, false);
      drawMouth(ctx, centerX, centerY + 40, 'neutral');
      break;

    case 'happy':
      // 笑顔
      drawBlush(ctx, centerX, centerY);
      drawEyes(ctx, centerX, centerY - 30, true, true, false);
      drawMouth(ctx, centerX, centerY + 40, 'happy');
      break;

    case 'surprised':
      // 驚き
      drawEyes(ctx, centerX, centerY - 30, true, false, false);
      // 驚き用に目を大きく
      ctx.fillStyle = '#333333';
      ctx.beginPath();
      ctx.ellipse(centerX - 40, centerY - 30, 30, 45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(centerX + 40, centerY - 30, 30, 45, 0, 0, Math.PI * 2);
      ctx.fill();
      drawMouth(ctx, centerX, centerY + 40, 'surprised');
      break;

    case 'angry':
      // 怒った顔
      drawEyes(ctx, centerX, centerY - 30, true, false, true);
      drawMouth(ctx, centerX, centerY + 40, 'angry');
      break;

    case 'sad':
      // 悲しい顔
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      drawEyes(ctx, centerX, centerY - 30, false, false, false);
      drawMouth(ctx, centerX, centerY + 40, 'sad');
      drawTears(ctx, centerX, centerY - 30);
      break;
  }
}

/**
 * 画像をファイルに保存
 */
function saveImage(canvas, filename) {
  const buffer = canvas.toBuffer('image/png');
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, buffer);
  console.log(`✓ 画像を生成: ${filename}`);
}

/**
 * すべてのサンプル画像を生成
 */
function generateAllSampleImages() {
  console.log('\n📸 テスト用の表情画像を生成します...\n');

  const canvas = createCanvas(1024, 1024);
  const ctx = canvas.getContext('2d');

  const expressions = [
    { type: 'neutral', filename: 'neutral.png', label: '通常' },
    { type: 'happy', filename: 'happy.png', label: '笑顔' },
    { type: 'surprised', filename: 'surprised.png', label: '驚き' },
    { type: 'angry', filename: 'angry.png', label: '怒り' },
    { type: 'sad', filename: 'sad.png', label: '悲しみ' }
  ];

  expressions.forEach(({ type, filename, label }) => {
    generateFaceImage(type, canvas, ctx);
    saveImage(canvas, filename);
  });

  console.log('\n✓ すべての画像の生成が完了しました！\n');
  console.log(`生成先: ${outputDir}\n`);
  console.log('生成されたファイル:');
  expressions.forEach(({ filename, label }) => {
    console.log(`  - ${filename} (${label})`);
  });

  console.log('\n💡 使用方法:');
  console.log('FaceAvatar.tsxで以下のように設定してください:\n');
  console.log(`const faceImages: FaceImageSet = {
  neutral: '/meeting-app/public/faces/neutral.png',
  happy: '/meeting-app/public/faces/happy.png',
  surprised: '/meeting-app/public/faces/surprised.png',
  angry: '/meeting-app/public/faces/angry.png',
  sad: '/meeting-app/public/faces/sad.png'
};\n`);
}

// 実行
generateAllSampleImages();
