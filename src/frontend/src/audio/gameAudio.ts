import { readAudioPreference, writeAudioPreference } from '../preferences/uiPreferences';

// Presentation-only sound. Nothing here can observe or change game state, and
// nothing plays before a user gesture: browsers refuse it, and a surprise
// sound on page load would be hostile. Sound effects are Kenney CC0 files
// (docs/legal/asset-licenses.md); the night ambience is synthesised here.
const SOUND_BASE = `${import.meta.env.BASE_URL}assets/third-party/kenney-rpg-pack/audio/`;

export type SoundName =
  | 'click' | 'toggle' | 'dialogOpen' | 'dialogClose' | 'portalEnter'
  | 'footstep0' | 'footstep1' | 'footstep2' | 'footstep3';

const files: Record<SoundName, string> = {
  click: 'click3.ogg',
  toggle: 'switch2.ogg',
  dialogOpen: 'bookOpen.ogg',
  dialogClose: 'bookClose.ogg',
  portalEnter: 'doorOpen_1.ogg',
  footstep0: 'footstep00.ogg',
  footstep1: 'footstep01.ogg',
  footstep2: 'footstep02.ogg',
  footstep3: 'footstep03.ogg',
};

type AmbientNodes = { stop: () => void };

class GameAudio {
  private enabled = readAudioPreference();
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly loading = new Set<SoundName>();
  private ambient: AmbientNodes | null = null;
  private ambientWanted = false;
  private lastFootstepAt = 0;
  private footstepIndex = 0;
  private readonly listeners = new Set<() => void>();

  // Stable references for useSyncExternalStore.
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly getSnapshot = (): boolean => this.enabled;

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    writeAudioPreference(enabled);
    if (enabled) {
      this.resume();
      if (this.ambientWanted) this.startAmbientNow();
      this.play('toggle', 0.5);
    } else {
      this.stopAmbientNow();
    }
    for (const listener of this.listeners) listener();
  }

  /** Call from a user gesture; browsers keep the context suspended until then. */
  unlock(): void {
    if (!this.enabled) return;
    this.resume();
    if (this.ambientWanted && !this.ambient) this.startAmbientNow();
  }

  play(name: SoundName, volume = 0.6): void {
    if (!this.enabled) return;
    const context = this.ensureContext();
    if (!context) return;
    const buffer = this.buffers.get(name);
    if (!buffer) {
      void this.load(name).then(() => { if (this.enabled && this.buffers.has(name)) this.play(name, volume); });
      return;
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain).connect(this.master ?? context.destination);
    source.start();
  }

  /** Throttled so a held movement key sounds like steps, not a buzz. */
  footstep(): void {
    const now = performance.now();
    if (now - this.lastFootstepAt < 330) return;
    this.lastFootstepAt = now;
    this.footstepIndex = (this.footstepIndex + 1) % 4;
    this.play(`footstep${this.footstepIndex}` as SoundName, 0.22);
  }

  /** The world scene asks for ambience; it only becomes audible once unlocked and enabled. */
  setAmbientWanted(wanted: boolean): void {
    this.ambientWanted = wanted;
    if (!wanted) this.stopAmbientNow();
    else if (this.enabled && this.context?.state === 'running') this.startAmbientNow();
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    const Context = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    try {
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.context.destination);
    } catch {
      this.context = null;
    }
    return this.context;
  }

  private resume(): void {
    const context = this.ensureContext();
    if (context && context.state === 'suspended') void context.resume().catch(() => undefined);
  }

  private async load(name: SoundName): Promise<void> {
    const context = this.ensureContext();
    if (!context || this.loading.has(name) || this.buffers.has(name)) return;
    this.loading.add(name);
    try {
      const response = await fetch(SOUND_BASE + files[name]);
      if (!response.ok) return;
      this.buffers.set(name, await context.decodeAudioData(await response.arrayBuffer()));
    } catch {
      // Missing/undecodable file or no Ogg support: the game stays silent, never broken.
    } finally {
      this.loading.delete(name);
    }
  }

  private startAmbientNow(): void {
    if (this.ambient) return;
    const context = this.ensureContext();
    if (!context || !this.master || context.state !== 'running') return;
    this.ambient = createNightAmbience(context, this.master);
  }

  private stopAmbientNow(): void {
    this.ambient?.stop();
    this.ambient = null;
  }
}

/**
 * Soft synthesised night: filtered wind, a slow two-note pad and sparse
 * crickets. No sample, nothing to license, silent after `stop()`.
 */
function createNightAmbience(context: AudioContext, destination: AudioNode): AmbientNodes {
  const out = context.createGain();
  out.gain.setValueAtTime(0, context.currentTime);
  out.gain.linearRampToValueAtTime(0.5, context.currentTime + 3);
  out.connect(destination);

  const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = noise.getChannelData(0);
  for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
  const wind = context.createBufferSource();
  wind.buffer = noise;
  wind.loop = true;
  const windFilter = context.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 380;
  windFilter.Q.value = 0.6;
  const windGain = context.createGain();
  windGain.gain.value = 0.05;
  const windLfo = context.createOscillator();
  windLfo.frequency.value = 0.07;
  const windLfoGain = context.createGain();
  windLfoGain.gain.value = 0.03;
  windLfo.connect(windLfoGain).connect(windGain.gain);
  wind.connect(windFilter).connect(windGain).connect(out);

  const padFilter = context.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 620;
  const padGain = context.createGain();
  padGain.gain.value = 0.03;
  const padLfo = context.createOscillator();
  padLfo.frequency.value = 0.05;
  const padLfoGain = context.createGain();
  padLfoGain.gain.value = 0.015;
  padLfo.connect(padLfoGain).connect(padGain.gain);
  const oscillators = [[110, -4], [164.81, 5], [220, 0]].map(([frequency, detune]) => {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    oscillator.detune.value = detune;
    oscillator.connect(padFilter);
    return oscillator;
  });
  padFilter.connect(padGain).connect(out);

  const timers: number[] = [];
  const chirp = () => {
    if (context.state !== 'running') return;
    const at = context.currentTime;
    const tone = context.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = 4100 + Math.random() * 500;
    const tremolo = context.createOscillator();
    tremolo.frequency.value = 24;
    const tremoloGain = context.createGain();
    tremoloGain.gain.value = 0.006;
    const volume = context.createGain();
    volume.gain.setValueAtTime(0.006, at);
    volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    tremolo.connect(tremoloGain).connect(volume.gain);
    tone.connect(volume).connect(out);
    tone.start(at);
    tremolo.start(at);
    tone.stop(at + 0.75);
    tremolo.stop(at + 0.75);
  };
  timers.push(window.setInterval(chirp, 5200));

  const sources = [wind, windLfo, padLfo, ...oscillators];
  for (const source of sources) source.start();

  return {
    stop() {
      for (const timer of timers) window.clearInterval(timer);
      const now = context.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + 0.6);
      window.setTimeout(() => {
        for (const source of sources) {
          try { source.stop(); } catch { /* already stopped */ }
        }
        out.disconnect();
      }, 700);
    },
  };
}

export const gameAudio = new GameAudio();
