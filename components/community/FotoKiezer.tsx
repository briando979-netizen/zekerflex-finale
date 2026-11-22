"use client";

import { useEffect, useId, useRef, useState } from "react";
import { GRENZEN } from "@/lib/community/regels";

export interface GekozenFoto {
  id: string;
  /** een blob:-adres van de verkleinde foto, alleen voor het voorbeeld hier */
  voorbeeld: string;
}

/**
 * Verkleint een foto in de browser (hooguit 1600 px, JPEG): sneller uploaden, en een iPhone-foto (heic) wordt zo meestal een
 * JPG die de server kan lezen. Lukt dat niet, dan gaat het origineel mee. De server maakt hem daarna toch opnieuw (zonder EXIF/GPS).
 */
async function verklein(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const schaal = Math.min(1, GRENZEN.fotoPx / Math.max(bmp.width, bmp.height));
    const breed = Math.max(1, Math.round(bmp.width * schaal));
    const hoog = Math.max(1, Math.round(bmp.height * schaal));
    const canvas = document.createElement("canvas");
    canvas.width = breed;
    canvas.height = hoog;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, breed, hoog);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.88));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Foto's kiezen voor een onderwerp of reactie: elke foto gaat meteen naar /api/community/upload, het bericht krijgt alleen de id's. */
export function FotoKiezer({
  fotos,
  setFotos,
  max,
  onBezig,
}: {
  fotos: GekozenFoto[];
  setFotos: (f: GekozenFoto[]) => void;
  max: number;
  onBezig: (bezig: boolean) => void;
}) {
  const invoerId = useId();
  const invoer = useRef<HTMLInputElement>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  // de voorbeelden (blob:-adressen) opruimen als het formulier verdwijnt
  const voorbeelden = useRef(new Set<string>());
  useEffect(() => {
    const alle = voorbeelden.current;
    return () => {
      for (const u of alle) URL.revokeObjectURL(u);
    };
  }, []);

  async function kies(lijst: FileList | null) {
    if (!lijst || lijst.length === 0) return;
    const ruimte = max - fotos.length;
    const bestanden = Array.from(lijst).slice(0, Math.max(0, ruimte));
    if (bestanden.length < lijst.length) setFout(max === 1 ? "Je kunt hier één foto toevoegen." : `Je kunt hier hooguit ${max} foto's toevoegen.`);
    else setFout(null);
    if (bestanden.length === 0) return;
    setBezig(true);
    onBezig(true);
    const erbij: GekozenFoto[] = [];
    try {
      for (const bestand of bestanden) {
        if (bestand.size > GRENZEN.fotoBytes * 3) {
          setFout("Deze foto is te groot. Kies een foto tot 8 MB.");
          continue;
        }
        const klein = await verklein(bestand);
        const fd = new FormData();
        fd.append("foto", klein, "foto.jpg");
        const r = await fetch("/api/community/upload", { method: "POST", body: fd }).catch(() => null);
        const d = r ? ((await r.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null) : null;
        if (!r?.ok || !d?.id) {
          setFout(d?.error?.message ?? "Deze foto uploaden lukte niet. Probeer het opnieuw.");
          continue;
        }
        const voorbeeld = URL.createObjectURL(klein);
        voorbeelden.current.add(voorbeeld);
        erbij.push({ id: d.id, voorbeeld });
      }
    } finally {
      if (erbij.length) setFotos([...fotos, ...erbij].slice(0, max));
      setBezig(false);
      onBezig(false);
      if (invoer.current) invoer.current.value = "";
    }
  }

  function haalWeg(id: string) {
    const weg = fotos.find((f) => f.id === id);
    if (weg) {
      URL.revokeObjectURL(weg.voorbeeld);
      voorbeelden.current.delete(weg.voorbeeld);
    }
    setFotos(fotos.filter((f) => f.id !== id));
  }

  return (
    <div className="relative">
      <input
        ref={invoer}
        id={invoerId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple={max > 1}
        className="sr-only"
        onChange={(e) => void kies(e.target.files)}
      />
      <div className="flex flex-wrap items-center gap-3">
        {fotos.map((f, i) => (
          <span key={f.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.voorbeeld} alt={`Gekozen foto ${i + 1}`} className="h-20 w-20 rounded-xl border border-hair object-cover" />
            <button
              type="button"
              onClick={() => haalWeg(f.id)}
              className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-ink text-sm font-bold text-white shadow"
              aria-label={`Foto ${i + 1} weghalen`}
            >
              ×
            </button>
          </span>
        ))}
        {fotos.length < max && (
          <label
            htmlFor={invoerId}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-hairstrong px-4 py-3 text-sm font-semibold text-ink hover:border-ink ${bezig ? "pointer-events-none opacity-60" : ""}`}
          >
            <span aria-hidden>📷</span> {bezig ? "Foto uploaden…" : fotos.length ? "Nog een foto" : max === 1 ? "Foto toevoegen" : "Foto's toevoegen"}
          </label>
        )}
      </div>
      <p className="mt-2 text-xs text-neutralx-500">
        Hooguit {max} {max === 1 ? "foto" : "foto's"}, jpg, png, webp of heic tot 8 MB. We halen de locatie en andere gegevens uit de foto.
      </p>
      {fout && (
        <p role="alert" className="mt-1 text-sm font-medium text-crit">
          {fout}
        </p>
      )}
    </div>
  );
}
