import { Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { LatLng, Zone, zoneCenter } from '../core/geo';
import { LocationService } from '../core/location';
import { DEFAULT_CENTER, createMap, fitZones, zoneLayer } from '../core/map';
import { ZoneStore } from '../core/zone-store';

type Draft =
  | { id: string; name: string; kind: 'polygon'; points: LatLng[] }
  | { id: string; name: string; kind: 'circle'; center: LatLng | null; radius: number };

@Component({
  selector: 'app-zones-editor',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './zones-editor.html',
  styleUrl: './zones-editor.css',
})
export class ZonesEditor {
  protected readonly store = inject(ZoneStore);
  protected readonly loc = inject(LocationService);

  private readonly mapEl = viewChild.required<ElementRef<HTMLElement>>('map');
  private map?: L.Map;
  private readonly savedGroup = L.layerGroup();
  private readonly draftGroup = L.layerGroup();
  private readonly posGroup = L.layerGroup();
  private readonly mapReady = signal(false);

  protected readonly draft = signal<Draft | null>(null);

  protected readonly canSave = computed(() => {
    const d = this.draft();
    if (!d || !d.name.trim()) return false;
    return d.kind === 'polygon' ? d.points.length >= 3 : !!d.center && d.radius > 0;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.map?.remove());

    afterNextRender(() => {
      this.map = createMap(this.mapEl().nativeElement, DEFAULT_CENTER, 13);
      this.savedGroup.addTo(this.map);
      this.draftGroup.addTo(this.map);
      this.posGroup.addTo(this.map);
      if (!fitZones(this.map, this.store.zones())) {
        // No zones yet: jump to where the user is, if we can.
        navigator.geolocation?.getCurrentPosition(
          (p) => this.map?.setView([p.coords.latitude, p.coords.longitude], 18),
          () => {},
          { enableHighAccuracy: true, timeout: 10_000 },
        );
      }
      this.map.on('click', (e: L.LeafletMouseEvent) => this.addPoint([e.latlng.lat, e.latlng.lng]));
      this.mapReady.set(true);
    });

    effect(() => {
      this.mapReady();
      const editing = this.draft()?.id;
      this.savedGroup.clearLayers();
      for (const z of this.store.zones()) {
        if (z.id === editing) continue;
        zoneLayer(z, '#0f766e').bindTooltip(z.name).addTo(this.savedGroup);
      }
    });

    effect(() => {
      this.mapReady();
      const d = this.draft();
      this.draftGroup.clearLayers();
      if (!d) return;
      const color = '#ea580c';
      if (d.kind === 'polygon') {
        if (d.points.length >= 2) {
          (d.points.length >= 3 ? L.polygon(d.points, { color, weight: 2, dashArray: '6 4' }) : L.polyline(d.points, { color }))
            .addTo(this.draftGroup);
        }
        d.points.forEach((p, i) => this.vertex(p, color, (np) => this.movePoint(i, np)));
      } else if (d.center) {
        L.circle(d.center, { radius: d.radius, color, weight: 2, dashArray: '6 4' }).addTo(this.draftGroup);
        this.vertex(d.center, color, (np) => this.patch({ center: np }));
      }
    });

    effect(() => {
      this.mapReady();
      const f = this.loc.fix();
      this.posGroup.clearLayers();
      if (!f) return;
      L.circle([f.lat, f.lng], { radius: f.accuracy, color: '#2563eb', weight: 1, fillOpacity: 0.1, interactive: false }).addTo(this.posGroup);
      L.circleMarker([f.lat, f.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1, interactive: false }).addTo(this.posGroup);
    });
  }

  /** A draggable handle for a polygon corner or circle centre. */
  private vertex(p: LatLng, color: string, onMove: (p: LatLng) => void): void {
    const icon = L.divIcon({ className: 'vertex', html: `<span style="background:${color}"></span>`, iconSize: [22, 22] });
    L.marker(p, { icon, draggable: true })
      .on('dragend', (e) => {
        const ll = (e.target as L.Marker).getLatLng();
        onMove([ll.lat, ll.lng]);
      })
      .addTo(this.draftGroup);
  }

  protected newZone(kind: 'polygon' | 'circle'): void {
    const id = crypto.randomUUID?.() ?? String(Date.now());
    const name = `Area ${this.store.zones().length + 1}`;
    this.draft.set(kind === 'polygon' ? { id, name, kind, points: [] } : { id, name, kind, center: null, radius: 25 });
  }

  protected edit(z: Zone): void {
    this.draft.set(structuredClone(z));
    if (this.map) fitZones(this.map, [z]);
  }

  protected patch(p: Partial<{ name: string; radius: number; center: LatLng }>): void {
    this.draft.update((d) => (d ? ({ ...d, ...p } as Draft) : d));
  }

  private addPoint(p: LatLng): void {
    const d = this.draft();
    if (!d) return;
    if (d.kind === 'polygon') this.draft.set({ ...d, points: [...d.points, p] });
    else this.draft.set({ ...d, center: p });
  }

  private movePoint(i: number, p: LatLng): void {
    const d = this.draft();
    if (d?.kind === 'polygon') this.draft.set({ ...d, points: d.points.map((q, j) => (j === i ? p : q)) });
  }

  /** Add a corner (or set the centre) at your current GPS position — handy for walking the boundary. */
  protected addHere(): void {
    const f = this.loc.fix();
    if (f) {
      this.addPoint([f.lat, f.lng]);
      this.map?.panTo([f.lat, f.lng]);
    } else {
      this.loc.start();
    }
  }

  protected undo(): void {
    const d = this.draft();
    if (d?.kind === 'polygon') this.draft.set({ ...d, points: d.points.slice(0, -1) });
    else if (d) this.draft.set({ ...d, center: null });
  }

  protected save(): void {
    const d = this.draft();
    if (!d || !this.canSave()) return;
    const name = d.name.trim();
    this.store.upsert(
      d.kind === 'polygon'
        ? { id: d.id, name, kind: 'polygon', points: d.points }
        : { id: d.id, name, kind: 'circle', center: d.center!, radius: d.radius },
    );
    this.draft.set(null);
  }

  protected remove(z: Zone): void {
    if (confirm(`Delete “${z.name}”?`)) {
      this.store.remove(z.id);
      if (this.draft()?.id === z.id) this.draft.set(null);
    }
  }

  protected show(z: Zone): void {
    if (this.map) this.map.setView(zoneCenter(z), Math.max(this.map.getZoom(), 17));
  }
}
