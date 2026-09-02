# Voice, notificaties & self-hosted Web Push

## Web Push (VAPID) — `lib/notifications/push/`

Volledig zelf geïmplementeerd, **nul nieuwe dependencies** (alleen Node-crypto +
jose):

- **`encrypt.ts`** — RFC 8291 `aes128gcm` payload-encryptie: ephemeral ECDH
  P-256 + HKDF-SHA256 + AES-128-GCM, RFC 8188-framing. Heeft ook
  `decryptPayload` (alleen voor de round-trip-test).
- **`vapid.ts`** — RFC 8292 `Authorization: vapid t=<jwt>, k=<pubkey>`, ES256 via
  jose. `generateVapidKeys()`.
- **`web-push.ts`** — `sendWebPush(target, payload, { ttlSeconds })`: kale POST
  naar het endpoint. 404/410 → `gone: true` (caller disablet de subscription).
- **`fcm.ts`** — Firebase is nu een **optionele** tweede provider; de box werkt
  volledig zonder `FIREBASE_*`.
- **`index.ts`** — `sendShiftOffer` waaiert uit over alle `WebPushSubscription`s
  én FCM-tokens; nooit een throw.

Setup: `npm run vapid:keys` → `WEBPUSH_VAPID_PUBLIC_KEY` / `_PRIVATE_KEY` in
`.env`. De browser abonneert met `applicationServerKey = <public key>` en POST
`{ endpoint, keys: { p256dh, auth } }` naar een opslag-endpoint.

## Voice / TTS — `lib/voice/`

- **`announce.ts#announce(input)`** — legt een `VoiceAnnouncement` vast (optioneel
  door het lokale model herschreven tot spreektaal). Nooit een throw. Gekoppeld
  aan: orchestratiecyclus klaar, nieuwe sales-lead, admin-console-mutatie
  uitgevoerd, LLM-herstel (watchdog).
- **`tts.ts`** — optioneel Piper (`PIPER_BIN` + `PIPER_MODEL`) → WAV via
  `GET /api/voice/announcements/[id]/audio` (501 als niet geconfigureerd).
- **`components/voice/VoiceAgent.tsx`** — gemount in `app/admin/layout.tsx`,
  verbindt met `GET /api/voice/stream` (SSE, 2s-poll, 5-min levensduur),
  spreekt elke melding in `nl-NL`. Mute-knop in `localStorage`. Serveraudio
  heeft voorrang, valt terug op de browser-`speechSynthesis`.

## Proactieve briefing — `lib/voice/briefing.ts`

`speakBriefing()` haalt **live** cijfers op (KPI's, omzet uit `Invoice`,
uitbetaald uit `Payment`, sales-backlog, open bevindingen, agent-activiteit,
AI-tokenverbruik, bezoekers) → NL-tekst → lokaal model herschrijft → `announce`.
`POST /api/admin/voice/briefing` (interne token of PLATFORM_ADMIN); ook bij boot
als `JARVIS_BOOT_BRIEFING=true`.

## Getrapte notificatiegolven

`lib/notifications/dispatcher.ts` — Redis-queue per shift, wave 1 direct, TTL,
follow-up-worker promoot de volgende golf. Zie de matching-workflow-handleiding.
