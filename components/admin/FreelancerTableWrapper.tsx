"use client";

import { useState, useMemo } from "react";
import { DataTable, type TableRow } from "@/components/admin/kit-client";
import { FreelancerLocationFilter } from "./FreelancerLocationFilter";

interface FreelancerTableWrapperProps {
  columns: Array<{ key: string; label: string; hideOnMobile?: boolean }>;
  rows: TableRow[];
  filters: Array<{ key: string; label: string; chips?: boolean; options: Array<{ value: string; label: string }> }>;
  searchPlaceholder: string;
  csvName: string;
  defaultSort: { key: string; dir: "asc" | "desc" };
  emptyText: string;
}

export function FreelancerTableWrapper({
  columns,
  rows,
  filters,
  searchPlaceholder,
  csvName,
  defaultSort,
  emptyText,
}: FreelancerTableWrapperProps) {
  const [radiusFilterIds, setRadiusFilterIds] = useState<Set<string> | null>(null);

  const filteredRows = useMemo(() => {
    if (!radiusFilterIds) return rows;
    return rows.filter((r) => radiusFilterIds.has(r.id));
  }, [rows, radiusFilterIds]);

  const freelancerItems = useMemo(
    () =>
      rows
        .filter((r) => r.filters.kind === "flexwerker")
        .map((r) => ({
          id: r.id,
          fullName: typeof r.cells.name === "string" ? r.cells.name : "",
          postalCode: r.filters.postalCode,
          latitude: undefined, // Zou uit de DB moeten komen
          longitude: undefined, // Zou uit de DB moeten komen
        })),
    [rows]
  );

  return (
    <div className="space-y-4">
      <FreelancerLocationFilter
        items={freelancerItems}
        onFilter={(ids) => setRadiusFilterIds(new Set(ids))}
      />

      <DataTable
        columns={columns}
        rows={filteredRows}
        searchPlaceholder={searchPlaceholder}
        csvName={csvName}
        defaultSort={defaultSort}
        filters={filters}
        emptyText={emptyText}
      />
    </div>
  );
}
