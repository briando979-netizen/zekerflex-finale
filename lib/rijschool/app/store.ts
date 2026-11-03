import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { Prisma, type Rijschool, type RijschoolApp } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { deleteUpload, storeUpload } from "@/lib/storage/local";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { hashWachtwoord } from "@/lib/rijschool/accounts";
import { siteUrl, testAppMail, verstuur } from "@/lib/rijschool/mail";
import { serviceAccountInfo } from "@/lib/play/account";
import {
  hoogsteVersie,
  inWinkel,
  metEdit,
  ondertekenVingerafdruk,
  PlayFout,
  sporen as leesSporen,
  testLink,
  uploadBundel,
  vervangAfbeeldingen,
  winkelLink,
  zetDetails,
  zetSpoor,
  zetTesters,
  zetVermelding,
  type Release,
  type Spoor,
  type Track,
} from "@/lib/play/api";
import { alsAppFout } from "@/lib/play/uitleg";
import { bouwStand, haalAab, startBouw } from "@/lib/rijschool/app/bouwer";
import {
  bouwManifest,
  functieafbeeldingSvg,
  icoonSvg,
  isPakketnaam,
  standaardKorteTekst,
  standaardLangeTekst,
  versieNaam,
  voorgesteldePakketnaam,
} from "@/lib/rijschool/app/twa";

// ---------------------------------------------------------------------------
// De Android-app van een rijschool in haar eigen Google Play-account.
//
//  1. ZekerFlex bouwt de app (deploy/android-bouwer). De eerste versie uploadt
//     de rijschool zelf in Play Console: Google kent de pakketnaam pas daarna.
//  2. De rijschool nodigt het serviceaccount van ZekerFlex uit; "Controleer
//     koppeling" leest de app dan via de Google Play-API.
//  3. Vanaf dan gaat alles hier: nieuwe versies naar de interne test, indienen
//     voor de gesloten test en productie, testers, winkelpagina, en de link
//     naar de Play Store zodra de app openbaar is.
//
// Een bouw loopt op de achtergrond: taakFase "bouwt" → (claim) "verwerkt" → "".
// `verder` doet één stap en mag vaker lopen (lus na het starten én elke keer dat
// het beheer de stand opvraagt); de claim voorkomt dubbel uploaden.
// ---------------------------------------------------------------------------

const SLEUTEL_DOEL = "rijschool-app-sleutel";
const TAAL = "nl-NL";
const TAAK_VERLOOPT_MS = 45 * 60_000;

export type Taak = {
  bouwId?: string;
  spoor?: Spoor | null;
  versie?: number;
  begon?: string;
  door?: string;
  nieuwWw?: string; // verzegeld wachtwoord voor een nieuwe uploadsleutel
  voortgang?: string[];
  plaatsInRij?: number;
  fout?: string;
};

export type SporenStand = { gelezenOp?: string; tracks?: Track[]; inWinkel?: boolean | null };
export type LogRegel = { at: string; tekst: string; soort: "ok" | "fout" | "info" };

export const taakVan = (a: RijschoolApp) => (a.taak ?? {}) as Taak;
export const sporenVan = (a: RijschoolApp) => (a.sporen ?? {}) as SporenStand;
export const logboekVan = (a: RijschoolApp) => (Array.isArray(a.logboek) ? (a.logboek as LogRegel[]) : []);

const json = (v: unknown) => v as Prisma.InputJsonValue;
const host = () => new URL(env.APP_BASE_URL).host;

export async function appVan(r: Pick<Rijschool, "id">): Promise<RijschoolApp | null> {
  return prisma.rijschoolApp.findUnique({ where: { rijschoolId: r.id } });
}

async function eisApp(r: Pick<Rijschool, "id">): Promise<RijschoolApp> {
  const a = await appVan(r);
  if (!a) throw AppError.precondition("Vul eerst de gegevens van je app in.");
  return a;
}

function metLog(a: RijschoolApp, tekst: string, soort: LogRegel["soort"] = "info") {
  return json([{ at: new Date().toISOString(), tekst, soort }, ...logboekVan(a)].slice(0, 60));
}

async function log(id: string, tekst: string, soort: LogRegel["soort"] = "info"): Promise<void> {
  const a = await prisma.rijschoolApp.findUnique({ where: { id } });
  if (a) await prisma.rijschoolApp.update({ where: { id }, data: { logboek: metLog(a, tekst, soort) } });
}

export function voorstel(r: Pick<Rijschool, "slug" | "email" | "naam" | "plaats">) {
  return {
    pakketnaam: voorgesteldePakketnaam(r),
    appNaam: r.naam.slice(0, 30),
    korteTekst: standaardKorteTekst(r.naam),
    langeTekst: standaardLangeTekst(r.naam, r.plaats),
  };
}

// ---- gegevens ----------------------------------------------------------------------

export async function instellen(
  r: Rijschool,
  data: { appNaam: string; korteTekst: string; langeTekst: string; pakketnaam: string },
): Promise<RijschoolApp> {
  const pakket = data.pakketnaam.trim().toLowerCase();
  if (!isPakketnaam(pakket)) throw AppError.validation("Die pakketnaam kan niet. Gebruik kleine letters en punten, bijvoorbeeld nl.rijschooljansen.app.");
  const bestaand = await appVan(r);
  if (bestaand?.gekoppeldOp && bestaand.pakketnaam !== pakket) {
    throw AppError.conflict("De pakketnaam ligt vast: je app staat al in Google Play onder deze naam.");
  }
  const velden = { appNaam: data.appNaam.trim(), korteTekst: data.korteTekst.trim(), langeTekst: data.langeTekst.trim(), pakketnaam: pakket };
  try {
    if (bestaand) {
      // een andere pakketnaam vraagt een nieuwe bouw: de oude .aab hoort bij de oude naam
      const anders = bestaand.pakketnaam !== pakket;
      return await prisma.rijschoolApp.update({
        where: { id: bestaand.id },
        data: { ...velden, ...(anders ? { aabUploadId: null } : {}), logboek: metLog(bestaand, anders ? `Pakketnaam gewijzigd naar ${pakket}` : "Gegevens van de app bijgewerkt") },
      });
    }
    return await prisma.rijschoolApp.create({
      data: { ...velden, rijschoolId: r.id, logboek: json([{ at: new Date().toISOString(), tekst: "App aangemaakt", soort: "info" }]) },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw AppError.conflict("Deze pakketnaam is al in gebruik. Kies een andere.");
    throw err;
  }
}

// ---- iconen ------------------------------------------------------------------------

export async function icoonPng(r: Pick<Rijschool, "kleur" | "accent">, grootte = 512): Promise<Buffer> {
  return sharp(Buffer.from(icoonSvg(r.kleur, r.accent, grootte))).png().toBuffer();
}

async function functieafbeeldingPng(r: Pick<Rijschool, "kleur" | "accent">): Promise<Buffer> {
  return sharp(Buffer.from(functieafbeeldingSvg(r.kleur, r.accent))).png().toBuffer();
}

// ---- bouwen ------------------------------------------------------------------------

const bezig = (a: RijschoolApp) => (a.taakFase === "bouwt" || a.taakFase === "verwerkt") && Date.now() - Date.parse(taakVan(a).begon ?? "") < TAAK_VERLOOPT_MS;

/** Start een bouw. Met `spoor` gaat de nieuwe versie daarna meteen naar Google Play. */
export async function bouwApp(r: Rijschool, spoor: Spoor | null, door: string): Promise<RijschoolApp> {
  const a = await eisApp(r);
  if (bezig(a)) throw AppError.conflict("Er loopt al een bouw. Even geduld.");
  if (spoor && !a.gekoppeldOp) throw AppError.precondition("Koppel eerst je app in Google Play (stap 4); daarna kan ZekerFlex nieuwe versies uploaden.");

  const versie = Math.max(a.versie, hoogsteVersie(sporenVan(a).tracks ?? [])) + 1;
  let sleutel: { wachtwoord: string; keystore?: string };
  let nieuwWw: string | undefined;
  if (a.sleutel) {
    sleutel = JSON.parse(openSecret(a.sleutel, SLEUTEL_DOEL)) as { wachtwoord: string; keystore: string };
  } else {
    sleutel = { wachtwoord: randomBytes(24).toString("base64url") };
    nieuwWw = sealSecret(sleutel.wachtwoord, SLEUTEL_DOEL);
  }
  const icoon = (await icoonPng(r)).toString("base64");
  const bouwId = await startBouw({ manifest: bouwManifest(r, a, host(), versie), icoon, maskeerbaar: icoon, sleutel });
  const taak: Taak = { bouwId, spoor, versie, begon: new Date().toISOString(), door, ...(nieuwWw ? { nieuwWw } : {}) };
  const bij = await prisma.rijschoolApp.update({
    where: { id: a.id },
    data: { taakFase: "bouwt", taak: json(taak), logboek: metLog(a, `Bouw gestart: versie ${versieNaam(versie)}${spoor ? ` (daarna naar ${SPOOR_LABEL[spoor]})` : ""}`) },
  });
  volg(a.id);
  return bij;
}

/** Volgt een bouw op de achtergrond tot hij klaar is (hooguit één lus per app per proces). */
function volg(id: string): void {
  const g = globalThis as typeof globalThis & { __zfAppBouw?: Set<string> };
  g.__zfAppBouw ??= new Set();
  const lopend = g.__zfAppBouw;
  if (lopend.has(id)) return;
  lopend.add(id);
  void (async () => {
    try {
      const eind = Date.now() + TAAK_VERLOOPT_MS;
      while (Date.now() < eind) {
        await new Promise((r) => setTimeout(r, 5_000));
        const fase = await verder(id);
        if (fase !== "bouwt") return;
      }
    } catch (err) {
      logger.warn("rijschool-app: volgen mislukt", { id, error: err instanceof Error ? err.message : String(err) });
    } finally {
      lopend.delete(id);
    }
  })();
}

/** Eén stap: stand ophalen; is de bouw klaar, dan het resultaat verwerken (één keer, door de claim). */
export async function verder(id: string): Promise<string> {
  const a = await prisma.rijschoolApp.findUnique({ where: { id }, include: { rijschool: true } });
  if (!a) return "";
  if (a.taakFase !== "bouwt") return a.taakFase;
  const t = taakVan(a);
  if (Date.now() - Date.parse(t.begon ?? "") > TAAK_VERLOOPT_MS) {
    await fout(a, "De bouw duurde te lang en is gestopt. Probeer het opnieuw.");
    return "fout";
  }
  const stand = t.bouwId ? await bouwStand(t.bouwId).catch(() => undefined) : null;
  if (stand === undefined) return "bouwt"; // bouwer even niet bereikbaar: volgende keer
  if (!stand) {
    await fout(a, "De Android-bouwer kent deze bouw niet meer (herstart?). Probeer het opnieuw.");
    return "fout";
  }
  if (stand.staat === "wacht" || stand.staat === "bezig") {
    await prisma.rijschoolApp.updateMany({
      where: { id, taakFase: "bouwt" },
      data: { taak: json({ ...t, voortgang: stand.log.slice(-6), plaatsInRij: stand.plaatsInRij ?? 0 }) },
    });
    return "bouwt";
  }
  if (stand.staat === "mislukt") {
    await fout(a, stand.fout ?? "De bouw is mislukt.");
    return "fout";
  }

  // klaar: claimen, zodat het resultaat maar één keer wordt verwerkt
  const claim = await prisma.rijschoolApp.updateMany({ where: { id, taakFase: "bouwt" }, data: { taakFase: "verwerkt" } });
  if (claim.count === 0) return "verwerkt";
  try {
    let sleutel = a.sleutel;
    if (t.nieuwWw) {
      if (!stand.resultaat?.nieuweSleutel) throw new Error("De nieuwe uploadsleutel kwam niet terug van de bouwer. Probeer het opnieuw.");
      sleutel = sealSecret(JSON.stringify({ wachtwoord: openSecret(t.nieuwWw, SLEUTEL_DOEL), keystore: stand.resultaat.nieuweSleutel }), SLEUTEL_DOEL);
    }
    const versie = t.versie ?? a.versie + 1;
    const aab = await haalAab(t.bouwId ?? "");
    const upload = await storeUpload({ filename: `${a.pakketnaam}-${versieNaam(versie)}.aab`, mimeType: "application/octet-stream", bytes: aab });
    if (a.aabUploadId) await deleteUpload(a.aabUploadId).catch(() => undefined);
    await prisma.rijschoolApp.update({
      where: { id },
      data: { sleutel, uploadVingerafdruk: stand.resultaat?.vingerafdruk ?? a.uploadVingerafdruk, aabUploadId: upload.id, versie },
    });
    await log(id, `Versie ${versieNaam(versie)} gebouwd (${((stand.resultaat?.grootte ?? aab.length) / 1_000_000).toFixed(1)} MB)`, "ok");

    if (t.spoor) {
      const concept = await naarPlay(a.pakketnaam, aab, versie, t.spoor);
      await log(
        id,
        concept
          ? `Versie ${versieNaam(versie)} staat als concept in ${SPOOR_LABEL[t.spoor]}. Zet hem één keer live in Play Console.`
          : `Versie ${versieNaam(versie)} staat in ${SPOOR_LABEL[t.spoor]}`,
        "ok",
      );
      await vernieuwStand(a.rijschool).catch(() => undefined);
    }
    await prisma.rijschoolApp.update({ where: { id }, data: { taakFase: "", taak: json({}) } });
    return "";
  } catch (err) {
    const tekst = await foutTekst(err, a.pakketnaam);
    const bij = await prisma.rijschoolApp.findUniqueOrThrow({ where: { id } });
    await fout(bij, tekst);
    return "fout";
  }
}

async function fout(a: RijschoolApp, tekst: string): Promise<void> {
  await prisma.rijschoolApp.update({
    where: { id: a.id },
    data: { taakFase: "fout", taak: json({ ...taakVan(a), fout: tekst }), logboek: metLog(a, tekst, "fout") },
  });
}

async function foutTekst(err: unknown, pakket: string): Promise<string> {
  const e = alsAppFout(err, { pakket, serviceEmail: (await serviceAccountInfo())?.email ?? null });
  return e instanceof Error ? e.message : String(e);
}

const release = (versie: number, status: Release["status"]): Release => ({
  name: versieNaam(versie),
  versionCodes: [String(versie)],
  status,
  releaseNotes: [{ language: TAAL, text: `Versie ${versieNaam(versie)}` }],
});

/** Uploadt een versie en zet hem in een spoor. true = alleen als concept gelukt (app nog nooit gepubliceerd). */
async function naarPlay(pakket: string, aab: Buffer, versie: number, spoor: Spoor): Promise<boolean> {
  const upload = async (status: Release["status"]) =>
    metEdit(pakket, async (e) => {
      await uploadBundel(e, aab);
      await zetSpoor(e, spoor, [release(versie, status)]);
      return {};
    });
  try {
    await upload("completed");
    return false;
  } catch (err) {
    if (err instanceof PlayFout && /status draft may be created on draft app/i.test(err.message)) {
      await upload("draft");
      return true;
    }
    throw err;
  }
}

// ---- Google Play -------------------------------------------------------------------

export const SPOOR_LABEL: Record<Spoor, string> = { internal: "de interne test", alpha: "de gesloten test", beta: "de open test", production: "productie" };

/** Leest de stand uit Google Play (sporen, openbaar in de winkel, ondertekensleutel). Gooit bij geen toegang. */
export async function vernieuwStand(r: Rijschool): Promise<RijschoolApp> {
  const a = await eisApp(r);
  let tracks: Track[];
  try {
    tracks = (await metEdit(a.pakketnaam, async (e) => ({ tracks: await leesSporen(e) }), false)).tracks;
  } catch (err) {
    throw alsAppFout(err, { pakket: a.pakketnaam, serviceEmail: (await serviceAccountInfo())?.email ?? null });
  }
  const winkel = await inWinkel(a.pakketnaam);
  let playVingerafdruk = a.playVingerafdruk;
  const vc = hoogsteVersie(tracks);
  if (!playVingerafdruk && vc) playVingerafdruk = await ondertekenVingerafdruk(a.pakketnaam, vc).catch(() => null);
  const eersteKeer = !a.gekoppeldOp;
  const nuLive = winkel === true && !a.liveSinds;
  let logboek = logboekVan(a);
  const nu = new Date().toISOString();
  if (eersteKeer) logboek = [{ at: nu, tekst: "Gekoppeld met Google Play", soort: "ok" }, ...logboek];
  if (nuLive) logboek = [{ at: nu, tekst: "Je app staat openbaar in de Play Store", soort: "ok" }, ...logboek];
  if (!a.playVingerafdruk && playVingerafdruk) logboek = [{ at: nu, tekst: "Ondertekensleutel van Google opgehaald: de app opent zonder adresbalk", soort: "ok" }, ...logboek];
  return prisma.rijschoolApp.update({
    where: { id: a.id },
    data: {
      gekoppeldOp: a.gekoppeldOp ?? new Date(),
      sporen: json({ gelezenOp: nu, tracks, inWinkel: winkel } satisfies SporenStand),
      playVingerafdruk,
      ...(nuLive ? { liveSinds: new Date() } : {}),
      ...(winkel === false && a.liveSinds ? { liveSinds: null } : {}),
      // een fout van een vorige poging blijft niet hangen als het nu wel lukt
      ...(a.taakFase === "fout" ? { taakFase: "", taak: json({}) } : {}),
      logboek: json(logboek.slice(0, 60)),
    },
  });
}

/** Ververst de stand stil als hij ouder is dan een paar minuten (bij het openen van het beheer). */
export async function vernieuwAlsOud(r: Rijschool, a: RijschoolApp): Promise<RijschoolApp> {
  const gelezen = Date.parse(sporenVan(a).gelezenOp ?? "");
  if (!a.gekoppeldOp || (Number.isFinite(gelezen) && Date.now() - gelezen < 3 * 60_000)) return a;
  return vernieuwStand(r).catch(() => a);
}

async function playActie<T>(a: RijschoolApp, werk: () => Promise<T>): Promise<T> {
  try {
    return await werk();
  } catch (err) {
    const tekst = await foutTekst(err, a.pakketnaam);
    await log(a.id, tekst, "fout");
    throw err instanceof PlayFout ? AppError.upstream(tekst) : err;
  }
}

/** Dient de nieuwste versie in voor de gesloten test of productie (Google beoordeelt hem). */
export async function indienen(r: Rijschool, naar: "alpha" | "production"): Promise<{ handmatigVersturen: boolean }> {
  const a = await eisApp(r);
  if (!a.gekoppeldOp) throw AppError.precondition("Koppel eerst je app in Google Play (stap 4).");
  const uitkomst = await playActie(a, () =>
    metEdit(a.pakketnaam, async (e) => {
      const tracks = await leesSporen(e);
      const bron = naar === "alpha" ? hoogsteVersie(tracks, "internal") || hoogsteVersie(tracks) : hoogsteVersie(tracks, "alpha") || hoogsteVersie(tracks, "internal");
      if (!bron) throw AppError.precondition(naar === "alpha" ? "Er staat nog geen versie in de interne test." : "Er staat nog geen versie in de gesloten of interne test.");
      await zetSpoor(e, naar, [{ name: versieNaam(bron), versionCodes: [String(bron)], status: "completed", releaseNotes: [{ language: TAAL, text: `Versie ${versieNaam(bron)}` }] }]);
      return { bron };
    }),
  );
  await log(
    a.id,
    `Versie ${versieNaam(uitkomst.bron)} ingediend voor ${SPOOR_LABEL[naar]}.${uitkomst.handmatigVersturen ? " Druk in Play Console nog op 'Ter beoordeling verzenden'." : " Google beoordeelt hem nu."}`,
    "ok",
  );
  await vernieuwStand(r).catch(() => undefined);
  return { handmatigVersturen: uitkomst.handmatigVersturen };
}

/** Zet de teksten, het icoon en de functieafbeelding op de winkelpagina. */
export async function winkelpagina(r: Rijschool): Promise<void> {
  const a = await eisApp(r);
  if (!a.gekoppeldOp) throw AppError.precondition("Koppel eerst je app in Google Play (stap 4).");
  const [icoon, functie] = await Promise.all([icoonPng(r), functieafbeeldingPng(r)]);
  await playActie(a, () =>
    metEdit(a.pakketnaam, async (e) => {
      await zetDetails(e, { contactWebsite: siteUrl(r), ...(r.email ? { contactEmail: r.email } : {}) });
      await zetVermelding(e, TAAL, {
        title: a.appNaam.slice(0, 30),
        shortDescription: (a.korteTekst || standaardKorteTekst(r.naam)).slice(0, 80),
        fullDescription: (a.langeTekst || standaardLangeTekst(r.naam, r.plaats)).slice(0, 4000),
      });
      await vervangAfbeeldingen(e, TAAL, "icon", [icoon]);
      await vervangAfbeeldingen(e, TAAL, "featureGraphic", [functie]);
      return {};
    }),
  );
  await log(a.id, "Winkelpagina bijgewerkt: teksten, icoon en functieafbeelding", "ok");
}

/** Schermafbeeldingen van de telefoon, passend gemaakt voor Google (hooguit 2:1, 1080×1920). */
export async function schermafbeeldingen(r: Rijschool, beelden: Buffer[]): Promise<number> {
  const a = await eisApp(r);
  if (!a.gekoppeldOp) throw AppError.precondition("Koppel eerst je app in Google Play (stap 4).");
  const pngs = await Promise.all(
    beelden.map(async (b) => {
      try {
        return await sharp(b).rotate().resize(1080, 1920, { fit: "contain", background: "#FFFFFF" }).png().toBuffer();
      } catch {
        throw AppError.validation("Een van de bestanden is geen afbeelding.");
      }
    }),
  );
  await playActie(a, () =>
    metEdit(a.pakketnaam, async (e) => {
      await vervangAfbeeldingen(e, TAAL, "phoneScreenshots", pngs);
      return {};
    }),
  );
  await log(a.id, `${pngs.length} schermafbeeldingen op de winkelpagina gezet`, "ok");
  return pngs.length;
}

/** De Google Group met testers voor de gesloten test. */
export async function testersGroep(r: Rijschool, groep: string): Promise<void> {
  const a = await eisApp(r);
  const g = groep.trim().toLowerCase();
  if (g && !/^[a-z0-9._%+-]+@(googlegroups\.com|[a-z0-9.-]+\.[a-z]{2,})$/.test(g)) throw AppError.validation("Vul het e-mailadres van een Google Group in, bijvoorbeeld testers-rijschool@googlegroups.com.");
  if (a.gekoppeldOp) {
    await playActie(a, () =>
      metEdit(a.pakketnaam, async (e) => {
        await zetTesters(e, "alpha", g ? [g] : []);
        return {};
      }),
    );
  }
  await prisma.rijschoolApp.update({
    where: { id: a.id },
    data: { testersGroep: g, logboek: metLog(a, g ? `Testersgroep ingesteld: ${g}` : "Testersgroep weggehaald", "ok") },
  });
}

export const groepLink = (groep: string) => {
  const [naam, domein] = groep.split("@");
  return naam && domein === "googlegroups.com" ? `https://groups.google.com/g/${encodeURIComponent(naam)}` : null;
};

/** Mailt leerlingen (actief) en instructeurs hoe ze de app testen. Eén keer per dag. */
export async function mailTesters(r: Rijschool): Promise<number> {
  const a = await eisApp(r);
  if (!a.gekoppeldOp) throw AppError.precondition("Koppel eerst je app in Google Play (stap 4).");
  const dag = new Date().toISOString().slice(0, 10);
  const claim = `rijschool-app-testmail:${a.id}:${dag}`;
  if (await kvGet(claim)) throw AppError.conflict("De testlink is vandaag al gemaild. Morgen kan het weer.");
  const [leerlingen, instructeurs] = await Promise.all([
    prisma.rijschoolLeerling.findMany({ where: { rijschoolId: r.id, status: "ACTIEF" }, select: { naam: true, email: true }, take: 300 }),
    prisma.rijschoolInstructeur.findMany({ where: { rijschoolId: r.id, actief: true }, select: { naam: true, email: true } }),
  ]);
  const gezien = new Set<string>();
  const ontvangers = [...instructeurs, ...leerlingen].filter((o) => {
    const e = o.email.trim().toLowerCase();
    if (!e || gezien.has(e) || e.endsWith("@zekerflex.com")) return false;
    gezien.add(e);
    return true;
  });
  if (ontvangers.length === 0) throw AppError.precondition("Er zijn nog geen actieve leerlingen of instructeurs met een e-mailadres.");
  await kvSet(claim, { at: new Date().toISOString(), aantal: ontvangers.length });
  const links = { groep: groepLink(a.testersGroep), aanmelden: testLink(a.pakketnaam), winkel: winkelLink(a.pakketnaam) };
  let verstuurd = 0;
  for (const o of ontvangers) if (await verstuur(testAppMail(r, o, links))) verstuurd++;
  await log(a.id, `Testlink gemaild naar ${verstuurd} van ${ontvangers.length} mensen`, verstuurd ? "ok" : "fout");
  return verstuurd;
}

/** Een testaccount voor de beoordelaar van Google (Play Console → App-toegang). Het wachtwoord zie je één keer. */
export async function beoordelaarAccount(r: Rijschool): Promise<{ email: string; wachtwoord: string }> {
  const email = "google-play-beoordeling@zekerflex.com";
  const wachtwoord = randomBytes(9).toString("base64url");
  const wachtwoordHash = await hashWachtwoord(wachtwoord);
  await prisma.rijschoolLeerling.upsert({
    where: { rijschoolId_email: { rijschoolId: r.id, email } },
    create: { rijschoolId: r.id, email, naam: "Beoordelaar Google Play", status: "ACTIEF", wachtwoordHash, notitie: "Testaccount voor de beoordeling door Google Play." },
    update: { wachtwoordHash, status: "ACTIEF" },
  });
  const a = await appVan(r);
  if (a) await log(a.id, "Testaccount voor de beoordelaar van Google gemaakt", "info");
  return { email, wachtwoord };
}
