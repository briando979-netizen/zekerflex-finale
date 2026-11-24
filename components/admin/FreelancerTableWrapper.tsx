"use client";

import { useMemo, useState } from "react";
import { DataTable, type TableColumn, type TableFilter, type TableRow } from "@/components/admin/kit-client";
import { AButton } from "@/components/admin/ui";
import { FreelancerLocationFilter, type GekozenPlek } from "./FreelancerLocationFilter";
import { STANDAARD_STRAAL_KM, binnenStraal, type StraalKm } from "@/lib/admin/locatie-straal";

interface FreelancerTableWrapperProps {
  columns: TableColumn[];
  rows: TableRow[];
  filters: TableFilter[];
  searchPlaceholder: string;
  csvName: string;
  defaultSort: { key: string; dir: "asc" | "desc" };
  emptyText: string;
  /** Thuisbasis van de flexwerkers, per gebruikers-id. Zonder punt hier valt een rij buiten elke straal. */
  locaties: Record<string, { lat: number; lon: number }>;
}

// De gebruikerstabel met het locatiefilter erboven: alleen flexwerkers binnen
// de gekozen straal, en een "+" per flexwerker om hem aan een selectie toe te voegen.
export function FreelancerTableWrapper({
  columns,
  rows,
  filters,
  searchPlaceholder,
  csvName,
  defaultSort,
  emptyText,
  locaties,
}: FreelancerTableWrapperProps) {
  const [punt, setPunt] = useState<GekozenPlek | null>(null);
  const [straalKm, setStraalKm] = useState<StraalKm>(STANDAARD_STRAAL_KM);
  const [geselecteerd, setGeselecteerd] = useState<string[]>([]);

  const binnen = useMemo(() => {
    if (!punt) return null;
    return new Set(rows.filter((r) => binnenStraal(punt, straalKm, locaties[r.id])).map((r) => r.id));
  }, [punt, straalKm, rows, locaties]);

  const zichtbaar = useMemo(() => {
    const basis = binnen ? rows.filter((r) => binnen.has(r.id)) : rows;
    const gekozen = new Set(geselecteerd);
    return basis.map((r) => {
      if (r.filters?.["kind"] !== "flexwerker") return r;
      const isGekozen = gekozen.has(r.id);
      const sortNaam = r.sort?.["name"];
      const naam = typeof sortNaam === "string" ? sortNaam : "deze flexwerker";
      return {
        ...r,
        cells: {
          ...r.cells,
          selectie: (
            <button
              type="button"
              onClick={() => setGeselecteerd((cur) => (cur.includes(r.id) ? cur.filter((x) => x !== r.id) : [...cur, r.id]))}
              aria-pressed={isGekozen}
              aria-label={isGekozen ? `${naam} uit de selectie halen` : `${naam} toevoegen aan de selectie`}
              className="whitespace-nowrap rounded-md border border-[var(--a-border)] px-2 py-0.5 text-xs font-semibold"
              style={isGekozen ? { background: "var(--a-ok-soft)", color: "var(--a-ok-ink)" } : { color: "var(--a-text)" }}
            >
              {isGekozen ? "Gekozen" : "+"}
            </button>
          ),
        },
      };
    });
  }, [rows, binnen, geselecteerd]);

  const kolommen = useMemo<TableColumn[]>(
    () => [...columns, { key: "selectie", label: "Selectie", sortable: false }],
    [columns]
  );

  const toolbar = (
    <div className="w-full space-y-2.5">
      <FreelancerLocationFilter
        punt={punt}
        straalKm={straalKm}
        treffers={binnen?.size ?? 0}
        onPunt={setPunt}
        onStraal={setStraalKm}
      />
      {geselecteerd.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
          <span>
            Selectie: <span className="num font-semibold" style={{ color: "var(--a-text)" }}>{geselecteerd.length}</span>{" "}
            {geselecteerd.length === 1 ? "flexwerker" : "flexwerkers"}
          </span>
          <AButton variant="ghost" onClick={() => setGeselecteerd([])}>
            Wis selectie
          </AButton>
        </div>
      )}
    </div>
  );

  return (
    <DataTable
      columns={kolommen}
      rows={zichtbaar}
      searchPlaceholder={searchPlaceholder}
      csvName={csvName}
      defaultSort={defaultSort}
      filters={filters}
      emptyText={punt ? `Geen flexwerkers binnen ${straalKm} km van ${punt.label}.` : emptyText}
      toolbar={toolbar}
    />
  );
}
