"use client";

import { useState } from "react";
import { NameCell, Panel, Pill } from "@/components/admin/kit";
import { DataTable, type TableRow } from "@/components/admin/kit-client";

interface Person {
  id: string;
  name: string;
  email: string;
  roles: string[];
  twoFactor: boolean;
}

const ROLE: Record<string, string> = { PLATFORM_ADMIN: "Beheerder", HQ_ADMIN: "Werkgever (hoofdkantoor)", LOCAL_MANAGER: "Werkgever (vestiging)" };

/** Who has two-step verification on; reset for someone who lost phone + recovery codes. */
export function AdminTwoFactorOverview({ people, selfId }: { people: Person[]; selfId: string }) {
  const [list, setList] = useState(people);
  const [note, setNote] = useState<string | null>(null);
  const on = list.filter((p) => p.twoFactor).length;

  async function reset(p: Person) {
    if (!window.confirm(`Tweestapsverificatie van ${p.name} resetten? Doe dit alleen als je zeker weet dat het echt deze persoon is (bijv. via een videogesprek). ${p.name} moet het daarna opnieuw instellen.`)) return;
    const r = await fetch("/api/admin/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: p.id }) }).catch(() => null);
    if (r?.ok) {
      setList((l) => l.map((x) => (x.id === p.id ? { ...x, twoFactor: false } : x)));
      setNote(`Tweestapsverificatie van ${p.name} is gereset (vastgelegd in het auditlog).`);
    } else setNote("Resetten lukte niet.");
  }

  const rows: TableRow[] = list.map((p) => ({
    id: p.id,
    search: `${p.name} ${p.email}`,
    filters: { state: p.twoFactor ? "on" : "off" },
    cells: {
      name: <NameCell name={p.id === selfId ? `${p.name} (jij)` : p.name} sub={p.email} />,
      roles: p.roles.map((r) => ROLE[r] ?? r).join(", "),
      state: <Pill tone={p.twoFactor ? "ok" : "warn"}>{p.twoFactor ? "Aan" : "Uit"}</Pill>,
      action: p.twoFactor && p.id !== selfId ? <button type="button" onClick={() => void reset(p)} className="a-button text-xs">Resetten</button> : null,
    },
    sort: { name: p.name, roles: p.roles.join(","), state: p.twoFactor ? 1 : 0 },
  }));

  return (
    <Panel flush title="Beheerders en werkgevers" subtitle={`${on} van ${list.length} met tweestapsverificatie`}>
      {note && <p role="status" className="px-4 pb-3 text-[0.8125rem] sm:px-5" style={{ color: "var(--a-dim)" }}>{note}</p>}
      <DataTable
        columns={[
          { key: "name", label: "Naam" },
          { key: "roles", label: "Rol", hideOnMobile: true },
          { key: "state", label: "Tweestaps" },
          { key: "action", label: "", align: "right", sortable: false },
        ]}
        rows={rows}
        pageSize={15}
        searchPlaceholder="Zoek op naam of e-mail"
        filters={[{ key: "state", label: "Tweestaps", chips: true, options: [{ value: "off", label: "Uit" }, { value: "on", label: "Aan" }] }]}
        emptyText="Nog geen beheerders of werkgevers."
      />
    </Panel>
  );
}
