import type { Block, SiteDoc } from "@/lib/sites/types";
import type { Kennis } from "@/lib/sitechat/antwoord";
import type { Fragment } from "@/lib/sitechat/regels";

// ---------------------------------------------------------------------------
// Wat de chatassistent van een klantsite (ZekerFlex Sites) weet: de
// bedrijfsgegevens, de openingstijden, elke veelgestelde vraag, de tekst van
// elke pagina en de producten uit de webwinkel. Alles komt uit de gepubliceerde
// site zelf; er wordt niets verzonnen of van buiten gehaald. Puur, los te testen.
// ---------------------------------------------------------------------------

/** Vanaf dit moment staat de chat standaard aan op nieuwe sites; bestaande sites zet de klant zelf aan (AGENTS.md). */
export const CHAT_START = "2026-11-04T06:00:00.000Z";

export function chatStandaardAan(site: Pick<SiteDoc, "createdAt">): boolean {
  return site.createdAt >= CHAT_START;
}

const euro = (cents: number) => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const regel = (...delen: (string | false | null | undefined)[]) => delen.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
const kort = (s: string, max = 1400) => (s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/, "")} …` : s);

/** De leesbare tekst van een blok; faq en openingstijden krijgen eigen fragmenten. */
function blokTekst(b: Block): string {
  switch (b.type) {
    case "hero":
      return regel(b.props.kop, b.props.tekst);
    case "tekst":
    case "tekstFoto":
      return regel(b.props.kop, b.props.tekst);
    case "diensten":
      return regel(b.props.kop, ...b.props.items.map((i) => `${i.titel}: ${i.tekst}.`));
    case "stappen":
    case "usps":
      return regel(b.props.kop, ...b.props.items.map((i) => `${i.titel}: ${i.tekst}.`));
    case "reviews":
      return regel(b.props.kop, ...b.props.items.map((i) => `${i.naam}: "${i.tekst}"`));
    case "cta":
      return regel(b.props.kop, b.props.tekst);
    case "contact":
      return regel(b.props.kop, b.props.tekst);
    case "vacatures":
      return regel(b.props.kop, b.props.tekst);
    default:
      return "";
  }
}

export function siteKennis(s: Pick<SiteDoc, "bedrijf" | "pages" | "winkel">): Kennis {
  const b = s.bedrijf;
  const adres = [b.straat, [b.postcode, b.plaats].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const blokken = s.pages.flatMap((p) => p.blocks);

  const vast: Fragment[] = [
    {
      titel: "Contact en adres",
      tekst: regel(
        `${b.naam}${adres ? `, ${adres}` : ""}.`,
        b.telefoon && `Telefoon ${b.telefoon}.`,
        b.email && `E-mail ${b.email}.`,
        b.whatsapp && `WhatsApp ${b.whatsapp}.`,
        b.kvk && `KvK ${b.kvk}.`,
        "Via de website kun je een bericht sturen met het contactformulier.",
      ),
      altijd: true,
    },
  ];
  const tijden = [...new Set(blokken.flatMap((x) => (x.type === "openingstijden" ? x.props.regels.map((r) => `${r.dag}: ${r.tijd}`) : [])))];
  if (tijden.length) vast.push({ titel: "Openingstijden", tekst: tijden.join("\n"), altijd: true });

  const faq: Fragment[] = blokken.flatMap((x) => (x.type === "faq" ? x.props.items.filter((i) => i.vraag && i.antwoord).map((i) => ({ titel: `Vraag: ${i.vraag}`, tekst: i.antwoord })) : []));

  const paginas: Fragment[] = s.pages.flatMap((p) => {
    const tekst = p.blocks.map(blokTekst).filter(Boolean).join("\n");
    return tekst ? [{ titel: p.slug ? `Pagina ${p.titel}` : `Home (${p.titel})`, tekst: kort(tekst) }] : [];
  });

  const producten = (s.winkel?.producten ?? []).filter((p) => p.zichtbaar);
  const winkel: Fragment[] = producten.map((p) => ({
    titel: `Product: ${p.naam}`,
    tekst: regel(
      p.korteTekst,
      kort(p.omschrijving, 500),
      `Prijs ${euro(p.prijsCents)}${p.oudePrijsCents ? ` (was ${euro(p.oudePrijsCents)})` : ""}.`,
      (p.uitverkocht || p.voorraad === 0) && "Nu uitverkocht.",
      ...(p.opties ?? []).map((o) => `${o.naam}: ${o.waarden.join(", ")}.`),
      p.categorie && `Categorie: ${p.categorie}.`,
    ),
  }));
  if (producten.length && s.winkel) {
    const l = s.winkel.levering;
    winkel.push({
      titel: "Webwinkel: bestellen, bezorgen en betalen",
      tekst: regel(
        s.winkel.bestellen ? "Bestellen kan via de webwinkel op deze website." : "Online bestellen staat nu uit.",
        l.afhalen && "Afhalen kan.",
        l.bezorgen && `Bezorgen kan${l.bezorgkostenCents ? ` voor ${euro(l.bezorgkostenCents)}` : ""}${l.gratisVanafCents ? `, gratis vanaf ${euro(l.gratisVanafCents)}` : ""}.`,
        s.winkel.betaalTekst,
      ),
    });
  }

  const home = s.pages.find((p) => p.slug === "");
  const held = home?.blocks.find((x) => x.type === "hero");
  return {
    bedrijf: b.naam,
    omschrijving: kort(regel(`${b.naam}${b.plaats ? ` uit ${b.plaats}` : ""}.`, held ? blokTekst(held) : ""), 300),
    regels: [
      'Wil iemand een afspraak, verwijs naar de knop "Afspraak aanvragen" in deze chat; bevestig zelf nooit een datum of tijd.',
      ...(producten.length ? ["Voor bestellingen: verwijs naar de webwinkel op de website."] : []),
    ],
    fragmenten: [...vast, ...faq, ...paginas, ...winkel],
    contact: b.telefoon ? `bel ${b.telefoon}` : b.email ? `mail ${b.email}` : "gebruik het contactformulier op de website",
  };
}
