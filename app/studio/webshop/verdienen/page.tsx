import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { siteTenantOf } from "@/lib/sites/access";
import { partnerBestellingen, partnerCodeVoor, partnerKlikken, partnerRekening } from "@/lib/shop/partner";
import { PARTNER_PCT, PARTNER_STATUS_LABEL, PARTNER_UITBETALEN_VANAF_CENTS, PARTNER_VAST_NA_DAGEN, partnerTotalen, type PartnerStatus } from "@/lib/shop/partner-core";
import { Card, PageHead, Pill, Stat } from "@/components/studio/ui";
import { PartnerLinks } from "@/components/studio/PartnerLinks";
import { PartnerRekening } from "@/components/studio/PartnerRekening";

export const dynamic = "force-dynamic";

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const datum = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", year: "numeric" });
const TONE: Record<PartnerStatus, "ok" | "info" | "warn" | "neutral" | "crit"> = { wacht: "neutral", verdiend: "info", vast: "ok", uitbetaald: "neutral", vervallen: "crit" };

// Studio → Verdienen: het partnerprogramma van de ZekerFlex-webshop. Een bedrijf
// deelt links naar de shop of naar producten; bestelt iemand via zo'n link, dan
// verdient het bedrijf een vergoeding. ZekerFlex levert. Regels: lib/shop/partner-core.ts.
export default async function StudioVerdienenPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=/studio/webshop/verdienen");
  let tenantId: string;
  try {
    tenantId = await siteTenantOf(principal);
  } catch {
    redirect("/studio");
  }
  const [code, klikken, rijen, rekening, producten] = await Promise.all([
    partnerCodeVoor(tenantId),
    partnerKlikken(tenantId, 30),
    partnerBestellingen(tenantId),
    partnerRekening(tenantId),
    prisma.shopProduct.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { slug: true, name: true, priceCents: true, imageUrl: true, category: true },
      take: 300,
    }),
  ]);
  const totaal = partnerTotalen(rijen);
  const base = env.APP_BASE_URL.replace(/\/+$/, "");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHead
        title="Verdienen met ZekerFlex"
        sub={`Deel producten uit de ZekerFlex-webshop. Bestelt iemand via jouw link, dan krijg jij ${PARTNER_PCT}% van het bedrag zonder btw. ZekerFlex levert en regelt de service.`}
      />

      <Card>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Klikken (30 dagen)" value={klikken} />
          <Stat label="Bestellingen" value={totaal.bestellingen} hint={totaal.omzetCents > 0 ? `${euro(totaal.omzetCents)} aan producten` : undefined} />
          <Stat label="Verdiend, in bedenktijd" value={euro(totaal.verdiendCents)} />
          <Stat label="Uit te betalen" value={euro(totaal.vastCents)} hint={`vanaf ${euro(PARTNER_UITBETALEN_VANAF_CENTS)}`} />
          <Stat label="Uitbetaald" value={euro(totaal.uitbetaaldCents)} />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <PartnerLinks base={base} code={code} pct={PARTNER_PCT} producten={producten} />

        <div className="grid content-start gap-4">
        <Card title="Zo werkt het">
          <ol className="space-y-3 text-sm text-[#303030]">
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#1a1a1a] text-xs font-bold text-white">1</span>
              <span>Kopieer je link of de link van een product en zet hem op je website, in een nieuwsbrief of op sociale media.</span>
            </li>
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#1a1a1a] text-xs font-bold text-white">2</span>
              <span>Iemand bestelt via jouw link in de ZekerFlex-webshop. Wij leveren en regelen retour en service.</span>
            </li>
            <li className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#1a1a1a] text-xs font-bold text-white">3</span>
              <span>
                Na {PARTNER_VAST_NA_DAGEN} dagen (bedenktijd en bezorging) staat je vergoeding vast. We betalen maandelijks uit, vanaf {euro(PARTNER_UITBETALEN_VANAF_CENTS)}.
              </span>
            </li>
          </ol>
          <p className="mt-4 border-t border-[#ebebeb] pt-3 text-xs leading-relaxed text-[#616161]">
            De vergoeding geldt voor bestellingen in hetzelfde bezoek als de klik, zonder cookies. Bestellingen door jezelf of je collega&apos;s tellen niet mee. Wordt een bestelling geannuleerd of teruggestuurd, dan vervalt de vergoeding.
          </p>
        </Card>
        <PartnerRekening huidig={rekening ? { iban: rekening.iban, tenaamstelling: rekening.tenaamstelling } : null} />
        </div>
      </div>

      <Card title="Bestellingen via jouw links" className="mt-4" pad={false}>
        {rijen.length === 0 ? (
          <p className="px-5 pb-5 pt-3 text-sm text-[#616161]">Nog geen bestellingen via je links. Zodra iemand via jouw link bestelt, zie je dat hier meteen.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[#ebebeb] text-left text-xs font-semibold text-[#616161]">
                  <th scope="col" className="px-5 py-2.5">Datum</th>
                  <th scope="col" className="px-3 py-2.5">Bestelling</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Producten</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Bedrag</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Jouw vergoeding</th>
                  <th scope="col" className="px-5 py-2.5">Stand</th>
                </tr>
              </thead>
              <tbody>
                {rijen.map((r) => (
                  <tr key={r.orderId} className="border-b border-[#f1f1f1] last:border-0">
                    <td className="whitespace-nowrap px-5 py-3 text-[#303030]">{datum(r.at)}</td>
                    <td className="px-3 py-3 font-mono text-xs text-[#616161]">#{r.orderId.slice(-8).toUpperCase()}</td>
                    <td className="px-3 py-3 text-right text-[#303030]">{r.regels}</td>
                    <td className="px-3 py-3 text-right text-[#303030]">{euro(r.productenCents)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-[#1a1a1a]">{r.status === "vervallen" ? <s className="text-[#707070]">{euro(r.vergoedingCents)}</s> : euro(r.vergoedingCents)}</td>
                    <td className="px-5 py-3">
                      <Pill tone={TONE[r.status]}>{PARTNER_STATUS_LABEL[r.status]}</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
