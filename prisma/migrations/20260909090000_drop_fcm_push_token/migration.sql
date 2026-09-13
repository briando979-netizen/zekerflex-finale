-- Drops the FCM device-token table. Firebase Cloud Messaging support was
-- removed: firebase-admin was only ever pulled in for this channel (env
-- FIREBASE_* was never configured) and it dragged a critical CVE along via
-- its @google-cloud/* -> google-gax -> uuid dependency chain. Self-hosted
-- Web Push (WebPushSubscription) is the only push channel now.

DROP TABLE IF EXISTS "PushToken";
