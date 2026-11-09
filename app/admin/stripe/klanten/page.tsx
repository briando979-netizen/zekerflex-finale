import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { zoekKlanten, type KlantRij } from "@/lib/billing/stripe-klant";
import { dateTimeNl } from "@/lib/admin/format";
import { Empty, Notice, PageHead, Panel } from "@/components/admin/kit";
import { DataTable, type TableRow } from "@/components/admin/kit-client";

export const dynamic = "force-dynamic";

// Klanten in Stripe, met zoeken op e-mailadres of naam. Elke klant opent de klantpagina.
export default async function StripeKlantenPage(props: { searchParams: Promise<{ q?: string }> }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De Stripe-klanten zijn alleen voor platformbeheerders." />;
  }
  if (!env.STRIPE_SECRET_KEY) {
    return <PageHead title="Stripe-klanten" subtitle="Er is nog geen Stripe-sleutel ingesteld (STRIPE_SECRET_KEY)." />;
  }
  const { q = "" } = await props.searchParams;
  const zoek = q.slice(0, 100);

  let klanten: KlantRij[] = [];
  let fout: string | null = null;
  try {
    klanten = await zoekKlanten(zoek);
  } catch (err) {
    fout = (err as Error).message;
  }

  const rijen: TableRow[] = klanten.map((k) => ({
    id: k.id,
    href: `/admin/stripe/klanten/${k.id}`,
    search: `${k.naam ?? ""} ${k.email ?? ""} ${k.id}`,
    cells: {
      naam: <span className="font-medium" style={{ color: "var(--a-text)" }}>{k.naam ?? "Zonder naam"}</span>,
      email: <span className="block max-w-[18rem] truncate">{k.email ?? "—"}</span>,
      doel: k.doel ?? "—",
      sinds: <span className="whitespace-nowrap">{dateTimeNl(k.aangemaakt)}</span>,
      id: <span className="num text-xs">{k.id}</span>,
    },
    sort: { naam: k.naam ?? "", email: k.email ?? "", doel: k.doel ?? "", sinds: new Date(k.aangemaakt).getTime() },
    csv: { naam: k.naam ?? "", email: k.email ?? "", doel: k.doel ?? "", sinds: k.aangemaakt, id: k.id },
  }));

  return (
    <div className="space-y-4">
      <PageHead
        title="Stripe-klanten"
        subtitle="Alle klanten in Stripe. Open een klant voor betalingen, betaalmethoden, controles en wat er gebeurde."
        actions={<Link href="/admin/stripe/werkbank" className="a-button text-xs">Werkbank</Link>}
      />
      <form method="get" className="flex flex-wrap items-center gap-2" role="search">
        <label htmlFor="stripe-klant-zoek" className="sr-only">Zoek een klant op e-mailadres of naam</label>
        <input id="stripe-klant-zoek" name="q" defaultValue={zoek} className="a-input w-full max-w-sm" placeholder="E-mailadres of naam" />
        <button type="submit" className="a-button a-button-primary text-xs">Zoeken</button>
        {zoek && <Link href="/admin/stripe/klanten" className="a-button text-xs">Alles tonen</Link>}
      </form>
      {fout && <Notice tone="crit" role="alert">Stripe is nu niet bereikbaar: {fout}</Notice>}
      <Panel flush title={zoek ? `Klanten voor “${zoek}”` : "Nieuwste klanten"} subtitle={`${klanten.length} getoond`}>
        {klanten.length === 0 && !fout ? (
          <Empty title="Geen klanten gevonden" body="Probeer het volledige e-mailadres, of laat de zoekbalk leeg voor de nieuwste klanten." />
        ) : (
          <DataTable
            columns={[
              { key: "naam", label: "Naam" },
              { key: "email", label: "E-mailadres" },
              { key: "doel", label: "Doel", hideOnMobile: true },
              { key: "sinds", label: "Klant sinds", hideOnMobile: true },
              { key: "id", label: "Klant-ID", hideOnMobile: true, sortable: false },
            ]}
            rows={rijen}
            searchPlaceholder="Filter in deze lijst"
            csvName="stripe-klanten"
            defaultSort={{ key: "sinds", dir: "desc" }}
          />
        )}
      </Panel>
    </div>
  );
}
