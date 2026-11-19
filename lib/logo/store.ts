import { AppError } from "@/lib/errors";
import { LOGO_VOORVOEGSEL, maakOpslag, nieuwId } from "@/lib/advertentie/opslag";
import { keuzeGewijzigd } from "@/lib/advertentie/regels";
import type { VrijgaveUitkomst } from "@/lib/advertentie/store";
import type { Logo, LogoAanvraag, LogoInvoer } from "@/lib/logo/regels";

// Logo's van de logo maker in KV (logo-maker:item:<id>), met dezelfde opslag als de advertentie op maat
// (lib/advertentie/opslag.ts): id van 128 bit, vervalt 60 dagen na de laatste wijziging.

const opslag = maakOpslag<Logo>(LOGO_VOORVOEGSEL);

export async function maakLogo(invoer: LogoInvoer, nu = new Date()): Promise<Logo> {
  const moment = nu.toISOString();
  return opslag.bewaar({ id: nieuwId(), aangemaakt: moment, gewijzigd: moment, invoer, status: "gemaakt" });
}

export const haalLogo = opslag.haal;
export const alleLogos = opslag.alle;

async function eis(id: string, nu: Date): Promise<Logo> {
  const logo = await opslag.haal(id, nu);
  if (!logo) throw AppError.notFound("Dit logo bestaat niet (meer).");
  return logo;
}

export async function vraagLogoAan(id: string, aanvraag: Omit<LogoAanvraag, "op">, nu = new Date()): Promise<Logo> {
  const logo = await eis(id, nu);
  if (logo.status === "vrijgegeven") throw AppError.conflict("Dit logo is al vrijgegeven.");
  const moment = nu.toISOString();
  return opslag.bewaar({ ...logo, status: "aangevraagd", aanvraag: { ...aanvraag, op: moment }, gewijzigd: moment });
}

/** Vrijgeven voor de aanvraag die de beheerder zag; koos de klant intussen iets anders, dan ok: false met de versie van nu. */
export async function geefLogoVrij(id: string, gezienOp: string, nu = new Date()): Promise<VrijgaveUitkomst<Logo>> {
  const logo = await eis(id, nu);
  if (!logo.aanvraag) throw AppError.precondition("Dit logo is nog niet aangevraagd: er is geen logo gekozen en geen e-mailadres.");
  if (keuzeGewijzigd(logo.aanvraag, gezienOp)) return { ok: false, rij: logo };
  const moment = nu.toISOString();
  return { ok: true, rij: await opslag.bewaar({ ...logo, status: "vrijgegeven", vrijgegevenOp: logo.vrijgegevenOp ?? moment, gewijzigd: moment }) };
}

export async function verwijderLogo(id: string): Promise<void> {
  await opslag.verwijder(id);
}
