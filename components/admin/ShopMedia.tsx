"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { conceptProductVoorFoto } from "@/lib/shop/media-product";
import { bewaarKnopTekst, bewaardMelding, nuLiveTekst, serverKeuze } from "@/lib/shop/media-keuze";

// ---------------------------------------------------------------------------
// Beheer → Webshop → Foto's en video's: meerdere bestanden tegelijk kiezen
// (ook vanaf een telefoon), één voor één uploaden met voortgang en per bestand
// "Opnieuw", er meteen verborgen producten van maken, en een achtergrond kiezen
// voor /shop en de homepage. Hergebruikt de media-bibliotheek van de
// Site-ontwerper (storage/, /beeld/<id>).
// ---------------------------------------------------------------------------

interface Item {
  id: string;
  soort: "foto" | "video";
  naam: string;
  alt: string;
}
interface Keuze {
  media: string;
  poster?: string;
}
type Instelling = { shop: Keuze | null; home: Keuze | null };
type Regel = { sleutel: number; bestand: File; status: "wacht" | "bezig" | "klaar" | "mislukt"; fout?: string };

const MAX_FOTO = 15_000_000;
const MAX_VIDEO = 80_000_000;

async function stuurNaarBibliotheek(bestand: File): Promise<{ item?: Item; fout?: string }> {
  const isVideo = bestand.type.startsWith("video/");
  if (bestand.size > (isVideo ? MAX_VIDEO : MAX_FOTO)) return { fout: isVideo ? "Video groter dan 80 MB." : "Foto groter dan 15 MB." };
  const fd = new FormData();
  fd.append("bestand", bestand);
  try {
    const r = await fetch("/api/admin/ontwerp/media", { method: "POST", body: fd });
    const d = (await r.json().catch(() => null)) as { item?: Item; error?: { message?: string } } | null;
    if (!r.ok || !d?.item) return { fout: d?.error?.message ?? "Uploaden mislukt." };
    return { item: d.item };
  } catch {
    return { fout: "Geen verbinding." };
  }
}

function PaginaKeuze({ pagina, titel, keuze, media, onBewaard }: { pagina: "shop" | "home"; titel: string; keuze: Keuze | null; media: Item[]; onBewaard: (k: Keuze | null) => void }) {
  const serverMedia = keuze?.media ?? "";
  const serverPoster = keuze?.poster ?? "";
  const [gekozen, setGekozen] = useState(serverMedia);
  const [poster, setPoster] = useState(serverPoster);
  const [status, setStatus] = useState("");
  // De stand van de server komt pas na het laden binnen (en verandert na bewaren): de vakken volgen hem.
  useEffect(() => {
    setGekozen(serverMedia);
    setPoster(serverPoster);
  }, [serverMedia, serverPoster]);
  const item = media.find((m) => m.id === gekozen);
  const fotos = media.filter((m) => m.soort === "foto");
  const bewaar = async () => {
    setStatus("Bezig…");
    const body = { pagina, keuze: gekozen ? (item?.soort === "video" && poster ? { media: gekozen, poster } : { media: gekozen }) : null };
    const r = await fetch("/api/admin/ontwerp/achtergrond", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await r.json().catch(() => null)) as { error?: { message?: string }; achtergrond?: Instelling } | null;
    if (!r.ok) { setStatus(d?.error?.message ?? "Bewaren mislukt."); return; }
    // de teruggegeven serverversie overnemen, niet de eigen keuze
    const bewaard = serverKeuze(d, pagina, body.keuze);
    onBewaard(bewaard);
    setStatus(bewaardMelding(pagina, bewaard));
  };
  return (
    <div className="space-y-2 rounded-xl p-3" style={{ border: "1px solid var(--a-border)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>{titel}</p>
      <label className="a-label">Achtergrond
        <select className="a-input" value={gekozen} onChange={(e) => { setGekozen(e.target.value); setPoster(""); setStatus(""); }}>
          <option value="">Geen (zoals nu)</option>
          {media.map((m) => <option key={m.id} value={m.id}>{m.soort === "video" ? "Video: " : "Foto: "}{m.naam}</option>)}
        </select>
      </label>
      {item?.soort === "video" ? (
        <label className="a-label">Stilstaand beeld voor de video (laadt eerst, ook bij weinig data)
          <select className="a-input" value={poster} onChange={(e) => { setPoster(e.target.value); setStatus(""); }}>
            <option value="">Geen</option>
            {fotos.map((m) => <option key={m.id} value={m.id}>{m.naam}</option>)}
          </select>
        </label>
      ) : null}
      <p className="text-xs font-semibold" style={{ color: "var(--a-dim)" }}>{nuLiveTekst(keuze, media)}</p>
      <div className="flex items-center gap-3">
        <button type="button" className="a-button a-button-primary text-sm" onClick={() => void bewaar()}>{bewaarKnopTekst(pagina)}</button>
        {status ? <span role="status" className="text-xs" style={{ color: "var(--a-mute)" }}>{status}</span> : null}
      </div>
    </div>
  );
}

export function ShopMedia({ onProductenAangemaakt }: { onProductenAangemaakt: () => void }) {
  const [media, setMedia] = useState<Item[] | null>(null);
  const [instelling, setInstelling] = useState<Instelling>({ shop: null, home: null });
  const [regels, setRegels] = useState<Regel[]>([]);
  const [alsProduct, setAlsProduct] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState("");
  const teller = useRef(0);

  const laad = useCallback(async () => {
    const [m, a] = await Promise.all([
      fetch("/api/admin/ontwerp/media", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ media?: Item[] } | null>,
      fetch("/api/admin/ontwerp/achtergrond", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ achtergrond?: Instelling } | null>,
    ]);
    setMedia(m?.media ?? []);
    if (a?.achtergrond) setInstelling(a.achtergrond);
  }, []);
  useEffect(() => { void laad(); }, [laad]);

  const verwerk = async (lijst: Regel[]) => {
    setBezig(true);
    let nieuweProducten = 0;
    for (const regel of lijst) {
      setRegels((cur) => cur.map((r) => (r.sleutel === regel.sleutel ? { ...r, status: "bezig" } : r)));
      const { item, fout } = await stuurNaarBibliotheek(regel.bestand);
      if (!item) {
        setRegels((cur) => cur.map((r) => (r.sleutel === regel.sleutel ? { ...r, status: "mislukt", fout: fout ?? "Mislukt." } : r)));
        continue;
      }
      setMedia((cur) => [item, ...(cur ?? [])]);
      let fout2: string | undefined;
      if (alsProduct && item.soort === "foto") {
        const r = await fetch("/api/shop/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(conceptProductVoorFoto(item)) }).catch(() => null);
        if (r?.ok) nieuweProducten += 1;
        else fout2 = "Foto staat erin, maar het product aanmaken mislukte.";
      }
      setRegels((cur) => cur.map((r) => (r.sleutel === regel.sleutel ? { ...r, status: fout2 ? "mislukt" : "klaar", ...(fout2 ? { fout: fout2 } : {}) } : r)));
    }
    setBezig(false);
    if (nieuweProducten > 0) {
      setMelding(`${nieuweProducten} verborgen product(en) aangemaakt. Geef ze in de lijst een naam en prijs en zet ze daarna zichtbaar.`);
      onProductenAangemaakt();
    }
  };

  const kies = (files: FileList | null) => {
    if (!files?.length || bezig) return;
    const nieuw: Regel[] = [...files].map((bestand) => ({ sleutel: (teller.current += 1), bestand, status: "wacht" }));
    setMelding("");
    setRegels(nieuw);
    void verwerk(nieuw);
  };
  const opnieuw = (regel: Regel) => {
    if (bezig) return;
    setRegels((cur) => cur.map((r) => (r.sleutel === regel.sleutel ? { sleutel: r.sleutel, bestand: r.bestand, status: "wacht" } : r)));
    void verwerk([{ sleutel: regel.sleutel, bestand: regel.bestand, status: "wacht" }]);
  };

  const klaar = regels.filter((r) => r.status === "klaar" || r.status === "mislukt").length;
  const percentage = regels.length ? Math.round((klaar / regels.length) * 100) : 0;
  const lijst = media ?? [];

  return (
    <section className="a-panel space-y-4 p-4">
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>Foto&apos;s en video&apos;s uploaden</h2>
        <p className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>Kies er meteen meer tegelijk, ook vanaf je telefoon. Ze worden één voor één geüpload; foto tot 15 MB, video tot 80 MB (MP4 of WebM).</p>
      </div>
      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl p-5 text-center text-sm" style={{ border: "2px dashed var(--a-border-strong)", background: "var(--a-elev)", color: "var(--a-text)" }}>
        <input type="file" accept="image/*,video/*" multiple className="sr-only" disabled={bezig} onChange={(e) => { kies(e.target.files); e.target.value = ""; }} />
        <span className="font-semibold">{bezig ? "Bezig met uploaden…" : "Kies foto's en video's"}</span>
      </label>
      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--a-text)" }}>
        <input type="checkbox" checked={alsProduct} onChange={(e) => setAlsProduct(e.target.checked)} /> Maak van elke foto meteen een verborgen product (naam en prijs vul je daarna in)
      </label>
      {regels.length > 0 ? (
        <div className="space-y-2">
          <div role="progressbar" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100} aria-label="Voortgang van het uploaden" className="h-2 overflow-hidden rounded-full" style={{ background: "var(--a-elev)" }}>
            <div className="h-full" style={{ width: `${percentage}%`, background: "var(--a-accent)" }} />
          </div>
          <p className="text-xs" style={{ color: "var(--a-mute)" }}>{klaar} van {regels.length} klaar</p>
          <ul className="space-y-1">
            {regels.map((r) => (
              <li key={r.sleutel} className="flex items-center gap-2 text-xs" style={{ color: "var(--a-text)" }}>
                <span className="min-w-0 flex-1 truncate">{r.bestand.name}</span>
                {r.status === "mislukt" ? (
                  <>
                    <span role="alert" style={{ color: "var(--a-crit)" }}>Mislukt: {r.fout}</span>
                    <button type="button" className="font-semibold underline" onClick={() => opnieuw(r)}>Opnieuw</button>
                  </>
                ) : (
                  <span style={{ color: "var(--a-mute)" }}>{r.status === "klaar" ? "Klaar" : r.status === "bezig" ? "Bezig…" : "Wacht"}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {melding ? <p role="status" className="text-sm" style={{ color: "var(--a-dim)" }}>{melding}</p> : null}

      {media !== null ? (
        <div className="space-y-3 border-t pt-4" style={{ borderColor: "var(--a-border)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>Achtergrond bovenaan de pagina</h3>
          <p className="text-xs" style={{ color: "var(--a-mute)" }}>Een foto of video als strook boven de kop van de pagina. Webshop en Homepage bewaar je los van elkaar: een knop verandert alleen die ene pagina. Bij &quot;Geen&quot; blijft de pagina precies zoals hij nu is. Video speelt zonder geluid en staat stil bij &quot;minder beweging&quot;.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <PaginaKeuze pagina="shop" titel="Webshop (/shop)" keuze={instelling.shop} media={lijst} onBewaard={(k) => setInstelling((cur) => ({ ...cur, shop: k }))} />
            <PaginaKeuze pagina="home" titel="Homepage" keuze={instelling.home} media={lijst} onBewaard={(k) => setInstelling((cur) => ({ ...cur, home: k }))} />
          </div>
          <p className="text-xs" style={{ color: "var(--a-mute)" }}>{lijst.length} bestand(en) in de bibliotheek.</p>
        </div>
      ) : null}
    </section>
  );
}
