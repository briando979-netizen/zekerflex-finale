import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { getWerkbank, type Werkbank } from "@/lib/billing/stripe-werkbank";
import { eventTekst, isProbleem, isStripeId, momentNl, nietAfgeleverd, perDag, perType, perVersie } from "@/lib/billing/stripe-events-tekst";
import { BarList, Empty, InfoList, KpiStrip, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { Chart, DataTable, Tabs, type TableRow } from "@/components/admin/kit-client";
import { AutoRefresh } from "@/components/admin/AutoRefresh";

export const dynamic = "force-dynamic";

const WEBHOOK_STATUS: Record<string, { label: string; tone: "ok" | "neutral" }> = {
  enabled: { label: "Actief", tone: "ok" },
  disabled: { label: "Uitgeschakeld", tone: "neutral" },
};

const JSON_MAX = 12_000;

function json(waarde: unknown): string {
  const tekst = JSON.stringify(waarde, null, 2) ?? "";
  return tekst.length > JSON_MAX ? `${tekst.slice(0, JSON_MAX)}\n… (ingekort)` : tekst;
}

// Het Stripe-werkbank binnen ZekerFlex: overzicht, webhooks, evenementen, logs en gezondheid.
export default async function StripeWerkbankPage(props: { searchParams: Promise<{ evenement?: string }> }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Het Stripe-werkbank is alleen voor platformbeheerders." />;
  }
  if (!env.STRIPE_SECRET_KEY) {
    return <PageHead title="Stripe-werkbank" subtitle="Er is nog geen Stripe-sleutel ingesteld (STRIPE_SECRET_KEY)." />;
  }
  const { evenement = "" } = await props.searchParams;

  let w: Werkbank;
  try {
    w = await getWerkbank();
  } catch (err) {
    return (
      <div className="space-y-4">
        <PageHead title="Stripe-werkbank" subtitle="Rechtstreeks uit je Stripe-account." />
        <Notice tone="crit" role="alert">Stripe is nu niet bereikbaar: {(err as Error).message}</Notice>
      </div>
    );
  }

  const nu = Date.now();
  const events = w.events.slice().sort((a, b) => b.kern.created - a.kern.created);
  const kernen = events.map((e) => e.kern);
  const problemen = events.filter((e) => isProbleem(e.kern.type));
  const nietAf = events.filter((e) => nietAfgeleverd(e.kern, nu));
  const dagen = perDag(kernen, 7, nu);
  const dagenProbleem = perDag(kernen, 7, nu, (e) => isProbleem(e.type));
  const dagenGoed = dagen.waarden.map((n, i) => n - (dagenProbleem.waarden[i] ?? 0));
  const typen = perType(kernen);
  const versies = perVersie(kernen);
  const actief = w.webhooks.filter((h) => h.status === "enabled").length;
  const uitgeschakeld = w.webhooks.filter((h) => h.status !== "enabled");

  const gekozen = isStripeId(evenement, "evt") ? events.find((e) => e.kern.id === evenement) : undefined;
  const geselecteerd = gekozen ?? events[0];

  const sleutelNaam = `${w.livemode ? "sk_live" : "sk_test"}_…${w.sleutelEinde ?? "????"}`;

  const logRijen: TableRow[] = events
    .filter((e) => e.kern.requestId)
    .map((e) => ({
      id: e.kern.id,
      search: `${e.kern.requestId} ${e.kern.type} ${eventTekst(e.kern.type)} ${e.kern.objectId ?? ""}`,
      filters: { soort: isProbleem(e.kern.type) ? "probleem" : "gewoon" },
      cells: {
        moment: <span className="whitespace-nowrap">{momentNl(e.kern.created)}</span>,
        verzoek: <span className="num text-xs">{e.kern.requestId}</span>,
        wat: eventTekst(e.kern.type),
        object: <span className="num block max-w-[14rem] truncate text-xs">{e.kern.objectId ?? "—"}</span>,
        sleutel: <span className="num block max-w-[12rem] truncate text-xs">{e.kern.idempotencyKey ?? "—"}</span>,
        soort: <Pill tone={isProbleem(e.kern.type) ? "crit" : "ok"}>{isProbleem(e.kern.type) ? "Probleem" : "Gelukt"}</Pill>,
      },
      sort: { moment: e.kern.created, verzoek: e.kern.requestId ?? "", wat: eventTekst(e.kern.type), soort: isProbleem(e.kern.type) ? 1 : 0 },
      csv: { moment: new Date(e.kern.created * 1000).toISOString(), verzoek: e.kern.requestId, wat: e.kern.type, object: e.kern.objectId, sleutel: e.kern.idempotencyKey },
    }));

  const overzicht = (
    <>
      <KpiStrip
        items={[
          { label: "Events (7 dagen)", value: String(events.length), hint: "alles wat Stripe meldde", tone: "plan" },
          { label: "Problemen", value: String(problemen.length), hint: "mislukte betalingen en geschillen", tone: problemen.length > 0 ? "warn" : "ok" },
          { label: "Niet afgeleverd", value: String(nietAf.length), hint: "wacht al langer dan een uur op een webhook", tone: nietAf.length > 0 ? "crit" : "ok" },
          { label: "Webhooks actief", value: `${actief} van ${w.webhooks.length}`, hint: "bestemmingen van Stripe naar ZekerFlex" },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Events per dag" subtitle="Laatste 7 dagen, Amsterdamse tijd">
          <Chart
            title="Aantal Stripe-events per dag, gelukt en problemen"
            labels={dagen.labels}
            kind="bars"
            series={[
              { label: "Gelukt", values: dagenGoed, slot: 1 },
              { label: "Probleem", values: dagenProbleem.waarden, slot: 5 },
            ]}
            height={200}
          />
        </Panel>
        <Panel title="Soorten events" subtitle="Wat er de laatste 7 dagen het vaakst gebeurde">
          <BarList rows={typen.slice(0, 8).map((t) => ({ key: t.type, label: eventTekst(t.type), value: t.aantal }))} emptyText="Nog geen events." />
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="API-versies" subtitle="Volgens de events van de laatste 7 dagen">
          <BarList rows={versies.map((v) => ({ key: v.versie, label: v.versie, value: v.aantal }))} emptyText="Nog geen events." />
        </Panel>
        <Panel title="Jouw integratie">
          <InfoList
            rows={[
              { label: "Modus", value: w.livemode ? "Live" : "Testmodus" },
              { label: "Geheime sleutel", value: <span className="num">{sleutelNaam}</span> },
              { label: "Webhook-bestemmingen", value: String(w.webhooks.length) },
              { label: "Bijgewerkt", value: momentNl(w.opgehaald) },
            ]}
          />
        </Panel>
      </div>
    </>
  );

  const webhooks = (
    <Panel flush title="Bestemmingen voor events" subtitle="Stripe stuurt events naar deze webhook-adressen">
      {w.webhooks.length === 0 ? (
        <Empty title="Nog geen webhook-bestemmingen" body="Zonder bestemming krijgt ZekerFlex geen bericht van Stripe over betalingen." />
      ) : (
        <ul>
          {w.webhooks.map((h) => {
            const s = WEBHOOK_STATUS[h.status] ?? { label: h.status, tone: "neutral" as const };
            return (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                <span className="min-w-0">
                  <span className="block truncate font-medium" style={{ color: "var(--a-text)" }}>{h.url}</span>
                  <span className="block text-xs" style={{ color: "var(--a-mute)" }}>luistert naar {h.luistertNaar}, API-versie {h.apiVersion ?? "van het account"}</span>
                </span>
                <Pill tone={s.tone}>{s.label}</Pill>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );

  const evenementen = (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Panel flush title="Evenementen" subtitle={`${events.length} in de laatste 7 dagen`}>
        {events.length === 0 ? (
          <Empty title="Geen events" />
        ) : (
          <ul className="max-h-[32rem] overflow-y-auto">
            {events.slice(0, 100).map((e) => {
              const aan = e.kern.id === geselecteerd?.kern.id;
              return (
                <li key={e.kern.id} style={{ borderTop: "1px solid var(--a-border)", background: aan ? "var(--a-elev)" : undefined }}>
                  <Link href={`/admin/stripe/werkbank?evenement=${e.kern.id}#evenementen`} className="block px-4 py-2.5 text-[0.8125rem]" aria-current={aan ? "true" : undefined}>
                    <span className="num block text-xs font-medium" style={{ color: "var(--a-accent-ink)" }}>{e.kern.type}</span>
                    <span className="block" style={{ color: "var(--a-text)" }}>{eventTekst(e.kern.type)}</span>
                    <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{momentNl(e.kern.created)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel title={geselecteerd ? eventTekst(geselecteerd.kern.type) : "Evenement"} subtitle={geselecteerd?.kern.type}>
        {geselecteerd ? (
          <div className="space-y-4">
            <InfoList
              rows={[
                { label: "Event-ID", value: <span className="num">{geselecteerd.kern.id}</span> },
                { label: "Moment", value: momentNl(geselecteerd.kern.created) },
                { label: "Object", value: <span className="num">{geselecteerd.kern.objectId ?? "—"}</span> },
                { label: "Klant", value: geselecteerd.kern.customerId ? <Link href={`/admin/stripe/klanten/${geselecteerd.kern.customerId}`} className="num hover:underline" style={{ color: "var(--a-accent-ink)" }}>{geselecteerd.kern.customerId}</Link> : "—" },
                { label: "Verzoek", value: <span className="num">{geselecteerd.kern.requestId ?? "automatisch"}</span> },
                { label: "API-versie", value: geselecteerd.kern.apiVersion ?? "—" },
                { label: "Webhooks", value: geselecteerd.kern.pendingWebhooks === 0 ? "Alles afgeleverd" : `${geselecteerd.kern.pendingWebhooks} wachten nog` },
              ]}
            />
            <div>
              <h3 className="mb-1.5 text-xs font-semibold" style={{ color: "var(--a-dim)" }}>Gebeurtenisgegevens</h3>
              <pre className="max-h-96 overflow-auto rounded-lg p-3 text-xs" style={{ background: "var(--a-elev)", color: "var(--a-text)" }} tabIndex={0}>{json(geselecteerd.data)}</pre>
            </div>
          </div>
        ) : (
          <Empty title="Kies een event" body="Kies links een event om de gegevens te zien." />
        )}
      </Panel>
    </div>
  );

  const logs = (
    <Panel flush title="API-verzoeken" subtitle="De verzoeken achter de events van de laatste 7 dagen. Stripe geeft zijn eigen verzoeklogboek niet via de API vrij, dus verzoeken zonder event ontbreken.">
      {logRijen.length === 0 ? (
        <Empty title="Geen verzoeken gevonden" />
      ) : (
        <DataTable
          columns={[
            { key: "moment", label: "Moment" },
            { key: "verzoek", label: "Verzoek-ID" },
            { key: "wat", label: "Gevolg" },
            { key: "object", label: "Object", hideOnMobile: true, sortable: false },
            { key: "sleutel", label: "Idempotentiesleutel", hideOnMobile: true, sortable: false },
            { key: "soort", label: "Uitkomst" },
          ]}
          rows={logRijen}
          searchPlaceholder="Zoek op verzoek, event of object"
          csvName="stripe-api-verzoeken"
          defaultSort={{ key: "moment", dir: "desc" }}
          filters={[{ key: "soort", label: "Uitkomst", chips: true, options: [{ value: "gewoon", label: "Gelukt" }, { value: "probleem", label: "Probleem" }] }]}
        />
      )}
    </Panel>
  );

  const gezondheid = (
    <>
      <KpiStrip
        items={[
          { label: "Waarschuwingen", value: String(nietAf.length + uitgeschakeld.length), hint: "vragen aandacht", tone: nietAf.length + uitgeschakeld.length > 0 ? "warn" : "ok" },
          { label: "Fouten", value: String(problemen.length), hint: "laatste 7 dagen", tone: problemen.length > 0 ? "warn" : "ok" },
        ]}
      />
      <Panel flush title="Waarschuwingen" subtitle="Kritieke betalings- en integratieproblemen">
        {nietAf.length + uitgeschakeld.length === 0 ? (
          <Empty title="Geen meldingen" body="Alle webhooks staan aan en elk event is afgeleverd." />
        ) : (
          <ul>
            {uitgeschakeld.map((h) => (
              <li key={h.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                <Pill tone="warn">Webhook uit</Pill> <span className="ml-2" style={{ color: "var(--a-text)" }}>{h.url}</span>
              </li>
            ))}
            {nietAf.slice(0, 20).map((e) => (
              <li key={e.kern.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                <span><Pill tone="crit">Niet afgeleverd</Pill> <span className="ml-2" style={{ color: "var(--a-text)" }}>{eventTekst(e.kern.type)}</span></span>
                <Link href={`/admin/stripe/werkbank?evenement=${e.kern.id}#evenementen`} className="text-xs hover:underline" style={{ color: "var(--a-accent-ink)" }}>{momentNl(e.kern.created)}</Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel flush title="Fouten" subtitle="Mislukte betalingen, afschrijvingen en geschillen volgens de events">
        {problemen.length === 0 ? (
          <Empty title="Geen fouten" body="De laatste 7 dagen mislukte er niets." />
        ) : (
          <ul>
            {problemen.slice(0, 30).map((e) => (
              <li key={e.kern.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                <span className="min-w-0">
                  <span className="block" style={{ color: "var(--a-text)" }}>{eventTekst(e.kern.type)}</span>
                  <span className="num block truncate text-xs" style={{ color: "var(--a-mute)" }}>{e.kern.type}{e.kern.objectId ? `, ${e.kern.objectId}` : ""}</span>
                </span>
                <Link href={`/admin/stripe/werkbank?evenement=${e.kern.id}#evenementen`} className="text-xs hover:underline" style={{ color: "var(--a-accent-ink)" }}>{momentNl(e.kern.created)}</Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Inzichten" subtitle="Aanbevelingen van Stripe zelf zijn niet via de API te lezen.">
        <p className="text-xs" style={{ color: "var(--a-mute)" }}>Hier staat wat ZekerFlex zelf kan zien: webhooks die uit staan en events die niet aankomen.</p>
      </Panel>
    </>
  );

  return (
    <div className="space-y-4">
      <PageHead
        title="Stripe-werkbank"
        subtitle="Events, webhooks, verzoeken en gezondheid van je Stripe-integratie, rechtstreeks uit Stripe."
        meta={<Pill tone={w.livemode ? "ok" : "warn"}>{w.livemode ? "Live" : "Testmodus"}</Pill>}
        actions={
          <>
            <Link href="/admin/stripe/klanten" className="a-button text-xs">Klanten</Link>
            <AutoRefresh fetchedAt={w.opgehaald} />
          </>
        }
      />
      {w.fouten.length > 0 && (
        <Panel>
          <ul className="space-y-1 text-sm" style={{ color: "var(--a-warn)" }}>
            {w.fouten.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </Panel>
      )}
      <Tabs
        label="Onderdelen van het Stripe-werkbank"
        tabs={[
          { id: "overzicht", label: "Overzicht", content: overzicht },
          { id: "webhooks", label: "Webhooks", content: webhooks },
          { id: "evenementen", label: "Evenementen", content: evenementen },
          { id: "logs", label: "Logs", content: logs },
          { id: "gezondheid", label: "Gezondheid", badge: nietAf.length + uitgeschakeld.length + problemen.length || null, content: gezondheid },
        ]}
      />
    </div>
  );
}
