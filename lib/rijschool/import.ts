// Leerlingen overnemen uit je oude software of een Excel-lijst (15 nov 2026): de rijschool plakt een CSV-export of kiest het
// bestand, ziet een voorbeeld en neemt ze over. Dit bestand is puur (geen prisma, geen zod): het leest de tekst, herkent de
// kolommen aan hun kop en meldt per regel wat er mis is. Er gaat niets naar leerlingen: geen uitnodiging, geen mail.

export const IMPORT_MAX = 500;

export interface ImportRij {
  naam: string;
  email: string;
  telefoon: string;
  adres: string;
}

export interface ImportFout {
  /** het regelnummer in het bestand (de kopregel is 1) */
  regel: number;
  reden: string;
}

export interface ImportUitslag {
  rijen: ImportRij[];
  fouten: ImportFout[];
  /** gevonden kolommen, voor het voorbeeld ("naam", "e-mail", …) */
  kolommen: string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Splitst CSV-tekst in cellen: ; , of tab, aanhalingstekens, "" binnen een cel en regeleinden binnen een cel. */
function celrijen(tekst: string, scheiding: string): string[][] {
  const uit: string[][] = [];
  let rij: string[] = [];
  let cel = "";
  let tussen = false;
  for (let i = 0; i < tekst.length; i += 1) {
    const c = tekst.charAt(i);
    if (tussen) {
      if (c === '"') {
        if (tekst.charAt(i + 1) === '"') {
          cel += '"';
          i += 1;
        } else tussen = false;
      } else cel += c;
    } else if (c === '"') tussen = true;
    else if (c === scheiding) {
      rij.push(cel);
      cel = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && tekst.charAt(i + 1) === "\n") i += 1;
      rij.push(cel);
      cel = "";
      uit.push(rij);
      rij = [];
    } else cel += c;
  }
  if (cel !== "" || rij.length > 0) {
    rij.push(cel);
    uit.push(rij);
  }
  return uit;
}

/** Welk scheidingsteken gebruikt de kopregel? Excel in Nederland geeft ;, anders , of een tab. */
function scheidingVan(kop: string): string {
  const tel = (s: string) => kop.split(s).length - 1;
  const opties = [";", "\t", ","] as const;
  return opties.reduce((beste, s) => (tel(s) > tel(beste) ? s : beste), ";");
}

const platte = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

type Veld = "naam" | "voornaam" | "tussenvoegsel" | "achternaam" | "email" | "telefoon" | "adres" | "postcode" | "plaats";

/** Welk veld is dit? Op de kop, in Nederlands en Engels, zoals de bekende pakketten ze noemen. */
function veldVan(kop: string): Veld | null {
  const k = platte(kop);
  if (["naam", "volledigenaam", "leerling", "leerlingnaam", "name", "fullname"].includes(k)) return "naam";
  if (["voornaam", "firstname", "roepnaam"].includes(k)) return "voornaam";
  if (["tussenvoegsel", "voorvoegsel", "tussenvoegsels"].includes(k)) return "tussenvoegsel";
  if (["achternaam", "lastname", "familienaam", "surname"].includes(k)) return "achternaam";
  if (["email", "emailadres", "mail", "emailadresleerling", "e-mail"].includes(k) || k.startsWith("email")) return "email";
  if (["telefoon", "telefoonnummer", "mobiel", "mobielnummer", "gsm", "tel", "phone", "mobile"].includes(k) || k.startsWith("telefoon") || k.startsWith("mobiel")) return "telefoon";
  if (["adres", "straat", "straatennummer", "straatnaamenhuisnummer", "address", "ophaaladres"].includes(k)) return "adres";
  if (["postcode", "zipcode", "zip"].includes(k)) return "postcode";
  if (["plaats", "woonplaats", "stad", "city"].includes(k)) return "plaats";
  return null;
}

const schoon = (s: string) => s.replace(/\s+/g, " ").trim();
/** Telefoonnummer zoals de invoer van het beheer het toestaat: cijfers, plus, spaties, haakjes en streepjes. */
const nummer = (s: string) => schoon(s).replace(/[^0-9+ ()-]/g, "");

/** Leest een export. De eerste regel moet de kopregel zijn en er moet een naam (of voor- en achternaam) en een e-mail in staan. */
export function leesLeerlingen(invoer: string): ImportUitslag {
  const tekst = invoer.replace(/^﻿/, "").trim();
  const leeg: ImportUitslag = { rijen: [], fouten: [], kolommen: [] };
  if (!tekst) return leeg;
  const eerste = tekst.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const regels = celrijen(tekst, scheidingVan(eerste));
  const kop = regels[0] ?? [];
  const velden = kop.map(veldVan);
  const heeftNaam = velden.includes("naam") || (velden.includes("voornaam") && velden.includes("achternaam"));
  if (!heeftNaam || !velden.includes("email")) {
    return { ...leeg, fouten: [{ regel: 1, reden: "De eerste regel moet kolomkoppen hebben, met in elk geval een naam (of voornaam en achternaam) en een e-mailadres." }] };
  }
  const kolommen = [...new Set(velden.filter((v): v is Veld => v !== null))];
  const rijen: ImportRij[] = [];
  const fouten: ImportFout[] = [];
  const gezien = new Set<string>();
  for (let i = 1; i < regels.length; i += 1) {
    const cellen = regels[i] ?? [];
    if (cellen.every((c) => schoon(c) === "")) continue;
    const w: Partial<Record<Veld, string>> = {};
    velden.forEach((v, j) => {
      if (v && !w[v]) w[v] = schoon(cellen[j] ?? "");
    });
    const naam = w.naam || schoon([w.voornaam, w.tussenvoegsel, w.achternaam].filter(Boolean).join(" "));
    const email = (w.email ?? "").toLowerCase();
    if (naam.length < 2) {
      fouten.push({ regel: i + 1, reden: "geen naam" });
      continue;
    }
    if (!EMAIL.test(email) || email.length > 200) {
      fouten.push({ regel: i + 1, reden: `${naam}: geen geldig e-mailadres` });
      continue;
    }
    if (gezien.has(email)) {
      fouten.push({ regel: i + 1, reden: `${naam}: dit e-mailadres staat er al in` });
      continue;
    }
    gezien.add(email);
    const adres = schoon([w.adres, [w.postcode, w.plaats].filter(Boolean).join(" ")].filter(Boolean).join(", "));
    rijen.push({ naam: naam.slice(0, 100), email, telefoon: nummer(w.telefoon ?? "").slice(0, 30), adres: adres.slice(0, 160) });
    if (rijen.length > IMPORT_MAX) {
      return { rijen: rijen.slice(0, IMPORT_MAX), fouten: [...fouten, { regel: i + 1, reden: `Er worden er maximaal ${IMPORT_MAX} tegelijk overgenomen. Doe de rest in een tweede ronde.` }], kolommen };
    }
  }
  return { rijen, fouten, kolommen };
}
