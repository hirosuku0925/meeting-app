/**
 * ボイスチェンジャーマネージャー
 * Web Audio APIを使用して、リアルタイムで声を変換
 */

export interface VoiceChangerSettings {
  enabled: boolean;
  pitchShift: number; // -12 to +12 (半音単位)
  speed: number; // 0.8 to 1.5
  roboticEffect: number; // 0 to 1 (0=OFF, 1=MAX)
  echoEffect: number; // 0 to 1
}

class VoiceChangerManager {
  private audioContext: AudioContext | null = null;
  private mediaStreamAudioSourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  
  // エフェクト用ノード
  private masterGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private roboticGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private feedbackGain: GainNode | null = null;
  
  private settings: VoiceChangerSettings = {
    enabled: false,
    pitchShift: 0,
    speed: 1.0,
    roboticEffect: 0,
    echoEffect: 0
  };

  private pitchBuffer: Float32Array = new Float32Array(8192);
  private pitchBufferPos = 0;
  private playbackPos = 0;

  async init(mediaStream: MediaStream): Promise<MediaStream> {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // 既存のノードがあれば切断
    this.cleanup();

    // 入力ソース
    this.mediaStreamAudioSourceNode = this.audioContext.createMediaStreamSource(mediaStream);
    
    // 出力ストリーム
    this.destination = this.audioContext.createMediaStreamDestination();

    // マスターゲイン
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 1.0;

    // ドライゲイン（元の音声）
    this.dryGain = this.audioContext.createGain();
    this.dryGain.gain.value = 0.0; // デフォルトではオフ

    // ロボティック効果用ゲイン
    this.roboticGain = this.audioContext.createGain();
    this.roboticGain.gain.value = 0.0;

    // エコー効果用
    this.delayNode = this.audioContext.createDelay(2);
    this.feedbackGain = this.audioContext.createGain();
    this.feedbackGain.gain.value = 0;

    // メインのオーディオプロセッサー - ピッチシフト処理
    this.createPitchShiftProcessor();

    return this.destination!.stream;
  }

  private createPitchShiftProcessor(): void {
    if (!this.audioContext || !this.mediaStreamAudioSourceNode) return;

    const bufferSize = 4096;
    this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    this.processorNode.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      const outputData = event.outputBuffer.getChannelData(0);

      if (!this.settings.enabled) {
        // ボイスチェンジャーが無効の場合は元の音をそのまま出力
        for (let i = 0; i < outputData.length; i++) {
          outputData[i] = inputData[i];
        }
        return;
      }

      // ピッチシフト + スピード処理
      const pitchFactor = Math.pow(2, this.settings.pitchShift / 12);
      const speedFactor = this.settings.speed;
      const combinedFactor = pitchFactor * speedFactor;

      // バッファにデータを追加
      for (let i = 0; i < inputData.length; i++) {
        this.pitchBuffer[this.pitchBufferPos] = inputData[i];
        this.pitchBufferPos = (this.pitchBufferPos + 1) % this.pitchBuffer.length;
      }

      // 再生インデックスでピッチシフト処理を実現
      for (let i = 0; i < outputData.length; i++) {
        const idx = Math.floor(this.playbackPos) % this.pitchBuffer.length;
        const nextIdx = (idx + 1) % this.pitchBuffer.length;
        const fraction = this.playbackPos - Math.floor(this.playbackPos);

        // 線形補間
        outputData[i] = this.pitchBuffer[idx] * (1 - fraction) + this.pitchBuffer[nextIdx] * fraction;

        // ロボティック効果を追加
        if (this.settings.roboticEffect > 0) {
          outputData[i] *= (1 - this.settings.roboticEffect * 0.7); // 振幅を減衰
          outputData[i] += Math.sin(i * 0.1) * this.settings.roboticEffect * 0.3;
        }

        this.playbackPos += combinedFactor;
        if (this.playbackPos >= this.pitchBuffer.length) {
          this.playbackPos -= this.pitchBuffer.length;
        }
      }

      // エコー効果を追加
      if (this.settings.echoEffect > 0) {
        for (let i = 0; i < outputData.length; i++) {
          const echoIdx = (this.pitchBufferPos - Math.floor(bufferSize * 0.3)) % this.pitchBuffer.length;
          const echoSample = this.pitchBuffer[echoIdx];
          outputData[i] = outputData[i] * (1 - this.settings.echoEffect * 0.3) + 
                         echoSample * this.settings.echoEffect * 0.2;
        }
      }
    };

    // ノードを接続
    this.mediaStreamAudioSourceNode.connect(this.processorNode);
    this.processorNode.connect(this.destination!);
  }

  updateSettings(newSettings: Partial<VoiceChangerSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
  }

  getSettings(): VoiceChangerSettings {
    return { ...this.settings };
  }

  cleanup(): void {
    try {
      if (this.processorNode) {
        this.processorNode.disconnect();
      }
      if (this.mediaStreamAudioSourceNode) {
        this.mediaStreamAudioSourceNode.disconnect();
      }
      if (this.masterGain) {
        this.masterGain.disconnect();
      }
      if (this.dryGain) {
        this.dryGain.disconnect();
      }
      if (this.roboticGain) {
        this.roboticGain.disconnect();
      }
      if (this.delayNode) {
        this.delayNode.disconnect();
      }
      if (this.feedbackGain) {
        this.feedbackGain.disconnect();
      }
    } catch (e) {
      console.error('Error cleaning up voice changer:', e);
    }
  }

  disable(): void {
    this.updateSettings({ enabled: false });
  }

  enable(): void {
    this.updateSettings({ enabled: true });
  }
}

export default new VoiceChangerManager();
