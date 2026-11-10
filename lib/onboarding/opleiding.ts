// ---------------------------------------------------------------------------
// Opleidingsniveau en studierichting van een werker (stap "Wie ben jij?").
// Optioneel en nooit een eis voor de poort of het reageren; het helpt alleen bij
// het profiel. Puur bestand (ook in de browser): de lijsten, de zoekfunctie en de
// controle van wat de server bewaart (KV "werker-opleiding:<userId>").
// ---------------------------------------------------------------------------

import type { Locale } from "@/lib/i18n/config";

export const OPLEIDING_NIVEAUS = ["middelbaar", "mbo", "hbo", "universiteit"] as const;
export type OpleidingNiveau = (typeof OPLEIDING_NIVEAUS)[number];

/** Bij welke niveaus hoort een studierichting? Bij middelbare school niet. */
export function heeftRichting(niveau: OpleidingNiveau | null | undefined): boolean {
  return niveau === "mbo" || niveau === "hbo" || niveau === "universiteit";
}

export const OPLEIDING_RICHTINGEN = [
  "gedrag", "economie", "communicatie", "financieel", "gezondheid", "horeca", "informatica", "recht",
  "landbouw", "techniek", "onderwijs", "taal", "logistiek", "zorg", "veiligheid", "overig",
] as const;
export type OpleidingRichting = (typeof OPLEIDING_RICHTINGEN)[number];

export interface Opleiding {
  niveau: OpleidingNiveau;
  richting?: OpleidingRichting;
}

export const NIVEAU_LABELS: Record<Locale, Record<OpleidingNiveau, string>> = {
  nl: { middelbaar: "Middelbare school", mbo: "MBO", hbo: "HBO", universiteit: "Universiteit" },
  en: { middelbaar: "Secondary school", mbo: "Vocational (MBO)", hbo: "University of applied sciences (HBO)", universiteit: "University" },
  pl: { middelbaar: "Szkoła średnia", mbo: "Szkoła zawodowa (MBO)", hbo: "Wyższa szkoła zawodowa (HBO)", universiteit: "Uniwersytet" },
  ro: { middelbaar: "Liceu", mbo: "Școală profesională (MBO)", hbo: "Universitate de științe aplicate (HBO)", universiteit: "Universitate" },
  uk: { middelbaar: "Середня школа", mbo: "Професійне училище (MBO)", hbo: "Прикладний університет (HBO)", universiteit: "Університет" },
};

export const RICHTING_LABELS: Record<Locale, Record<OpleidingRichting, string>> = {
  nl: {
    gedrag: "Gedrag en Maatschappij",
    economie: "Economie, Bedrijfskunde en Management",
    communicatie: "Communicatie, Marketing en Personeel",
    financieel: "Financieel en Accountancy",
    gezondheid: "Gezondheidszorg, Sport en Beweging",
    horeca: "Horeca, Toerisme en Facilitair",
    informatica: "Informatica en Grafische vormgeving",
    recht: "Recht en Bestuur",
    landbouw: "Landbouw en Natuurlijke omgeving",
    techniek: "Techniek en Bouw",
    onderwijs: "Onderwijs en Opvoeding",
    taal: "Taal en Cultuur",
    logistiek: "Logistiek en Transport",
    zorg: "Zorg en Welzijn",
    veiligheid: "Veiligheid",
    overig: "Overig",
  },
  en: {
    gedrag: "Behaviour and Society",
    economie: "Economics, Business Administration and Management",
    communicatie: "Communication, Marketing and HR",
    financieel: "Finance and Accountancy",
    gezondheid: "Healthcare, Sport and Exercise",
    horeca: "Hospitality, Tourism and Facility",
    informatica: "IT and Graphic Design",
    recht: "Law and Public Administration",
    landbouw: "Agriculture and the Natural Environment",
    techniek: "Technology and Construction",
    onderwijs: "Education and Pedagogy",
    taal: "Language and Culture",
    logistiek: "Logistics and Transport",
    zorg: "Care and Welfare",
    veiligheid: "Safety and Security",
    overig: "Other",
  },
  pl: {
    gedrag: "Zachowanie i społeczeństwo",
    economie: "Ekonomia, zarządzanie i administracja biznesowa",
    communicatie: "Komunikacja, marketing i kadry",
    financieel: "Finanse i księgowość",
    gezondheid: "Opieka zdrowotna, sport i ruch",
    horeca: "Gastronomia, turystyka i obsługa obiektów",
    informatica: "Informatyka i grafika",
    recht: "Prawo i administracja publiczna",
    landbouw: "Rolnictwo i środowisko naturalne",
    techniek: "Technika i budownictwo",
    onderwijs: "Edukacja i wychowanie",
    taal: "Język i kultura",
    logistiek: "Logistyka i transport",
    zorg: "Opieka i pomoc społeczna",
    veiligheid: "Bezpieczeństwo",
    overig: "Inne",
  },
  ro: {
    gedrag: "Comportament și societate",
    economie: "Economie, administrarea afacerilor și management",
    communicatie: "Comunicare, marketing și resurse umane",
    financieel: "Finanțe și contabilitate",
    gezondheid: "Sănătate, sport și mișcare",
    horeca: "Horeca, turism și servicii de facilități",
    informatica: "Informatică și design grafic",
    recht: "Drept și administrație publică",
    landbouw: "Agricultură și mediu natural",
    techniek: "Tehnică și construcții",
    onderwijs: "Educație și pedagogie",
    taal: "Limbă și cultură",
    logistiek: "Logistică și transport",
    zorg: "Îngrijire și asistență socială",
    veiligheid: "Securitate",
    overig: "Altele",
  },
  uk: {
    gedrag: "Поведінка та суспільство",
    economie: "Економіка, бізнес-адміністрування та менеджмент",
    communicatie: "Комунікація, маркетинг і персонал",
    financieel: "Фінанси та бухгалтерія",
    gezondheid: "Охорона здоров'я, спорт і рух",
    horeca: "Готельно-ресторанна справа, туризм і сервіс",
    informatica: "Інформатика та графічний дизайн",
    recht: "Право та державне управління",
    landbouw: "Сільське господарство та природне середовище",
    techniek: "Техніка та будівництво",
    onderwijs: "Освіта та виховання",
    taal: "Мова та культура",
    logistiek: "Логістика та транспорт",
    zorg: "Догляд і соціальна допомога",
    veiligheid: "Безпека",
    overig: "Інше",
  },
};

export function isNiveau(v: unknown): v is OpleidingNiveau {
  return typeof v === "string" && Object.hasOwn(NIVEAU_LABELS.nl, v);
}

export function isRichting(v: unknown): v is OpleidingRichting {
  return typeof v === "string" && Object.hasOwn(RICHTING_LABELS.nl, v);
}

/** Wat een client of de KV levert, schoon gemaakt: een onbekend niveau geeft null; een richting alleen bij MBO/HBO/Universiteit. */
export function schoonOpleiding(v: unknown): Opleiding | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { niveau?: unknown; richting?: unknown };
  if (!isNiveau(o.niveau)) return null;
  return heeftRichting(o.niveau) && isRichting(o.richting) ? { niveau: o.niveau, richting: o.richting } : { niveau: o.niveau };
}

const kaal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** De richtingen die bij de zoekterm passen (op de tekst in die taal, zonder accenten en hoofdletters); leeg zoekveld geeft alles. */
export function filterRichtingen(zoek: string, locale: Locale): OpleidingRichting[] {
  const q = kaal(zoek);
  const labels = RICHTING_LABELS[locale];
  return OPLEIDING_RICHTINGEN.filter((r) => !q || kaal(labels[r]).includes(q));
}
