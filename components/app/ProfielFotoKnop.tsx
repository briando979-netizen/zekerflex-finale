"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { snijdVierkant } from "@/components/app/AvatarUpload";
import type { ProfielFotoTeksten } from "@/lib/i18n/profielfoto";

/**
 * De ronde profielfoto bovenaan Account (21 nov 2026, eigenaar: "als je op je profielfoto klikt doet het niks, dat moet
 * opties geven, zie YoungOnes"). Tik erop: een venster onderin met Foto maken (camera), Kiezen uit bibliotheek, Foto
 * verwijderen (als je er een hebt) en Annuleren. Uploaden via /api/profile/avatar, vierkant bijgesneden zoals bij de start.
 * Het venster staat in een portal: de foto zit in een verschoven blok (translate), daarbinnen zou "fixed" niet het hele
 * scherm pakken.
 */
export function ProfielFotoKnop({ userId, fotoUrl, teksten }: { userId: string; fotoUrl: string | null; teksten: ProfielFotoTeksten }) {
  const router = useRouter();
  const [heeftFoto, setHeeftFoto] = useState(Boolean(fotoUrl));
  const [versie, setVersie] = useState(0);
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [klaarVoorPortal, setKlaarVoorPortal] = useState(false);
  const [thema, setThema] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const bibliotheekRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setKlaarVoorPortal(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, [open]);

  async function upload(bestand: File) {
    setBezig(true);
    setFout(null);
    try {
      const fd = new FormData();
      fd.append("file", await snijdVierkant(bestand));
      const r = await fetch("/api/profile/avatar", { method: "POST", body: fd });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(d?.error?.message ?? teksten.fout);
      }
      setHeeftFoto(true);
      setVersie(Date.now());
      setOpen(false);
      router.refresh();
    } catch (e) {
      setFout((e as Error).message || teksten.fout);
    } finally {
      setBezig(false);
    }
  }

  async function verwijder() {
    setBezig(true);
    setFout(null);
    const r = await fetch("/api/profile/avatar", { method: "DELETE" }).catch(() => null);
    if (r?.ok) {
      setHeeftFoto(false);
      setVersie(Date.now());
      setOpen(false);
      router.refresh();
    } else setFout(teksten.fout);
    setBezig(false);
  }

  const kies = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void upload(f);
    e.target.value = "";
  };

  const bron = heeftFoto ? `${fotoUrl ?? `/api/profile/${userId}/avatar`}${versie ? `${(fotoUrl ?? "").includes("?") ? "&" : "?"}v=${versie}` : ""}` : null;
  const rij = "block w-full px-5 py-4 text-left text-base font-medium text-ink hover:bg-paper-soft disabled:opacity-50";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setThema(document.querySelector(".app-scope")?.getAttribute("data-theme") ?? null);
          setOpen(true);
        }}
        aria-label={teksten.wijzig} aria-haspopup="dialog" className="grid h-full w-full place-items-center">
        {bron ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bron} alt="" className="h-full w-full object-cover" />
        ) : (
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-ink" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="10" r="3.2" />
            <path d="M6.2 18.4c1.3-2.2 3.3-3.4 5.8-3.4s4.5 1.2 5.8 3.4" />
          </svg>
        )}
      </button>
      <input ref={cameraRef} type="file" accept="image/*" capture="user" hidden onChange={kies} />
      <input ref={bibliotheekRef} type="file" accept="image/*" hidden onChange={kies} />
      {open &&
        klaarVoorPortal &&
        createPortal(
          // buiten de app-schil (portal): neem het thema mee, anders blijft het venster licht in de donkere modus
          <div
            className="app-scope fixed inset-0 z-[95] flex items-end justify-center bg-black/40"
            {...(thema ? { "data-theme": thema } : {})}
            onClick={() => !bezig && setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="profielfoto-titel"
              className="w-full max-w-lg rounded-t-2xl border border-hair bg-white pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lift"
              onClick={(e) => e.stopPropagation()}
            >
              <p id="profielfoto-titel" className="px-5 pb-2 pt-5 font-display text-lg font-bold text-ink">
                {teksten.titel}
              </p>
              <div className="divide-y divide-hair border-t border-hair">
                <button type="button" className={rij} disabled={bezig} onClick={() => cameraRef.current?.click()}>
                  {teksten.maken}
                </button>
                <button type="button" className={rij} disabled={bezig} onClick={() => bibliotheekRef.current?.click()}>
                  {teksten.kiezen}
                </button>
                {heeftFoto && (
                  <button type="button" className={`${rij} text-crit`} disabled={bezig} onClick={() => void verwijder()}>
                    {teksten.verwijderen}
                  </button>
                )}
                <button type="button" className={rij} disabled={bezig} onClick={() => setOpen(false)}>
                  {teksten.annuleren}
                </button>
              </div>
              {bezig && (
                <p className="px-5 pt-2 text-sm text-neutralx-500" aria-live="polite">
                  {teksten.bezig}
                </p>
              )}
              {fout && (
                <p role="alert" className="px-5 pt-2 text-sm text-crit">
                  {fout}
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
