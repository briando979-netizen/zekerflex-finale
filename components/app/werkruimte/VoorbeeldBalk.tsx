import Link from "next/link";
import { WERKRUIMTE_INFO, type Werkruimte } from "@/lib/werkgever/werkruimte";

// /werkgever?voorbeeld=<soort>: bekijk het startscherm van een andere werkruimte
// zonder iets op te slaan (handig om te vergelijken en voor metingen). Alleen het
// startscherm; het menu volgt de echte werkruimte.
export function VoorbeeldBalk({ soort }: { soort: Werkruimte }) {
  return (
    <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hair bg-white px-4 py-3 text-sm text-neutralx-700">
      <p>
        <strong className="text-ink">Voorbeeld:</strong> zo ziet het startscherm eruit voor {WERKRUIMTE_INFO[soort].naam.toLowerCase()}. Er is niets opgeslagen.
      </p>
      <Link href="/werkgever" className="font-semibold text-brand-600 hover:underline">
        Terug naar je eigen startscherm
      </Link>
    </div>
  );
}
