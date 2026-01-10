"use client";
import React, { useRef, useState } from 'react';

export default function ScreenShare() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const startScreenShare = async () => {
    try {
      // 画面共有のストリームを取得
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true // 音声も共有するかどうか
      });

      if (videoRef.current) {
        videoRef.current.srcObject = screenStream;
      }

      setStream(screenStream);
      setIsSharing(true);

      // ユーザーがブラウザの「共有を停止」ボタンを押した時の処理
      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      console.error("Error: " + err);
    }
  };

  const stopScreenShare = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop()); // 全てのトラックを停止
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
    setIsSharing(false);
  };

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800">画面共有</h2>
      
      <div className="relative w-full max-w-2xl aspect-video bg-gray-900 rounded-lg overflow-hidden border-4 border-gray-200">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain"
        />
        {!isSharing && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            画面共有が開始されていません
          </div>
        )}
      </div>

      <div className="flex gap-4">
        {!isSharing ? (
          <button
            onClick={startScreenShare}
            className="px-6 py-2 bg-blue-600 text-white rounded-full font-bold hover:bg-blue-700 transition"
          >
            🖥 画面を共有する
          </button>
        ) : (
          <button
            onClick={stopScreenShare}
            className="px-6 py-2 bg-red-600 text-white rounded-full font-bold hover:bg-red-700 transition"
          >
            ⏹ 共有を停止
          </button>
        )}
      </div>
    </div>
  );
}