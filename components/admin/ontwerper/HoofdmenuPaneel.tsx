"use client";

import { useState } from "react";
import { NAV, type MenuItem } from "@/lib/marketing/site-nav";
import { MAX_EIGEN_KNOPPEN, MAX_SUBMENU_LINKS, isEigenKnop, type Hoofdmenu, type HoofdmenuKnop } from "@/lib/ontwerp/hoofdmenu";
import type { MenuLink } from "@/lib/ontwerp/menu";

// ---------------------------------------------------------------------------
// Tabblad Menu, deel Hoofdmenu: de knoppen bovenaan de site. Hernoemen,
// verbergen, verplaatsen, eigen links in een submenu en hooguit twee eigen
// knoppen. Opslaan zet het meteen live; "Standaard" zet het oorspronkelijke
// menu terug. Een menu gelijk aan de standaard wordt niet bewaard.
// ---------------------------------------------------------------------------

const paneel = { background: "var(--a-panel)", border: "1px solid var(--a-border)" };
const veld = { background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" };
const mute = { color: "var(--a-mute)" };
const klein = "grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-xs disabled:opacity-30";
const knopStijl = { background: "var(--a-elev)", color: "var(--a-text)" };
const wegStijl = { background: "var(--a-crit-soft)", color: "var(--a-crit)" };

function verplaats<T>(lijst: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= lijst.length) return lijst;
  const n = [...lijst];
  const [x] = n.splice(i, 1);
  if (x !== undefined) n.splice(j, 0, x);
  return n;
}

function SubmenuLink({ link, nummer, onZet, onWeg }: { link: MenuItem; nummer: number; onZet: (l: MenuItem) => void; onWeg: () => void }) {
  return (
    <li className="space-y-1 rounded-lg p-2" style={{ background: "var(--a-elev)" }}>
      <div className="flex items-center gap-1.5">
        <input aria-label={`Submenu-link ${nummer}: titel`} value={link.title} onChange={(e) => onZet({ ...link, title: e.target.value })} maxLength={50} placeholder="Titel" className="min-w-0 flex-1 rounded-lg px-2 py-1 text-xs font-semibold" style={veld} />
        <button type="button" onClick={onWeg} aria-label="Link weghalen" className={klein} style={wegStijl}>
          ✕
        </button>
      </div>
      <input aria-label={`Submenu-link ${nummer}: korte uitleg`} value={link.desc} onChange={(e) => onZet({ ...link, desc: e.target.value })} maxLength={100} placeholder="Korte uitleg (mag leeg)" className="w-full rounded-lg px-2 py-1 text-xs" style={veld} />
      <input aria-label={`Submenu-link ${nummer}: adres`} value={link.href} onChange={(e) => onZet({ ...link, href: e.target.value })} maxLength={500} placeholder="/pagina of https://…" className="w-full rounded-lg px-2 py-1 font-mono text-[11px]" style={veld} />
    </li>
  );
}

function KnopRij({
  knop,
  index,
  aantal,
  open,
  eigenPaginas,
  onZet,
  onVerplaats,
  onWeg,
  onOpen,
}: {
  knop: HoofdmenuKnop;
  index: number;
  aantal: number;
  open: boolean;
  eigenPaginas: MenuLink[];
  onZet: (k: HoofdmenuKnop) => void;
  onVerplaats: (d: number) => void;
  onWeg: () => void;
  onOpen: () => void;
}) {
  const standaard = NAV.find((n) => n.key === knop.key);
  const eigen = isEigenKnop(knop.key);
  const vast = standaard?.menu?.werknemers.items.length ?? 0;
  const zetExtra = (extra: MenuItem[]) => onZet({ ...knop, extra });
  return (
    // verborgen: gestippelde rand en een andere achtergrond (geen doorzichtigheid: de tekst moet leesbaar blijven)
    <li className="space-y-2 rounded-xl p-3" style={knop.verborgen ? { background: "var(--a-elev)", border: "1px dashed var(--a-border)" } : paneel}>
      <div className="flex items-center gap-1.5">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Naam van knop {index + 1}</span>
          <input value={knop.label} onChange={(e) => onZet({ ...knop, label: e.target.value })} maxLength={30} placeholder={standaard?.label ?? "Naam van de knop"} className="w-full rounded-lg px-2 py-1.5 text-sm font-semibold" style={veld} />
        </label>
        <button type="button" onClick={() => onVerplaats(-1)} disabled={index === 0} aria-label="Knop naar links" className={klein} style={knopStijl}>
          ←
        </button>
        <button type="button" onClick={() => onVerplaats(1)} disabled={index === aantal - 1} aria-label="Knop naar rechts" className={klein} style={knopStijl}>
          →
        </button>
        {eigen ? (
          <button type="button" onClick={onWeg} aria-label="Knop weghalen" className={klein} style={wegStijl}>
            ✕
          </button>
        ) : null}
      </div>
      {eigen ? (
        <label className="block">
          <span className="sr-only">Adres van knop {index + 1}</span>
          <input value={knop.href} onChange={(e) => onZet({ ...knop, href: e.target.value })} maxLength={500} placeholder="/p/mijn-pagina of https://…" className="w-full rounded-lg px-2 py-1 font-mono text-[11px]" style={veld} />
        </label>
      ) : (
        <p className="font-mono text-[11px]" style={mute}>
          {standaard?.href}
          {standaard && knop.label.trim() && knop.label.trim() !== standaard.label ? ` · standaardnaam: ${standaard.label}` : ""}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5" style={{ color: "var(--a-text)" }}>
          <input type="checkbox" checked={!knop.verborgen} onChange={(e) => onZet({ ...knop, verborgen: !e.target.checked })} />
          Tonen
        </label>
        <button type="button" onClick={onOpen} aria-expanded={open} className="underline" style={mute}>
          Submenu: {vast ? `${vast} vaste links` : "geen vaste links"}
          {knop.extra.length ? ` + ${knop.extra.length} eigen` : ""} {open ? "▲" : "▼"}
        </button>
      </div>
      {open ? (
        <div className="space-y-2">
          {vast ? (
            <p className="text-[11px]" style={mute}>
              De vaste links blijven staan; jouw links komen eronder.
            </p>
          ) : null}
          <ul className="space-y-1.5">
            {knop.extra.map((l, i) => (
              <SubmenuLink key={i} nummer={i + 1} link={l} onZet={(nl) => zetExtra(knop.extra.map((x, j) => (j === i ? nl : x)))} onWeg={() => zetExtra(knop.extra.filter((_, j) => j !== i))} />
            ))}
          </ul>
          {knop.extra.length < MAX_SUBMENU_LINKS ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => zetExtra([...knop.extra, { title: "", desc: "", href: "" }])} className="a-button text-xs">
                + Link in submenu
              </button>
              {eigenPaginas.length ? (
                <label className="flex items-center gap-1 text-[11px]" style={mute}>
                  <span>Eigen pagina:</span>
                  <select
                    value=""
                    onChange={(e) => {
                      const p = eigenPaginas.find((x) => x.href === e.target.value);
                      if (p) zetExtra([...knop.extra, { title: p.label, desc: "", href: p.href }]);
                    }}
                    className="rounded-md px-1.5 py-1 text-[11px]"
                    style={veld}
                  >
                    <option value="">kies…</option>
                    {eigenPaginas.map((p) => (
                      <option key={p.href} value={p.href}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function HoofdmenuPaneel({ begin, beginEigen, eigenPaginas, onVernieuw }: { begin: Hoofdmenu; beginEigen: boolean; eigenPaginas: MenuLink[]; onVernieuw: () => void }) {
  const [menu, setMenu] = useState<Hoofdmenu>(begin);
  // de versie die live staat (waar "Wijzigingen weggooien" naar terug gaat)
  const [basis, setBasis] = useState<Hoofdmenu>(begin);
  const [eigen, setEigen] = useState(beginEigen);
  const [open, setOpen] = useState<string | null>(null);
  const [gewijzigd, setGewijzigd] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout?: boolean } | null>(null);

  const knoppen = menu.knoppen;
  const zet = (k: HoofdmenuKnop[]) => {
    setMenu({ knoppen: k });
    setGewijzigd(true);
    setMelding(null);
  };
  const aantalEigen = knoppen.filter((k) => isEigenKnop(k.key)).length;
  const zichtbaar = knoppen.filter((k) => !k.verborgen).length;

  function eigenKnopErbij() {
    const p = eigenPaginas[0];
    const key = `eigen-${Date.now().toString(36).slice(-8)}`;
    zet([...knoppen, { key, label: p?.label.slice(0, 30) ?? "", href: p?.href ?? "", verborgen: false, extra: [] }]);
    setOpen(null);
  }

  async function bewaar(terugNaarStandaard = false) {
    if (terugNaarStandaard && !window.confirm("Het hoofdmenu terugzetten naar het oorspronkelijke ZekerFlex-menu?")) return;
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch(
        "/api/admin/ontwerp/menu" + (terugNaarStandaard ? "?deel=hoofdmenu" : ""),
        terugNaarStandaard ? { method: "DELETE" } : { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hoofdmenu: menu }) },
      );
      const d = (await r.json().catch(() => null)) as { hoofdmenu?: Hoofdmenu; hoofdmenuEigen?: boolean; error?: { message?: string } } | null;
      if (!r.ok || !d?.hoofdmenu) throw new Error(d?.error?.message ?? "Opslaan lukte niet.");
      // wat de server bewaarde (genormaliseerd) is wat er live staat; minder knoppen of links = iets onvolledigs weggelaten
      const weg = !terugNaarStandaard && tel(d.hoofdmenu) < tel(menu);
      setMenu(d.hoofdmenu);
      setBasis(d.hoofdmenu);
      setEigen(Boolean(d.hoofdmenuEigen));
      setGewijzigd(false);
      setMelding({
        tekst: terugNaarStandaard
          ? "Het oorspronkelijke menu staat weer live."
          : !d.hoofdmenuEigen
            ? "Dit is gelijk aan het standaardmenu; dat staat live."
            : weg
              ? "Live. Links zonder titel of zonder geldig adres zijn weggelaten."
              : "Live. Het menu staat bovenaan elke pagina (in het voorbeeld onder ☰ als het smal is).",
      });
      onVernieuw();
    } catch (e) {
      setMelding({ tekst: e instanceof Error ? e.message : "Opslaan lukte niet.", fout: true });
    } finally {
      setBezig(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl p-4" style={paneel}>
      <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
        Hoofdmenu (bovenaan)
      </h2>
      <p className="text-xs" style={mute}>
        De knoppen in de balk bovenaan. Hernoem, verberg of verplaats ze, zet eigen links in een submenu, of voeg een eigen knop toe (hooguit {MAX_EIGEN_KNOPPEN}). {eigen ? "Je eigen versie staat live." : "Nu staat het standaardmenu live."}
      </p>
      {zichtbaar > NAV.length ? (
        <p className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: "var(--a-warn-soft)", color: "var(--a-warn-ink)" }}>
          Op een laptop is de balk al bijna vol. Met {zichtbaar} knoppen kan hij krap worden: verberg liever een andere knop, of zet de link in een submenu.
        </p>
      ) : null}
      <ul className="space-y-2">
        {knoppen.map((k, i) => (
          <KnopRij
            key={k.key}
            knop={k}
            index={i}
            aantal={knoppen.length}
            open={open === k.key}
            eigenPaginas={eigenPaginas}
            onZet={(nk) => zet(knoppen.map((x, j) => (j === i ? nk : x)))}
            onVerplaats={(d) => zet(verplaats(knoppen, i, d))}
            onWeg={() => zet(knoppen.filter((_, j) => j !== i))}
            onOpen={() => setOpen((o) => (o === k.key ? null : k.key))}
          />
        ))}
      </ul>
      {aantalEigen < MAX_EIGEN_KNOPPEN ? (
        <button type="button" onClick={eigenKnopErbij} className="a-button w-full text-xs">
          + Eigen knop{eigenPaginas.length ? " (begint met je eerste eigen pagina)" : ""}
        </button>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => bewaar()} disabled={bezig || !gewijzigd} className="a-button a-button-primary text-xs disabled:opacity-50">
          {bezig ? "Bezig…" : "Opslaan (meteen live)"}
        </button>
        {gewijzigd ? (
          <button
            type="button"
            onClick={() => {
              setMenu(basis);
              setGewijzigd(false);
              setMelding(null);
            }}
            className="a-button text-xs"
          >
            Wijzigingen weggooien
          </button>
        ) : null}
        {eigen ? (
          <button type="button" onClick={() => bewaar(true)} disabled={bezig} className="a-button text-xs">
            Terug naar de standaard
          </button>
        ) : null}
      </div>
      {melding ? (
        <p role={melding.fout ? "alert" : "status"} className="text-xs font-semibold" style={{ color: melding.fout ? "var(--a-crit)" : "var(--a-ok-ink)" }}>
          {melding.tekst}
        </p>
      ) : null}
    </section>
  );
}

/** Aantal knoppen plus submenu-links (om te zien of de server iets onvolledigs weggooide). */
const tel = (m: Hoofdmenu) => m.knoppen.length + m.knoppen.reduce((s, k) => s + k.extra.length, 0);
