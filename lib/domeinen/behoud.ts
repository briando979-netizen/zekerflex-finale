import { resolve4 } from "node:dns/promises";
import type { DomeinBestelling } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { CONTACTS } from "@/lib/seo";
import { kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { alertOwnerLater } from "@/lib/ops/alert";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { domainInfo, listTlds, setTransferLock, transipConfigured } from "@/lib/mail/hosting/transip";
import { EXTENSIES, euroPrijs, extensie, metBtw } from "@/lib/domeinen/extensies";
import { datumNl, isTestAdres } from "@/lib/domeinen/verlengen-core";
import { domeinenOpWebsite } from "@/lib/domeinen/koppelen";
import { VERHUIS_REDEN_LABEL, blijfAanbod, codeMagNu, margeTeKort, slotMagOpen, wijstNaarOns, type Aanbod, type Verhuis, type VerhuisReden } from "@/lib/domeinen/behoud-core";

// ---------------------------------------------------------------------------
// Domeinnamen: klanten behouden en verhuizen via ZekerFlex (regels in behoud-core.ts).
//   KV domein-verhuis:<bestelling>  → Verhuis & { bestellingId }   de verhuisweg van de klant
//   KV domein-korting:<bestelling>  → { prijsCent, voorVerloop }    blijfaanbod voor één verlenging
// Dagelijks (lib/domeinen/verlengen.ts): verhuiscodes sturen als de wachttijd om
// is, en alle namen bewaken: staat hij nog in ons account, is het verhuisslot
// dicht, loopt er een actie bij het register, wijst hij nog naar onze server,
// en is de inkoop niet boven onze prijs gestegen. Alles wat op vertrek wijst,
// gaat meteen als melding (push + mail) naar de eigenaar.
// ---------------------------------------------------------------------------

const verhuisKey = (id: string) => `domein-verhuis:${id}`;
const kortingKey = (id: string) => `domein-korting:${id}`;

type VerhuisRec = Verhuis & { bestellingId: string };

const tldVan = (domein: string) => domein.slice(domein.lastIndexOf(".") + 1);
const dag = (d: Date) => d.toISOString().slice(0, 10);

function aanbodVoor(domein: string): Aanbod | null {
  const ext = extensie(tldVan(domein));
  return ext ? blijfAanbod(ext.verlengCent, ext.inkoopVerlengCent) : null;
}

/** Het aanbod in bedragen incl. btw, voor de klant. */
export function aanbodIncl(a: Aanbod | null): { normaal: string; aanbod: string } | null {
  return a ? { normaal: euroPrijs(metBtw(a.normaalCent).inclCent), aanbod: euroPrijs(metBtw(a.aanbodCent).inclCent) } : null;
}

async function mail(b: Pick<DomeinBestelling, "email" | "domein">, onderwerp: string, tekst: string): Promise<void> {
  await sendMail({ to: b.email, kind: "domein-behoud", replyTo: CONTACTS.sales, subject: onderwerp, text: `${tekst}\n\nVragen? Antwoord gewoon op deze mail.\n\nHet ZekerFlex-team` }).catch((e) =>
    logger.warn("domein: mail mislukt", { domein: b.domein, error: (e as Error).message }),
  );
}

async function bedrijfsnaam(tenantId: string): Promise<string> {
  return (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }))?.name ?? "Een klant";
}

/** Melding (push + mail) aan de eigenaar; nooit voor een testbestelling. */
function meld(b: Pick<DomeinBestelling, "email">, key: string, title: string, detail: string): void {
  if (isTestAdres(b.email)) return;
  alertOwnerLater({ key, title, detail, severity: "warning", url: "/admin/domeinen" });
}

/** De korting voor de komende verlenging (prijs excl. btw), als de klant het blijfaanbod nam. */
export async function kortingVoor(b: Pick<DomeinBestelling, "id" | "verlooptOp">): Promise<number | null> {
  if (!b.verlooptOp) return null;
  const k = await kvGet<{ prijsCent: number; voorVerloop: string }>(kortingKey(b.id));
  return k && k.voorVerloop === dag(b.verlooptOp) ? k.prijsCent : null;
}

async function eigen(tenantId: string, id: string): Promise<DomeinBestelling> {
  const b = await prisma.domeinBestelling.findFirst({ where: { id, tenantId } });
  if (!b) throw AppError.notFound("Deze domeinnaam is niet van jouw bedrijf.");
  if (b.status !== "GEREGISTREERD") throw AppError.conflict(`${b.domein} is niet (meer) actief bij ZekerFlex.`);
  return b;
}

/** De klant zet verlengen uit: meteen een melding om hem te houden, en het aanbod terug. */
export async function verlengenUitGezet(b: DomeinBestelling): Promise<{ normaal: string; aanbod: string } | null> {
  const a = aanbodVoor(b.domein);
  const wie = await bedrijfsnaam(b.tenantId);
  meld(
    b,
    `domein-stopt:${b.id}`,
    `${wie} wil ${b.domein} niet verlengen`,
    `${wie} (${b.email}) zette "Automatisch verlengen" uit voor ${b.domein}${b.verlooptOp ? ` (loopt tot ${datumNl(b.verlooptOp)})` : ""}. ${a ? `Het blijfaanbod staat klaar: volgend jaar ${aanbodIncl(a)?.aanbod} i.p.v. ${aanbodIncl(a)?.normaal} incl. btw.` : ""} Neem contact op om de klant te houden.`,
  );
  return aanbodIncl(a);
}

/** Stap 1: de klant wil verhuizen en kiest een reden. De eigenaar weet het meteen; de klant ziet het blijfaanbod. */
export async function vraagVerhuis(tenantId: string, id: string, reden: VerhuisReden): Promise<{ normaal: string; aanbod: string } | null> {
  const b = await eigen(tenantId, id);
  const rec: VerhuisRec = { bestellingId: b.id, stap: "aanbod", reden, op: new Date().toISOString() };
  await kvSet(verhuisKey(b.id), rec);
  const a = aanbodVoor(b.domein);
  const wie = await bedrijfsnaam(b.tenantId);
  meld(
    b,
    `domein-verhuis:${b.id}`,
    `${wie} wil ${b.domein} verhuizen`,
    `${wie} (${b.email}) wil ${b.domein} bij ZekerFlex weghalen. Reden: ${VERHUIS_REDEN_LABEL[reden]}. ${a ? `De klant ziet nu het blijfaanbod: volgend jaar ${aanbodIncl(a)?.aanbod} i.p.v. ${aanbodIncl(a)?.normaal} incl. btw.` : ""} Bel of mail vandaag nog: kiest de klant toch voor verhuizen, dan krijgt hij de code pas na een dag.`,
  );
  await recordAudit({ category: "BILLING", action: "domein.verhuis-gevraagd", actorLabel: "user", summary: `${b.domein}: verhuizen gevraagd (${reden})`, targetType: "domein-bestelling", targetId: b.id }).catch(() => undefined);
  return aanbodIncl(a);
}

/** De klant neemt het blijfaanbod (of blijft gewoon): korting op de volgende verlenging, verlengen weer aan. */
export async function blijf(tenantId: string, id: string): Promise<void> {
  const b = await eigen(tenantId, id);
  const a = aanbodVoor(b.domein);
  if (a && b.verlooptOp) await kvSet(kortingKey(b.id), { prijsCent: a.aanbodCent, voorVerloop: dag(b.verlooptOp), reden: "blijfaanbod", op: new Date().toISOString() });
  await prisma.domeinBestelling.update({ where: { id: b.id }, data: { autoVerlengen: true } });
  // een open verlengfactuur zonder lopende incasso vervalt; de dagelijkse ronde maakt hem opnieuw, met de korting
  if (a) await prisma.invoice.updateMany({ where: { domeinBestellingId: b.id, type: "DOMEIN", status: "ISSUED", stripePaymentIntentId: null }, data: { status: "CANCELLED" } });
  const v = await kvGet<VerhuisRec>(verhuisKey(b.id));
  if (v) await kvSet(verhuisKey(b.id), { ...v, stap: "gebleven" } satisfies VerhuisRec);
  const bedragen = aanbodIncl(a);
  await mail(
    b,
    `Fijn dat je blijft: ${b.domein}`,
    bedragen && b.verlooptOp
      ? `Fijn dat je bij ZekerFlex blijft! De verlenging van ${b.domein} op ${datumNl(b.verlooptOp)} kost je ${bedragen.aanbod} in plaats van ${bedragen.normaal} (incl. btw). Je hoeft niets te doen.`
      : `Fijn dat je bij ZekerFlex blijft! ${b.domein} wordt gewoon verlengd; je hoeft niets te doen.`,
  );
  meld(b, `domein-gebleven:${b.id}`, `${b.domein} blijft bij ZekerFlex`, `De klant (${b.email}) nam het blijfaanbod voor ${b.domein}.`);
  await recordAudit({ category: "BILLING", action: "domein.gebleven", actorLabel: "user", summary: `${b.domein}: blijft (blijfaanbod)`, targetType: "domein-bestelling", targetId: b.id }).catch(() => undefined);
}

/** De klant wil toch verhuizen: de code komt na de wachttijd; de eigenaar krijgt een laatste seintje. */
export async function bevestigVerhuis(tenantId: string, id: string): Promise<void> {
  const b = await eigen(tenantId, id);
  const v = await kvGet<VerhuisRec>(verhuisKey(b.id));
  const rec: VerhuisRec = { bestellingId: b.id, stap: "code-wacht", reden: v?.reden ?? "anders", op: v?.op ?? new Date().toISOString(), bevestigdOp: new Date().toISOString() };
  await kvSet(verhuisKey(b.id), rec);
  await mail(b, `Je verhuiscode voor ${b.domein}`, `We hebben je verzoek ontvangen. Binnen een dag mailen we je de verhuiscode van ${b.domein}; die geef je aan je nieuwe partij. Tot de verhuizing blijft alles gewoon werken.\n\nBedacht? Antwoord op deze mail, dan houden we alles zoals het is.`);
  meld(b, `domein-verhuis-zeker:${b.id}`, `Laatste kans: ${b.domein} gaat verhuizen`, `De klant (${b.email}) wees het blijfaanbod af en wil ${b.domein} verhuizen. Over ongeveer een dag mailen we de verhuiscode. Bel nu als je hem wilt houden.`);
  await recordAudit({ category: "BILLING", action: "domein.verhuis-bevestigd", actorLabel: "user", summary: `${b.domein}: verhuiscode gevraagd`, targetType: "domein-bestelling", targetId: b.id }).catch(() => undefined);
}

export interface BehoudStand {
  stap: Verhuis["stap"] | null;
  aanbod: { normaal: string; aanbod: string } | null;
}

/** Voor "Jouw domeinnamen": waar de klant in de verhuisweg zit, en het blijfaanbod. */
export async function behoudStanden(rijen: Pick<DomeinBestelling, "id" | "domein">[]): Promise<Map<string, BehoudStand>> {
  const m = new Map<string, BehoudStand>();
  for (const b of rijen) {
    const v = await kvGet<VerhuisRec>(verhuisKey(b.id));
    m.set(b.id, { stap: v?.stap ?? null, aanbod: aanbodIncl(aanbodVoor(b.domein)) });
  }
  return m;
}

// ---- dagelijks ---------------------------------------------------------------------

/** Verhuiscodes sturen waarvan de wachttijd om is. */
export async function stuurVerhuiscodes(nu = new Date(), opties: { alleenTest?: boolean } = {}): Promise<number> {
  const open = (await kvListValues<VerhuisRec>("domein-verhuis:", 1000)).filter((v) => codeMagNu(v, nu));
  let n = 0;
  for (const v of open) {
    const b = await prisma.domeinBestelling.findUnique({ where: { id: v.bestellingId } });
    if (!b || b.status !== "GEREGISTREERD") continue;
    const test = isTestAdres(b.email);
    if (opties.alleenTest && !test) continue;
    let code: string | null = null;
    if (test) code = `TEST-${b.id.slice(-6).toUpperCase()}`;
    else if (transipConfigured()) {
      const info = await domainInfo(b.domein).catch(() => null);
      code = info?.authCode?.trim() || null;
      if (code) await setTransferLock(b.domein, false).catch((e) => logger.warn("domein: verhuisslot openen lukte niet", { domein: b.domein, error: (e as Error).message }));
    }
    if (!code) {
      meld(b, `domein-code:${b.id}`, `Verhuiscode van ${b.domein} nodig`, `De klant (${b.email}) wacht op de verhuiscode van ${b.domein}, maar die kwam niet uit TransIP. Vraag hem op in TransIP en mail hem de klant.`);
      continue;
    }
    await mail(b, `Verhuiscode voor ${b.domein}`, `Hier is de verhuiscode van ${b.domein}:\n\n${code}\n\nGeef deze code aan je nieuwe partij; zij regelen de verhuizing. Tot die klaar is, blijft alles bij ZekerFlex gewoon werken.\n\nToch blijven? Antwoord op deze mail; dan zetten we de verhuizing stop.`);
    await kvSet(verhuisKey(b.id), { ...v, stap: "code-verstuurd", codeOp: nu.toISOString() } satisfies VerhuisRec);
    meld(b, `domein-code-weg:${b.id}`, `Verhuiscode van ${b.domein} verstuurd`, `De klant (${b.email}) heeft de verhuiscode van ${b.domein}. Het verhuisslot staat open.`);
    await recordAudit({ category: "BILLING", action: "domein.verhuiscode", actorLabel: "system:domein-behoud", summary: `${b.domein}: verhuiscode verstuurd`, targetType: "domein-bestelling", targetId: b.id }).catch(() => undefined);
    n += 1;
  }
  return n;
}

export interface Bewaking {
  gecontroleerd: number;
  vertrokken: number;
  slotDicht: number;
  dnsAlarm: number;
  margeAlarm: number;
}

/** Alle vastgelegde namen bij het register en in DNS nakijken; alles wat op vertrek wijst meteen melden. */
export async function bewaakDomeinen(nu = new Date()): Promise<Bewaking> {
  const r: Bewaking = { gecontroleerd: 0, vertrokken: 0, slotDicht: 0, dnsAlarm: 0, margeAlarm: 0 };
  if (!transipConfigured()) return r;
  const vandaag = amsterdamDayKey(nu);
  const rijen = (await prisma.domeinBestelling.findMany({ where: { status: "GEREGISTREERD" }, take: 500 })).filter((b) => !isTestAdres(b.email));
  const perBedrijf = new Map<string, string[]>();
  for (const b of rijen) {
    r.gecontroleerd += 1;
    const v = await kvGet<VerhuisRec>(verhuisKey(b.id));
    try {
      const info = await domainInfo(b.domein);
      if (!info) throw AppError.notFound("niet gevonden");
      if (info.isTransferLocked === false && info.supportsLocking !== false && !slotMagOpen(v)) {
        await setTransferLock(b.domein, true);
        r.slotDicht += 1;
        meld(b, `domein-slot:${b.id}`, `Verhuisslot van ${b.domein} stond open`, `Het verhuisslot van ${b.domein} stond open zonder dat de klant een verhuiscode kreeg. We hebben het weer dichtgezet. Kijk of iemand probeert de naam weg te halen.`);
      }
      if (info.hasActionRunning && !slotMagOpen(v)) {
        meld(b, `domein-actie:${b.id}:${vandaag}`, `Er loopt iets bij het register voor ${b.domein}`, `Bij het register loopt een actie voor ${b.domein} die ZekerFlex niet startte (mogelijk een verhuizing). Neem contact op met de klant (${b.email}).`);
      }
    } catch (err) {
      if (err instanceof AppError && err.status === 404) {
        // niet meer in ons account: verhuisd
        r.vertrokken += 1;
        await prisma.domeinBestelling.updateMany({ where: { id: b.id, status: "GEREGISTREERD" }, data: { status: "OPGEZEGD", opgezegdOp: nu, notitie: `${b.notitie} Niet meer in het TransIP-account: verhuisd (${vandaag}).`.trim() } });
        await kvSet(verhuisKey(b.id), { bestellingId: b.id, stap: "vertrokken", reden: v?.reden ?? "anders", op: v?.op ?? nu.toISOString() } satisfies VerhuisRec);
        meld(b, `domein-weg:${b.id}`, `${b.domein} is verhuisd`, `${b.domein} staat niet meer in het ZekerFlex-account bij TransIP: de klant (${b.email}) is met de naam vertrokken. Bel om te horen waarom; een websiteabonnement kan blijven.`);
        await mail(b, `${b.domein} is verhuisd`, `${b.domein} staat niet meer bij ZekerFlex. Klopt dat niet, of wil je terugkomen? Antwoord op deze mail; verhuizen naar ZekerFlex kost je niets extra.`);
        continue;
      }
      logger.warn("domein: bewaken lukte niet", { domein: b.domein, error: (err as Error).message });
    }
    const op = perBedrijf.get(b.tenantId) ?? (await domeinenOpWebsite(b.tenantId).catch(() => [] as string[]));
    perBedrijf.set(b.tenantId, op);
    if (op.includes(b.domein) && env.SITES_IPV4) {
      const adressen = await resolve4(b.domein).catch(() => [] as string[]);
      if (wijstNaarOns(adressen, env.SITES_IPV4) === false) {
        r.dnsAlarm += 1;
        meld(b, `domein-dns:${b.id}:${vandaag}`, `${b.domein} wijst niet meer naar ZekerFlex`, `${b.domein} staat op de website van de klant, maar wijst naar ${adressen.join(", ")} in plaats van naar onze server. Mogelijk stapt de klant over. Neem contact op (${b.email}).`);
      }
    }
  }
  // marge: inkoop bij TransIP boven onze verkoopprijs? (één keer per dag)
  const tlds = await listTlds().catch(() => []);
  const te = EXTENSIES.filter((e) => {
    const t = tlds.find((x) => x.name.replace(/^\./, "") === e.tld);
    return t ? margeTeKort(e, t) : false;
  });
  if (te.length > 0) {
    r.margeAlarm = te.length;
    alertOwnerLater({
      key: `domein-marge:${vandaag}`,
      title: "Domeinnamen: inkoop boven onze prijs",
      detail: `TransIP rekent nu meer dan wij voor: ${te.map((e) => `.${e.tld}`).join(", ")}. Laat Claude de prijzen bijwerken (lib/domeinen/extensies.ts), anders kost elke bestelling of verlenging geld.`,
      severity: "warning",
      url: "/admin/domeinen",
    });
  }
  return r;
}
