import { Injectable } from '@angular/core';

/** Short tones via the Web Audio API — no sound files needed. */
@Injectable({ providedIn: 'root' })
export class BeepService {
  private ctx: AudioContext | null = null;

  /** Must be called from a user gesture (tap) once, or mobile browsers keep audio muted. */
  unlock(): void {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** Two quick rising beeps: "the button is available". */
  available(): void {
    this.tone(880, 0, 0.12);
    this.tone(1320, 0.16, 0.12);
    navigator.vibrate?.([120, 60, 120]);
  }

  /** One short click-like beep: "button pressed". */
  confirm(): void {
    this.tone(660, 0, 0.08);
  }

  private tone(freq: number, delay: number, duration: number): void {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }
}
