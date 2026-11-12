// ---------------------------------------------------------------------------
// Bank: gegevens voor het tabblad Bank (datalaag, met prisma). Het eigen IBAN en het IBAN van tegenpartijen gaan
// gemaskeerd naar het scherm (laatste vier tekens). Persoonsgegevens (naam) zijn alleen voor de ingelogde platformbeheerder.
// ---------------------------------------------------------------------------

import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { bedragTekst, dagTekst } from "../scherm-kern";
import { dagVanDatumKolom } from "../lezen-kern";
import { REKENING_BANK } from "../bonnen/boeking";
import { kandidaatTitel, bankTodo, MAX_TRANSACTIES_IN_LIJST, type BankOverzicht, type BankRekeningRij, type KandidaatRij, type TransactieRij } from "./scherm-kern";
import { eisGeldigIban, maskeerIban, schoonTekst } from "./tekst";
import { leesVoorstel } from "./voorstel";

function rekeningRij(r: {
  id: string;
  administratieId: string;
  iban: string;
  naam: string;
  valuta: string;
  actief: boolean;
  rekening: { nummer: string };
  _count: { afschriften: number };
}, laatste: Date | null): BankRekeningRij {
  return {
    id: r.id,
    administratieId: r.administratieId,
    naam: r.naam,
    ibanGemaskeerd: maskeerIban(r.iban),
    valuta: r.valuta,
    grootboekNummer: r.rekening.nummer,
    actief: r.actief,
    aantalAfschriften: r._count.afschriften,
    laatsteBoekdag: laatste ? dagVanDatumKolom(laatste) : null,
  };
}

export async function lijstBankRekeningen(administratieId: string): Promise<BankRekeningRij[]> {
  const rijen = await prisma.boekBankRekening.findMany({
    where: { administratieId },
    orderBy: { naam: "asc" },
    select: { id: true, administratieId: true, iban: true, naam: true, valuta: true, actief: true, rekening: { select: { nummer: true } }, _count: { select: { afschriften: true } } },
  });
  const uit: BankRekeningRij[] = [];
  for (const r of rijen) {
    const laatste = await prisma.boekBankTransactie.findFirst({ where: { bankRekeningId: r.id }, orderBy: { boekdatum: "desc" }, select: { boekdatum: true } });
    uit.push(rekeningRij(r, laatste?.boekdatum ?? null));
  }
  return uit;
}

export interface NieuweBankRekening {
  administratieId: string;
  naam: string;
  iban: string;
  /** het grootboekrekeningnummer van de bank; standaard 1100 */
  grootboekNummer?: string | undefined;
}

/** Voegt een bankrekening toe: IBAN gevalideerd (modulo 97), het grootboekrekeningnummer moet een boekbare balansrekening zijn. */
export async function maakBankRekening(i: NieuweBankRekening): Promise<BankRekeningRij> {
  const naam = schoonTekst(i.naam, 80);
  if (!naam) throw AppError.validation("Geef de bankrekening een naam, bijvoorbeeld \"Zakelijke rekening\".");
  const iban = eisGeldigIban(i.iban);
  const administratie = await prisma.boekAdministratie.findUnique({ where: { id: i.administratieId }, select: { id: true, valuta: true, actief: true } });
  if (!administratie) throw AppError.notFound("Deze administratie bestaat niet.");
  if (!administratie.actief) throw AppError.validation("Deze administratie is niet actief.");
  const nummer = (i.grootboekNummer ?? REKENING_BANK).trim();
  const grootboek = await prisma.boekRekening.findFirst({
    where: { administratieId: administratie.id, nummer, actief: true, boekbaar: true },
    select: { id: true, soort: true },
  });
  if (!grootboek) throw AppError.validation(`Rekening ${nummer} bestaat niet in deze administratie.`);
  if (grootboek.soort !== "ACTIVA") throw AppError.validation(`Rekening ${nummer} is geen balansrekening voor bezittingen; kies de bankrekening (standaard ${REKENING_BANK}).`);
  const dubbel = await prisma.boekBankRekening.findUnique({ where: { administratieId_iban: { administratieId: administratie.id, iban } }, select: { id: true } });
  if (dubbel) throw AppError.conflict("Deze bankrekening staat al in deze administratie.");
  const gemaakt = await prisma.boekBankRekening.create({
    data: { administratieId: administratie.id, iban, naam, valuta: administratie.valuta, rekeningId: grootboek.id },
    select: { id: true, administratieId: true, iban: true, naam: true, valuta: true, actief: true, rekening: { select: { nummer: true } }, _count: { select: { afschriften: true } } },
  });
  return rekeningRij(gemaakt, null);
}

const TRANSACTIE_SELECT = {
  id: true,
  bankRekeningId: true,
  boekdatum: true,
  bedragCents: true,
  valuta: true,
  tegenNaam: true,
  tegenIban: true,
  omschrijving: true,
  status: true,
  voorstel: true,
} as const;

type TransactieData = {
  id: string;
  bankRekeningId: string;
  boekdatum: Date;
  bedragCents: number;
  valuta: string;
  tegenNaam: string | null;
  tegenIban: string | null;
  omschrijving: string | null;
  status: "NIEUW" | "GEKOPPELD" | "TWIJFEL" | "GENEGEERD";
  voorstel: unknown;
};

/** Bonnen die in voorstellen voorkomen: een leesbare titel (leverancier, datum, totaal) voor de ingelogde beheerder. */
async function bonLabels(bonIds: string[]): Promise<Map<string, string>> {
  if (bonIds.length === 0) return new Map();
  const bonnen = await prisma.boekBon.findMany({ where: { id: { in: bonIds } }, select: { id: true, leverancier: true, bonDatum: true, totaalCents: true, valuta: true } });
  return new Map(
    bonnen.map((b) => {
      const delen = [b.leverancier ? `Bon van ${b.leverancier}` : "Bon", b.bonDatum ? dagTekst(dagVanDatumKolom(b.bonDatum)) : null, b.totaalCents !== null ? bedragTekst(b.totaalCents, b.valuta) : null];
      return [b.id, delen.filter(Boolean).join(", ")] as const;
    }),
  );
}

async function naarRijen(data: TransactieData[]): Promise<TransactieRij[]> {
  const voorstellen = data.map((t) => leesVoorstel(t.voorstel));
  const bonIds = [...new Set(voorstellen.flatMap((v) => v.kandidaten.flatMap((k) => (k.voorstel.soort === "bon" || k.voorstel.soort === "bon-betaald" ? [k.voorstel.bonId] : []))))];
  const labels = await bonLabels(bonIds);
  return data.map((t, i) => {
    const v = voorstellen[i];
    const kandidaten: KandidaatRij[] = (v?.kandidaten ?? []).map((k) => {
      const s = k.voorstel;
      if (s.soort === "factuur") return { soort: "factuur", id: s.invoiceId, titel: kandidaatTitel({ soort: "factuur", nummer: s.nummer }), zekerheid: k.zekerheid, reden: k.reden };
      if (s.soort === "stripe") return { soort: "stripe", id: null, titel: kandidaatTitel({ soort: "stripe" }), zekerheid: k.zekerheid, reden: k.reden };
      return { soort: s.soort, id: s.bonId, titel: kandidaatTitel({ soort: s.soort, bonLabel: labels.get(s.bonId) }), zekerheid: k.zekerheid, reden: k.reden };
    });
    return {
      id: t.id,
      bankRekeningId: t.bankRekeningId,
      boekdag: dagVanDatumKolom(t.boekdatum),
      bedragCents: t.bedragCents,
      valuta: t.valuta,
      tegenNaam: t.tegenNaam,
      tegenIbanGemaskeerd: maskeerIban(t.tegenIban),
      omschrijving: t.omschrijving,
      status: t.status,
      reden: v?.reden ?? "",
      kandidaten,
      genegeerdReden: v?.genegeerdReden ?? null,
    };
  });
}

/** Eén transactie als rij (na een PATCH geeft de route de serverversie terug). */
export async function transactieRij(id: string): Promise<TransactieRij> {
  const t = await prisma.boekBankTransactie.findUnique({ where: { id }, select: TRANSACTIE_SELECT });
  if (!t) throw AppError.notFound("Deze banktransactie bestaat niet.");
  const [rij] = await naarRijen([t]);
  if (!rij) throw AppError.notFound("Deze banktransactie bestaat niet.");
  return rij;
}

/** Alles voor het tabblad Bank: rekeningen, de transacties die op jou wachten, tellingen en wat je nog moet doen. */
export async function bankOverzicht(administratieId: string): Promise<BankOverzicht> {
  const rekeningen = await lijstBankRekeningen(administratieId);
  const where = { bankRekening: { administratieId } };
  const [groepen, wachtend, categorieen] = await Promise.all([
    prisma.boekBankTransactie.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.boekBankTransactie.findMany({
      where: { ...where, status: { in: ["NIEUW", "TWIJFEL"] } },
      orderBy: [{ boekdatum: "desc" }, { createdAt: "desc" }],
      take: MAX_TRANSACTIES_IN_LIJST + 1,
      select: TRANSACTIE_SELECT,
    }),
    prisma.boekRekening.findMany({ where: { administratieId, soort: "KOSTEN", actief: true, boekbaar: true }, orderBy: { nummer: "asc" }, select: { nummer: true, naam: true } }),
  ]);
  const tel = (s: string) => groepen.find((g) => g.status === s)?._count._all ?? 0;
  const telling = { evenKijken: tel("TWIJFEL"), genegeerd: tel("GENEGEERD"), gekoppeld: tel("GEKOPPELD"), nieuw: tel("NIEUW") };
  const afgekapt = wachtend.length > MAX_TRANSACTIES_IN_LIJST;
  const transacties = await naarRijen(wachtend.slice(0, MAX_TRANSACTIES_IN_LIJST));
  const stripe = transacties.filter((t) => t.kandidaten[0]?.soort === "stripe").length;
  return {
    rekeningen,
    transacties,
    afgekapt,
    telling,
    categorieen,
    todo: bankTodo({ aantalRekeningen: rekeningen.length, telling, stripe }),
  };
}
