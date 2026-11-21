import Link from "next/link";
import { EmptyState } from "@/components/app/ui";
import { getDict } from "@/lib/i18n/server";
import type { BureauMelding } from "@/lib/uitzend/bureau-kern";

// Het dashboard van een uitzendpartner (/werkgever/uitzend, lib/uitzend/bureau.ts): de tabbladen bovenaan elk scherm,
// de meldingen over de bureaugegevens en wat een bedrijf ziet dat (nog) geen uitzendpartner is. Servercomponenten; de
// tekst komt uit het werkgeverswoordenboek (uitzendBureau in lib/i18n/dictionaries.ts).

export type BureauTab = "aanvragen" | "krachten" | "verloning" | "klanten" | "bureau";

const TABS: readonly { id: BureauTab; href: string }[] = [
  { id: "aanvragen", href: "/werkgever/uitzend" },
  { id: "krachten", href: "/werkgever/uitzend/krachten" },
  { id: "verloning", href: "/werkgever/uitzend/verloning" },
  { id: "klanten", href: "/werkgever/uitzend/klanten" },
  { id: "bureau", href: "/werkgever/uitzend/bureau" },
];

export async function BureauTabs({ actief }: { actief: BureauTab }) {
  const u = (await getDict()).uitzendBureau;
  return (
    <nav aria-label={u.eyebrow} className="mb-5 inline-flex max-w-full flex-wrap rounded-full border border-hair bg-white p-1">
      {TABS.map((tab) => {
        const huidig = tab.id === actief;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={huidig ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${huidig ? "bg-ink text-white" : "text-neutralx-600 hover:bg-paper-soft hover:text-ink"}`}
          >
            {u.tabs[tab.id]}
          </Link>
        );
      })}
    </nav>
  );
}

/** Wat het bureau nog moet regelen (lib/uitzend/bureau-kern.ts, bureauMeldingen); niets = geen balk. */
export async function BureauMeldingen({ meldingen, metLink = true }: { meldingen: readonly BureauMelding[]; metLink?: boolean }) {
  if (meldingen.length === 0) return null;
  const u = (await getDict()).uitzendBureau;
  const ernstig = meldingen.some((m) => m.ernst === "crit");
  return (
    <div role="status" className={`mb-6 rounded-2xl border p-4 text-sm ${ernstig ? "border-crit/30 bg-crit/[0.06]" : "border-warn/30 bg-warn/[0.06]"}`}>
      <p className="font-semibold text-ink">{ernstig ? u.meldingErnstig : u.meldingBinnenkort}</p>
      <ul className="mt-2 space-y-1 text-neutralx-700">
        {meldingen.map((m) => (
          <li key={m.tekst} className="flex gap-2">
            <span aria-hidden className={m.ernst === "crit" ? "text-crit" : "text-warn"}>
              ●
            </span>
            <span>{m.tekst}</span>
          </li>
        ))}
      </ul>
      {metLink && (
        <Link href="/werkgever/uitzend/bureau" className="mt-3 inline-block font-semibold text-brand-600 underline">
          {u.naarGegevens}
        </Link>
      )}
    </div>
  );
}

/** Een bedrijf dat (nog) geen uitzendpartner is. */
export async function GeenUitzendPartner() {
  const u = (await getDict()).uitzendBureau;
  return (
    <div className="surface">
      <EmptyState title={u.geenPartnerTitel} body={u.geenPartnerUitleg} cta={{ href: "/partners/uitzend", label: u.geenPartnerKnop }} />
    </div>
  );
}
