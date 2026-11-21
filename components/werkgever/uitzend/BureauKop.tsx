import Link from "next/link";
import { EmptyState } from "@/components/app/ui";
import type { BureauMelding } from "@/lib/uitzend/bureau-kern";

// Het dashboard van een uitzendpartner (/werkgever/uitzend, lib/uitzend/bureau.ts): de tabbladen bovenaan elk scherm,
// de meldingen over de bureaugegevens en wat een bedrijf ziet dat (nog) geen uitzendpartner is. Servercomponenten.

export type BureauTab = "aanvragen" | "krachten" | "verloning" | "klanten" | "bureau";

const TABS: readonly { id: BureauTab; href: string; label: string }[] = [
  { id: "aanvragen", href: "/werkgever/uitzend", label: "Aanvragen" },
  { id: "krachten", href: "/werkgever/uitzend/krachten", label: "Uitzendkrachten" },
  { id: "verloning", href: "/werkgever/uitzend/verloning", label: "Uren voor verloning" },
  { id: "klanten", href: "/werkgever/uitzend/klanten", label: "Klanten en locaties" },
  { id: "bureau", href: "/werkgever/uitzend/bureau", label: "Bureaugegevens" },
];

export function BureauTabs({ actief }: { actief: BureauTab }) {
  return (
    <nav aria-label="Uitzendbureau" className="mb-5 inline-flex max-w-full flex-wrap rounded-full border border-hair bg-white p-1">
      {TABS.map((tab) => {
        const huidig = tab.id === actief;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={huidig ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${huidig ? "bg-ink text-white" : "text-neutralx-600 hover:bg-paper-soft hover:text-ink"}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Wat het bureau nog moet regelen (lib/uitzend/bureau-kern.ts, bureauMeldingen); niets = geen balk. */
export function BureauMeldingen({ meldingen, metLink = true }: { meldingen: readonly BureauMelding[]; metLink?: boolean }) {
  if (meldingen.length === 0) return null;
  const ernstig = meldingen.some((m) => m.ernst === "crit");
  return (
    <div role="status" className={`mb-6 rounded-2xl border p-4 text-sm ${ernstig ? "border-crit/30 bg-crit/[0.06]" : "border-warn/30 bg-warn/[0.06]"}`}>
      <p className="font-semibold text-ink">{ernstig ? "Regel dit eerst" : "Binnenkort vernieuwen"}</p>
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
          Naar je bureaugegevens
        </Link>
      )}
    </div>
  );
}

/** Een bedrijf dat (nog) geen uitzendpartner is. */
export function GeenUitzendPartner() {
  return (
    <div className="surface">
      <EmptyState
        title="Dit deel is voor uitzendbureaus"
        body="Ben je een uitzendbureau? Dan zetten we je account op uitzendpartner. Je klussen staan dan onder de naam van je bureau en je ziet hier de aanvragen van werkers."
        cta={{ href: "/partners/uitzend", label: "Zo werkt het voor bureaus" }}
      />
    </div>
  );
}
