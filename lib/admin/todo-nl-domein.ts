// Eigenaar-taak voor zekerflex.nl (28 nov 2026). Gemeten op die dag: zekerflex.nl en www.zekerflex.nl sturen de
// bezoeker door naar builder.vimexx.nl en geven daar een 401-pagina "Onbevoegd". Wie de Nederlandse naam intypt —
// en dat is wat een Nederlander doet als hij "ZekerFlex" hoort — komt dus op een foutmelding uit en niet op het
// platform. Het domein staat sinds 10 december 2025 op naam van de eigenaar (registrar ZXCS), dus het hoeft alleen
// nog naar onze server te wijzen.
//
// De taak vinkt zichzelf af: zodra zekerflex.nl dezelfde A-records heeft als zekerflex.com, wijst hij naar ons.
// Zo hoeft er geen IP-adres in de code te staan (dat verandert bij een verhuizing van de server).

import type { OwnerTodo } from "@/lib/admin/owner-todos";

export interface NlDomeinStand {
  /** de A-records van zekerflex.nl; leeg = geen A-record */
  nl: string[];
  /** de A-records van zekerflex.com (waar het platform staat) */
  com: string[];
}

/** Wijst het .nl-domein naar dezelfde server als het .com-domein? */
export function wijstNaarPlatform(stand: NlDomeinStand): boolean {
  if (stand.nl.length === 0 || stand.com.length === 0) return false;
  // één gedeeld adres is genoeg: de server kan meerdere adressen hebben
  return stand.nl.some((ip) => stand.com.includes(ip));
}

/**
 * De taak om zekerflex.nl naar het platform te laten wijzen.
 * `undefined` = de DNS was niet te lezen (dan geen taak, om niets vals te tonen).
 */
export function nlDomeinTodo(stand: NlDomeinStand | undefined): OwnerTodo | null {
  if (stand === undefined) return null;
  const goed = wijstNaarPlatform(stand);
  return {
    id: "nl-domein-naar-platform",
    group: "Vindbaarheid & app",
    title: goed ? "zekerflex.nl wijst naar het platform" : "zekerflex.nl komt op een foutmelding uit",
    why: goed
      ? "zekerflex.nl staat op dezelfde server als zekerflex.com, dus wie de Nederlandse naam intypt komt gewoon op het platform."
      : "Gemeten op 28 november 2026: typ je zekerflex.nl of www.zekerflex.nl in, dan word je doorgestuurd naar builder.vimexx.nl en zie je de foutmelding \"Onbevoegd\". Het platform staat op zekerflex.com. ZekerFlex is een Nederlands platform, dus .nl is precies wat iemand intypt die de naam hoort in een gesprek, een video of een advertentie. Die mensen zijn nu weg, en we zien dat nergens terug in onze cijfers: ze komen nooit op onze server aan. Het domein staat al op jouw naam (sinds 10 december 2025, bij ZXCS), dus er hoeft niets gekocht te worden.",
    how: goed
      ? ["Niets meer te doen. Deze taak vinkt zichzelf af zolang het zo blijft staan."]
      : [
          "Stap 1. Log in bij ZXCS (daar staat zekerflex.nl) en zoek het onderdeel DNS of Domeinnamen → zekerflex.nl → DNS-instellingen.",
          "Stap 2. Haal de verwijzing naar de websitebouwer van Vimexx weg: de regel(s) die zekerflex.nl en www.zekerflex.nl naar Vimexx sturen (soort A, AAAA of CNAME).",
          "Stap 3. Zet er twee A-regels voor terug, beide met als waarde 37.97.226.24 (onze eigen server): één met naam @ (of leeg, dat is zekerflex.nl zelf) en één met naam www.",
          "Stap 4. Laat het mij weten zodra dat gedaan is. Ik zet zekerflex.nl dan in één minuut bij in de serverinstelling, zodat het beveiligingscertificaat wordt aangevraagd en .nl netjes doorstuurt naar .com. Dat moet in die volgorde: zet ik het er eerder bij, dan mislukt de certificaataanvraag omdat het domein nog niet naar ons wijst.",
          "Let op de verlenging: zekerflex.nl is op 10 december 2025 geregistreerd, dus de rekening van ZXCS komt rond 10 december. Laat hem niet verlopen — een vrijgevallen .nl met jouw merknaam kan iemand anders overnemen.",
          "Deze taak vinkt zichzelf af zodra zekerflex.nl naar dezelfde server wijst als zekerflex.com.",
        ],
    auto: true,
    done: goed,
    ...(goed ? { doneNote: `zekerflex.nl wijst naar ${stand.nl.filter((ip) => stand.com.includes(ip)).join(", ")}` } : {}),
  };
}
