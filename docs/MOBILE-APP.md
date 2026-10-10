# Mobile app — Google Play (and iOS later)

ZekerFlex is a **Next.js web app**, not a native one. You do **not** rewrite it
in another framework to ship an app. The web app is now an installable **PWA**;
Google Play distributes it as a **Trusted Web Activity (TWA)** — a ~1 MB
Android shell that opens `www.zekerflex.com` full-screen, with the same code,
instant updates, and no content review for changes.

> **Status (2026-10-10):** the Play Console app already exists — package
> `com.zekerflex`, app name "Zekerflex.com", status Draft. A release signing
> key has been generated (`android-twa/KEYSTORE-CREDENTIALS.txt`, gitignored —
> back it up) and its fingerprint is already live in `assetlinks.json` below.
> `android-twa/twa-manifest.json` is fully filled in and ready. What's left is
> purely the build step (`bubblewrap build`), which needs a JDK 17 + Android
> SDK that this machine's network couldn't download (crawled at ~100KB/min).
> Either retry `bubblewrap build` from `android-twa/` once on a faster
> connection, or use [pwabuilder.com](https://www.pwabuilder.com) (enter
> `https://www.zekerflex.com`, package for Android/Google Play, package ID
> `com.zekerflex`) which builds the `.aab` in the browser — no local Android
> SDK needed — then sign it with `android-twa/android-release.keystore`.

## What's in the repo now

| Piece | File |
|---|---|
| Web manifest | [`app/manifest.ts`](../app/manifest.ts) → `/manifest.webmanifest` |
| Icons (192, 512, maskable, apple-touch) | `public/icons/` |
| Service worker — offline fallback + **Web Push delivery** | [`public/sw.js`](../public/sw.js) |
| SW registration | [`components/app/ServiceWorkerRegister.tsx`](../components/app/ServiceWorkerRegister.tsx) (mounted in the root layout, prod only) |
| Push opt-in UI | [`components/app/PushToggle.tsx`](../components/app/PushToggle.tsx) on `/dashboard/account` |
| Push subscribe/unsubscribe API | [`app/api/me/push/route.ts`](../app/api/me/push/route.ts) |
| Digital Asset Links (TWA verification) | [`public/.well-known/assetlinks.json`](../public/.well-known/assetlinks.json) — **filled in**, package `com.zekerflex` |
| CSP | `worker-src 'self'` + `manifest-src 'self'` added (`lib/security/csp.ts`) |

Web Push send-side already existed (`lib/notifications/push`, VAPID keys via
`npm run vapid:keys`). It could not deliver — there was no service worker.
Now it can.

## Prerequisites

1. `APP_BASE_URL=https://www.zekerflex.com`, HTTPS live, `WEBPUSH_VAPID_*` set
   (`npm run vapid:keys`).
2. A **Google Play Console** account (one-time $25) — already set up, app
   `com.zekerflex` exists in Draft.
3. Node ≥ 18, a JDK 17, and the Android SDK command-line tools for Bubblewrap.
   On this machine Android Studio's SDK is at
   `%LOCALAPPDATA%\Android\Sdk`, but Bubblewrap needs a legacy-layout
   `tools/` or `bin/` folder at the SDK root (Android Studio's installer
   doesn't put one there) — either install the "Android SDK Command-line
   Tools" package and point `bubblewrap updateConfig --androidSdkPath` at
   that `cmdline-tools/latest` folder, or let `bubblewrap init` download its
   own copy of the JDK/SDK on first run (~350MB).

## Step by step — TWA with Bubblewrap

The config already exists at `android-twa/twa-manifest.json` (package
`com.zekerflex`, host `www.zekerflex.com`, signing key already generated —
see `android-twa/KEYSTORE-CREDENTIALS.txt`, gitignored, **back it up**). From
a machine with a working JDK 17 + Android SDK:

```bash
npm i -g @bubblewrap/cli
cd android-twa
bubblewrap build          # reads twa-manifest.json, signs with android-release.keystore
```

This produces `app-release-bundle.aab` (upload this to Play Console) +
`app-release-signed.apk` (for local device testing). If you ever need to
regenerate the fingerprint: `bubblewrap fingerprint`, or directly via
`keytool -list -v -keystore android-release.keystore -alias zekerflex`.

**No working local JDK/SDK?** Use [pwabuilder.com](https://www.pwabuilder.com)
instead — enter `https://www.zekerflex.com`, "Package for stores" → Android,
package ID `com.zekerflex`. It builds the `.aab` server-side (no local
Android SDK needed) and lets you either have it sign the bundle (register
*that* new fingerprint in Play Console → Android developer verification →
"Add key" instead) or download an unsigned bundle to sign yourself with
`android-release.keystore`.

1. The fingerprint already in `public/.well-known/assetlinks.json` is live —
   verify at `https://www.zekerflex.com/.well-known/assetlinks.json` with
   `Content-Type: application/json`.
2. In Play Console → **Android developer verification** → the `Zekerflex.com`
   app → **Add key**, paste the same SHA-256 fingerprint so this new upload
   key is authorized alongside whatever keys are already registered there.
3. Test locally: `bubblewrap install` on a connected device — the address bar
   must be gone. If you see a browser bar, Asset Links didn't verify.

## Play Console

1. App already created (`com.zekerflex`, Draft) — continue from there rather
   than creating a second app.
2. **Upload the `.aab`** to Internal testing first.
3. Fill in: store listing (use the copy from `lib/seo.ts`), a 512×512 icon
   (`public/icons/icon-512.png`), feature graphic (1024×500), 2+ phone
   screenshots, privacy policy URL (`https://www.zekerflex.com/privacy`),
   and the **Account deletion** URL: `https://www.zekerflex.com/account-verwijderen`.
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
