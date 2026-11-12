"use client";

import { useCallback, useEffect, useState } from "react";
import { Empty, Notice, Panel, Pill } from "@/components/admin/kit";
import { ERNST_TEKST, ERNST_TONE, jaarKeuzes } from "@/lib/boekhouding/btw/scherm-kern";
import type { MeldingErnst } from "@/lib/boekhouding/btw/labels";
import { EXPORT_KNOPPEN, EXPORT_UITLEG, XAF_WAARSCHUWING, exportUrl } from "@/lib/boekhouding/export/scherm-kern";
import { API_BOEKHOUDING, boekApi } from "@/lib/boekhouding/scherm-api";
import { dagTekst } from "@/lib/boekhouding/scherm-kern";

interface AdminKeuze {
  id: string;
  naam: string;
  soort: "ECHT" | "TEST";
}

interface ControleAntwoord {
  periode: { jaar: number; van: string; tot: string };
  administratie: { naam: string; soort: "ECHT" | "TEST"; valuta: string };
  meldingen: { code: string; ernst: MeldingErnst; tekst: string }[];
  inBalans: boolean;
  boekingAantal: number;
}

export function ExportTab() {
  const [administraties, setAdministraties] = useState<AdminKeuze[]>([]);
  const [adminId, setAdminId] = useState("");
  const [jaren] = useState(() => jaarKeuzes(new Date()));
  const [jaar, setJaar] = useState(() => jaren[0] ?? new Date().getFullYear());
  const [data, setData] = useState<ControleAntwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const a = await boekApi<{ administraties: AdminKeuze[] }>("/administraties");
        setAdministraties(a.administraties);
        setAdminId((huidig) => huidig || (a.administraties[0]?.id ?? ""));
      } catch (e) {
        setFout(e instanceof Error ? e.message : "Laden mislukt.");
      }
    })();
  }, []);

  const laad = useCallback(async () => {
    if (!adminId) return;
    try {
      const q = new URLSearchParams({ administratieId: adminId, jaar: String(jaar), formaat: "controle" });
      setData(await boekApi<ControleAntwoord>(`/export?${q.toString()}`));
      setFout(null);
    } catch (e) {
      setData(null);
      setFout(e instanceof Error ? e.message : "Laden mislukt.");
    }
  }, [adminId, jaar]);
  useEffect(() => {
    void laad();
  }, [laad]);

  const gekozen = administraties.find((a) => a.id === adminId);
  const blokkades = data ? data.meldingen.filter((m) => m.ernst === "blokkeert").length : 0;

  return (
    <div className="space-y-5">
      {fout && <Notice tone="crit" role="alert">{fout}</Notice>}

      <Panel title="Voor de accountant" subtitle={EXPORT_UITLEG}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="a-label" htmlFor="export-admin">
            Administratie
            <select id="export-admin" className="a-input" value={adminId} onChange={(e) => setAdminId(e.target.value)}>
              {administraties.length === 0 && <option value="">Nog geen administratie</option>}
              {administraties.map((a) => (
                <option key={a.id} value={a.id}>{a.soort === "TEST" ? `${a.naam} (test)` : a.naam}</option>
              ))}
            </select>
          </label>
          <label className="a-label" htmlFor="export-jaar">
            Boekjaar
            <select id="export-jaar" className="a-input" value={jaar} onChange={(e) => setJaar(Number(e.target.value))}>
              {jaren.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </label>
        </div>
        {gekozen?.soort === "TEST" && (
          <div className="mt-3">
            <Notice tone="warn">Dit is een testadministratie: niets hier is echt.</Notice>
          </div>
        )}
        {data && (
          <p className="mt-3 text-sm">
            Periode: {dagTekst(data.periode.van)} t/m {dagTekst(data.periode.tot)}, in {data.administratie.valuta}. {data.boekingAantal === 0 ? "Er staan geen boekingen in." : `${data.boekingAantal.toLocaleString("nl-NL")} boekingen.`}
          </p>
        )}
      </Panel>

      <Panel title="Wat je nog moet doen voor je dit doorgeeft" subtitle="De controle van dit boekjaar.">
        {data === null ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>{adminId ? "Bezig met controleren…" : "Kies eerst een administratie."}</p>
        ) : data.meldingen.length === 0 ? (
          <Empty title="Niets te doen" body="De controle vond geen afwijkingen." />
        ) : (
          <ul className="space-y-3">
            {data.meldingen.map((m) => (
              <li key={m.code} className="text-sm">
                <Pill tone={ERNST_TONE[m.ernst]}>{ERNST_TEKST[m.ernst]}</Pill> <span>{m.tekst}</span>
              </li>
            ))}
          </ul>
        )}
        {blokkades > 0 && (
          <div className="mt-3">
            <Notice tone="warn">Er {blokkades === 1 ? "staat nog 1 punt" : `staan nog ${blokkades} punten`} met &quot;Eerst oplossen&quot;. Je kunt wel downloaden, maar geef het bestand nog niet door.</Notice>
          </div>
        )}
      </Panel>

      <Panel title="Downloaden" subtitle="Alles is alleen-lezen: hiermee verandert er niets in de boekhouding.">
        <div className="mb-3">
          <Notice tone="warn">{XAF_WAARSCHUWING}</Notice>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {EXPORT_KNOPPEN.map((k) => (
            <li key={k.formaat} className="text-sm">
              {adminId ? (
                <a
                  className="a-btn"
                  href={exportUrl(API_BOEKHOUDING, k.formaat, adminId, jaar)}
                  {...(k.formaat.endsWith("-html") ? { target: "_blank", rel: "noopener" } : {})}
                >
                  {k.titel}
                </a>
              ) : (
                <span className="a-btn" aria-disabled="true">{k.titel}</span>
              )}
              <span className="mt-1 block text-xs" style={{ color: "var(--a-mute)" }}>{k.uitleg}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>
          Dit is een hulpmiddel voor je accountant en geen jaarrekening. In de bestanden staan geen namen van klanten of leveranciers; de bonnen zelf gaan niet mee, alleen hun nummers.
        </p>
      </Panel>
    </div>
  );
}
