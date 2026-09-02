import type { Metadata } from "next";
import { DemoBooking } from "@/components/marketing/DemoBooking";

export const metadata: Metadata = {
  title: "Vraag een demo aan",
  description:
    "Plan een vrijblijvende demo van 30 minuten en ontdek hoe je met ZekerFlex snel flexibele krachten inzet — matching, urengoedkeuring, facturatie en Wet DBA-monitor.",
  alternates: { canonical: "/demo" },
};

const POINTS = ["Rondleiding door het platform", "Compleet vrijblijvend", "Ongeveer 30 minuten"];

function Tick() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="flex-shrink-0 text-brand-mint">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DemoPage() {
  return (
    <div className="hero-ink text-white">
      <div className="shell grid gap-12 py-16 md:py-24 lg:grid-cols-[1fr_1.05fr] lg:items-start lg:gap-16">
        <div>
          <p className="eyebrow text-brand-mint">Demo voor opdrachtgevers</p>
          <h1 className="mt-4 max-w-lg text-balance font-display text-4xl font-bold leading-[1.08] md:text-5xl">
            Wil je weten hoe ZekerFlex werkt?
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/70">
            Benieuwd hoe je makkelijk en snel flexibele krachten inzet via ZekerFlex? In een
            vrijblijvende demo van 30 minuten laten we zien hoe je duizenden krachten bereikt en
            hoe je planning gevuld raakt — inclusief urengoedkeuring, facturatie en de Wet
            DBA-monitor. Kies hieronder een datum en tijd, dan bevestigen we de afspraak.
          </p>
          <ul className="mt-8 space-y-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-3 text-sm text-white/80">
                <Tick /> {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:pt-2">
          <DemoBooking />
        </div>
      </div>
    </div>
  );
}
