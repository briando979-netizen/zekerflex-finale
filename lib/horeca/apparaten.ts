import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { KOPPEL_MINUTEN, KOPPEL_TEKENS, isSchermRol, maakKoppelcode, type SchermRol } from "@/lib/horeca/schermen";

// ---------------------------------------------------------------------------
// Apparaten die aan een zaak gekoppeld zijn: de handheld van de bediening, de
// tablet in de keuken, de tv bij de balie. De beheerder maakt een apparaat aan
// en krijgt een koppelcode (15 minuten geldig, één keer te gebruiken). Op het
// apparaat tik je die in bij /scherm (of scan je de QR); het krijgt dan een
// ondertekend httpOnly-cookie voor een jaar. Personeel heeft dus geen eigen
// ZekerFlex-account nodig. Ontkoppelen haalt het apparaat weg: het cookie werkt
// dan direct niet meer, want elk verzoek kijkt of het apparaat nog bestaat.
//
// Opslag in KV (geen schema nodig):
//   horeca:apparaten:<zaakId>          lijst van apparaten
//   horeca:koppel:<code>               { zaakId, apparaatId, tot }
//   horeca:gezien:<zaakId>:<id>        laatst gezien (los, zodat schrijven nooit botst)
// ---------------------------------------------------------------------------

export const SCHERM_COOKIE = "zf_horeca_scherm";
const COOKIE_DAGEN = 365;
const MAX_APPARATEN = 40;

export interface Apparaat {
  id: string;
  naam: string;
  rol: SchermRol;
  gemaakt: string;
  gekoppeld: string | null;
  /** hoort bij het cookie; een nieuwe koppeling maakt het oude cookie ongeldig */
  sleutel: string;
}

interface Koppeling {
  zaakId: string;
  apparaatId: string;
  tot: string;
}

const kLijst = (zaakId: string) => `horeca:apparaten:${zaakId}`;
const kKoppel = (code: string) => `horeca:koppel:${code}`;
const kGezien = (zaakId: string, id: string) => `horeca:gezien:${zaakId}:${id}`;

const leesLijst = async (zaakId: string): Promise<Apparaat[]> => {
  const l = await kvGet<Apparaat[]>(kLijst(zaakId));
  return Array.isArray(l) ? l.filter((a) => a && typeof a.id === "string" && isSchermRol(a.rol)) : [];
};

/** De apparaten van een zaak met wanneer ze het laatst iets vroegen. */
export async function apparatenVan(zaakId: string): Promise<(Omit<Apparaat, "sleutel"> & { gezien: string | null })[]> {
  const [lijst, gezien] = await Promise.all([leesLijst(zaakId), kvListEntries<string>(`horeca:gezien:${zaakId}:`, 200)]);
  const op = new Map(gezien.map((g) => [g.key.slice(`horeca:gezien:${zaakId}:`.length), typeof g.value === "string" ? g.value : null]));
  return lijst.map(({ sleutel: _s, ...a }) => ({ ...a, gezien: op.get(a.id) ?? null }));
}

/** Een nieuwe koppelcode voor een apparaat (de oude code vervalt vanzelf). */
async function nieuweCode(zaakId: string, apparaatId: string): Promise<{ code: string; tot: string }> {
  const tot = new Date(Date.now() + KOPPEL_MINUTEN * 60_000).toISOString();
  for (let poging = 0; poging < 5; poging++) {
    const code = maakKoppelcode(() => randomInt(0, KOPPEL_TEKENS.length) / KOPPEL_TEKENS.length);
    const bestaand = await kvGet<Koppeling>(kKoppel(code));
    if (bestaand && Date.parse(bestaand.tot) > Date.now()) continue;
    await kvSet(kKoppel(code), { zaakId, apparaatId, tot } satisfies Koppeling);
    return { code, tot };
  }
  throw AppError.conflict("Er ging iets mis bij het maken van de code. Probeer het opnieuw.");
}

/** Apparaat aanmaken (zonder id) of wijzigen; een nieuw apparaat krijgt meteen een koppelcode. */
export async function bewaarApparaat(zaakId: string, a: { id?: string | undefined; naam: string; rol: SchermRol }): Promise<{ code: string; tot: string; id: string } | null> {
  const lijst = await leesLijst(zaakId);
  if (a.id) {
    const x = lijst.find((y) => y.id === a.id);
    if (!x) throw AppError.notFound("Apparaat niet gevonden.");
    x.naam = a.naam;
    x.rol = a.rol;
    await kvSet(kLijst(zaakId), lijst);
    return null;
  }
  if (lijst.length >= MAX_APPARATEN) throw AppError.validation(`Je kunt maximaal ${MAX_APPARATEN} apparaten koppelen. Ontkoppel eerst een apparaat dat je niet meer gebruikt.`);
  const nieuw: Apparaat = { id: randomBytes(8).toString("hex"), naam: a.naam, rol: a.rol, gemaakt: new Date().toISOString(), gekoppeld: null, sleutel: randomBytes(12).toString("base64url") };
  await kvSet(kLijst(zaakId), [...lijst, nieuw]);
  return { ...(await nieuweCode(zaakId, nieuw.id)), id: nieuw.id };
}

/** Een nieuwe koppelcode voor een bestaand apparaat (bijv. een vervangen tablet). */
export async function koppelcodeVoor(zaakId: string, id: string) {
  if (!(await leesLijst(zaakId)).some((a) => a.id === id)) throw AppError.notFound("Apparaat niet gevonden.");
  return { ...(await nieuweCode(zaakId, id)), id };
}

/** Ontkoppelen: het apparaat verdwijnt en zijn cookie werkt direct niet meer. */
export async function ontkoppel(zaakId: string, id: string) {
  const lijst = await leesLijst(zaakId);
  if (!lijst.some((a) => a.id === id)) throw AppError.notFound("Apparaat niet gevonden.");
  await kvSet(
    kLijst(zaakId),
    lijst.filter((a) => a.id !== id),
  );
  await kvDelete(kGezien(zaakId, id));
}

// ── Het cookie op het apparaat ───────────────────────────────────────────────

const geheim = () => createHmac("sha256", env.AUTH_SECRET).update("horeca-scherm").digest();

function teken(zaakId: string, a: Apparaat): string {
  const inhoud = Buffer.from(JSON.stringify({ z: zaakId, a: a.id, s: a.sleutel, x: Date.now() + COOKIE_DAGEN * 86_400_000 })).toString("base64url");
  return `${inhoud}.${createHmac("sha256", geheim()).update(inhoud).digest("base64url")}`;
}

function leesCookie(token: string | undefined): { zaakId: string; id: string; sleutel: string } | null {
  if (!token || token.length > 600) return null;
  const [inhoud, handtekening] = token.split(".");
  if (!inhoud || !handtekening) return null;
  const verwacht = createHmac("sha256", geheim()).update(inhoud).digest();
  const gekregen = Buffer.from(handtekening, "base64url");
  if (gekregen.length !== verwacht.length || !timingSafeEqual(gekregen, verwacht)) return null;
  try {
    const { z, a, s, x } = JSON.parse(Buffer.from(inhoud, "base64url").toString()) as Record<string, unknown>;
    if (typeof z !== "string" || typeof a !== "string" || typeof s !== "string" || typeof x !== "number" || x <= Date.now()) return null;
    return { zaakId: z, id: a, sleutel: s };
  } catch {
    return null;
  }
}

/** De code van het apparaat inwisselen voor het cookie. Eén keer te gebruiken. */
export async function koppel(code: string): Promise<{ zaakId: string; apparaat: Apparaat }> {
  const k = await kvGet<Koppeling>(kKoppel(code));
  if (!k || Date.parse(k.tot) <= Date.now()) throw AppError.validation("Deze code klopt niet of is verlopen. Maak in het beheer een nieuwe code.");
  await kvDelete(kKoppel(code));
  const lijst = await leesLijst(k.zaakId);
  const a = lijst.find((x) => x.id === k.apparaatId);
  if (!a) throw AppError.validation("Dit apparaat is intussen ontkoppeld. Maak in het beheer een nieuwe code.");
  // nieuwe sleutel: een eerder gekoppeld apparaat met dezelfde naam is nu los
  a.sleutel = randomBytes(12).toString("base64url");
  a.gekoppeld = new Date().toISOString();
  await kvSet(kLijst(k.zaakId), lijst);
  (await cookies()).set(SCHERM_COOKIE, teken(k.zaakId, a), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_DAGEN * 86_400,
  });
  return { zaakId: k.zaakId, apparaat: a };
}

export async function vergeetCookie() {
  (await cookies()).delete(SCHERM_COOKIE);
}

// laatst gezien hoogstens eens per minuut per apparaat schrijven (gedeeld via globalThis: Next bundelt routes apart)
const g = globalThis as unknown as { __zfHorecaGezien?: Map<string, number> };
const gezienGeheugen = (g.__zfHorecaGezien ??= new Map());

/** Het gekoppelde apparaat van deze browser, of null (geen cookie, ontkoppeld, vervalst). */
export async function ditApparaat(): Promise<{ zaakId: string; apparaat: Apparaat } | null> {
  const c = leesCookie((await cookies()).get(SCHERM_COOKIE)?.value);
  if (!c) return null;
  const a = (await leesLijst(c.zaakId)).find((x) => x.id === c.id);
  if (!a || a.sleutel.length !== c.sleutel.length || !timingSafeEqual(Buffer.from(a.sleutel), Buffer.from(c.sleutel))) return null;
  const nu = Date.now();
  if (nu - (gezienGeheugen.get(a.id) ?? 0) > 60_000) {
    gezienGeheugen.set(a.id, nu);
    await kvSet(kGezien(c.zaakId, a.id), new Date(nu).toISOString()).catch(() => undefined);
  }
  return { zaakId: c.zaakId, apparaat: a };
}
