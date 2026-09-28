import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { AUDIO, type SoundKey } from './manifest';

const POOL = 3; // overlapping instances per effect
const MIN_GAP: Partial<Record<SoundKey, number>> = { chop: 110, mine: 110, hammer: 110, arrow: 90, sword: 80, death: 120, click: 40, select: 60, command: 60 };

/** Small audio engine: pooled SFX players with per-sound throttling + one looping music track. */
class SoundManager {
  sfxOn = true;
  musicOn = true;
  private sfxVolume = 0.85;
  private musicVolume = 0.42;
  private pools = new Map<SoundKey, AudioPlayer[]>();
  private next = new Map<SoundKey, number>();
  private last = new Map<SoundKey, number>();
  private music: AudioPlayer | null = null;
  private ready = false;

  init() {
    if (this.ready) return;
    this.ready = true;
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  }

  play(key: SoundKey, volume = 1) {
    if (!this.sfxOn || volume <= 0.02) return;
    const now = Date.now();
    if (now - (this.last.get(key) ?? 0) < (MIN_GAP[key] ?? 50)) return;
    this.last.set(key, now);
    try {
      let pool = this.pools.get(key);
      if (!pool) { pool = []; this.pools.set(key, pool); }
      const i = this.next.get(key) ?? 0;
      let p = pool[i];
      if (!p) { p = createAudioPlayer(AUDIO[key]); pool[i] = p; }
      this.next.set(key, (i + 1) % POOL);
      p.volume = Math.min(1, volume * this.sfxVolume);
      p.seekTo(0).catch(() => {});
      p.play();
    } catch {
      // audio is best-effort: never break the game loop
    }
  }

  startMusic() {
    if (!this.musicOn) return;
    try {
      if (!this.music) {
        this.music = createAudioPlayer(AUDIO.music_main);
        this.music.loop = true;
      }
      this.music.volume = this.musicVolume;
      if (!this.music.playing) this.music.play();
    } catch {
      // ignore
    }
  }

  pauseMusic() {
    try { this.music?.pause(); } catch { /* ignore */ }
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (on) this.startMusic(); else this.pauseMusic();
  }

  setSfx(on: boolean) { this.sfxOn = on; }
}

export const sound = new SoundManager();
