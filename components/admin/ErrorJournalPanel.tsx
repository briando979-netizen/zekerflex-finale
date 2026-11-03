"use client";

import { useCallback, useEffect, useState } from "react";
import type { ErrorGroup } from "@/lib/ops/error-journal";
import { count, dateTimeNl, timeAgoNl } from "@/lib/admin/format";
import { Empty, Notice, Panel, Pill } from "@/components/admin/kit";
import { DataTable, type TableColumn, type TableRow } from "@/components/admin/kit-client";

// Admin → Systeem → Foutmeldingen: wat er op de site misging, ook van vóór de
// laatste update (lib/ops/error-journal.ts), zonder persoonsgegevens.

const DAY = 86_400_000;

const COLUMNS: TableColumn[] = [
  { key: "melding", label: "Melding", sortable: false },
  { key: "soort", label: "Soort", sortable: false },
  { key: "aantal", label: "Aantal", align: "right" },
  { key: "laatst", label: "Laatst" },
  { key: "eerst", label: "Eerst", hideOnMobile: true },
  { key: "actie", label: "", sortable: false },
];

export function ErrorJournalPanel() {
  const [groups, setGroups] = useState<ErrorGroup[] | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "crit"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/foutmeldingen", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return setNote({ tone: "crit", text: "Kon de foutmeldingen niet laden." });
    setGroups(((await r.json()) as { groups: ErrorGroup[] }).groups);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function clear(body: { ids: string[] } | { alles: true }, done: string) {
    setBusy(true);
    const r = await fetch("/api/admin/foutmeldingen", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    setConfirmAll(false);
    if (!r?.ok) return setNote({ tone: "crit", text: "Wissen lukte niet." });
    setNote({ tone: "ok", text: done });
    await load();
  }

  const now = Date.now();
  const recent = (groups ?? []).filter((g) => now - Date.parse(g.lastAt) < DAY);
  const recentErrors = recent.filter((g) => g.level === "error").length;
  const rows: TableRow[] = (groups ?? []).map((g) => ({
    id: g.id,
    cells: {
      melding: (
        <div className="min-w-[16rem] max-w-2xl">
          <p className="break-words font-medium" style={{ color: "var(--a-text)" }}>{g.message}</p>
          {g.reason && <p className="break-words font-mono text-xs">{g.reason}</p>}
          {g.route && <p className="break-all font-mono text-xs" style={{ color: "var(--a-mute)" }}>{g.route}</p>}
          {g.samples.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs" style={{ color: "var(--a-mute)" }}>{g.samples.length === 1 ? "Laatste voorbeeld" : `Laatste ${g.samples.length} voorbeelden`}</summary>
              <ul className="mt-1 space-y-1">
                {[...g.samples].reverse().map((s) => (
                  <li key={s.at + s.detail.slice(0, 20)} className="break-all font-mono text-[11px]">
                    {dateTimeNl(s.at)} · {s.detail || "geen extra gegevens"}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ),
      soort: <Pill tone={g.level === "error" ? "crit" : "warn"}>{g.level === "error" ? "Fout" : "Waarschuwing"}</Pill>,
      aantal: count(g.count),
      laatst: <span className="whitespace-nowrap" title={dateTimeNl(g.lastAt)}>{timeAgoNl(g.lastAt, now)}</span>,
      eerst: <span className="whitespace-nowrap">{dateTimeNl(g.firstAt)}</span>,
      actie: (
        <button type="button" className="a-button text-xs" disabled={busy} onClick={() => void clear({ ids: [g.id] }, "Gemarkeerd als opgelost. Gebeurt het opnieuw, dan staat het er weer.")}>
          Opgelost
        </button>
      ),
    },
    sort: { aantal: g.count, laatst: g.lastAt, eerst: g.firstAt },
    search: [g.message, g.reason ?? "", g.route ?? ""].join(" "),
    filters: { soort: g.level },
    csv: { melding: [g.message, g.reason, g.route].filter(Boolean).join(" | "), soort: g.level === "error" ? "Fout" : "Waarschuwing", aantal: g.count, laatst: g.lastAt, eerst: g.firstAt },
  }));

  return (
    <div className="space-y-4">
      <Notice>
        Technische meldingen van de site, bewaard ook na een update. E-mailadressen, telefoonnummers, IBAN&apos;s en sleutels worden eruit gehaald voordat iets wordt opgeslagen. Komt iets vaak terug, vraag Claude ernaar en noem de melding.
      </Notice>
      {note && (
        <Notice tone={note.tone} role={note.tone === "crit" ? "alert" : "status"}>
          {note.text}
        </Notice>
      )}
      <Panel
        flush
        title="Foutmeldingen"
        subtitle={groups ? `${recentErrors} ${recentErrors === 1 ? "soort fout" : "soorten fouten"} en ${recent.length - recentErrors} ${recent.length - recentErrors === 1 ? "soort waarschuwing" : "soorten waarschuwingen"} in de laatste 24 uur` : "Laden…"}
        actions={
          groups && groups.length > 0 ? (
            confirmAll ? (
              <span className="flex gap-1.5">
                <button type="button" className="a-button a-button-primary text-xs" disabled={busy} onClick={() => void clear({ alles: true }, "Alle meldingen zijn gewist.")}>
                  Ja, wis alles
                </button>
                <button type="button" className="a-button text-xs" onClick={() => setConfirmAll(false)}>
                  Annuleren
                </button>
              </span>
            ) : (
              <button type="button" className="a-button text-xs" onClick={() => setConfirmAll(true)}>
                Alles wissen
              </button>
            )
          ) : null
        }
      >
        {groups === null ? (
          <p className="px-5 py-6 text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>Laden…</p>
        ) : groups.length === 0 ? (
          <Empty title="Geen foutmeldingen" body="Gaat er iets mis op de site, dan komt het hier vanzelf te staan, met hoe vaak en wanneer." />
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={rows}
            filters={[{ key: "soort", label: "Soort", chips: true, options: [{ value: "error", label: "Fouten" }, { value: "warn", label: "Waarschuwingen" }] }]}
            searchPlaceholder="Zoek in meldingen"
            csvName="foutmeldingen"
            defaultSort={{ key: "laatst", dir: "desc" }}
          />
        )}
      </Panel>
    </div>
  );
}
