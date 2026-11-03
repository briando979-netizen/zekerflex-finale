import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { AUTO_DOOR } from "@/lib/bouwer/autopilot";
import { leesLive, type LiveStaat, type LiveStatus } from "@/lib/bouwer/live";
import { bouwer, bouwerIngesteld, type TaakKort, type TaakStaat } from "@/lib/bouwer/werker";

// ---------------------------------------------------------------------------
// Pushmeldingen, zodat de eigenaar de pagina niet open hoeft te houden. Elke 2
// minuten (cron → /api/internal/bouwer/meldingen): staat een opdracht van de
// Bouwer klaar, heeft hij een vraag of liep hij vast, of is het live zetten
// klaar, mislukt, teruggezet of wacht het op akkoord, dan krijgt wie het startte
// één push die meteen het juiste tabblad opent. Automatische reparaties meldt
// de autopilot zelf (lib/bouwer/autopilot.ts).
// ---------------------------------------------------------------------------

const K_STAND = "bouwer:meldingen";
const MELD_TAAK = new Set<TaakStaat>(["vraag", "klaar", "mislukt", "conflict"]);
const MELD_LIVE = new Set<LiveStaat>(["wacht-op-akkoord", "klaar", "mislukt", "teruggezet"]);

export interface MeldStand {
  /** taak-id → de staat bij de vorige ronde */
  taken: Record<string, TaakStaat>;
  /** `${id}:${staat}` van de live-status bij de vorige ronde */
  live: string;
}

export interface Melding {
  id: string;
  door: string;
  titel: string;
  tekst: string;
  url: string;
}

const kort = (s: string, max = 70) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

function taakMelding(t: TaakKort): Melding {
  const over = `"${kort(t.opdracht)}"`;
  const [titel, tekst] =
    t.staat === "vraag"
      ? ["De Bouwer heeft een vraag", `Over ${over}. Tik om te antwoorden.`]
      : t.staat === "klaar"
        ? ["De Bouwer is klaar", `${over} staat klaar. Bekijk het voorbeeld en keur goed of gooi weg.`]
        : t.staat === "conflict"
          ? ["Goedkeuren lukte niet", `Bij ${over} veranderde tegelijk iets in dezelfde bestanden. Tik om bij te sturen.`]
          : ["De Bouwer liep vast", `${over} is niet gelukt. Tik om bij te sturen of weg te gooien.`];
  return { id: t.id, door: t.door, titel, tekst, url: "/admin/zekerflex-ai?tab=bouwer" };
}

function liveMelding(s: LiveStatus): Melding {
  const n = s.migraties.length;
  const [titel, tekst] =
    s.staat === "wacht-op-akkoord"
      ? ["Live zetten wacht op jou", n === 1 ? "Er is 1 databasewijziging om goed te keuren." : `Er zijn ${n} databasewijzigingen om goed te keuren.`]
      : s.staat === "klaar"
        ? [s.actie === "terug" ? "De vorige versie staat weer live" : "Live gezet", s.bericht || "De nieuwe versie staat live."]
        : s.staat === "teruggezet"
          ? ["Live zetten teruggedraaid", s.bericht || "De nieuwe versie werkte niet goed; de vorige draait weer."]
          : ["Live zetten mislukt", s.bericht || "Tik om te zien wat er misging."];
  return { id: s.id, door: s.door, titel, tekst: kort(tekst, 180), url: "/admin/zekerflex-ai?tab=live" };
}

/**
 * Wat er sinds de vorige ronde te melden is. `taken` is null als de Bouwer niet
 * bereikbaar was: dan blijft de vorige stand staan (anders meldt hij alles
 * opnieuw zodra hij terug is). De eerste ronde legt alleen de stand vast.
 */
export function nieuweMeldingen(
  taken: TaakKort[] | null,
  live: LiveStatus | null,
  vorige: MeldStand | null,
): { meldingen: Melding[]; stand: MeldStand } {
  const stand: MeldStand = { taken: taken ? {} : { ...(vorige?.taken ?? {}) }, live: live ? `${live.id}:${live.staat}` : (vorige?.live ?? "") };
  const meldingen: Melding[] = [];
  for (const t of taken ?? []) {
    stand.taken[t.id] = t.staat;
    if (!vorige || t.door === AUTO_DOOR || !MELD_TAAK.has(t.staat) || vorige.taken[t.id] === t.staat) continue;
    meldingen.push(taakMelding(t));
  }
  // serveronderhoud start de eigenaar zelf en ziet hij meteen op het scherm: geen push
  if (vorige && live && live.actie !== "onderhoud" && MELD_LIVE.has(live.staat) && stand.live !== vorige.live) meldingen.push(liveMelding(live));
  return { meldingen, stand };
}

/** Wie het startte, als dat (nog) een platformbeheerder is; anders alle beheerders. */
async function ontvangers(door: string): Promise<string[]> {
  const { platformAdminIds } = await import("@/lib/messaging/contacts");
  const beheerders = await platformAdminIds();
  if (!door.includes("@")) return beheerders;
  const user = await prisma.user.findUnique({ where: { email: door.toLowerCase() }, select: { id: true } }).catch(() => null);
  return user && beheerders.includes(user.id) ? [user.id] : beheerders;
}

export async function bouwerMeldingenTick(): Promise<{ meldingen: number; apparaten: number }> {
  const [vorige, { status }] = await Promise.all([kvGet<MeldStand>(K_STAND), leesLive()]);
  const taken = bouwerIngesteld()
    ? await bouwer<{ taken: TaakKort[] }>("/taken", { timeoutMs: 8_000 }).then(
        (r) => r.taken,
        () => null,
      )
    : null;
  const { meldingen, stand } = nieuweMeldingen(taken, status, vorige);
  await kvSet(K_STAND, stand);

  let apparaten = 0;
  if (meldingen.length) {
    const { sendUserPush } = await import("@/lib/notifications/push");
    for (const m of meldingen) {
      apparaten += await sendUserPush(await ontvangers(m.door), {
        title: m.titel,
        body: m.tekst,
        data: { type: "bouwer", url: m.url, tag: `bouwer-${m.id}` },
        ttlSeconds: 6 * 3600,
      }).catch(() => 0);
    }
  }
  return { meldingen: meldingen.length, apparaten };
}
