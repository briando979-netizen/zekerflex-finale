import Link from "next/link";
import type { Werkruimte } from "@/lib/werkgever/werkruimte";
import { getDict } from "@/lib/i18n/server";
import { fmt } from "@/lib/i18n/dictionaries";

// /werkgever?voorbeeld=<soort>: bekijk het startscherm van een andere werkruimte
// zonder iets op te slaan (handig om te vergelijken en voor metingen). Alleen het
// startscherm; het menu volgt de echte werkruimte.
export async function VoorbeeldBalk({ soort }: { soort: Werkruimte }) {
  const dict = await getDict();
  const k = dict.werkruimteKiezer;
  return (
    <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hair bg-white px-4 py-3 text-sm text-neutralx-700">
      <p>
        <strong className="text-ink">{k.voorbeeldVet}</strong>
        {fmt(k.voorbeeldTekst, { naam: dict.werkruimteInfo[`${soort}Naam` as const].toLowerCase() })}
      </p>
      <Link href="/werkgever" className="font-semibold text-brand-600 hover:underline">
        {k.voorbeeldTerug}
      </Link>
    </div>
  );
}
