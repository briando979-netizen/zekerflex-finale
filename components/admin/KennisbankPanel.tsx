"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Empty, InfoList, KpiStrip, Notice, Panel } from "@/components/admin/kit";
import { dateTimeNl } from "@/lib/admin/format";

interface Antwoord {
  ingesteld: boolean;
  gezond: boolean;
  url: string;
  interneUrl: string | null;
  oidc: { id: string; naam: string; redirectUris: string[] }[];
  stand: { apiGezet: boolean; laatstGevuld: string | null; verzamelingen: { naam: string; documenten: number }[]; laatsteFout: string | null };
  opSchijf: { verzameling: string; documenten: string[] }[];
}

export function KennisbankPanel() {
  const [d, setD] = useState<Antwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [sleutel, setSleutel] = useState("");
  const [bezig, setBezig] = useState(false);
  const now = new Date();

  const laad = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/kennisbank", { cache: "no-store" });
      if (!r.ok) throw new Error("Laden lukte niet.");
      setD((await r.json()) as Antwoord);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Laden lukte niet.");
    }
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  async function post(body: Record<string, unknown>, okTekst: string) {
    setBezig(true);
    setFout(null);
    setOk(null);
    try {
      const r = await fetch("/api/admin/kennisbank", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const x = (await r.json().catch(() => ({}))) as { ok?: boolean; stand?: Antwoord["stand"]; error?: { message?: string } };
      if (!r.ok) throw new Error(x.error?.message ?? "Dat lukte niet.");
      if (x.ok === false) throw new Error(x.stand?.laatsteFout ?? "Dat lukte niet.");
      setOk(okTekst);
      setSleutel("");
      await laad();
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Dat lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  function bewaar(e: FormEvent) {
    e.preventDefault();
    void post({ actie: "api-sleutel", sleutel }, "De API-sleutel is bewaard.");
  }

  if (!d) return fout ? <Notice tone="crit" role="alert">{fout}</Notice> : <p className="text-sm" style={{ color: "var(--a-mute)" }}>Laden…</p>;
  const totaal = d.opSchijf.reduce((s, v) => s + v.documenten.length, 0);

  return (
    <div className="space-y-5">
      <KpiStrip
        items={[
          { label: "Outline", value: !d.ingesteld ? "Niet ingesteld" : d.gezond ? "Draait" : "Reageert niet", tone: d.gezond ? "ok" : d.ingesteld ? "crit" : "neutral", hint: "eigen server, Docker" },
          { label: "Inloggen met ZekerFlex", value: d.oidc.length ? "Gekoppeld" : "Uit", tone: d.oidc.length ? "ok" : "neutral", hint: "OpenID Connect" },
          { label: "Handleidingen op schijf", value: String(totaal), hint: `${d.opSchijf.length} verzamelingen (docs/kennisbank)` },
          { label: "In de kennisbank", value: d.stand.laatstGevuld ? String(d.stand.verzamelingen.reduce((s, v) => s + v.documenten, 0)) : "–", tone: d.stand.laatstGevuld ? "ok" : "neutral", hint: d.stand.laatstGevuld ? `gevuld ${dateTimeNl(d.stand.laatstGevuld, now)}` : "nog niet gevuld" },
        ]}
      />
      {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
      {ok && <Notice tone="ok">{ok}</Notice>}
      {!d.ingesteld && <Notice tone="warn">OUTLINE_URL, OUTLINE_PUBLIC_URL of OIDC_OUTLINE_SECRET ontbreekt in .env.production. De uitrol maakt het geheim zelf aan; de adressen staan in docker-compose.vps.yml.</Notice>}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Openen en inloggen" subtitle="Iedereen met een ZekerFlex-account (bevestigd e-mailadres) kan erin; wie als eerste inlogt wordt beheerder van de kennisbank">
          <InfoList
            rows={[
              { label: "Adres", value: d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="underline">{d.url}</a> : "—" },
              { label: "Inlogknop in Outline", value: d.oidc.length ? `"${d.oidc[0]?.naam}" via ZekerFlex (OIDC)` : "nog niet gekoppeld" },
              { label: "Terugkeerlink", value: d.oidc[0]?.redirectUris.join(", ") ?? "—" },
              { label: "Discovery", value: <a href="/.well-known/openid-configuration" target="_blank" rel="noopener noreferrer" className="underline">/.well-known/openid-configuration</a> },
            ]}
          />
          <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>Mooiere naam (kennis.zekerflex.com)? Zet een A-record naar de VPS en OUTLINE_HOST in .env.production; zie Te doen.</p>
        </Panel>
        <Panel title="Vullen met de handleidingen" subtitle="Uit docs/kennisbank in de code; bestaande titels worden bijgewerkt, eigen pagina's blijven staan">
          {d.stand.apiGezet ? (
            <p className="text-sm" style={{ color: "var(--a-text)" }}>API-sleutel staat ingesteld.</p>
          ) : (
            <form onSubmit={bewaar} className="space-y-2">
              <p className="text-sm" style={{ color: "var(--a-mute)" }}>Log één keer in op de kennisbank, ga naar Instellingen → API-sleutels, maak een sleutel en plak hem hier.</p>
              <label className="block text-xs font-semibold" htmlFor="ol-api">API-sleutel van Outline</label>
              <input id="ol-api" className="a-input w-full" value={sleutel} onChange={(e) => setSleutel(e.target.value)} placeholder="ol_api_…" autoComplete="off" />
              <button type="submit" className="a-btn" disabled={bezig || sleutel.length < 10}>Bewaren</button>
            </form>
          )}
          <button type="button" className="a-btn mt-3" disabled={bezig || !d.stand.apiGezet || !d.gezond} onClick={() => void post({ actie: "vullen" }, "De kennisbank is gevuld met de handleidingen.")}>
            {bezig ? "Bezig…" : d.stand.laatstGevuld ? "Opnieuw vullen / bijwerken" : "Kennisbank vullen"}
          </button>
          {d.stand.laatsteFout && <p role="alert" className="mt-2 text-xs" style={{ color: "var(--a-crit)" }}>{d.stand.laatsteFout}</p>}
          <ul className="mt-4 space-y-2 text-[0.8125rem]">
            {d.opSchijf.map((v) => (
              <li key={v.verzameling}>
                <span className="font-semibold" style={{ color: "var(--a-text)" }}>{v.verzameling}</span>
                <span style={{ color: "var(--a-mute)" }}> · {v.documenten.join(" · ")}</span>
              </li>
            ))}
            {d.opSchijf.length === 0 && <li><Empty title="Geen handleidingen gevonden in docs/kennisbank" /></li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
