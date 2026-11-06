import type { Principal } from "@/lib/auth";
import { getFreelancerOverview } from "@/lib/dashboard/freelancer";
import { getEmployerOverview } from "@/lib/dashboard/employer";
import { ownerTodos } from "@/lib/admin/owner-todos";
import type { OsKaart, OsRol } from "@/lib/os/apps";

// ---------------------------------------------------------------------------
// De strook "Vandaag" bovenaan het bureaublad: een paar echte cijfers die
// ertoe doen, met een klik naar de app erachter. De cijfers komen uit de
// bestaande overzichten van de portalen, dus er is geen tweede waarheid.
// Lukt het ophalen niet, dan toont het bureaublad gewoon geen strook.
// ---------------------------------------------------------------------------

export type { OsKaart } from "@/lib/os/apps";

const euro = (centen: number) => `€ ${(centen / 100).toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export async function vandaagVoor(principal: Principal, rol: OsRol): Promise<OsKaart[]> {
  try {
    if (rol === "werker") {
      const o = await getFreelancerOverview(principal.userId);
      return [
        { label: "Klussen die eraan komen", waarde: String(o.kpis.upcoming), app: "w-diensten", tint: "groen" },
        { label: "Wacht op jou", waarde: String(o.kpis.actionNeeded), app: "w-uren", tint: "goud", actie: o.kpis.actionNeeded > 0 },
        { label: "Deze maand verdiend", waarde: euro(o.kpis.earnedThisMonthCents), app: "w-uitbetalingen", tint: "goud" },
        { label: "Nog uit te betalen", waarde: euro(o.kpis.pendingPayoutCents), app: "w-uitbetalingen", tint: "blauw" },
      ];
    }
    if (rol === "werkgever") {
      const o = await getEmployerOverview(principal);
      return [
        { label: "Open diensten", waarde: String(o.kpis.openShifts), app: "b-diensten", tint: "groen" },
        { label: "Uren om goed te keuren", waarde: String(o.kpis.toApprove), app: "b-uren", tint: "goud", actie: o.kpis.toApprove > 0 },
        { label: "Krachten aan het werk", waarde: String(o.kpis.activeFreelancers), app: "b-kalender", tint: "blauw" },
        { label: "Deze maand besteed", waarde: euro(o.kpis.spentThisMonthCents), app: "b-facturen", tint: "goud" },
      ];
    }
    const todos = await ownerTodos();
    const open = todos.filter((t) => !t.done).length;
    return [{ label: "Te doen voor jou", waarde: String(open), app: "a-te-doen", tint: "goud", actie: open > 0 }];
  } catch {
    return [];
  }
}
