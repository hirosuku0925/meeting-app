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
  private analyser: AnalyserNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  
  // エフェクト用ノード
  private pitchShiftProcessor: ScriptProcessorNode | null = null;
  private roboticGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private feedbackGain: GainNode | null = null;
  
  private settings: VoiceChangerSettings = {
    enabled: false,
    pitchShift: 0,
    speed: 1.0,
    roboticEffect: 0,
    echoEffect: 0
  };



  async init(mediaStream: MediaStream): Promise<MediaStream> {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // 既存のノードがあれば切断
    this.cleanup();

    // 入力ソーム
    this.mediaStreamAudioSourceNode = this.audioContext.createMediaStreamSource(mediaStream);
    
    // 出力ストリーム
    this.destination = this.audioContext.createMediaStreamDestination();

    // アナライザー (必須)
    this.analyser = this.audioContext.createAnalyser();
    this.mediaStreamAudioSourceNode.connect(this.analyser);

    // ドライ/ウェットゲイン
    this.dryGain = this.audioContext.createGain();
    this.wetGain = this.audioContext.createGain();
    
    this.analyser.connect(this.dryGain);
    this.dryGain.connect(this.destination);

    // ロボティック効果用ノード
    this.roboticGain = this.audioContext.createGain();
    this.analyser.connect(this.roboticGain);

    // エコー効果用
    this.delayNode = this.audioContext.createDelay(5);
    this.feedbackGain = this.audioContext.createGain();
    this.roboticGain.connect(this.delayNode);
    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);
    this.delayNode.connect(this.wetGain);
    this.wetGain.connect(this.destination);

    // ピッチシフトプロセッサ（簡易版 - ピッチシフトは複雑なため、再生速度で近似）
    this.createPitchShiftEffect();

    // 初期値を設定
    this.updateEffects();

    return this.destination!.stream;
  }

  private createPitchShiftEffect(): void {
    if (!this.audioContext) return;
    
    // SimplePitchShift効果: 再生速度変更で実現（簡易版）
    // より高度なピッチシフトはlibrosaやPitchyなどのライブラリが必要
    const bufferSize = 4096;
    this.pitchShiftProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    this.pitchShiftProcessor.onaudioprocess = (event) => {
      if (!this.settings.enabled) return;

      const inputData = event.inputBuffer.getChannelData(0);
      const outputData = event.outputBuffer.getChannelData(0);

      // 簡易ピッチシフト: サンプル間隔を変更することで実現
      const pitchFactor = Math.pow(2, this.settings.pitchShift / 12);
      const speedFactor = this.settings.speed;
      const combinedFactor = pitchFactor * speedFactor;

      let readIndex = 0;
      for (let i = 0; i < outputData.length; i++) {
        const index = Math.floor(readIndex);
        const fraction = readIndex - index;

        if (index + 1 < inputData.length) {
          const sample1 = inputData[index];
          const sample2 = inputData[index + 1];
          // 線形補間
          outputData[i] = sample1 + (sample2 - sample1) * fraction;
        } else {
          outputData[i] = inputData[index] || 0;
        }

        readIndex += combinedFactor;
        if (readIndex >= inputData.length) {
          readIndex -= inputData.length;
        }
      }
    };

    if (this.analyser && this.destination) {
      this.analyser.connect(this.pitchShiftProcessor);
      this.pitchShiftProcessor.connect(this.destination);
    }
  }

  updateSettings(newSettings: Partial<VoiceChangerSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.updateEffects();
  }

  private updateEffects(): void {
    if (!this.settings.enabled) {
      // 有効化されていない場合は、ドライシグナルのみ
      if (this.dryGain) this.dryGain.gain.value = 1.0;
      if (this.wetGain) this.wetGain.gain.value = 0.0;
      return;
    }

    // ロボティック効果
    if (this.roboticGain) {
      this.roboticGain.gain.value = this.settings.roboticEffect;
    }

    // エコー効果
    if (this.feedbackGain && this.delayNode) {
      this.delayNode.delayTime.value = 0.2 + this.settings.echoEffect * 0.3;
      this.feedbackGain.gain.value = this.settings.echoEffect * 0.6;
      this.wetGain!.gain.value = this.settings.echoEffect * 0.5;
    }

    // ドライ/ウェットバランス
    if (this.dryGain) {
      this.dryGain.gain.value = 1.0 - this.settings.roboticEffect * 0.5;
    }
  }

  getSettings(): VoiceChangerSettings {
    return { ...this.settings };
  }

  cleanup(): void {
    try {
      if (this.pitchShiftProcessor) {
        this.pitchShiftProcessor.disconnect();
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
      if (this.dryGain) {
        this.dryGain.disconnect();
      }
      if (this.wetGain) {
        this.wetGain.disconnect();
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
