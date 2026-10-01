import { Injectable, effect, signal } from '@angular/core';
import { Zone } from './geo';
import { load, save } from './storage';

export interface Settings {
  /** GPS fixes with a worse accuracy radius than this (metres) are not trusted. */
  requiredAccuracy: number;
  /** Only enable the button when the whole accuracy circle is inside the zone. */
  strict: boolean;
  beep: boolean;
}

export interface Press {
  time: number;
  zone: string;
  lat: number;
  lng: number;
  accuracy: number;
}

@Injectable({ providedIn: 'root' })
export class ZoneStore {
  readonly zones = signal<Zone[]>(load('gf.zones', []));
  readonly settings = signal<Settings>({
    requiredAccuracy: 10,
    strict: false,
    beep: true,
    ...load<Partial<Settings>>('gf.settings', {}),
  });
  readonly presses = signal<Press[]>(load('gf.presses', []));

  constructor() {
    effect(() => save('gf.zones', this.zones()));
    effect(() => save('gf.settings', this.settings()));
    effect(() => save('gf.presses', this.presses()));
  }

  upsert(zone: Zone): void {
    this.zones.update((zs) =>
      zs.some((z) => z.id === zone.id) ? zs.map((z) => (z.id === zone.id ? zone : z)) : [...zs, zone],
    );
  }

  remove(id: string): void {
    this.zones.update((zs) => zs.filter((z) => z.id !== id));
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings.update((s) => ({ ...s, ...patch }));
  }

  recordPress(p: Press): void {
    this.presses.update((ps) => [p, ...ps].slice(0, 200));
  }

  clearPresses(): void {
    this.presses.set([]);
  }
}
