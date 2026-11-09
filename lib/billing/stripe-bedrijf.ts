import type Stripe from "stripe";
import type { CompanyRegistration } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Bedrijfsgegevens vooraf invullen bij een nieuw Stripe-account (Connect
// Express) van een rijschool of horecazaak, zodat de ondernemer bij Stripe
// niet opnieuw zijn KvK-gegevens hoeft te typen. Alleen wat in het
// Handelsregister staat (CompanyRegistration), nooit zelf ingetypte velden:
// Stripe vraagt vooraf ingevulde gegevens niet opnieuw, alleen om te bevestigen.
//   company.name    = de statutaire naam (Stripe: "registered name"), niet de
//                     naam van de zaak; die staat al in business_profile.name
//   company.tax_id  = het KvK-nummer (Stripe: id_numbers.nl_kvk)
//   company.address = het adres uit de KvK, alleen als het compleet is
// De rechtsvorm (business_type) laten we aan de ondernemer bij Stripe. Weigert
// Stripe een vooraf ingevuld veld, dan maken we het account zonder: koppelen
// mag hier nooit op vastlopen.
// ---------------------------------------------------------------------------

type Registratie = Pick<CompanyRegistration, "legalName" | "kvkNumber" | "street" | "houseNumber" | "postalCode" | "city">;

/** Wat we vooraf kunnen invullen; undefined als er niets bruikbaars is. */
export function stripeBedrijf(reg: Registratie | null | undefined): Stripe.AccountCreateParams.Company | undefined {
  if (!reg) return undefined;
  const naam = reg.legalName.trim();
  const kvk = reg.kvkNumber.replace(/\D/g, "");
  const straat = reg.street?.trim() ?? "";
  const postcode = reg.postalCode?.trim() ?? "";
  const plaats = reg.city?.trim() ?? "";
  const line1 = [straat, reg.houseNumber?.trim()].filter(Boolean).join(" ");
  const company: Stripe.AccountCreateParams.Company = {
    ...(naam ? { name: naam } : {}),
    ...(/^\d{8}$/.test(kvk) ? { tax_id: kvk } : {}),
    ...(straat && postcode && plaats ? { address: { line1, postal_code: postcode, city: plaats, country: "NL" } } : {}),
  };
  return Object.keys(company).length > 0 ? company : undefined;
}

/** De KvK-gegevens van dit bedrijf voor Stripe. Lukt het lezen niet, dan vult Stripe het zelf in. */
export async function stripeBedrijfVan(tenantId: string): Promise<Stripe.AccountCreateParams.Company | undefined> {
  const t = await prisma.tenant
    .findUnique({
      where: { id: tenantId },
      select: { companyRegistration: { select: { legalName: true, kvkNumber: true, street: true, houseNumber: true, postalCode: true, city: true } } },
    })
    .catch(() => null);
  return stripeBedrijf(t?.companyRegistration);
}

/**
 * Stripe weigerde een van de vooraf ingevulde bedrijfsvelden (en niets anders). Ook
 * business_type: Stripe kan een ingevuld company-blok weigeren zolang de rechtsvorm
 * nog niet gekozen is, en die laten we juist aan de ondernemer.
 */
export function isBedrijfsveldFout(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { type?: unknown; param?: unknown };
  return e.type === "StripeInvalidRequestError" && typeof e.param === "string" && (e.param.startsWith("company") || e.param.startsWith("business_type"));
}

/** Maakt het Connect-account met de KvK-gegevens erin; weigert Stripe die, dan zonder. */
export async function maakAccountMetKvk(stripe: Pick<Stripe, "accounts">, gegevens: Stripe.AccountCreateParams, tenantId: string): Promise<Stripe.Account> {
  const company = await stripeBedrijfVan(tenantId);
  if (!company) return stripe.accounts.create(gegevens);
  try {
    return await stripe.accounts.create({ ...gegevens, company });
  } catch (err) {
    if (!isBedrijfsveldFout(err)) throw err;
    logger.warn("stripe: vooraf ingevulde bedrijfsgegevens geweigerd, account zonder gemaakt", { tenantId, error: err instanceof Error ? err.message : String(err) });
    return stripe.accounts.create(gegevens);
  }
}
