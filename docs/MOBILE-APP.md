# Mobile app — Google Play (and iOS later)

ZekerFlex is a **Next.js web app**, not a native one. You do **not** rewrite it
in another framework to ship an app. The web app is now an installable **PWA**;
Google Play distributes it as a **Trusted Web Activity (TWA)** — a ~1 MB
Android shell that opens `zekerflex.nl` full-screen, with the same code,
instant updates, and no content review for changes.

## What's in the repo now

| Piece | File |
|---|---|
| Web manifest | [`app/manifest.ts`](../app/manifest.ts) → `/manifest.webmanifest` |
| Icons (192, 512, maskable, apple-touch) | `public/icons/` |
| Service worker — offline fallback + **Web Push delivery** | [`public/sw.js`](../public/sw.js) |
| SW registration | [`components/app/ServiceWorkerRegister.tsx`](../components/app/ServiceWorkerRegister.tsx) (mounted in the root layout, prod only) |
| Push opt-in UI | [`components/app/PushToggle.tsx`](../components/app/PushToggle.tsx) on `/dashboard/account` |
| Push subscribe/unsubscribe API | [`app/api/me/push/route.ts`](../app/api/me/push/route.ts) |
| Digital Asset Links (TWA verification) | [`public/.well-known/assetlinks.json`](../public/.well-known/assetlinks.json) — **fill in the fingerprint** |
| CSP | `worker-src 'self'` + `manifest-src 'self'` added (`lib/security/csp.ts`) |

Web Push send-side already existed (`lib/notifications/push`, VAPID keys via
`npm run vapid:keys`). It could not deliver — there was no service worker.
Now it can.

## Prerequisites

1. `APP_BASE_URL=https://zekerflex.nl`, HTTPS live, `WEBPUSH_VAPID_*` set
   (`npm run vapid:keys`).
2. A **Google Play Console** account (one-time $25).
3. Node ≥ 18 for Bubblewrap, plus a JDK (Bubblewrap can fetch one).

## Step by step — TWA with Bubblewrap

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://zekerflex.nl/manifest.webmanifest
```

Answer the prompts:

- **Application ID**: `nl.zekerflex.app` (must match `assetlinks.json`
  `package_name` and never change).
- **Host**: `zekerflex.nl`
- **Start URL**: `/start`
- **Signing key**: let Bubblewrap create one — **back up the `.keystore` file
  and its passwords**; losing it means you can never update the app.

Then:

```bash
bubblewrap build          # produces app-release-bundle.aab + app-release-signed.apk
bubblewrap fingerprint    # prints the SHA-256 of your signing key
```

1. Put that SHA-256 into `public/.well-known/assetlinks.json`
   (`sha256_cert_fingerprints`), deploy, and verify it's live at
   `https://zekerflex.nl/.well-known/assetlinks.json` with
   `Content-Type: application/json`.
2. Also add the fingerprint in Play Console → **Setup → App integrity**, and
   if you use **Play App Signing** (recommended), copy the fingerprint Google
   shows there into `assetlinks.json` too (you'll list both).
3. Test locally: `bubblewrap install` on a connected device — the address bar
   must be gone. If you see a browser bar, Asset Links didn't verify.

## Play Console

1. Create the app (Dutch, category "Business", free).
2. **Upload the `.aab`** to Internal testing first.
3. Fill in: store listing (use the copy from `lib/seo.ts`), a 512×512 icon
   (`public/icons/icon-512.png`), feature graphic (1024×500), 2+ phone
   screenshots, privacy policy URL (`https://zekerflex.nl/privacy`).
4. Complete the **Data safety** form — declare: account data, location
   (GPS check-in), photos (KYC), device ids. Reference `docs/` and the AVG
   register.
5. Promote Internal → Closed → Production.

## Updating

- **Content / features**: just deploy the web app. The TWA has no cache of
  your HTML — users get the new version on next open.
- **Icon, name, permissions, target SDK**: rebuild the `.aab` with Bubblewrap
  and upload a new version (bump `versionCode`).

## When to go beyond a TWA

A TWA is fine until you need something the web can't do well: background
geofencing, deep OS integration, offline-first data entry, App Clips /
widgets. At that point evaluate **Capacitor** (wrap the same frontend, add
native plugins incrementally) before a full **React Native / Expo** rewrite —
the latter shares the `types/` + API layer but rebuilds every screen.

## iOS

Apple does not accept plain PWAs. The same web app goes into the App Store via
**Capacitor** (a WKWebView shell) or PacMan/PWABuilder's iOS target. Same
`manifest.ts` and service worker apply. Do this after Android is stable.
