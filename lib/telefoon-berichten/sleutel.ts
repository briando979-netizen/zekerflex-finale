// De sleutel van de berichten op een zakelijk nummer (lib/telephony/lijn-server.ts): per eigenaar en lijn. De eigenaar
// is de organisatie (register lib/privacy/org-kv.ts, wissen met de organisatie) of, bij een eigen werknummer, de
// gebruiker (ERASABLE_KV_PREFIXES in lib/privacy/user-kv.ts). Een eigen map, zodat de registertest alleen deze sleutel ziet.

export const berichtenSleutel = (eigenaar: string, lijnId: string) => `telefoon:berichten:${eigenaar}:${lijnId}`;
