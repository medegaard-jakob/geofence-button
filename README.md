# Geofence Button (Angular)

**Live app:** `https://<your-github-username>.github.io/geofence-button/` (deployed by
`.github/workflows/deploy-pages.yml` on every push to `main`; one-time setup:
Settings → Pages → Source: GitHub Actions).

A small mobile web app: it tracks your GPS position and enables a big button
only while you are inside an area you drew yourself. When the button becomes
available it plays a short beep (and vibrates where supported).

## Pages

- **Button** (`#/`) — tap **Start GPS**, allow location, keep the screen open.
  Shows GPS accuracy, which area you are in / how far from it, and the button.
  Presses are logged with time, area and accuracy.
- **Areas** (`#/zones`) — draw areas on an OpenStreetMap map:
  - **Draw shape**: tap the map for each corner (drag corners to adjust), or
    walk the boundary and tap **Add my position** at each corner.
  - **Circle**: tap the centre, pick a radius.
  - Settings: required GPS accuracy (default ≤ 10 m), strict mode, beep on/off.

Everything is stored in the browser's `localStorage` on the device — no server.

## How "inside" is decided

The button is enabled when all of these hold:

1. GPS is on and the last fix is less than 15 s old;
2. the fix's reported accuracy is ≤ the required accuracy (e.g. 10 m or 5 m);
3. your position is inside an area. In **strict** mode it must be at least
   the accuracy radius inside the edge, i.e. the whole uncertainty circle is
   inside the area.

Once enabled it stays enabled until you are 3 m past the edge, so GPS jitter
on the boundary doesn't make it flicker or beep repeatedly.

Realistic accuracy: phones typically report 3–10 m outdoors with a clear sky,
and 10–50 m indoors or between tall buildings. A 5 m requirement will often
only be met outdoors.

## Notes / limitations

- **HTTPS is required** for GPS in browsers (except `localhost`).
- Browsers only track while the page is open and the screen is on. The app
  requests a screen wake lock while tracking to help with that.
- The beep uses the Web Audio API; mobile browsers only allow sound after a
  tap, which is why the beep is unlocked when you tap **Start GPS**. If your
  phone is in silent mode, iOS may mute it.

## Develop / build

```bash
npm install          # .npmrc sets legacy-peer-deps (works around an npm resolver bug)
npm start            # http://localhost:4200
npm run build        # static files in dist/geofence-app/browser
```

The build is plain static files using hash URLs, so it can be dropped onto
any static HTTPS host (GitHub Pages, Netlify, Cloudflare Pages, …).
To test on a phone during development: `npx ng serve --host 0.0.0.0 --ssl`
and accept the self-signed certificate.
