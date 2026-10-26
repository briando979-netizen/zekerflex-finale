import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pagina niet gevonden",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 py-16 text-center">
      <style>{`@keyframes zf-bob{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-16px) rotate(5deg)}}@media (prefers-reduced-motion:reduce){.zf-bob{animation:none!important}}`}</style>
      <div className="mx-auto max-w-md">
        <div className="zf-bob mx-auto mb-5 text-7xl" style={{ animation: "zf-bob 3s ease-in-out infinite" }} aria-hidden>
          ⛑️
        </div>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">Fout 404</p>
        <h1 className="mt-3 text-3xl font-bold text-ink sm:text-4xl">Deze pagina is van de steiger gevallen</h1>
        <p className="mt-4 text-base leading-relaxed text-neutralx-500">
          De pagina die je zoekt bestaat niet (meer) of is verhuisd. Geen zorgen — hieronder ben je zo weer aan het werk.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-primary">
            Naar de homepage
          </Link>
          <Link href="/dashboard" className="btn-ghost">
            Naar je dashboard
          </Link>
        </div>
        <p className="mt-10 text-xs text-neutralx-400">
          Typefout in het adres? Check &apos;m nog even — of zoek via het menu op de homepage.
        </p>
      </div>
    </main>
  );
}
