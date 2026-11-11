import { requirePrincipal } from "@/lib/auth";
import { ChecklistsBeheer } from "@/components/checklists/ChecklistsBeheer";

export const dynamic = "force-dynamic";

// Werkgever → Checklists: sjablonen met vaste taken per locatie (schoonmaak, horeca, hotel), een invullink voor personeel
// zonder account, en een overzicht van wat gedaan en wat gemist is. Personeel vult in op /checklist/<sleutel>.
export default async function ChecklistsPagina() {
  await requirePrincipal();
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-ink">Checklists</h1>
      <p className="mb-5 mt-1 max-w-2xl text-sm text-neutralx-600">Vaste taken per locatie, ingevuld door je personeel op de telefoon, zonder account. Je ziet wie wat deed en wat gemist is.</p>
      <ChecklistsBeheer />
    </div>
  );
}
