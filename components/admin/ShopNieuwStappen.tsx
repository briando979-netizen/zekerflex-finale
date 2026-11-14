"use client";

import { useState } from "react";
import { CATEGORIEEN, LEEG, conceptBody, heeftFoto, heeftLinkPad, magInDeWinkel, productBody, stapFouten, vulUitLink, type Categorie, type NieuwVelden } from "@/lib/shop/nieuw-stappen";

// Beheer -> Webshop -> Producten -> Product toevoegen, in drie stappen (Mijn winkel, deel 4). Hergebruikt de bestaande routes: Product van een link
// (/api/admin/shop-ai/link en /opslaan), de Winkel-AI-concepttekst (/concept), het uploaden van een foto (/api/uploads) en het aanmaken van een
// product (/api/shop/products). Alles is een voorstel tot jij kiest: een nieuw product kan eerst als concept (verborgen) worden bewaard.

interface Props {
  bestaandeSlugs: string[];
  onKlaar: (melding: string) => void;
  onAnnuleer: () => void;
  onAlleVelden: () => void;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = (await r.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!r.ok || !d) throw new Error(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
  return d;
}

export function ShopNieuwStappen({ bestaandeSlugs, onKlaar, onAnnuleer, onAlleVelden }: Props) {
  const [stap, setStap] = useState<1 | 2 | 3>(1);
  const [v, setV] = useState<NieuwVelden>(LEEG);
  const [bezig, setBezig] = useState("");
  const [fouten, setFouten] = useState<string[]>([]);
  const [info, setInfo] = useState("");

  const zet = <K extends keyof NieuwVelden>(sleutel: K, waarde: NieuwVelden[K]) => setV((huidig) => ({ ...huidig, [sleutel]: waarde }));

  const leesLink = async () => {
    setBezig("link");
    setFouten([]);
    setInfo("");
    try {
      const d = await post<{ idee: string; fotos: string[]; prijsCents: number | null; valuta: string | null; bron: string }>("/api/admin/shop-ai/link", { url: v.link });
      setV((huidig) => vulUitLink(huidig, d, v.link));
      const prijs = d.prijsCents ? ` De prijs op de pagina (${d.valuta ?? "onbekende munt"} ${(d.prijsCents / 100).toFixed(2).replace(".", ",")}) is een inkoopindicatie, geen verkoopprijs; je kiest de verkoopprijs zelf.` : "";
      setInfo(`Gelezen van ${d.bron}.${d.fotos[0] ? " De foto is gevonden; controleer of je hem mag gebruiken." : " Er is geen foto gevonden."}${prijs}`);
    } catch (e) {
      setFouten([e instanceof Error ? e.message : "De link lezen lukte niet."]);
    } finally {
      setBezig("");
    }
  };

  const uploadFoto = async (file: File) => {
    setBezig("foto");
    setFouten([]);
    try {
      const body = new FormData();
      body.append("file", file);
      const r = await fetch("/api/uploads", { method: "POST", body });
      const d = (await r.json().catch(() => null)) as { upload?: { id: string }; error?: { message?: string } } | null;
      if (!r.ok || !d?.upload) throw new Error(d?.error?.message ?? "De foto uploaden mislukte.");
      setV((huidig) => ({ ...huidig, imageUploadId: d.upload!.id, imageUrl: `/api/shop/media/${d.upload!.id}`, fotoUrl: "", bronUrl: "" }));
    } catch (e) {
      setFouten([e instanceof Error ? e.message : "De foto uploaden mislukte."]);
    } finally {
      setBezig("");
    }
  };

  const schrijfTekst = async () => {
    if (v.naam.trim().length < 2) { setFouten(["Geef eerst het product een naam; daar maakt de Winkel-AI de tekst uit."]); return; }
    setBezig("tekst");
    setFouten([]);
    try {
      const d = await post<{ concept: { description: string; category: Categorie } }>("/api/admin/shop-ai/concept", { idee: `${v.naam.trim()}\n${v.omschrijving.trim()}`.slice(0, 1500) });
      setV((huidig) => ({ ...huidig, omschrijving: d.concept.description, ...(CATEGORIEEN.includes(d.concept.category) ? { categorie: d.concept.category } : {}) }));
      setInfo("De Winkel-AI schreef een tekst. Lees hem na en pas hem aan waar nodig.");
    } catch (e) {
      setFouten([e instanceof Error ? e.message : "De tekst maken lukte niet."]);
    } finally {
      setBezig("");
    }
  };

  const volgende = () => {
    if (stap === 1) { setFouten([]); setStap(2); return; }
    const f = stapFouten(2, v);
    if (f.length > 0) { setFouten(f); return; }
    setFouten([]);
    setStap(3);
  };
  const bewaar = async (zichtbaar: boolean) => {
    const f = stapFouten(3, v);
    if (f.length > 0) { setFouten(f); return; }
    if (zichtbaar) {
      const nee = magInDeWinkel(v);
      if (nee) { setFouten([nee]); return; }
    }
    setBezig("bewaren");
    setFouten([]);
    try {
      if (heeftLinkPad(v)) {
        await post("/api/admin/shop-ai/opslaan", conceptBody(v));
        onKlaar(`"${v.naam.trim()}" is bewaard als concept. Controleer de foto en zet hem in de lijst aan als hij klopt; de voorraad stel je daar ook in.`);
      } else {
        await post("/api/shop/products", productBody(v, bestaandeSlugs, zichtbaar));
        onKlaar(zichtbaar ? `"${v.naam.trim()}" staat nu in je winkel.` : `"${v.naam.trim()}" is bewaard als concept: hij staat verborgen tot je hem aanzet.`);
      }
    } catch (e) {
      setFouten([e instanceof Error ? e.message : "Opslaan mislukt."]);
    } finally {
      setBezig("");
    }
  };

  const kop = ["Foto of link", "Naam, omschrijving en prijs", "Voorraad en zichtbaar"] as const;
  return (
    <section className="a-panel space-y-4 p-4" aria-labelledby="nieuw-product-kop">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="nieuw-product-kop" className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>Product toevoegen: stap {stap} van 3, {kop[stap - 1]}</h2>
        <button type="button" className="text-xs underline" style={{ color: "var(--a-mute)" }} onClick={onAlleVelden}>Alle velden tonen</button>
      </div>

      {stap === 1 && (
        <div className="space-y-4">
          <label className="a-label">Plak de link naar het product bij je leverancier
            <input className="a-input" value={v.link} onChange={(e) => zet("link", e.target.value)} placeholder="https://…" inputMode="url" />
          </label>
          <button type="button" className="a-button text-sm" disabled={bezig !== "" || v.link.trim().length < 8} onClick={() => void leesLink()}>{bezig === "link" ? "Bezig met lezen…" : "Lees de pagina"}</button>
          <p className="text-xs" style={{ color: "var(--a-mute)" }}>Dat werkt bij een losse productpagina van de meeste webwinkels. Grote marktplaatsen zoals AliExpress, Temu en Amazon laten hun pagina&apos;s niet door een programma lezen: dan upload je zelf een foto en schrijf je de tekst zelf.</p>
          <label className="a-label">Of upload zelf een foto
            <input type="file" accept="image/*" className="a-input" disabled={bezig !== ""} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFoto(f); e.target.value = ""; }} />
          </label>
          {v.imageUrl ? <p role="status" className="text-xs" style={{ color: "var(--a-ok)" }}>Foto geüpload.</p> : null}
          {heeftLinkPad(v) ? <p role="status" className="text-xs" style={{ color: "var(--a-ok)" }}>Foto van de leverancier gevonden; die wordt bij het bewaren overgenomen.</p> : null}
          <p className="text-xs" style={{ color: "var(--a-mute)" }}>Een foto is niet verplicht om door te gaan: zonder foto kun je het product bewaren als concept.</p>
        </div>
      )}

      {stap === 2 && (
        <div className="space-y-4">
          <label className="a-label">Naam van het product
            <input className="a-input" value={v.naam} onChange={(e) => zet("naam", e.target.value)} required />
          </label>
          <label className="a-label">Omschrijving
            <textarea className="a-input min-h-24" value={v.omschrijving} onChange={(e) => zet("omschrijving", e.target.value)} />
          </label>
          <button type="button" className="a-button text-sm" disabled={bezig !== ""} onClick={() => void schrijfTekst()}>{bezig === "tekst" ? "De Winkel-AI schrijft…" : "Schrijf de tekst met de Winkel-AI"}</button>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="a-label">Verkoopprijs in euro
              <input className="a-input" inputMode="decimal" value={v.prijsTekst} onChange={(e) => zet("prijsTekst", e.target.value)} placeholder="12,95" />
            </label>
            <label className="a-label">Categorie
              <select className="a-input" value={v.categorie} onChange={(e) => zet("categorie", e.target.value as Categorie)}>
                {CATEGORIEEN.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}

      {stap === 3 && (
        <div className="space-y-4">
          {heeftLinkPad(v) ? (
            <p className="text-sm" style={{ color: "var(--a-text)" }}>Dit product komt via de link als concept binnen, met de foto van de leverancier. De voorraad stel je daarna in de lijst in.</p>
          ) : (
            <label className="a-label">Voorraad (stuks)
              <input className="a-input w-32" inputMode="numeric" value={v.voorraadTekst} onChange={(e) => zet("voorraadTekst", e.target.value)} />
            </label>
          )}
          <dl className="grid gap-1 text-sm sm:grid-cols-2" style={{ color: "var(--a-text)" }}>
            <div><dt className="inline" style={{ color: "var(--a-mute)" }}>Naam: </dt><dd className="inline">{v.naam}</dd></div>
            <div><dt className="inline" style={{ color: "var(--a-mute)" }}>Prijs: </dt><dd className="inline">€ {v.prijsTekst}</dd></div>
            <div><dt className="inline" style={{ color: "var(--a-mute)" }}>Foto: </dt><dd className="inline">{heeftFoto(v) ? "ja" : "nog niet"}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="a-button text-sm" disabled={bezig !== ""} onClick={() => void bewaar(false)}>{bezig === "bewaren" ? "Bezig…" : "Bewaar als concept"}</button>
            {!heeftLinkPad(v) ? <button type="button" className="a-button a-button-primary text-sm" disabled={bezig !== ""} onClick={() => void bewaar(true)}>Zet in de winkel</button> : null}
          </div>
          <p className="text-xs" style={{ color: "var(--a-mute)" }}>Een concept staat verborgen: klanten zien het pas als jij het aanzet. In de winkel zetten kan alleen met een foto en een prijs.</p>
        </div>
      )}

      {info ? <p role="status" className="text-xs" style={{ color: "var(--a-dim)" }}>{info}</p> : null}
      {fouten.map((f) => <p key={f} role="alert" className="text-xs" style={{ color: "var(--a-crit)" }}>{f}</p>)}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: "var(--a-border)" }}>
        <button type="button" className="a-button text-sm" onClick={() => (stap === 1 ? onAnnuleer() : setStap(stap === 2 ? 1 : 2))}>{stap === 1 ? "Annuleren" : "Terug"}</button>
        {stap < 3 ? <button type="button" className="a-button a-button-primary text-sm" disabled={bezig !== ""} onClick={volgende}>Volgende</button> : null}
      </div>
    </section>
  );
}