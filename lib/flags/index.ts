import { createHash } from "node:crypto";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Feature flags / remote config.
//
// Flip features on or off, or roll them out to a percentage of users, WITHOUT a
// redeploy — stored in the KeyValueStore, read with a short in-memory cache.
// Evaluation per user is deterministic (a user stays in or out of a rollout),
// supports an allowlist (userIds/roles) for early access, and falls back to a
// code-defined default so a flag that was never configured still behaves.
// ---------------------------------------------------------------------------

export interface FlagDef {
  key: string;
  label: string;
  description: string;
  /** behaviour when nothing is configured in the store */
  default: boolean;
}

// Known flags (for the admin UI + safe defaults). Evaluation also works for any
// ad-hoc key, but listing it here documents it and gives it a default.
export const FLAG_REGISTRY: FlagDef[] = [
  { key: "brein-assistent", label: "ZekerFlex-assistent (brein)", description: "De AI-assistent in de chat en op /dashboard|/werkgever/assistent.", default: true },
  { key: "autopilot", label: "Autopilot", description: "Laat de autopilot-acties draaien (naast de eigen aan/uit in Admin → Autopilot).", default: true },
  { key: "uren-auto-goedkeuren", label: "Uren automatisch goedkeuren aanbieden", description: "Toon opdrachtgevers de optie om uren automatisch te laten goedkeuren.", default: true },
  { key: "qr-betalen", label: "QR-betalen", description: "QR-betaallink op facturen.", default: true },
  { key: "winkel-ai-autopubliceren", label: "Winkel-AI zet producten zelf aan", description: "De winkel-agent zet een door hem gemaakt product zelf aan, maar alleen met echte voorraad én een echte foto. Uit = jij zet ze aan.", default: false },
  { key: "shop", label: "Webshop", description: "De klus-gear webshop.", default: true },
  { key: "agent-winkel", label: "Webshop via AI-assistenten", description: "De productlijst gaat elk kwartier naar Stripe, die hem deelt met AI-assistenten (ChatGPT, Copilot, …); een bestelling daar wordt een gewone webshopbestelling. Uit = er gaat niets meer naar Stripe; wat er al staat, blijft daar tot je het in Stripe uitzet.", default: true },
  { key: "agent-horeca", label: "Reserveren via AI-assistenten", description: "AI-assistenten kunnen bij horecazaken met online reserveren de vrije tijden zien en een tafel boeken (/api/agent/horeca), met dezelfde regels en mails als de eigen site. Uit = de API antwoordt dat hij dicht is.", default: true },
  { key: "ai-vertalen", label: "AI-vertalen in chat", description: "Herschrijven/vertalen-knop in de chat.", default: true },
  { key: "netwerk-pakketten", label: "Verbinding: wifi, VPN en 5G", description: "De netwerkpakketten in het werkgever-menu (Wifi en VPN) en hun API. Uit = het onderdeel is weg; bestaande instellingen blijven bewaard.", default: true },
  { key: "locatie-modules", label: "Op locatie: portofoon, toegang, kluis, printen", description: "De vier Op locatie-modules in het werkgever-menu, de werker-app en hun API (lib/locatie). Uit = het onderdeel is weg; instellingen, kentekens en de kluis blijven bewaard.", default: true },
  { key: "opbouwfase-melding", label: "Melding 'nog in de opbouwfase'", description: "Balk bovenaan /dashboard en /werkgever: nog niet officieel live, testklussen, gegevens veilig, ideeën welkom. Zet uit bij de officiële start.", default: true },
  { key: "onboarding-onderhoud", label: "Melding 'we verbeteren de aanmelding'", description: "Melding in de start van werkgevers (bij werkers weg sinds 10 nov, eigenaar): we verbeteren de onboarding, dingen kunnen haperen, wacht even tot je bericht krijgt; testklussen; begin volgend jaar online. Zet uit zodra de onboarding weer soepel werkt.", default: true },
  { key: "welkom-ontwikkelingsnotitie", label: "Welkomstmail: nog in ontwikkeling, testklussen", description: "Aan = elke nieuwe gebruiker leest in de welkomstmail (vijf talen) dat ZekerFlex nog in ontwikkeling is, dat de klussen testklussen zijn en dat we begin volgend jaar online gaan. Zet uit bij de officiële start.", default: true },
  { key: "werkrecht-eis", label: "Recht om te werken vragen vóór een klus", description: "Aan = een werker moet vóór het reageren op of aannemen van een klus eerst verklaren dat hij in Nederland mag werken en een bewijs uploaden (Verificatie). Uit (standaard sinds 10 nov, eigenaar) = er wordt niets gevraagd en niets geblokkeerd; de melding en het paneel zijn dan weg. Zet je dit weer aan, dan gelden verklaring en bewijs opnieuw.", default: false },
  { key: "id-gezicht-automatisch", label: "ID-controle: automatisch goedkeuren op het gezicht", description: "Aan = als de pasfoto op het document en de selfie sterk overeenkomen (gelijkenis vanaf 42%, eigen gezichtsmodel op de server, gemeten op echte controles) en alle andere controles kloppen (code op het document, naam, geldigheid, werkrecht, leeftijd), keurt ZekerFlex de identiteit zelf goed. Uit = de gezichtsscore wordt nog wel bewaard en getoond, maar een medewerker beslist altijd. Een rijbewijs gaat altijd naar een medewerker. Standaard uit: zet dit pas aan na een meting op echte gevallen (de gezichtsscore staat bij elke beoordeling), want de selfie wordt nog niet op echtheid gecontroleerd.", default: false },
  { key: "iphone-testflight", label: "iPhone-testversie (TestFlight) op de appspagina", description: "Aan = op /app en de homepage staat een knop \"TestFlight\" met uitleg voor de iPhone-testversie. Zet dit pas aan als de testlink echt testers aanneemt (Apple keurt de externe beta eerst); anders gaat de knop nergens heen. Uit (standaard) = alleen Android en \"Installeer de app\".", default: false },
  { key: "iphone-appstore", label: "iPhone-app in de App Store op de appspagina", description: "Aan = op /app en de homepage staat de echte App Store-knop voor de iPhone-app (Apple keurde versie 1.0 goed op 10 nov). Zet dit pas aan als de App Store-pagina openbaar is (het kan tot 24 uur duren na de goedkeuring); open eerst https://apps.apple.com/nl/app/zekerflex/id6832775836 op een iPhone. Uit (standaard) = de testknop of \"tester worden\".", default: false },
  { key: "google-verificatiemail", label: "Verificatiemail ook bij aanmelden met Google of Apple", description: "Aan = een nieuw account dat via Google of Apple wordt gemaakt krijgt dezelfde bevestigingsmail (link + code) als een gewone aanmelding en moet het adres eerst bevestigen. Uit = zo’n account geldt meteen als bevestigd en krijgt een welkomstmail. Een verborgen adres van Apple (@privaterelay.appleid.com) geldt altijd meteen als bevestigd. Bestaande accounts veranderen niet.", default: true },
];

// Boekhouding: bonnetjes per mail (lib/boekhouding/bonnen/mail-taak.ts); staat bewust apart omdat hij pas aan mag na een echte testmail.
FLAG_REGISTRY.push({
  key: "boekhouding-bonnen-mail",
  label: "Boekhouding: bonnetjes per mail verwerken",
  description:
    "Aan = elke 10 minuten wordt de Postvak (bonnetjes@zekerflex.com, een alias van info@) gelezen en worden bijlagen als bon in de echte administratie gezet; wat niet zeker klopt komt bij Beheer, Boekhouding, even kijken. Zet dit pas aan na een echte testmail: stel eerst BONNEN_AUTHSERV_ID in en controleer de lijst eigen afzenders. Uit (standaard) = er wordt geen mail gelezen.",
  default: false,
});

export interface FlagOverride {
  /** master switch; undefined = use the registry default */
  enabled?: boolean | undefined;
  /** 0–100: deterministic percentage rollout (needs a userId) */
  rolloutPct?: number | undefined;
  /** always-on for these roles (early access, even while enabled=false) */
  roles?: string[] | undefined;
  /** always-on for these user ids */
  userIds?: string[] | undefined;
  note?: string | undefined;
  updatedAt: string;
  updatedBy: string;
}

export type FlagStore = Record<string, FlagOverride>;

export interface FlagContext {
  userId?: string | null;
  roles?: string[];
}

const KEY = "feature-flags";
const CACHE_MS = 30_000;
let cache: { store: FlagStore; at: number } = { store: {}, at: 0 };

async function loadStore(force = false): Promise<FlagStore> {
  if (!force && Date.now() - cache.at < CACHE_MS) return cache.store;
  try {
    const store = (await kvGet<FlagStore>(KEY)) ?? {};
    cache = { store, at: Date.now() };
  } catch (err) {
    logger.warn("feature flags load failed — using defaults", { error: (err as Error).message });
  }
  return cache.store;
}

function defaultFor(key: string): boolean {
  return FLAG_REGISTRY.find((f) => f.key === key)?.default ?? false;
}

/** 0–99 bucket, stable per (flag, user). */
function bucket(key: string, userId: string): number {
  const h = createHash("sha256").update(`${key}:${userId}`).digest();
  return h.readUInt32BE(0) % 100;
}

export function evaluate(key: string, override: FlagOverride | undefined, ctx: FlagContext): boolean {
  if (!override) return defaultFor(key);
  if (ctx.userId && override.userIds?.includes(ctx.userId)) return true;
  if (ctx.roles && override.roles?.some((r) => ctx.roles!.includes(r))) return true;
  if (override.enabled === false) return false;
  if (typeof override.rolloutPct === "number") {
    if (!ctx.userId) return override.rolloutPct >= 100 || override.enabled === true;
    return bucket(key, ctx.userId) < override.rolloutPct;
  }
  if (override.enabled === true) return true;
  return defaultFor(key);
}

/** Is a feature on for this caller? Never throws — on any error it uses the default. */
export async function featureEnabled(key: string, ctx: FlagContext = {}): Promise<boolean> {
  try {
    const store = await loadStore();
    return evaluate(key, store[key], ctx);
  } catch {
    return defaultFor(key);
  }
}

/** Every known (and configured) flag resolved for this caller — for /api/me/flags. */
export async function flagsFor(ctx: FlagContext): Promise<Record<string, boolean>> {
  const store = await loadStore();
  const keys = new Set([...FLAG_REGISTRY.map((f) => f.key), ...Object.keys(store)]);
  const out: Record<string, boolean> = {};
  for (const key of keys) out[key] = evaluate(key, store[key], ctx);
  return out;
}

export interface FlagAdminRow extends FlagDef {
  override: FlagOverride | null;
  effectiveDefault: boolean;
}

/** For the admin UI: registry + stored overrides + any ad-hoc stored keys. */
export async function adminFlags(): Promise<FlagAdminRow[]> {
  const store = await loadStore(true);
  const rows: FlagAdminRow[] = FLAG_REGISTRY.map((f) => ({ ...f, override: store[f.key] ?? null, effectiveDefault: f.default }));
  for (const [key, override] of Object.entries(store)) {
    if (!FLAG_REGISTRY.some((f) => f.key === key)) {
      rows.push({ key, label: key, description: "Ad-hoc flag (niet in de registry).", default: false, override, effectiveDefault: false });
    }
  }
  return rows;
}

export async function setFlag(key: string, patch: Omit<FlagOverride, "updatedAt" | "updatedBy">, by: string): Promise<void> {
  const store = await loadStore(true);
  store[key] = { ...patch, updatedAt: new Date().toISOString(), updatedBy: by };
  await kvSet(KEY, store);
  cache = { store, at: Date.now() };
}

export async function deleteFlag(key: string): Promise<void> {
  const store = await loadStore(true);
  delete store[key];
  await kvSet(KEY, store);
  cache = { store, at: Date.now() };
}

export function _resetFlagCacheForTest(): void {
  cache = { store: {}, at: 0 };
}
