import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth";
import { siteTenantOf } from "@/lib/sites/access";
import { partnerRekening } from "@/lib/shop/partner";
import { verkoperBestellingen, verkoperProductDto, verkoperProducten, verkoperStand } from "@/lib/shop/verkoper";
import {
  VERKOOP_COMMISSIE_PCT,
  VERKOPER_UITBETALEN_VANAF_CENTS,
  VERKOPER_VAST_NA_DAGEN,
  VERKOPER_VERZENDT_BINNEN_WERKDAGEN,
  verkoopTotalen,
} from "@/lib/shop/verkoper-core";
import { Card, PageHead, Stat, btn } from "@/components/studio/ui";
import { PartnerRekening } from "@/components/studio/PartnerRekening";
import { VerkoperAkkoord } from "@/components/studio/VerkoperAkkoord";
import { VerkoperProducten } from "@/components/studio/VerkoperProducten";
import { VerkoperVerkopen } from "@/components/studio/VerkoperVerkopen";

export const dynamic = "force-dynamic";

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;

// Studio → Verkopen: eigen producten verkopen in de ZekerFlex-shop, zoals op een
// grote marktplaats. Alleen voor geverifieerde bedrijven, na akkoord op de
// voorwaarden; elk product gaat eerst langs de beheerder. Regels: lib/shop/verkoper-core.ts.
export default async function StudioVerkopenPage() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login?callbackUrl=/studio/verkopen");
  let tenantId: string;
  try {
    tenantId = await siteTenantOf(principal);
  } catch {
    redirect("/studio");
  }
  const [stand, producten, verkopen, rekening] = await Promise.all([
    verkoperStand(tenantId),
    verkoperProducten(tenantId),
    verkoperBestellingen(tenantId),
    partnerRekening(tenantId),
  ]);
  const totaal = verkoopTotalen(verkopen);
  const inShop = producten.filter((p) => p.sellerStatus === "goedgekeurd").length;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHead
        title="Verkopen op ZekerFlex"
        sub={`Zet je eigen producten in de ZekerFlex-shop. Klanten betalen veilig via ZekerFlex, jij verstuurt. Je betaalt ${VERKOOP_COMMISSIE_PCT}% commissie per verkoop, geen abonnement.`}
      />

      {!stand.geverifieerd ? (
        <Card title="Eerst je bedrijf verifiëren">
          <p className="text-sm leading-relaxed text-[#303030]">
            {stand.inControle
              ? "Je KVK-nummer klopt. We controleren nog of je bij dit bedrijf hoort; dat doen we zo snel mogelijk. Daarna kun je hier meteen producten aanbieden."
              : "Alleen bedrijven met een gecontroleerd KVK-nummer verkopen in de ZekerFlex-shop. Zo weten kopers bij wie ze kopen."}
          </p>
          {!stand.inControle && (
            <Link href="/werkgever" className={`${btn.primary} mt-4`}>
              Bedrijf verifiëren
            </Link>
          )}
        </Card>
      ) : !stand.akkoord ? (
        <VerkoperAkkoord />
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="In de shop" value={inShop} hint={`${producten.length} product${producten.length === 1 ? "" : "en"} totaal`} />
              <Stat label="Nu versturen" value={totaal.teVersturen} hint={`binnen ${VERKOPER_VERZENDT_BINNEN_WERKDAGEN} werkdagen`} />
              <Stat label="Nog niet vast" value={euro(totaal.lopendCents)} hint="in bedenktijd" />
              <Stat label="Uit te betalen" value={euro(totaal.vastCents)} hint={`vanaf ${euro(VERKOPER_UITBETALEN_VANAF_CENTS)}`} />
              <Stat label="Uitbetaald" value={euro(totaal.uitbetaaldCents)} />
            </div>
          </Card>

          <VerkoperVerkopen verkopen={verkopen} />

          <VerkoperProducten producten={producten.map(verkoperProductDto)} />

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card title="Zo werkt verkopen">
              <ol className="space-y-3 text-sm text-[#303030]">
                <li className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#1a1a1a] text-xs font-bold text-white">1</span>
                  <span>Voeg een product toe met foto, prijs en voorraad. We bekijken het binnen een werkdag; daarna staat het in de shop met &quot;Verkoop door&quot; en jouw bedrijfsnaam.</span>
                </li>
                <li className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#1a1a1a] text-xs font-bold text-white">2</span>
                  <span>Bestelt iemand, dan krijg je na de betaling een mail met het adres. Verstuur binnen {VERKOPER_VERZENDT_BINNEN_WERKDAGEN} werkdagen en vul hier de track-en-trace in; de koper krijgt hem meteen.</span>
                </li>
                <li className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#1a1a1a] text-xs font-bold text-white">3</span>
                  <span>
                    {VERKOPER_VAST_NA_DAGEN} dagen na de bestelling (bedenktijd en bezorging) staat je verkoop vast. We betalen maandelijks uit, min {VERKOOP_COMMISSIE_PCT}% commissie, vanaf {euro(VERKOPER_UITBETALEN_VANAF_CENTS)}.
                  </span>
                </li>
              </ol>
              <p className="mt-4 border-t border-[#ebebeb] pt-3 text-xs leading-relaxed text-[#616161]">
                Prijs en voorraad pas je meteen aan. Verander je de naam, tekst, categorie of foto, dan bekijken we het product opnieuw. Bestaat een bestelling alleen uit jouw producten, dan krijg je ook de verzendkosten die de koper betaalde.
              </p>
            </Card>
            <PartnerRekening huidig={rekening ? { iban: rekening.iban, tenaamstelling: rekening.tenaamstelling } : null} />
          </div>
        </>
      )}
    </div>
  );
}
