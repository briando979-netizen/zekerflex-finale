import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand } from "@/components/marketing/primitives";
import { WHITEPAPERS } from "@/lib/kennis/whitepapers";

export const metadata: Metadata = {
  title: "Whitepapers",
  description:
    "Download de ZekerFlex-whitepapers: werken als freelancer, omzet- en inkomstenbelasting, de kleineondernemersregeling, aftrekposten, administratie en verzekering.",
};

function DocIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="flex-shrink-0 text-brand-mint">
      <path
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5M8.5 13h7M8.5 16.5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function WhitepapersPage() {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <Link href="/kennis" className="text-sm font-medium text-white/60 hover:text-white">
            ← Kennis
          </Link>
          <p className="eyebrow mt-6 text-brand-mint">Whitepapers</p>
          <h1 className="mt-3 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
            Klik en download de whitepapers
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/70">
            Alles op een rij over freelancen, belasting, administratie en verzekering — in ZekerFlex-stijl,
            als pdf om te bewaren.
          </p>
        </div>
      </div>

      <section className="bg-paper">
        <div className="shell max-w-3xl py-16 md:py-20">
          <ul className="overflow-hidden rounded-2xl border border-hair bg-white shadow-e1">
            {WHITEPAPERS.map((w, i) => (
              <li key={w.slug} className={i > 0 ? "border-t border-hair" : ""}>
                <div className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper-soft">
                  <DocIcon />
                  <Link href={`/kennis/whitepapers/${w.slug}`} className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{w.title}</span>
                    <span className="block truncate text-sm text-neutralx-500">{w.subtitle}</span>
                  </Link>
                  <a
                    href={`/api/kennis/whitepaper/${w.slug}`}
                    className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-brand-500 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-brand-600"
                    aria-label={`Download ${w.title} als pdf`}
                  >
                    <DownloadIcon />
                    Downloaden
                  </a>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-neutralx-500">
            Algemene informatie, geen fiscaal of juridisch advies. Bedragen en regels kunnen wijzigen.
          </p>
        </div>
      </section>

      <CtaBand
        title="Klaar om te beginnen?"
        body="Aanmelden is gratis en kost een paar minuten."
        primaryHref="/register"
        primaryLabel="Account aanmaken"
        secondaryHref="/kennis"
        secondaryLabel="Terug naar Kennis"
      />
    </>
  );
}
