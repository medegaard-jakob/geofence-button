import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { BeepService } from '../core/beep';
import { LatLng, signedDistanceToZone } from '../core/geo';
import { LocationService } from '../core/location';
import { DEFAULT_CENTER, createMap, fitZones, zoneLayer } from '../core/map';
import { ZoneStore } from '../core/zone-store';

/** Fixes older than this are treated as lost. */
const STALE_MS = 15_000;
/** Once enabled, the button stays enabled until you are this many metres past the threshold, so GPS jitter on the edge does not make it flicker (and beep) repeatedly. */
const HYSTERESIS_M = 3;

@Component({
  selector: 'app-tracker',
  imports: [DecimalPipe, DatePipe, RouterLink],
  templateUrl: './tracker.html',
  styleUrl: './tracker.css',
})
export class Tracker {
  protected readonly store = inject(ZoneStore);
  protected readonly loc = inject(LocationService);
  private readonly beep = inject(BeepService);

  private readonly mapEl = viewChild.required<ElementRef<HTMLElement>>('map');
  private map?: L.Map;
  private zonesGroup = L.layerGroup();
  private posGroup = L.layerGroup();

  protected readonly now = signal(Date.now());
  protected readonly follow = signal(true);
  protected readonly flash = signal<string | null>(null);

  protected readonly fresh = computed(() => {
    const f = this.loc.fix();
    return !!f && this.now() - f.time < STALE_MS;
  });

  protected readonly accurateEnough = computed(() => {
    const f = this.loc.fix();
    return !!f && f.accuracy <= this.store.settings().requiredAccuracy;
  });

  /** The zone you are deepest inside (or nearest to), with signed distance to its edge. */
  protected readonly nearest = computed(() => {
    const f = this.loc.fix();
    if (!f) return null;
    let best: { name: string; dist: number } | null = null;
    for (const z of this.store.zones()) {
      const dist = signedDistanceToZone([f.lat, f.lng], z);
      if (!best || dist > best.dist) best = { name: z.name, dist };
    }
    return best;
  });

  /** Metres you must be inside the edge for the button to enable. */
  private readonly margin = computed(() =>
    this.store.settings().strict ? (this.loc.fix()?.accuracy ?? 0) : 0,
  );

  protected readonly available = signal(false);

  constructor() {
    const tick = setInterval(() => this.now.set(Date.now()), 1000);
    const onVisible = () => document.visibilityState === 'visible' && this.loc.resumeIfWatching();
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
      this.map?.remove();
    });

    // Availability with hysteresis + beep on the off→on transition.
    effect(() => {
      const n = this.nearest();
      const ok = this.loc.watching() && this.fresh() && this.accurateEnough() && !!n;
      const was = untracked(this.available);
      const threshold = this.margin() - (was ? HYSTERESIS_M : 0);
      const now = ok && n!.dist >= threshold;
      if (now !== was) {
        this.available.set(now);
        if (now && this.store.settings().beep) this.beep.available();
      }
    });

    afterNextRender(() => {
      this.map = createMap(this.mapEl().nativeElement, DEFAULT_CENTER);
      this.zonesGroup.addTo(this.map);
      this.posGroup.addTo(this.map);
      if (!fitZones(this.map, this.store.zones())) this.map.setZoom(13);
      this.map.on('dragstart', () => this.follow.set(false));
    });

    effect(() => {
      const zones = this.store.zones();
      this.zonesGroup.clearLayers();
      zones.forEach((z) => zoneLayer(z, '#0f766e').addTo(this.zonesGroup));
    });

    effect(() => {
      const f = this.loc.fix();
      const follow = this.follow();
      this.posGroup.clearLayers();
      if (!f || !this.map) return;
      const p: LatLng = [f.lat, f.lng];
      L.circle(p, { radius: f.accuracy, color: '#2563eb', weight: 1, fillOpacity: 0.12 }).addTo(this.posGroup);
      L.circleMarker(p, { radius: 7, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }).addTo(this.posGroup);
      if (follow) this.map.panTo(p, { animate: true });
    });
  }

  protected toggleTracking(): void {
    if (this.loc.watching()) {
      this.loc.stop();
      return;
    }
    this.beep.unlock(); // this tap is what allows the beep to play later
    this.loc.start();
    this.follow.set(true);
  }

  protected testBeep(): void {
    this.beep.unlock();
    this.beep.available();
  }

  protected press(): void {
    const f = this.loc.fix();
    const n = this.nearest();
    if (!this.available() || !f || !n) return;
    this.store.recordPress({ time: Date.now(), zone: n.name, lat: f.lat, lng: f.lng, accuracy: f.accuracy });
    this.beep.confirm();
    this.flash.set(`Pressed in “${n.name}”`);
    setTimeout(() => this.flash.set(null), 2500);
  }

  protected ageSeconds(): number {
    const f = this.loc.fix();
    return f ? Math.max(0, Math.round((this.now() - f.time) / 1000)) : 0;
  }
}
