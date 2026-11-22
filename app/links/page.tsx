import type { Metadata } from "next";
import Link from "next/link";
import { LogoGlyph } from "@/components/brand/Logo";
import { SocialLinks } from "@/components/marketing/SocialLinks";
import { COMMUNITY_URL } from "@/lib/hulp/hulpjes";
import { canonical } from "@/lib/seo";

// De linkpagina voor in de bio van de social-profielen en WhatsApp Business (22 nov 2026, eigenaar: "voeg alle links toe die we
// hebben"). Bewust zonder het sitemenu: één scherm, eerst voor de telefoon, in de stijl van de app.

const TITLE = "ZekerFlex: flexwerk en bijbaan bij jou in de buurt";
const DESCRIPTION =
  "Alle links van ZekerFlex op één plek: aanmelden als werker, personeel inhuren, de app downloaden, de community en onze social media.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonical("/links", { title: TITLE, description: DESCRIPTION }),
};

const KNOPPEN: { label: string; onder: string; href: string; hoofd?: boolean; extern?: boolean }[] = [
  // werkers komen binnen zoals in de app: eerst de welkomstcarrousel, dan aanmaken (lib/welkom)
  { label: "Aanmelden als werker", onder: "Gratis, klussen bij jou in de buurt", href: "/welkom", hoofd: true },
  { label: "Personeel nodig? Plaats je klus", onder: "Eerste maand gratis", href: "/voor-bedrijven" },
  { label: "Download de app", onder: "Android en iPhone", href: "/app" },
  { label: "Praat mee in de ZekerFlex community", onder: "Vragen, ervaringen en tips", href: COMMUNITY_URL },
  { label: "Naar de website", onder: "zekerflex.com", href: "/" },
];

export default function LinksPagina() {
  return (
    <main className="min-h-[100dvh] bg-[linear-gradient(165deg,#0B3B3A_0%,#0E5C4A_45%,#0C0E12_100%)] px-5 pb-12 pt-[max(2.5rem,env(safe-area-inset-top))] text-white">
      <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
        <LogoGlyph size={72} tone="light" />
        <h1 className="mt-5 font-display text-3xl font-bold">ZekerFlex</h1>
        <p className="mt-2 text-base text-white/80">Flexwerk &amp; bijbaan bij jou in de buurt</p>
        <nav aria-label="Links van ZekerFlex" className="mt-8 w-full space-y-3">
          {KNOPPEN.map((k) => {
            const kleur = k.hoofd ? "bg-brand-mint text-ink hover:brightness-95" : "bg-white/10 text-white hover:bg-white/15";
            const inhoud = (
              <>
                <span className="block font-display text-base font-bold">{k.label}</span>
                <span className={`mt-0.5 block text-sm ${k.hoofd ? "text-ink/70" : "text-white/70"}`}>{k.onder}</span>
              </>
            );
            const cls = `block rounded-2xl px-5 py-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${kleur}`;
            return k.extern ? (
              <a key={k.href} href={k.href} target="_blank" rel="noopener noreferrer" className={cls}>
                {inhoud}
              </a>
            ) : (
              <Link key={k.href} href={k.href} className={cls}>
                {inhoud}
              </Link>
            );
          })}
        </nav>
        <SocialLinks className="mt-8 flex-wrap justify-center" />
      </div>
    </main>
  );
}
