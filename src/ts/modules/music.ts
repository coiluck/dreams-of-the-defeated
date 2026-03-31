// music.ts
import { SettingState } from './store';

const AUTO_BGM_LIST = [
  'Cultus',
  'Danse_Macabre',
  'Devine_Fencer',
  'LonelyMerchant',
  'The_Final_Confrontation'
];

class BGMController {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private currentSources: AudioBufferSourceNode[] = []; // 再生中のソース（IntroとLoop両方管理するため配列）
  private masterVolume: number = 1.0;
  private bgmVolume: number = 0.4;
  private FADE_TIME: number = 1.0; // 秒単位

  private autoIndex: number = 0;
  private currentMode: 'auto' | 'fixed' = SettingState.mainBgm;
  private shuffledList: string[] = [];

  constructor() {
    // AudioContextはユーザー操作が必要なため、play時に初期化またはresumeする
    // ブラウザ互換性のため window.AudioContext または window.webkitAudioContext
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      this.ctx = new AudioContext();
      this.gainNode = this.ctx.createGain();
      this.gainNode.connect(this.ctx.destination);
    }
  }

  private shuffle(list: string[]): string[] {
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  private updateGain() {
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setTargetAtTime(this.masterVolume * this.bgmVolume, this.ctx.currentTime, 0.01);
    }
  }

  // volumeは0.0 - 2.0
  setMasterVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(2, volume));
    this.updateGain();
  }
  // volumeは0.0 - 1.0
  setVolume(volume: number) {
    this.bgmVolume = Math.max(0, Math.min(1, volume));
    this.updateGain();
  }

  private async loadBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return await this.ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.warn(`Failed to load audio: ${url}`, e);
      return null;
    }
  }

  async play(fileName: string, isLoop: boolean = true) {
    if (!this.ctx || !this.gainNode) return;

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    if (this.currentSources.length > 0) {
      await this.fadeOut(0.5);
      this.stop();
    }

    this.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gainNode.gain.setValueAtTime(this.masterVolume * this.bgmVolume, this.ctx.currentTime);

    const introUrl = `/assets/audio/bgm/${fileName}_intro.mp3`;
    const loopUrl = `/assets/audio/bgm/${fileName}_loop.mp3`;

    const [introBuffer, loopBuffer] = await Promise.all([
      this.loadBuffer(introUrl),
      this.loadBuffer(loopUrl)
    ]);

    if (!loopBuffer) {
      console.warn(`Main loop file not found: ${fileName}`);
      return;
    }

    const startTime = this.ctx.currentTime + 0.1;
    const introDuration = introBuffer?.duration ?? 0;

    if (introBuffer) {
      const introSource = this.ctx.createBufferSource();
      introSource.buffer = introBuffer;
      introSource.connect(this.gainNode);
      introSource.start(startTime);
      this.currentSources.push(introSource);
    }

    const loopSource = this.ctx.createBufferSource();
    loopSource.buffer = loopBuffer;
    loopSource.loop = isLoop;
    loopSource.connect(this.gainNode);
    loopSource.start(startTime + introDuration);
    this.currentSources.push(loopSource);

    if (!isLoop) {
      // 終了FADE_TIME秒前からフェードアウト
      const totalDuration = introDuration + loopBuffer.duration;
      const fadeStartTime = startTime + totalDuration - this.FADE_TIME;
      const fadeEndTime = startTime + totalDuration;
      const safeFadeStart = Math.max(fadeStartTime, this.ctx.currentTime);
      this.gainNode.gain.setValueAtTime(this.masterVolume * this.bgmVolume, safeFadeStart);
      this.gainNode.gain.linearRampToValueAtTime(0, fadeEndTime);

      // 終了時に次の曲へ
      loopSource.onended = () => {
        if (this.currentMode === 'auto') {
          this.playNextAuto();
        }
      };
    }
  }

  // autoモード: 次の曲へ進む（内部用）
  private playNextAuto() {
    this.autoIndex = (this.autoIndex + 1) % this.shuffledList.length;
    // 一周したら再シャッフル（ただし同じ曲が連続しないよう先頭を調整）
    if (this.autoIndex === 0) {
      const lastPlayed = this.shuffledList[this.shuffledList.length - 1];
      this.shuffledList = this.shuffle(AUTO_BGM_LIST);
      // 再シャッフル後の先頭が直前の曲と被ったら2番目と交換
      if (this.shuffledList[0] === lastPlayed && this.shuffledList.length > 1) {
        [this.shuffledList[0], this.shuffledList[1]] = [this.shuffledList[1], this.shuffledList[0]];
      }
    }
    this.play(this.shuffledList[this.autoIndex], false);
  }

  // autoモードで再生開始（GamePageから呼ぶ）
  startAuto() {
    this.currentMode = 'auto';
    this.autoIndex = 0;
    this.shuffledList = this.shuffle(AUTO_BGM_LIST);
    this.play(this.shuffledList[this.autoIndex], false);
  }

  // fixedモードで再生開始（GamePageから呼ぶ）
  startFixed(fileName: string) {
    this.currentMode = 'fixed';
    this.play(fileName, true);
  }

  // モード切替（OptionsPageのMainBgmChangeから呼ぶ）
  setMode(mode: 'auto' | 'fixed', fixedFileName?: string) {
    if (mode === 'auto') {
      this.startAuto();
    } else {
      this.startFixed(fixedFileName ?? '');
    }
  }

  // durationはsec
  async fadeOut(duration: number = this.FADE_TIME): Promise<void> {
    if (!this.ctx || !this.gainNode || this.currentSources.length === 0) return;

    const currentTime = this.ctx.currentTime;

    // 現在のボリュームから0まで線形に下げる
    this.gainNode.gain.cancelScheduledValues(currentTime);
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, currentTime);
    this.gainNode.gain.linearRampToValueAtTime(0, currentTime + duration);

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, duration * 1000);
    });
  }

  stop() {
    this.currentSources.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // 既に止まっている場合などは無視
      }
    });
    this.currentSources = [];
  }
}

const bgm = new BGMController();
export { bgm };



class SEController {
  private audio: HTMLAudioElement | null = null;
  private masterVolume: number = 1.0;
  private seVolume: number = 1.0;

  setMasterVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(2, volume));
    this.updateVolume();
  }

  setVolume(volume: number) {
    this.seVolume = volume;
    this.updateVolume();
  }

  private updateVolume() {
    if (this.audio) {
      const effective = this.masterVolume * this.seVolume;
      this.audio.volume = Math.max(0, Math.min(1, effective));
    }
  }

  async play(fileName: string) {
    const wavList: string[] = ['click'];
    const extension = wavList.includes(fileName) ? '.wav' : '.mp3';

    this.audio = new Audio(`/assets/audio/se/${fileName}${extension}`);
    this.audio.volume = Math.max(0, Math.min(1, this.masterVolume * this.seVolume));
    this.audio.play().catch((e) => {
      console.warn('再生に失敗しました:', e);
    });
  }
}

const se = new SEController();
export { se };


// se click event
export function initSE() {
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('[data-se]') as HTMLElement | null;
    if (!el) return;
    se.play(el.dataset.se ?? 'click');
  }, true);
}