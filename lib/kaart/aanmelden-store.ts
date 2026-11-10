import { AppError } from "@/lib/errors";
import { zoekCoordinaat } from "@/lib/geo/pdok";
import { kvGet, kvListEntries, kvSet } from "@/lib/storage/kv";
import { controleerAanmelding, type Aanmelding, type AanmeldInvoer, type AanmeldStatus } from "@/lib/kaart/aanmelden";

// Aanmeldingen van bedrijven voor ZekerFlex Kaart, per organisatie één, in de KV (geen schema nodig):
//   kaart:aanmelding:<tenantId>
// Een nieuwe aanmelding of een wijziging staat eerst op "wacht"; pas na goedkeuring door een beheerder komt
// het bedrijf op de kaart (lib/kaart/plaatsen-server.ts). Het gaat om bedrijfsgegevens, niet om gebruikers.

const PREFIX = "kaart:aanmelding:";
const sleutel = (tenantId: string) => `${PREFIX}${tenantId}`;

export async function leesAanmelding(tenantId: string): Promise<Aanmelding | null> {
  const a = await kvGet<Aanmelding>(sleutel(tenantId));
  return a && typeof a.tenantId === "string" ? a : null;
}

/** Het bedrijf dient in of wijzigt. Een eerder goedgekeurde aanmelding gaat opnieuw naar de beheerder. */
export async function dienIn(tenantId: string, invoer: AanmeldInvoer, nu = new Date()): Promise<Aanmelding> {
  const c = controleerAanmelding(invoer);
  if (!c.ok) throw AppError.validation(c.fout);
  const plek = await zoekCoordinaat(c.waarde.adres);
  if (!plek) throw AppError.validation("Dit adres vonden we niet. Controleer straat, huisnummer en plaats.");
  const a: Aanmelding = {
    tenantId,
    ...c.waarde,
    lat: plek.lat,
    lon: plek.lon,
    plaats: plek.plaats ?? "",
    status: "wacht",
    ingediend: nu.toISOString(),
    beoordeeld: null,
    reden: "",
  };
  await kvSet(sleutel(tenantId), a);
  return a;
}

/** De beheerder keurt goed of af. Bij afwijzen hoort een reden voor het bedrijf. */
export async function beoordeel(tenantId: string, status: Exclude<AanmeldStatus, "wacht">, reden = "", nu = new Date()): Promise<Aanmelding> {
  const a = await leesAanmelding(tenantId);
  if (!a) throw AppError.notFound("Deze aanmelding bestaat niet meer.");
  if (status === "afgewezen" && reden.trim().length < 3) throw AppError.validation("Geef kort aan waarom je afwijst, dan weet het bedrijf wat het kan aanpassen.");
  const volgend: Aanmelding = { ...a, status, beoordeeld: nu.toISOString(), reden: status === "afgewezen" ? reden.trim().slice(0, 200) : "" };
  await kvSet(sleutel(tenantId), volgend);
  return volgend;
}

/** Alle aanmeldingen, voor de beheerder: wachtend eerst, dan nieuwste. */
export async function alleAanmeldingen(max = 200): Promise<Aanmelding[]> {
  const rijen = await kvListEntries<Aanmelding>(PREFIX, max);
  const lijst = rijen.map((r) => r.value).filter((a): a is Aanmelding => Boolean(a) && typeof a.tenantId === "string");
  return lijst.sort((x, y) => (x.status === "wacht" ? 0 : 1) - (y.status === "wacht" ? 0 : 1) || y.ingediend.localeCompare(x.ingediend));
}

export async function goedgekeurdeAanmeldingen(): Promise<Aanmelding[]> {
  return (await alleAanmeldingen(500)).filter((a) => a.status === "goedgekeurd");
}
