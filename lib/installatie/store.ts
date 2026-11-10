import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { geldigePositie, magNaar, type Afspraak, type InstallatieStatus, type Positie } from "@/lib/installatie/model";

// ---------------------------------------------------------------------------
// Opslag van installatieafspraken in de KV (geen schema nodig):
//   installatie:<id>       de afspraak
//   installatie:index      de id's, nieuwste eerst (hooguit 300)
//
// Een link naar de afspraak is een "capability": wie hem heeft, ziet de afspraak. De link bevat het
// id en een handtekening (HMAC met AUTH_SECRET) per rol, "klant" of "monteur". Er is dus niets om op
// te slaan of te lekken, en de beheerder kan de link altijd opnieuw maken. De monteurlink mag de
// status en de positie zetten, de klantlink alleen kijken. De positie van de monteur bestaat alleen
// zolang hij onderweg is en wordt gewist zodra hij er is.
// ---------------------------------------------------------------------------

export type Rol = "klant" | "monteur";

const MAX_INDEX = 300;
/** hooguit eens per zoveel seconden een nieuwe positie bewaren */
const MIN_TUSSENTIJD_MS = 3_000;

const kAfspraak = (id: string) => `installatie:${id}`;
const KINDEX = "installatie:index";

const geheim = () => createHmac("sha256", env.AUTH_SECRET).update("installatie-link").digest();
const handtekening = (id: string, rol: Rol) => createHmac("sha256", geheim()).update(`${id}|${rol}`).digest("base64url").slice(0, 22);

/** De link-code voor een rol: `<id>.<handtekening>`. */
export function maakToken(id: string, rol: Rol): string {
  return `${id}.${handtekening(id, rol)}`;
}

/** Klopt deze code, en voor welke rol? Null bij alles wat niet klopt. */
export function leesToken(token: string): { id: string; rol: Rol } | null {
  if (typeof token !== "string" || token.length > 80) return null;
  const [id, sig] = token.split(".");
  if (!id || !sig || !/^[a-z0-9]{6,32}$/.test(id) || sig.length !== 22) return null;
  for (const rol of ["klant", "monteur"] as const) {
    const verwacht = Buffer.from(handtekening(id, rol));
    const gekregen = Buffer.from(sig);
    if (verwacht.length === gekregen.length && timingSafeEqual(verwacht, gekregen)) return { id, rol };
  }
  return null;
}

export interface NieuweAfspraak {
  klantNaam: string;
  adres: string;
  plaats: string;
  lat: number;
  lon: number;
  venster: { van: string; tot: string };
  monteurNaam: string;
  regels: string[];
  notitie?: string;
}

export async function maakAfspraak(invoer: NieuweAfspraak): Promise<Afspraak> {
  if (!geldigePositie(invoer.lat, invoer.lon)) throw AppError.validation("De plek van het adres klopt niet.");
  if (!(Date.parse(invoer.venster.van) < Date.parse(invoer.venster.tot))) throw AppError.validation("Het tijdvak klopt niet: het einde moet na het begin liggen.");
  const nu = new Date().toISOString();
  const a: Afspraak = {
    id: randomBytes(8).toString("hex"),
    klantNaam: invoer.klantNaam.trim().slice(0, 120),
    adres: invoer.adres.trim().slice(0, 160),
    plaats: invoer.plaats.trim().slice(0, 80),
    lat: invoer.lat,
    lon: invoer.lon,
    venster: invoer.venster,
    monteurNaam: invoer.monteurNaam.trim().slice(0, 80),
    regels: invoer.regels.map((r) => r.trim().slice(0, 120)).filter(Boolean).slice(0, 30),
    notitie: (invoer.notitie ?? "").trim().slice(0, 500),
    status: "gepland",
    positie: null,
    tijden: { gepland: nu },
    gemaakt: nu,
  };
  await kvSet(kAfspraak(a.id), a);
  const index = (await kvGet<string[]>(KINDEX)) ?? [];
  await kvSet(KINDEX, [a.id, ...index.filter((x) => x !== a.id)].slice(0, MAX_INDEX));
  return a;
}

export async function leesAfspraak(id: string): Promise<Afspraak | null> {
  const a = await kvGet<Afspraak>(kAfspraak(id));
  return a && typeof a.id === "string" && a.id === id ? a : null;
}

export async function lijstAfspraken(max = 60): Promise<Afspraak[]> {
  const index = (await kvGet<string[]>(KINDEX)) ?? [];
  const lijst = await Promise.all(index.slice(0, max).map((id) => leesAfspraak(id)));
  return lijst.filter((a): a is Afspraak => a !== null);
}

/** De monteur zet de status. Alleen toegestane stappen; de positie is weg zodra hij er is. */
export async function zetStatus(id: string, naar: InstallatieStatus, nu = new Date()): Promise<Afspraak> {
  const a = await leesAfspraak(id);
  if (!a) throw AppError.notFound("Deze afspraak bestaat niet meer.");
  if (a.status === naar) return a;
  if (!magNaar(a.status, naar)) throw AppError.conflict("Deze stap kan nu niet. Ververs de pagina en kijk wat de volgende stap is.");
  const volgend: Afspraak = {
    ...a,
    status: naar,
    // de plek van de monteur is alleen voor onderweg; daarna is hij er of niet meer van belang
    positie: naar === "onderweg" ? a.positie : null,
    tijden: { ...a.tijden, [naar]: nu.toISOString() },
  };
  await kvSet(kAfspraak(id), volgend);
  return volgend;
}

/** De telefoon van de monteur meldt waar hij is. Alleen onderweg; te snel achter elkaar wordt genegeerd. */
export async function zetPositie(id: string, p: { lat: number; lon: number; nauwkeurigheid?: number }, nu = new Date()): Promise<Afspraak> {
  const a = await leesAfspraak(id);
  if (!a) throw AppError.notFound("Deze afspraak bestaat niet meer.");
  if (a.status !== "onderweg") return a;
  if (!geldigePositie(p.lat, p.lon)) throw AppError.validation("Deze plek klopt niet.");
  if (a.positie && nu.getTime() - Date.parse(a.positie.at) < MIN_TUSSENTIJD_MS) return a;
  const positie: Positie = { lat: p.lat, lon: p.lon, at: nu.toISOString(), ...(typeof p.nauwkeurigheid === "number" && p.nauwkeurigheid >= 0 && p.nauwkeurigheid < 100_000 ? { nauwkeurigheid: Math.round(p.nauwkeurigheid) } : {}) };
  const volgend: Afspraak = { ...a, positie };
  await kvSet(kAfspraak(id), volgend);
  return volgend;
}
