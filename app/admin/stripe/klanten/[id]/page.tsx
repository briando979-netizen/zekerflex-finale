import type { ReactNode } from "react";
import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { getKlant, type KlantDetail } from "@/lib/billing/stripe-klant";
import { eventTekst, isStripeId, momentNl } from "@/lib/billing/stripe-events-tekst";
import { dateNl } from "@/lib/admin/format";
import { Empty, Feed, InfoList, Notice, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

const bedrag = (centen: number, valuta: string) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: valuta.toUpperCase() }).format(centen / 100);

const ABO: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Actief", tone: "ok" },
  trialing: { label: "Proefperiode", tone: "plan" },
  past_due: { label: "Achterstallig", tone: "crit" },
  unpaid: { label: "Onbetaald", tone: "crit" },
  canceled: { label: "Opgezegd", tone: "neutral" },
  incomplete: { label: "Niet afgerond", tone: "warn" },
  incomplete_expired: { label: "Verlopen", tone: "neutral" },
  paused: { label: "Gepauzeerd", tone: "neutral" },
};
const FACTUUR: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Concept", tone: "neutral" },
  open: { label: "Open", tone: "warn" },
  paid: { label: "Betaald", tone: "ok" },
  uncollectible: { label: "Oninbaar", tone: "crit" },
  void: { label: "Ongeldig", tone: "neutral" },
};
const OFFERTE: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Concept", tone: "neutral" },
  open: { label: "Open", tone: "warn" },
  accepted: { label: "Geaccepteerd", tone: "ok" },
  canceled: { label: "Geannuleerd", tone: "neutral" },
};
const VERIFICATIE: Record<string, { label: string; tone: Tone }> = {
  verified: { label: "Geverifieerd", tone: "ok" },
  processing: { label: "Wordt verwerkt", tone: "plan" },
  requires_input: { label: "Wacht op de klant", tone: "warn" },
  canceled: { label: "Geannuleerd", tone: "neutral" },
};

function Rij({ children }: { children: ReactNode }) {
  return <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>{children}</li>;
}

function Lijst({ leeg, aantal, children }: { leeg: string; aantal: number; children: ReactNode }) {
  return aantal === 0 ? <Empty title={leeg} /> : <ul>{children}</ul>;
}

function Status({ kaart, waarde }: { kaart: Record<string, { label: string; tone: Tone }>; waarde: string }) {
  const s = kaart[waarde] ?? { label: waarde, tone: "neutral" as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

function Kolom({ k }: { k: KlantDetail }) {
  return (
    <div className="space-y-4">
      <Panel flush title="Abonnementen" subtitle="Terugkerende betalingen van deze klant">
        <Lijst leeg="Geen abonnementen" aantal={k.abonnementen.length}>
          {k.abonnementen.map((a) => (
            <Rij key={a.id}>
              <span className="min-w-0">
                <span className="block truncate font-medium" style={{ color: "var(--a-text)" }}>{a.omschrijving || a.id}</span>
                <span className="block text-xs" style={{ color: "var(--a-mute)" }}>
                  {bedrag(a.bedragCenten, a.valuta)}{a.interval ? ` per ${a.interval === "month" ? "maand" : a.interval === "year" ? "jaar" : a.interval === "week" ? "week" : "dag"}` : ""}, gestart {dateNl(a.gestart)}{a.opzegAanEinde ? ", stopt aan het einde van de periode" : ""}
                </span>
              </span>
              <Status kaart={ABO} waarde={a.status} />
            </Rij>
          ))}
        </Lijst>
      </Panel>

      <Panel flush title="Betalingen">
        <Lijst leeg="Geen betalingen" aantal={k.betalingen.length}>
          {k.betalingen.map((b) => (
            <Rij key={b.id}>
              <span className="min-w-0">
                <span className="num block font-medium" style={{ color: "var(--a-text)" }}>
                  {bedrag(b.bedragCenten, b.valuta)}
                  {b.terugCenten > 0 && <span className="ml-2 text-xs font-normal" style={{ color: "var(--a-mute)" }}>−{bedrag(b.terugCenten, b.valuta)} terug</span>}
                </span>
                <span className="block truncate text-xs" style={{ color: "var(--a-mute)" }}>{b.methode}{b.omschrijving ? `, ${b.omschrijving}` : ""}, {momentNl(b.aangemaakt)}</span>
              </span>
              <Pill tone={b.status === "succeeded" ? "ok" : b.status === "failed" ? "crit" : "warn"}>{b.status === "succeeded" ? "Geslaagd" : b.status === "failed" ? "Mislukt" : "In behandeling"}</Pill>
            </Rij>
          ))}
        </Lijst>
      </Panel>

      <Panel flush title="Betaalmethoden" subtitle="Wat nu aan de klant gekoppeld is">
        <Lijst leeg="Geen betaalmethoden" aantal={k.betaalmethoden.length}>
          {k.betaalmethoden.map((m) => (
            <Rij key={m.id}>
              <span className="font-medium" style={{ color: "var(--a-text)" }}>{m.omschrijving}</span>
              <span className="text-xs" style={{ color: "var(--a-mute)" }}>gekoppeld {dateNl(m.aangemaakt)}</span>
            </Rij>
          ))}
        </Lijst>
      </Panel>

      <Panel flush title="Financiële connecties" subtitle="Toegang tot bankgegevens met toestemming van de klant">
        <Lijst leeg="Geen verslagen" aantal={k.financieleConnecties.length}>
          {k.financieleConnecties.map((c) => (
            <Rij key={c.id}>
              <span className="font-medium" style={{ color: "var(--a-text)" }}>{c.naam}</span>
              <span className="text-xs" style={{ color: "var(--a-mute)" }}>{c.instelling ?? "Bank onbekend"}{c.laatste4 ? ` •••• ${c.laatste4}` : ""}</span>
            </Rij>
          ))}
        </Lijst>
      </Panel>

      <Panel flush title="Rechten" subtitle="Worden bijgewerkt bij een nieuw abonnement of een nieuwe factuurperiode">
        <Lijst leeg="Geen actieve rechten" aantal={k.rechten.length}>
          {k.rechten.map((r) => <Rij key={r.id}><span className="num font-medium" style={{ color: "var(--a-text)" }}>{r.sleutel}</span></Rij>)}
        </Lijst>
      </Panel>

      <Panel flush title="Facturen">
        <Lijst leeg="Geen facturen" aantal={k.facturen.length}>
          {k.facturen.map((f) => (
            <Rij key={f.id}>
              <span className="min-w-0">
                <span className="num block font-medium" style={{ color: "var(--a-text)" }}>{f.nummer ?? f.id} · {bedrag(f.bedragCenten, f.valuta)}</span>
                <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{dateNl(f.aangemaakt)}</span>
              </span>
              <span className="flex items-center gap-2">
                {f.url && <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium hover:underline" style={{ color: "var(--a-accent-ink)" }}>Bekijken ↗</a>}
                <Status kaart={FACTUUR} waarde={f.status} />
              </span>
            </Rij>
          ))}
        </Lijst>
      </Panel>

      <Panel flush title="Offertes">
        <Lijst leeg="Geen offertes" aantal={k.offertes.length}>
          {k.offertes.map((q) => (
            <Rij key={q.id}>
              <span className="num font-medium" style={{ color: "var(--a-text)" }}>{q.nummer ?? q.id} · {bedrag(q.bedragCenten, q.valuta)}</span>
              <Status kaart={OFFERTE} waarde={q.status} />
            </Rij>
          ))}
        </Lijst>
      </Panel>

      <Panel flush title="Kredietverlening" subtitle="Prepaid- en promotietegoed dat op facturen wordt toegepast">
        <Lijst leeg="Geen kredietverlening" aantal={k.tegoeden.length}>
          {k.tegoeden.map((g) => (
            <Rij key={g.id}>
              <span className="font-medium" style={{ color: "var(--a-text)" }}>{g.naam}</span>
              <span className="num text-xs" style={{ color: "var(--a-mute)" }}>{g.bedragCenten !== null && g.valuta ? bedrag(g.bedragCenten, g.valuta) : "—"}</span>
            </Rij>
          ))}
        </Lijst>
      </Panel>

      <Panel flush title="Klantfactuursaldo" subtitle="Het saldo wordt van toekomstige facturen afgetrokken of erbij opgeteld">
        {k.saldoCenten === 0 ? (
          <Empty title="Geen saldo van klantfactuur" />
        ) : (
          <p className="num px-4 py-3 text-sm font-medium sm:px-5" style={{ color: "var(--a-text)" }}>
            {bedrag(Math.abs(k.saldoCenten), k.valuta)} {k.saldoCenten < 0 ? "tegoed voor de klant" : "nog te betalen door de klant"}
          </p>
        )}
      </Panel>

      <Panel flush title="Identiteitsverificaties" subtitle="De identiteitscontroles van het gekoppelde ZekerFlex-account">
        <Lijst leeg="Geen verificaties voor klanten" aantal={k.verificaties.length}>
          {k.verificaties.map((v) => (
            <Rij key={v.id}>
              <span className="min-w-0">
                <span className="num block text-xs" style={{ color: "var(--a-text)" }}>{v.id}</span>
                <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{momentNl(v.aangemaakt)}{v.fout ? `, reden: ${v.fout}` : ""}</span>
              </span>
              <Status kaart={VERIFICATIE} waarde={v.status} />
            </Rij>
          ))}
        </Lijst>
      </Panel>
    </div>
  );
}

// De klantpagina van Stripe, binnen ZekerFlex. Alleen lezen.
export default async function StripeKlantPage(props: { params: Promise<{ id: string }> }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De Stripe-klanten zijn alleen voor platformbeheerders." />;
  }
  if (!env.STRIPE_SECRET_KEY) {
    return <PageHead title="Stripe-klant" subtitle="Er is nog geen Stripe-sleutel ingesteld (STRIPE_SECRET_KEY)." />;
  }
  const { id } = await props.params;
  if (!isStripeId(id, "cus")) {
    return <PageHead title="Klant niet gevonden" subtitle="Dit is geen geldig Stripe-klant-ID." actions={<Link href="/admin/stripe/klanten" className="a-button text-xs">Naar alle klanten</Link>} />;
  }

  let k: KlantDetail | null;
  try {
    k = await getKlant(id);
  } catch (err) {
    return (
      <div className="space-y-4">
        <PageHead title="Stripe-klant" subtitle={id} />
        <Notice tone="crit" role="alert">Stripe is nu niet bereikbaar: {(err as Error).message}</Notice>
      </div>
    );
  }
  if (!k) {
    return <PageHead title="Klant niet gevonden" subtitle={id} actions={<Link href="/admin/stripe/klanten" className="a-button text-xs">Naar alle klanten</Link>} />;
  }

  const metadata = Object.entries(k.metadata);
  const activiteit = k.events
    .slice()
    .sort((a, b) => b.kern.created - a.kern.created)
    .slice(0, 10)
    .map((e) => ({ key: e.kern.id, text: eventTekst(e.kern.type), meta: momentNl(e.kern.created) }));
  const verzoeken = k.events
    .filter((e) => e.kern.requestId)
    .slice()
    .sort((a, b) => b.kern.created - a.kern.created)
    .slice(0, 8);

  return (
    <div className="space-y-4">
      <PageHead
        title={k.naam ?? "Klant zonder naam"}
        subtitle={k.email ?? k.id}
        meta={<Pill tone={k.livemode ? "ok" : "warn"}>{k.livemode ? "Live" : "Testmodus"}</Pill>}
        actions={
          <>
            <Link href="/admin/stripe/klanten" className="a-button text-xs">Alle klanten</Link>
            {k.gebruikerId && <Link href={`/admin/gebruikers/${k.gebruikerId}`} className="a-button text-xs">Gebruiker in ZekerFlex</Link>}
            <a href={k.dashboardUrl} target="_blank" rel="noopener noreferrer" className="a-button text-xs">Openen in Stripe ↗</a>
          </>
        }
      />
      {k.fouten.length > 0 && (
        <Panel>
          <ul className="space-y-1 text-sm" style={{ color: "var(--a-warn)" }}>
            {k.fouten.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Kolom k={k} />
        <aside className="space-y-4">
          <Panel title="Details">
            <InfoList
              rows={[
                { label: "Klant-ID", value: <span className="num">{k.id}</span> },
                { label: "Klant sinds", value: dateNl(k.aangemaakt) },
                { label: "Facturatie-e-mail", value: k.email ?? "—" },
                { label: "Bedrijfsnaam", value: k.bedrijf ?? "—" },
              ]}
            />
          </Panel>
          <Panel title="Metadata">
            {metadata.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--a-mute)" }}>Geen metadata.</p>
            ) : (
              <InfoList rows={metadata.map(([label, value]) => ({ label, value }))} />
            )}
          </Panel>
        </aside>
      </div>

      <Panel title="Recente activiteiten" subtitle="Uit de events van de laatste 30 dagen">
        <Feed items={activiteit} emptyText="Geen activiteit in de laatste 30 dagen." />
      </Panel>

      <Panel flush title="Logs" subtitle="De API-verzoeken achter de laatste events. Stripe geeft zijn eigen verzoeklogboek niet vrij.">
        {verzoeken.length === 0 ? (
          <Empty title="Geen verzoeken gevonden" />
        ) : (
          <ul>
            {verzoeken.map((e) => (
              <Rij key={e.kern.id}>
                <span className="min-w-0 truncate"><span className="num text-xs">{e.kern.requestId}</span> <span className="text-xs" style={{ color: "var(--a-mute)" }}>{eventTekst(e.kern.type)}</span></span>
                <span className="whitespace-nowrap text-xs" style={{ color: "var(--a-mute)" }}>{momentNl(e.kern.created)}</span>
              </Rij>
            ))}
          </ul>
        )}
      </Panel>

      <Panel flush title="Evenementen" subtitle={`${k.events.length} in de laatste 30 dagen`} footer={<Link href="/admin/stripe/werkbank#evenementen" className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>Alle events in de werkbank</Link>}>
        {k.events.length === 0 ? (
          <Empty title="Geen events" />
        ) : (
          <ul>
            {k.events.slice().sort((a, b) => b.kern.created - a.kern.created).slice(0, 15).map((e) => (
              <Rij key={e.kern.id}>
                <Link href={`/admin/stripe/werkbank?evenement=${e.kern.id}#evenementen`} className="min-w-0 truncate hover:underline" style={{ color: "var(--a-text)" }}>{eventTekst(e.kern.type)}</Link>
                <span className="whitespace-nowrap text-xs" style={{ color: "var(--a-mute)" }}>{momentNl(e.kern.created)}</span>
              </Rij>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
