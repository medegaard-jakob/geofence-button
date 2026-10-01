import { Injectable, signal } from '@angular/core';

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number; // metres, 68% confidence radius as reported by the device
  time: number;
}

/** Wraps navigator.geolocation.watchPosition in signals, with high accuracy and no caching. */
@Injectable({ providedIn: 'root' })
export class LocationService {
  readonly fix = signal<Fix | null>(null);
  readonly error = signal<string | null>(null);
  readonly watching = signal(false);

  private watchId: number | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private wakeLock: { release(): Promise<void> } | null = null;

  start(): void {
    if (this.watchId !== null) return;
    if (!('geolocation' in navigator)) {
      this.error.set('This browser has no GPS / geolocation support.');
      return;
    }
    this.error.set(null);
    this.watching.set(true);
    const opts: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 };
    this.watchId = navigator.geolocation.watchPosition(this.onFix, this.onError, opts);
    // Some phones (notably iOS) stop sending updates while you stand still;
    // ask explicitly when the last fix is getting old so a stationary user keeps the button.
    this.poll = setInterval(() => {
      const f = this.fix();
      if (!f || Date.now() - f.time > 8_000) navigator.geolocation.getCurrentPosition(this.onFix, () => {}, opts);
    }, 5_000);
    this.keepScreenOn();
  }

  private readonly onFix = (pos: GeolocationPosition): void => {
    this.error.set(null);
    this.fix.set({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      // Local receive time: device GPS timestamps can be skewed from the system clock.
      time: Date.now(),
    });
  };

  private readonly onError = (err: GeolocationPositionError): void => {
    this.error.set(
      err.code === err.PERMISSION_DENIED
        ? 'Location permission denied. Allow location for this site in your browser settings.'
        : err.code === err.TIMEOUT
          ? 'Waiting for a GPS fix… (go outside / near a window)'
          : `Location unavailable: ${err.message}`,
    );
    if (err.code === err.PERMISSION_DENIED) this.stop();
  };

  stop(): void {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    if (this.poll !== null) clearInterval(this.poll);
    this.watchId = null;
    this.poll = null;
    this.watching.set(false);
    this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }

  /** Browsers pause GPS when the screen turns off, so ask to keep it on while tracking. */
  private async keepScreenOn(): Promise<void> {
    const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<any> } }).wakeLock;
    if (!wl) return;
    try {
      this.wakeLock = await wl.request('screen');
    } catch {
      /* not allowed (e.g. battery saver) — tracking still works while the screen is on */
    }
  }

  /** Wake locks are dropped when the tab is hidden; re-acquire on return. */
  resumeIfWatching(): void {
    if (this.watching() && !this.wakeLock) this.keepScreenOn();
  }
}
