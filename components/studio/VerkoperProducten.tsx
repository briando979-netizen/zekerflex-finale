"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { VerkoperProductDto } from "@/lib/shop/verkoper";
import { PRODUCT_STATUS_LABEL, VERKOPER_CATEGORIEEN, euroNaarCents, type ProductStatus } from "@/lib/shop/verkoper-core";
import { Card, Empty, IImage, IPlus, IStore, Pill, btn, input } from "@/components/studio/ui";

// Studio → Verkopen: de eigen producten in de ZekerFlex-shop. Toevoegen, prijs en
// voorraad aanpassen, pauzeren of weghalen. Naam, tekst, categorie of foto
// wijzigen stuurt het product opnieuw naar de beoordeling (lib/shop/verkoper.ts).

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const euroVeld = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const TONE: Record<ProductStatus, "ok" | "info" | "warn" | "neutral" | "crit"> = { in_beoordeling: "warn", goedgekeurd: "ok", afgewezen: "crit", gepauzeerd: "neutral" };

type Maat = { maat: string; voorraad: string };

async function stuur(url: string, method: string, body?: unknown): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; fout: string }> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
    if (!res.ok) return { ok: false, fout: data.error?.message ?? "Dat is niet gelukt. Probeer het opnieuw." };
    return { ok: true, data };
  } catch {
    return { ok: false, fout: "Geen verbinding. Controleer je internet en probeer het opnieuw." };
  }
}

export function VerkoperProducten({ producten }: { producten: VerkoperProductDto[] }) {
  const [nieuw, setNieuw] = useState(false);
  return (
    <Card
      title="Jouw producten in de shop"
      className="mt-4"
      pad={false}
      actions={
        !nieuw && (
          <button type="button" onClick={() => setNieuw(true)} className={btn.primary}>
            <IPlus width={16} height={16} /> Product toevoegen
          </button>
        )
      }
    >
      {nieuw && (
        <div className="border-b border-[#ebebeb] px-5 pb-5 pt-3">
          <ProductFormulier product={null} onKlaar={() => setNieuw(false)} />
        </div>
      )}
      {producten.length === 0 && !nieuw ? (
        <Empty icon={<IStore />} title="Nog geen producten" text="Voeg je eerste product toe. Na onze controle staat het in de ZekerFlex-shop, met jouw bedrijfsnaam erbij.">
          <button type="button" onClick={() => setNieuw(true)} className={btn.primary}>
            <IPlus width={16} height={16} /> Product toevoegen
          </button>
        </Empty>
      ) : (
        <ul className="divide-y divide-[#f1f1f1]">
          {producten.map((p) => (
            <ProductRij key={`${p.id}-${p.bijgewerkt}`} p={p} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ProductRij({ p }: { p: VerkoperProductDto }) {
  const router = useRouter();
  const [bewerk, setBewerk] = useState(false);
  const [weg, setWeg] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const voorraad = p.varianten.reduce((s, v) => s + v.voorraad, 0);

  const actie = async (method: "PATCH" | "DELETE", body?: unknown) => {
    setBezig(true);
    setFout("");
    const r = await stuur(`/api/werkgever/verkopen/producten/${p.id}`, method, body);
    setBezig(false);
    if (!r.ok) {
      setFout(r.fout);
      return;
    }
    router.refresh();
  };

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f1f1f1] text-[#707070]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.fotoUrl ? <img src={p.fotoUrl} alt="" className="h-full w-full object-cover" /> : <IImage />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[#1a1a1a] [overflow-wrap:anywhere]">{p.naam}</p>
          <p className="mt-0.5 text-sm text-[#616161]">
            {euro(p.prijsCents)} · {p.categorie} · {voorraad} op voorraad
            {p.varianten.length > 1 ? ` (${p.varianten.map((v) => `${v.maat}: ${v.voorraad}`).join(", ")})` : ""}
          </p>
          {p.status === "afgewezen" && p.reden && <p className="mt-1 text-sm text-[#b42318]">Reden: {p.reden}. Pas het product aan, dan bekijken we het opnieuw.</p>}
          {p.status === "in_beoordeling" && <p className="mt-1 text-sm text-[#616161]">We bekijken dit product binnen een werkdag.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={TONE[p.status]}>{PRODUCT_STATUS_LABEL[p.status]}</Pill>
          {p.status === "goedgekeurd" && (
            <a href={`/shop/${p.slug}`} target="_blank" rel="noopener" className={btn.quiet}>
              Bekijk
            </a>
          )}
          <button type="button" onClick={() => setBewerk((b) => !b)} aria-expanded={bewerk} className={btn.secondary}>
            {bewerk ? "Sluiten" : "Bewerken"}
          </button>
          {p.status === "goedgekeurd" && (
            <button type="button" disabled={bezig} onClick={() => void actie("PATCH", { pauze: true })} className={btn.secondary}>
              Pauzeren
            </button>
          )}
          {p.status === "gepauzeerd" && (
            <button type="button" disabled={bezig} onClick={() => void actie("PATCH", { pauze: false })} className={btn.secondary}>
              Terug in de shop
            </button>
          )}
          {weg ? (
            <button type="button" disabled={bezig} onClick={() => void actie("DELETE")} className={btn.danger}>
              Zeker weghalen?
            </button>
          ) : (
            <button type="button" onClick={() => setWeg(true)} className={btn.quiet}>
              Weghalen
            </button>
          )}
        </div>
      </div>
      {fout && (
        <p role="alert" className="mt-2 text-sm font-semibold text-[#b42318]">
          {fout}
        </p>
      )}
      {bewerk && (
        <div className="mt-4 rounded-xl border border-[#ebebeb] bg-[#fafafa] p-4">
          <ProductFormulier product={p} onKlaar={() => setBewerk(false)} />
        </div>
      )}
    </li>
  );
}

function ProductFormulier({ product, onKlaar }: { product: VerkoperProductDto | null; onKlaar: () => void }) {
  const router = useRouter();
  const [naam, setNaam] = useState(product?.naam ?? "");
  const [omschrijving, setOmschrijving] = useState(product?.omschrijving ?? "");
  const [categorie, setCategorie] = useState(product?.categorie ?? VERKOPER_CATEGORIEEN[0]);
  const [prijs, setPrijs] = useState(product ? euroVeld(product.prijsCents) : "");
  const [voorraad, setVoorraad] = useState(product ? "" : "10");
  const [maten, setMaten] = useState<Maat[]>([]);
  const [variantVoorraad, setVariantVoorraad] = useState<Record<string, string>>(() => Object.fromEntries((product?.varianten ?? []).map((v) => [v.id, String(v.voorraad)])));
  const [foto, setFoto] = useState<{ id: string; voorbeeld: string } | null>(null);
  const [uploaden, setUploaden] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const id = product?.id ?? "nieuw";

  const kiesFoto = async (file: File | undefined) => {
    if (!file) return;
    setFout("");
    setUploaden(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/werkgever/verkopen/foto", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFout(data?.error?.message ?? "De foto kon niet worden geüpload.");
        return;
      }
      setFoto({ id: data.foto.id, voorbeeld: URL.createObjectURL(file) });
    } catch {
      setFout("Geen verbinding. Controleer je internet en probeer het opnieuw.");
    } finally {
      setUploaden(false);
    }
  };

  const opslaan = async (e: FormEvent) => {
    e.preventDefault();
    setFout("");
    const prijsCents = euroNaarCents(prijs);
    if (prijsCents === null) {
      setFout("Vul de prijs in euro's in, bijvoorbeeld 24,95.");
      return;
    }
    let body: Record<string, unknown>;
    if (!product) {
      if (!foto) {
        setFout("Voeg een foto toe; producten zonder foto verkopen slecht en keuren we niet goed.");
        return;
      }
      const lijst = maten.filter((m) => m.maat.trim());
      body = {
        naam,
        omschrijving,
        categorie,
        prijsCents,
        voorraad: Number(voorraad) || 0,
        maten: lijst.map((m) => ({ maat: m.maat.trim(), voorraad: Number(m.voorraad) || 0 })),
        fotoUploadId: foto.id,
      };
    } else {
      body = {};
      if (naam.trim() !== product.naam) body.naam = naam;
      if (omschrijving.trim() !== product.omschrijving) body.omschrijving = omschrijving;
      if (categorie !== product.categorie) body.categorie = categorie;
      if (prijsCents !== product.prijsCents) body.prijsCents = prijsCents;
      if (foto) body.fotoUploadId = foto.id;
      const vv = Object.fromEntries(
        product.varianten.filter((v) => String(v.voorraad) !== (variantVoorraad[v.id] ?? "")).map((v) => [v.id, Number(variantVoorraad[v.id]) || 0]),
      );
      if (Object.keys(vv).length > 0) body.voorraad = vv;
      if (Object.keys(body).length === 0) {
        onKlaar();
        return;
      }
    }
    setBezig(true);
    const r = await stuur(product ? `/api/werkgever/verkopen/producten/${product.id}` : "/api/werkgever/verkopen/producten", product ? "PATCH" : "POST", body);
    setBezig(false);
    if (!r.ok) {
      setFout(r.fout);
      return;
    }
    onKlaar();
    router.refresh();
  };

  const inhoudGewijzigd = Boolean(product) && (naam.trim() !== product?.naam || omschrijving.trim() !== product?.omschrijving || categorie !== product?.categorie || foto !== null);

  return (
    <form onSubmit={opslaan} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_200px]">
        <div className="grid min-w-0 gap-3">
          <label className="grid gap-1.5 text-xs font-semibold text-[#616161]" htmlFor={`naam-${id}`}>
            Naam
            <input id={`naam-${id}`} value={naam} onChange={(e) => setNaam(e.target.value)} required minLength={3} maxLength={90} className={input} />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[#616161]" htmlFor={`oms-${id}`}>
            Omschrijving
            <textarea id={`oms-${id}`} value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} required minLength={20} maxLength={3000} rows={4} className={input} />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-xs font-semibold text-[#616161]" htmlFor={`cat-${id}`}>
              Categorie
              <select id={`cat-${id}`} value={categorie} onChange={(e) => setCategorie(e.target.value)} className={input}>
                {VERKOPER_CATEGORIEEN.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-[#616161]" htmlFor={`prijs-${id}`}>
              Prijs incl. btw (€)
              <input id={`prijs-${id}`} value={prijs} onChange={(e) => setPrijs(e.target.value)} required inputMode="decimal" placeholder="24,95" className={input} />
            </label>
            {!product && maten.length === 0 && (
              <label className="grid gap-1.5 text-xs font-semibold text-[#616161]" htmlFor={`vr-${id}`}>
                Voorraad
                <input id={`vr-${id}`} value={voorraad} onChange={(e) => setVoorraad(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={input} />
              </label>
            )}
          </div>

          {product ? (
            <fieldset className="grid gap-2">
              <legend className="text-xs font-semibold text-[#616161]">Voorraad</legend>
              <div className="flex flex-wrap gap-3">
                {product.varianten.map((v) => (
                  <label key={v.id} className="grid gap-1 text-xs text-[#616161]">
                    {v.maat ?? "Aantal"}
                    <input
                      value={variantVoorraad[v.id] ?? ""}
                      onChange={(e) => setVariantVoorraad((s) => ({ ...s, [v.id]: e.target.value.replace(/\D/g, "") }))}
                      inputMode="numeric"
                      className={`${input} w-24`}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <fieldset className="grid gap-2">
              <legend className="text-xs font-semibold text-[#616161]">Maten (alleen als het product in maten komt)</legend>
              {maten.map((m, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <label className="grid gap-1 text-xs text-[#616161]">
                    Maat
                    <input value={m.maat} onChange={(e) => setMaten((l) => l.map((x, j) => (j === i ? { ...x, maat: e.target.value } : x)))} maxLength={20} placeholder="M" className={`${input} w-28`} />
                  </label>
                  <label className="grid gap-1 text-xs text-[#616161]">
                    Voorraad
                    <input value={m.voorraad} onChange={(e) => setMaten((l) => l.map((x, j) => (j === i ? { ...x, voorraad: e.target.value.replace(/\D/g, "") } : x)))} inputMode="numeric" className={`${input} w-24`} />
                  </label>
                  <button type="button" onClick={() => setMaten((l) => l.filter((_, j) => j !== i))} className={btn.quiet}>
                    Weg
                  </button>
                </div>
              ))}
              {maten.length < 12 && (
                <button type="button" onClick={() => setMaten((l) => [...l, { maat: "", voorraad: "5" }])} className={`${btn.quiet} justify-self-start`}>
                  <IPlus width={15} height={15} /> Maat toevoegen
                </button>
              )}
            </fieldset>
          )}
        </div>

        <div className="grid content-start gap-2">
          <span className="text-xs font-semibold text-[#616161]">Foto</span>
          <div className="grid aspect-square place-items-center overflow-hidden rounded-xl border border-dashed border-[#c9c9c9] bg-white text-[#707070]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {foto ? <img src={foto.voorbeeld} alt="Voorbeeld van de nieuwe foto" className="h-full w-full object-cover" /> : product?.fotoUrl ? <img src={product.fotoUrl} alt="Huidige foto" className="h-full w-full object-cover" /> : <IImage width={28} height={28} />}
          </div>
          <label className={`${btn.secondary} cursor-pointer`}>
            {uploaden ? "Uploaden…" : foto || product?.fotoUrl ? "Andere foto" : "Foto kiezen"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploaden} onChange={(e) => void kiesFoto(e.target.files?.[0])} />
          </label>
          <p className="text-xs text-[#707070]">JPG, PNG of WebP, liefst vierkant op een lichte achtergrond.</p>
        </div>
      </div>

      {inhoudGewijzigd && <p className="text-sm text-[#8a5a00]">Je wijzigt de naam, tekst, categorie of foto: het product gaat uit de shop tot we het opnieuw hebben bekeken.</p>}
      {fout && (
        <p role="alert" className="text-sm font-semibold text-[#b42318]">
          {fout}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={bezig || uploaden} className={btn.primary}>
          {bezig ? "Bezig…" : product ? "Opslaan" : "Aanbieden in de shop"}
        </button>
        <button type="button" onClick={onKlaar} className={btn.secondary}>
          Annuleren
        </button>
      </div>
    </form>
  );
}
