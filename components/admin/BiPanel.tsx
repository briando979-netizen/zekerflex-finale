"use client";

import { useCallback, useEffect, useState } from "react";
import { Empty, InfoList, KpiStrip, Notice, Panel, Pill } from "@/components/admin/kit";
import { dateTimeNl, timeAgoNl } from "@/lib/admin/format";

// De stand van Metabase en de inrichting, met "Nu inrichten" en een voorbeeld
// van het ingebedde dashboard voor het eigen bedrijf van de beheerder.

interface Antwoord {
  ingesteld: boolean;
  gezond: { ok: boolean; versie: string | null };
  publiekeUrl: string;
  beheerderEmail: string;
  stand: { ingerichtOp: string | null; dashboardId: number | null; databaseId: number | null; kaarten: Record<string, number>; inbedsleutel: string | null; rolWachtwoord: string | null; laatsteFout: string | null; laatstePoging: string | null; versie: string | null };
  views: { naam: string; uitleg: string }[];
  kaarten: { sleutel: string; naam: string; uitleg: string; weergave: string }[];
  voorbeeld: { tenantId: string; url: string } | null;
}

export function BiPanel() {
  const [d, setD] = useState<Antwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const now = new Date();

  const laad = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/bi", { cache: "no-store" });
      if (!r.ok) throw new Error("Laden lukte niet.");
      setD((await r.json()) as Antwoord);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Laden lukte niet.");
    }
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  async function inrichten() {
    setBezig(true);
    setMelding(null);
    setFout(null);
    try {
      const r = await fetch("/api/admin/bi", { method: "POST" });
      const x = (await r.json().catch(() => ({}))) as { ok?: boolean; fout?: string | null; error?: { message?: string } };
      if (!r.ok) throw new Error(x.error?.message ?? "Inrichten lukte niet.");
      setMelding(x.ok ? "Metabase is ingericht: schema, dashboard en inbedding staan klaar." : `Inrichten lukte nog niet: ${x.fout ?? "onbekende fout"}`);
      await laad();
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Inrichten lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  if (!d) return fout ? <Notice tone="crit" role="alert">{fout}</Notice> : <p className="text-sm" style={{ color: "var(--a-mute)" }}>Laden…</p>;
  const s = d.stand;
  const klaar = Boolean(s.ingerichtOp && s.dashboardId && s.inbedsleutel && !s.laatsteFout);

  return (
    <div className="space-y-5">
      <KpiStrip
        items={[
          { label: "Metabase", value: !d.ingesteld ? "Niet ingesteld" : d.gezond.ok ? "Draait" : "Reageert niet", tone: d.gezond.ok ? "ok" : d.ingesteld ? "crit" : "neutral", hint: d.gezond.versie ?? "eigen server, Docker" },
          { label: "Inrichting", value: klaar ? "Klaar" : s.laatsteFout ? "Mislukt" : "Nog niet", tone: klaar ? "ok" : s.laatsteFout ? "crit" : "neutral", hint: s.ingerichtOp ? `${timeAgoNl(s.ingerichtOp, now.getTime())}` : "elk uur een poging" },
          { label: "Views in schema bi", value: String(d.views.length), hint: "alleen eigen cijfers per bedrijf" },
          { label: "Kaarten op het dashboard", value: `${Object.keys(s.kaarten).length} / ${d.kaarten.length}`, hint: "Mijn bedrijf" },
        ]}
      />
      {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
      {melding && <Notice tone={klaar ? "ok" : "warn"}>{melding}</Notice>}
      {!d.ingesteld && <Notice tone="warn">METABASE_URL staat niet in .env.production: de Metabase-container draait dan niet. De uitrol zet hem aan zodra docker-compose.vps.yml de dienst bevat (deze versie).</Notice>}
      {s.laatsteFout && <Notice tone="crit" role="alert">Laatste poging ({s.laatstePoging ? dateTimeNl(s.laatstePoging, now) : "–"}): {s.laatsteFout}</Notice>}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel
          title="Inrichting"
          subtitle="Idempotent: opnieuw draaien werkt views, kaarten en dashboard bij"
          actions={
            <button type="button" className="a-btn" disabled={bezig || !d.ingesteld} onClick={() => void inrichten()}>
              {bezig ? "Bezig… (tot een minuut)" : klaar ? "Opnieuw inrichten" : "Nu inrichten"}
            </button>
          }
        >
          <InfoList
            rows={[
              { label: "Metabase", value: d.publiekeUrl ? <a href={d.publiekeUrl} target="_blank" rel="noopener noreferrer" className="underline">{d.publiekeUrl}</a> : "geen publiek adres (METABASE_PUBLIC_URL)" },
              { label: "Beheerder", value: `${d.beheerderEmail} (wachtwoord: METABASE_ADMIN_PASSWORD in .env.production op de server)` },
              { label: "Databaseverbinding", value: s.databaseId ? `#${s.databaseId}, rol zf_bi op schema bi` : "nog niet" },
              { label: "Dashboard", value: s.dashboardId ? `#${s.dashboardId} "Mijn bedrijf", bedrijf vastgezet` : "nog niet" },
              { label: "Inbedsleutel", value: s.inbedsleutel ? "ingesteld (statisch inbedden aan)" : "nog niet" },
              { label: "Laatst ingericht", value: s.ingerichtOp ? dateTimeNl(s.ingerichtOp, now) : "–" },
            ]}
          />
        </Panel>
        <Panel title="Wat een bedrijf ziet" subtitle="De views in het schema bi; nooit persoonsgegevens, nooit een ander bedrijf">
          <ul className="space-y-1.5 text-[0.8125rem]">
            {d.views.map((v) => (
              <li key={v.naam}>
                <span className="font-mono" style={{ color: "var(--a-text)" }}>bi.{v.naam}</span> <span style={{ color: "var(--a-mute)" }}>· {v.uitleg}</span>
              </li>
            ))}
          </ul>
          <ul className="mt-3 space-y-1 text-[0.8125rem]">
            {d.kaarten.map((k) => (
              <li key={k.sleutel} className="flex items-center gap-2">
                <Pill tone={s.kaarten[k.sleutel] ? "ok" : "neutral"} dot={false}>{k.weergave}</Pill>
                <span style={{ color: "var(--a-text)" }}>{k.naam}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Voorbeeld: het dashboard zoals een opdrachtgever het ziet" subtitle={d.voorbeeld ? `Bedrijf ${d.voorbeeld.tenantId}, ingebed met een getekende link van 10 minuten` : "Nog geen dashboard, of je hebt zelf geen bedrijf"}>
        {d.voorbeeld ? (
          <iframe src={d.voorbeeld.url} title="Dashboard Mijn bedrijf (voorbeeld)" className="h-[720px] w-full rounded-lg" style={{ border: "1px solid var(--a-border)" }} allowTransparency />
        ) : (
          <Empty title="Nog geen voorbeeld" body="Richt Metabase in; zodra het dashboard er is, staat hier de ingebedde versie." />
        )}
      </Panel>
    </div>
  );
}
