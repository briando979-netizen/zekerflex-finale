import type { Rijschool, RijschoolApp } from "@prisma/client";
import { playIngesteld, serviceAccountInfo } from "@/lib/play/account";
import { hoogsteVersie, testLink, winkelLink, type Release } from "@/lib/play/api";
import { bouwerIngesteld } from "@/lib/rijschool/app/bouwer";
import { groepLink, logboekVan, sporenVan, taakVan, voorstel, type LogRegel } from "@/lib/rijschool/app/store";
import { appStartPad, versieNaam } from "@/lib/rijschool/app/twa";
import { siteUrl } from "@/lib/rijschool/mail";

// Wat het tabblad App in het rijschool-beheer te zien krijgt. Nooit de sleutel.

export interface SpoorWeergave {
  spoor: "internal" | "alpha" | "production";
  titel: string;
  versie: string | null;
  stand: "leeg" | "concept" | "actief" | "uitrol" | "gepauzeerd" | "live";
  standTekst: string;
}

export interface AppWeergave {
  playIngesteld: boolean;
  bouwerIngesteld: boolean;
  serviceEmail: string | null;
  voorstel: ReturnType<typeof voorstel>;
  links: { privacy: string; app: string; icoon: string };
  app: null | {
    pakketnaam: string;
    pakketVast: boolean;
    appNaam: string;
    korteTekst: string;
    langeTekst: string;
    versie: string | null;
    testersGroep: string;
    gekoppeld: boolean;
    liveSinds: string | null;
    aabBeschikbaar: boolean;
    adresbalkWeg: boolean;
    taak: { fase: string; versie: string | null; naarSpoor: string | null; begon: string | null; voortgang: string[]; plaatsInRij: number; fout: string | null };
    sporen: SpoorWeergave[];
    gelezenOp: string | null;
    winkelLink: string;
    testLink: string;
    groepLink: string | null;
    logboek: LogRegel[];
  };
}

const TITELS = { internal: "Interne test", alpha: "Gesloten test", production: "Productie" } as const;

function spoorStand(spoor: SpoorWeergave["spoor"], releases: Release[], live: boolean): Pick<SpoorWeergave, "stand" | "standTekst"> {
  const r = releases[0];
  if (!r) return { stand: "leeg", standTekst: "Nog niet gestart" };
  if (r.status === "draft") return { stand: "concept", standTekst: "Concept: zet hem één keer live in Play Console" };
  if (r.status === "halted") return { stand: "gepauzeerd", standTekst: "Gepauzeerd" };
  if (r.status === "inProgress") return { stand: "uitrol", standTekst: `Wordt uitgerold (${Math.round((r.userFraction ?? 0) * 100)}%)` };
  if (spoor === "production") return live ? { stand: "live", standTekst: "Live in de Play Store" } : { stand: "actief", standTekst: "Ingediend: Google beoordeelt hem" };
  if (spoor === "alpha") return { stand: "actief", standTekst: "Ingediend: na goedkeuring kunnen testers hem installeren" };
  return { stand: "actief", standTekst: "Beschikbaar voor je interne testers" };
}

export async function appWeergave(r: Rijschool, a: RijschoolApp | null): Promise<AppWeergave> {
  const [ingesteld, sa] = await Promise.all([playIngesteld(), serviceAccountInfo()]);
  const basis = {
    playIngesteld: ingesteld,
    bouwerIngesteld: bouwerIngesteld(),
    serviceEmail: sa?.email ?? null,
    voorstel: voorstel(r),
    links: { privacy: siteUrl(r, "/privacy"), app: siteUrl(r, appStartPad(r.slug).slice(`/rijschool/${r.slug}`.length)), icoon: `/rijschool/${r.slug}/app-icoon.png` },
  };
  if (!a) return { ...basis, app: null };

  const t = taakVan(a);
  const s = sporenVan(a);
  const tracks = s.tracks ?? [];
  const sporen: SpoorWeergave[] = (["internal", "alpha", "production"] as const).map((spoor) => {
    const releases = tracks.find((tr) => tr.track === spoor)?.releases ?? [];
    const v = hoogsteVersie(tracks, spoor);
    return { spoor, titel: TITELS[spoor], versie: v ? versieNaam(v) : null, ...spoorStand(spoor, releases, s.inWinkel === true) };
  });
  return {
    ...basis,
    app: {
      pakketnaam: a.pakketnaam,
      pakketVast: !!a.gekoppeldOp,
      appNaam: a.appNaam,
      korteTekst: a.korteTekst,
      langeTekst: a.langeTekst,
      versie: a.versie ? versieNaam(a.versie) : null,
      testersGroep: a.testersGroep,
      gekoppeld: !!a.gekoppeldOp,
      liveSinds: a.liveSinds?.toISOString() ?? null,
      aabBeschikbaar: !!a.aabUploadId,
      adresbalkWeg: !!a.playVingerafdruk,
      taak: {
        fase: a.taakFase,
        versie: t.versie ? versieNaam(t.versie) : null,
        naarSpoor: t.spoor ?? null,
        begon: t.begon ?? null,
        voortgang: t.voortgang ?? [],
        plaatsInRij: t.plaatsInRij ?? 0,
        fout: t.fout ?? null,
      },
      sporen,
      gelezenOp: s.gelezenOp ?? null,
      winkelLink: winkelLink(a.pakketnaam),
      testLink: testLink(a.pakketnaam),
      groepLink: groepLink(a.testersGroep),
      logboek: logboekVan(a).slice(0, 25),
    },
  };
}
