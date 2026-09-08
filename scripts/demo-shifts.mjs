/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// Demo shifts — fills the freelancer marketplace with a broad, evergreen set of
// open klussen so the demo accounts always have something to browse, filter and
// take. Idempotent: re-running refreshes dates so nothing drifts into the past.
//
//   node scripts/demo-shifts.mjs           add / refresh demo shifts
//   node scripts/demo-shifts.mjs --clear   remove them again
//
// Only touches rows whose id starts with "demo_" — real data is never modified.
// ---------------------------------------------------------------------------

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile, appendFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CLEAR = process.argv.includes("--clear");

const DAY = 86_400_000;
const now = new Date();
const at = (dayOffset, h, m = 0) => {
  const d = new Date(now.getTime() + dayOffset * DAY);
  d.setHours(h, m, 0, 0);
  return d;
};

const REPLACEMENT_DIR = join(process.cwd(), "storage", "replacements");
const REVIEWS_DIR = join(process.cwd(), "storage", "reviews");
const OFFERS_DIR = join(process.cwd(), "storage", "offers");
const FISCAL_DIR = join(process.cwd(), "storage", "fiscal");
const ADVANCES_DIR = join(process.cwd(), "storage", "payouts", "advances");
const UITZEND_CONTRACT_DIR = join(process.cwd(), "storage", "agreements", "uitzend");
// lib/payouts/advances.ts sanitises the filename by stripping everything but
// [a-z0-9-] (case-insensitive) — so "usr_fl_bronze" -> "usrflbronze.jsonl".
const advFile = (userId) => join(ADVANCES_DIR, `${userId.replace(/[^a-z0-9-]/gi, "")}.jsonl`);

/** "2026-W36" — matches lib/payroll/week.ts isoWeekId(isoWeekOf(date)). */
function isoWeekIdOf(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((dt - yearStart) / 86_400_000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}
const reviewFile = (type, id) => join(REVIEWS_DIR, `${type}-${String(id).replace(/[^a-z0-9-]/gi, "")}.jsonl`);

// --- extra branches (all under the existing HQ tenant) ---------------------

const BRANCHES = [
  { id: "demo_loc_ams_zo", name: "Amsterdam Zuidoost", city: "Amsterdam", addressLine: "Bijlmerplein 888", postalCode: "1102 MG", latitude: 52.3118, longitude: 4.9475 },
  { id: "demo_loc_rtm", name: "Rotterdam Centrum", city: "Rotterdam", addressLine: "Coolsingel 40", postalCode: "3011 AD", latitude: 51.9225, longitude: 4.4792 },
  { id: "demo_loc_dh", name: "Den Haag HS", city: "Den Haag", addressLine: "Stationsplein 30", postalCode: "2515 BR", latitude: 52.0705, longitude: 4.3225 },
  { id: "demo_loc_utr_lr", name: "Utrecht Leidsche Rijn", city: "Utrecht", addressLine: "Brusselplein 12", postalCode: "3541 CX", latitude: 52.0787, longitude: 5.033 },
  { id: "demo_loc_ein", name: "Eindhoven Centrum", city: "Eindhoven", addressLine: "18 Septemberplein 5", postalCode: "5611 AL", latitude: 51.4416, longitude: 5.4697 },
];

// --- extra skills ---------------------------------------------------------

const SKILLS = [
  { id: "demo_skill_bediening", name: "Bediening", category: "HORECA" },
  { id: "demo_skill_orderpicker", name: "Orderpicker", category: "LOGISTIEK" },
  { id: "demo_skill_schoonmaak", name: "Schoonmaak", category: "SCHOONMAAK" },
  { id: "demo_skill_host", name: "Evenementhost", category: "EVENEMENT" },
];

// --- shift templates ----------------------------------------------------

// branch pool: existing seed branches + the demo ones above
const BRANCH_POOL = [
  "loc_ams_centrum",
  "loc_utr_cs",
  "demo_loc_ams_zo",
  "demo_loc_rtm",
  "demo_loc_dh",
  "demo_loc_utr_lr",
  "demo_loc_ein",
];

const TEMPLATES = [
  { title: "Vakkenvullen avonddienst", skillId: "skill_vakkenvullen", rate: 1650, positions: 3, dur: 5, start: [1, 17] },
  { title: "Kassamedewerker piekuren", skillId: "skill_kassa", rate: 1700, positions: 2, dur: 6, start: [1, 12] },
  { title: "Orderpicker magazijn", skillId: "demo_skill_orderpicker", rate: 1650, positions: 4, dur: 8, start: [2, 7] },
  { title: "Bediening lunchservice", skillId: "demo_skill_bediening", rate: 1650, positions: 3, dur: 4, start: [2, 11] },
  { title: "Barista koffiebar", skillId: "demo_skill_bediening", rate: 1650, positions: 1, dur: 6, start: [2, 8] },
  { title: "Schoonmaak kantoorpand", skillId: "demo_skill_schoonmaak", rate: 1650, positions: 2, dur: 4, start: [3, 6] },
  { title: "Evenementhost beursvloer", skillId: "demo_skill_host", rate: 1800, positions: 6, dur: 8, start: [4, 9] },
  { title: "Garderobe & entree festival", skillId: "demo_skill_host", rate: 1750, positions: 8, dur: 7, start: [5, 16] },
  { title: "Runner restaurant diner", skillId: "demo_skill_bediening", rate: 1650, positions: 2, dur: 6, start: [3, 17] },
  { title: "Afwas keukenhulp", skillId: null, rate: 1650, positions: 2, dur: 5, start: [2, 18] },
  { title: "Magazijnmedewerker inpak", skillId: null, rate: 1650, positions: 5, dur: 8, start: [3, 8] },
  { title: "Verkoopmedewerker weekend", skillId: "skill_kassa", rate: 1650, positions: 2, dur: 7, start: [6, 10] },
  { title: "Vakkenvullen ochtend", skillId: "skill_vakkenvullen", rate: 1650, positions: 3, dur: 4, start: [4, 6] },
  { title: "Teamleider dagdienst", skillId: "skill_teamleider", rate: 2600, positions: 1, dur: 8, start: [7, 8], minRating: 4 },
  { title: "Receptie & klantenservice", skillId: null, rate: 1750, positions: 1, dur: 8, start: [3, 9] },
  { title: "Steward voetbalwedstrijd", skillId: "demo_skill_host", rate: 1700, positions: 10, dur: 5, start: [8, 13] },
  { title: "Schoonmaak hotel housekeeping", skillId: "demo_skill_schoonmaak", rate: 1650, positions: 3, dur: 6, start: [5, 8] },
  { title: "Bezorger fietskoerier", skillId: null, rate: 1700, positions: 3, dur: 5, start: [2, 16] },
  { title: "Kok meewerkend weekend", skillId: "demo_skill_bediening", rate: 2200, positions: 1, dur: 8, start: [6, 15] },
  { title: "Orderpicker nachtdienst", skillId: "demo_skill_orderpicker", rate: 1950, positions: 4, dur: 8, start: [4, 22] },
  { title: "Vakkenvullen zondag", skillId: "skill_vakkenvullen", rate: 1750, positions: 2, dur: 6, start: [9, 9] },
  { title: "Catering medewerker bedrijfsfeest", skillId: "demo_skill_bediening", rate: 1850, positions: 5, dur: 6, start: [10, 16] },
  { title: "Kassa avondwinkel", skillId: "skill_kassa", rate: 1700, positions: 1, dur: 5, start: [1, 18] },
  { title: "Magazijn heftruckchauffeur", skillId: null, rate: 2100, positions: 2, dur: 8, start: [5, 7] },
];

async function clearDemo() {
  const shifts = await prisma.shift.findMany({
    where: { id: { startsWith: "demo_shift_" } },
    select: { id: true },
  });
  const ids = shifts.map((s) => s.id);
  if (ids.length) {
    const tsIds = (
      await prisma.timesheet.findMany({ where: { assignment: { shiftId: { in: ids } } }, select: { id: true } })
    ).map((t) => t.id);
    if (tsIds.length) {
      await prisma.payment.deleteMany({ where: { invoice: { timesheetId: { in: tsIds } } } });
      await prisma.invoice.deleteMany({ where: { timesheetId: { in: tsIds } } });
    }
    await prisma.modelAgreement.deleteMany({ where: { shiftId: { in: ids } } });
    await prisma.timesheet.deleteMany({ where: { assignment: { shiftId: { in: ids } } } });
    await prisma.shiftAssignment.deleteMany({ where: { shiftId: { in: ids } } });
    await prisma.shiftMatch.deleteMany({ where: { shiftId: { in: ids } } });
    await prisma.shift.deleteMany({ where: { id: { in: ids } } });
  }
  // demo counter-offer files
  if (existsSync(OFFERS_DIR)) {
    for (const f of await readdir(OFFERS_DIR)) {
      if (f.startsWith("demo-")) await rm(join(OFFERS_DIR, f)).catch(() => undefined);
    }
  }
  await prisma.branch.deleteMany({ where: { id: { startsWith: "demo_loc_" } } });
  await prisma.freelancerSkill.deleteMany({ where: { skillId: { startsWith: "demo_skill_" } } });
  await prisma.skill.deleteMany({ where: { id: { startsWith: "demo_skill_" } } });
  if (existsSync(REPLACEMENT_DIR)) {
    for (const f of await readdir(REPLACEMENT_DIR)) {
      if (!f.endsWith(".json")) continue;
      try {
        const rec = JSON.parse(await readFile(join(REPLACEMENT_DIR, f), "utf8"));
        if (String(rec.id).startsWith("demo-")) await rm(join(REPLACEMENT_DIR, f));
      } catch {
        /* ignore */
      }
    }
  }
  // Strip demo reviews from every review file.
  if (existsSync(REVIEWS_DIR)) {
    for (const f of await readdir(REVIEWS_DIR)) {
      if (!f.endsWith(".jsonl")) continue;
      const p = join(REVIEWS_DIR, f);
      const kept = (await readFile(p, "utf8"))
        .split("\n")
        .filter(Boolean)
        .filter((l) => {
          try {
            return !String(JSON.parse(l).id).startsWith("demo-rev-");
          } catch {
            return true;
          }
        });
      await writeFile(p, kept.join("\n") + (kept.length ? "\n" : ""), "utf8");
    }
  }
  // Demo uitzendkracht fiscaal profiel + voorschotten weer weg.
  await rm(join(FISCAL_DIR, "usr_fl_bronze.json")).catch(() => undefined);
  await rm(advFile("usr_fl_bronze")).catch(() => undefined);
  await rm(join(UITZEND_CONTRACT_DIR, "usrflbronze.jsonl")).catch(() => undefined);
  console.log(`✔ Removed ${ids.length} demo shifts + demo branches/skills + test-reviews.`);
}

async function main() {
  if (CLEAR) {
    await clearDemo();
    return;
  }

  const hq =
    (await prisma.tenant.findFirst({ where: { type: "ENTERPRISE_HQ" }, select: { id: true } })) ??
    (await prisma.tenant.findFirst({ where: { type: { not: "PLATFORM" } }, select: { id: true } }));
  if (!hq) {
    console.error("Geen opdrachtgever-tenant gevonden. Draai eerst: npm run db:seed");
    process.exit(1);
  }

  console.log("→ Demo-vestigingen…");
  for (const b of BRANCHES) {
    await prisma.branch.upsert({
      where: { id: b.id },
      create: {
        ...b,
        tenantId: hq.id,
        geofenceRadiusMeters: 150,
        matchingConfig: { minScore: 0.5, maxTravelMinutes: 75, offerTtlMinutes: 20, notificationWaveSize: 6 },
      },
      update: { name: b.name, addressLine: b.addressLine, postalCode: b.postalCode, city: b.city, latitude: b.latitude, longitude: b.longitude },
    });
  }

  console.log("→ Demo-skills…");
  for (const s of SKILLS) {
    await prisma.skill.upsert({
      where: { id: s.id },
      create: s,
      update: { name: s.name, category: s.category },
    });
  }

  // Give every verified demo freelancer the new skills at a solid rating, so the
  // skill-filtered demo shifts match them.
  const demoFreelancers = await prisma.freelancerProfile.findMany({
    where: { user: { email: { endsWith: "@freelancer.nl" } } },
    select: { id: true, user: { select: { kycStatus: true } } },
  });
  for (const fp of demoFreelancers) {
    if (fp.user.kycStatus !== "VERIFIED") continue;
    for (const s of SKILLS) {
      await prisma.freelancerSkill.upsert({
        where: { freelancerId_skillId: { freelancerId: fp.id, skillId: s.id } },
        create: { freelancerId: fp.id, skillId: s.id, rating: 4.2, shiftsWorked: 15 },
        update: {},
      }).catch(() => undefined);
    }
  }

  console.log("→ Demo-klussen…");
  let n = 0;
  for (let i = 0; i < TEMPLATES.length; i += 1) {
    const t = TEMPLATES[i];
    const branchId = BRANCH_POOL[i % BRANCH_POOL.length];
    const [dayOffset, hour] = t.start;
    const startsAt = at(dayOffset + Math.floor(i / BRANCH_POOL.length), hour);
    const endsAt = new Date(startsAt.getTime() + t.dur * 3_600_000);
    const id = `demo_shift_${String(i + 1).padStart(2, "0")}`;
    const data = {
      branchId,
      title: t.title,
      description: `${t.title} — demo-klus voor testaccounts. Meld je aan en volg de flow.`,
      requiredSkillId: t.skillId,
      minSkillRating: t.minRating ?? 0,
      startsAt,
      endsAt,
      breakMinutes: t.dur >= 6 ? 30 : 15,
      hourlyRateCents: t.rate,
      positions: t.positions,
      status: "OPEN",
    };
    await prisma.shift.upsert({ where: { id }, create: { id, ...data }, update: data });
    n += 1;
  }
  console.log(`  ${n} open klussen geplaatst / bijgewerkt.`);

  // --- Replacement demo: a filled shift whose holder needs a substitute -----
  console.log("→ Vervanging-demo…");
  const bronze = await prisma.freelancerProfile.findFirst({
    where: { user: { email: "sam.bronze@freelancer.nl" } },
    select: { id: true, user: { select: { id: true, fullName: true } } },
  });
  const gold = await prisma.freelancerProfile.findFirst({
    where: { user: { email: "liam.gold@freelancer.nl" } },
    select: { id: true, user: { select: { id: true, fullName: true } } },
  });

  if (bronze && gold) {
    const rShiftId = "demo_shift_replace";
    const startsAt = at(3, 16);
    const endsAt = new Date(startsAt.getTime() + 5 * 3_600_000);
    const rShift = {
      branchId: "demo_loc_rtm",
      title: "Vakkenvullen — vervanging gezocht",
      description: "Sam kan deze dienst niet doen en zoekt een vervanger. Demo van de vrije-vervanging flow.",
      requiredSkillId: "skill_vakkenvullen",
      minSkillRating: 0,
      startsAt,
      endsAt,
      breakMinutes: 15,
      hourlyRateCents: 1800,
      positions: 1,
      status: "FILLED",
    };
    await prisma.shift.upsert({ where: { id: rShiftId }, create: { id: rShiftId, ...rShift }, update: rShift });

    const assignment = await prisma.shiftAssignment.upsert({
      where: { shiftId_freelancerId: { shiftId: rShiftId, freelancerId: bronze.id } },
      create: { shiftId: rShiftId, freelancerId: bronze.id, source: "ACCEPTED", cancelledAt: null },
      update: { cancelledAt: null, cancelReason: null },
      select: { id: true },
    });
    await prisma.timesheet.upsert({
      where: { assignmentId: assignment.id },
      create: {
        assignmentId: assignment.id,
        freelancerId: bronze.id,
        branchId: "demo_loc_rtm",
        scheduledStart: startsAt,
        scheduledEnd: endsAt,
        breakMinutes: 15,
        hourlyRateCents: 1800,
      },
      update: {},
    });

    await mkdir(REPLACEMENT_DIR, { recursive: true });
    // wipe any earlier demo replacement file for this shift
    for (const f of await readdir(REPLACEMENT_DIR).catch(() => [])) {
      if (f.startsWith("demo-")) await rm(join(REPLACEMENT_DIR, f)).catch(() => undefined);
    }
    const rec = {
      id: "demo-replace-01",
      at: new Date(now.getTime() - 3 * 3_600_000).toISOString(),
      userId: bronze.user.id,
      freelancerName: bronze.user.fullName,
      assignmentId: assignment.id,
      shiftId: rShiftId,
      shiftTitle: rShift.title,
      branch: "Rotterdam Centrum",
      startsAt: startsAt.toISOString(),
      note: "Ik ben die dag helaas verhinderd — wie kan overnemen?",
      status: "open",
      responses: [
        {
          userId: gold.user.id,
          name: gold.user.fullName,
          at: new Date(now.getTime() - 1 * 3_600_000).toISOString(),
          note: "Ik kan deze klus overnemen, heb hier vaker gewerkt.",
        },
      ],
    };
    await writeFile(join(REPLACEMENT_DIR, "demo-replace-01.json"), JSON.stringify(rec, null, 2), "utf8");
    console.log(
      `  Log in als ${bronze.user.fullName} (sam.bronze@freelancer.nl) → Mijn klussen → "Bekijk reacties".`,
    );
  } else {
    console.log("  (demo-freelancers niet gevonden — vervanging-demo overgeslagen)");
  }

  await writeTestReviews(hq.id);
  await writeFreelancerJourney(hq.id);
  await writeArchivedForTeam(hq.id);

  console.log("\n✔ Klaar. Log in als een @freelancer.nl account en open Werk vinden / Klussen.");
}

// --- Gearchiveerde klussen voor de overige demo-freelancers -------------
// Sam (bronze), Noa (silver) en Eva (platinum) krijgen elk drie afgeronde
// klussen (uitbetaald / goedgekeurd / ingediend) plus een geannuleerde, zodat
// hun tab "Gearchiveerd" ook gevuld is. Ids: demo_shift_arch_<tag>_<fase>.
async function writeArchivedForTeam(tenantId) {
  console.log("→ Gearchiveerde klussen (overige demo-freelancers) …");
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, kvkNumber: true, companyRegistration: { select: { legalName: true } } },
  });
  const clientName = tenant?.companyRegistration?.legalName ?? tenant?.name ?? "Opdrachtgever";

  const PEOPLE = [
    // payoutDays = extra dagen na goedkeuring tot het geld op de rekening staat
    // Sam werkt als uitzendkracht → payroll-spoor: geen factuur, uren gaan naar de loonstrook.
    // rate net onder het WML zodat de automatische minimumloon-vloer zichtbaar is
    { email: "sam.bronze@freelancer.nl", branchId: "demo_loc_dh", tag: "sam", rate: 1620, payoutDays: 0, payroll: true, birthDate: "2003-06-15" },
    { email: "noa.silver@freelancer.nl", branchId: "demo_loc_utr_lr", tag: "noa", rate: 1800, payoutDays: 1 },
    { email: "eva.platinum@freelancer.nl", branchId: "demo_loc_ein", tag: "eva", rate: 2400, payoutDays: 2 },
  ];
  const PLAN = [
    { suffix: "todo", title: "Schoonmaak avonddienst — vul je uren in", day: -1, hour: 17, ts: "DRAFT", gps: true },
    { suffix: "paid", title: "Vakkenvullen ochtend — uitbetaald", day: -21, hour: 8, ts: "PAID", invoice: "PAID" },
    { suffix: "approved", title: "Orderpicker magazijn — goedgekeurd", day: -13, hour: 9, ts: "APPROVED", invoice: "ISSUED" },
    { suffix: "submitted", title: "Kassadienst weekend — ingediend", day: -5, hour: 20, ts: "SUBMITTED", weekendNight: true },
    { suffix: "cancelled", title: "Bezorger avond — geannuleerd", day: -9, hour: 17, ts: null, cancelled: true },
  ];

  const dur = 5 * 3_600_000;
  const billable = 5 * 60 - 30;
  let seq = 100;

  for (const person of PEOPLE) {
    const fp = await prisma.freelancerProfile.findFirst({
      where: { user: { email: person.email } },
      select: { id: true, kvkNumber: true, payoutIban: true, user: { select: { id: true, fullName: true } } },
    });
    if (!fp) {
      console.log(`  (${person.email} niet gevonden — overgeslagen)`);
      continue;
    }
    const gross = Math.round((billable / 60) * person.rate);

    // clean previous archive klussen for this person (idempotent re-run)
    const old = await prisma.shiftAssignment.findMany({
      where: { freelancerId: fp.id, shift: { id: { startsWith: `demo_shift_arch_${person.tag}_` } } },
      select: { id: true, timesheet: { select: { id: true } } },
    });
    const oldTs = old.map((a) => a.timesheet?.id).filter(Boolean);
    if (oldTs.length) {
      await prisma.payment.deleteMany({ where: { invoice: { timesheetId: { in: oldTs } } } });
      await prisma.invoice.deleteMany({ where: { timesheetId: { in: oldTs } } });
    }
    await prisma.modelAgreement.deleteMany({ where: { assignmentId: { in: old.map((a) => a.id) } } });
    await prisma.timesheet.deleteMany({ where: { id: { in: oldTs } } });
    await prisma.shiftAssignment.deleteMany({ where: { id: { in: old.map((a) => a.id) } } });
    await prisma.shift.deleteMany({ where: { id: { startsWith: `demo_shift_arch_${person.tag}_` } } });

    // Uitzendkracht: schrijf een fiscaal profiel zodat het payroll-spoor aangaat,
    // en ruim oude demo-voorschotten op.
    if (person.payroll) {
      const af = advFile(fp.user.id);
      if (existsSync(af)) {
        const kept = (await readFile(af, "utf8"))
          .split("\n")
          .filter(Boolean)
          .filter((l) => {
            try {
              return !String(JSON.parse(l).id).startsWith("demo-adv-");
            } catch {
              return true;
            }
          });
        await writeFile(af, kept.join("\n") + (kept.length ? "\n" : ""), "utf8");
      }

      // getekende uitzendovereenkomst
      await mkdir(UITZEND_CONTRACT_DIR, { recursive: true });
      const uzoSignedAt = new Date(now.getTime() - 42 * DAY);
      const uzoValidUntil = new Date(uzoSignedAt.getTime());
      uzoValidUntil.setMonth(uzoValidUntil.getMonth() + 3);
      await writeFile(
        join(UITZEND_CONTRACT_DIR, `${fp.user.id.replace(/[^a-z0-9-]/gi, "")}.jsonl`),
        JSON.stringify({
          id: `demo-uzo-${person.tag}`,
          reference: `ZF-UZO-${uzoSignedAt.getFullYear()}-001-${person.tag}`,
          userId: fp.user.id,
          workerName: fp.user.fullName,
          workerBsnLast4: "6782",
          employerName: "ZekerFlex B.V.",
          employerKvk: "00000000",
          signedAt: uzoSignedAt.toISOString(),
          validFrom: uzoSignedAt.toISOString(),
          validUntil: uzoValidUntil.toISOString(),
          phase: "A",
          weeksWorked: 6,
        }) + "\n",
        "utf8",
      );

      await mkdir(FISCAL_DIR, { recursive: true });
      const bsnHash = createHash("sha256").update("bsn:123456782").digest("hex");
      await writeFile(
        join(FISCAL_DIR, `${fp.user.id}.json`),
        JSON.stringify(
          {
            workerKind: "uitzendkracht",
            vatNumber: null, vatValid: false, vatStatus: null, vatCheckedAt: null, vatRequested: false,
            kvkNumber: null, korApplies: false,
            bsnLast4: "6782", bsnHash, loonheffingskorting: true,
            birthDate: person.birthDate ?? null,
            invoiceMode: "payroll",
            iban: fp.payoutIban ?? "NL91ABNA0417164300", ibanValid: true,
            completedAt: new Date(now.getTime() - 40 * DAY).toISOString(),
            updatedAt: new Date(now.getTime() - 40 * DAY).toISOString(),
          },
          null,
          2,
        ),
        "utf8",
      );
    }

    for (const p of PLAN) {
      const id = `demo_shift_arch_${person.tag}_${p.suffix}`;
      let startsAt = at(p.day, p.hour);
      if (p.weekendNight) {
        // snap terug naar de meest recente zaterdag → weekend- + nachttoeslag
        while (startsAt.getDay() !== 6) startsAt = new Date(startsAt.getTime() - DAY);
        startsAt.setHours(p.hour, 0, 0, 0);
      }
      const endsAt = new Date(startsAt.getTime() + dur);

      await prisma.shift.create({
        data: {
          id,
          branchId: person.branchId,
          title: p.title,
          description: "Afgeronde demo-klus voor het overzicht 'Gearchiveerd'.",
          minSkillRating: 0,
          startsAt,
          endsAt,
          breakMinutes: 30,
          hourlyRateCents: person.rate,
          positions: 1,
          status: p.cancelled ? "CANCELLED" : "COMPLETED",
        },
      });

      const assignment = await prisma.shiftAssignment.create({
        data: {
          shiftId: id,
          freelancerId: fp.id,
          source: "ACCEPTED",
          acceptedAt: new Date(startsAt.getTime() - 3 * DAY),
          cancelledAt: p.cancelled ? new Date(startsAt.getTime() - DAY) : null,
          cancelReason: p.cancelled ? "Afgezegd door flexwerker: ziek" : null,
        },
        select: { id: true },
      });

      if (!p.ts) continue;

      const done = ["SUBMITTED", "APPROVED", "PAID"].includes(p.ts);
      const submittedAt = new Date(endsAt.getTime() + 3_600_000);
      const approvedAt = new Date(submittedAt.getTime() + DAY);
      const settledAt = new Date(approvedAt.getTime() + person.payoutDays * DAY + 60_000);
      const ts = await prisma.timesheet.create({
        data: {
          assignmentId: assignment.id,
          freelancerId: fp.id,
          branchId: person.branchId,
          scheduledStart: startsAt,
          scheduledEnd: endsAt,
          breakMinutes: 30,
          hourlyRateCents: person.rate,
          actualStart: p.gps ? new Date(startsAt.getTime() - 4 * 60_000) : done ? startsAt : null,
          actualEnd: p.gps ? new Date(endsAt.getTime() + 15 * 60_000) : done ? endsAt : null,
          billableMinutes: done ? billable : 0,
          status: p.ts,
          submittedAt: done ? submittedAt : null,
          approvedAt: ["APPROVED", "PAID"].includes(p.ts) ? approvedAt : null,
        },
        select: { id: true },
      });

      // Uitzendkracht: instant-advance voorschot bij goedkeuring.
      if (person.payroll && ["APPROVED", "PAID"].includes(p.ts)) {
        await mkdir(ADVANCES_DIR, { recursive: true });
        const amountCents = Math.round(gross * 0.5);
        const feeCents = Math.round(amountCents * 0.03);
        const isoWeek = isoWeekIdOf(startsAt);
        const rec = {
          id: `demo-adv-${person.tag}-${p.suffix}`,
          userId: fp.user.id,
          amountCents,
          feeCents,
          netCents: amountCents - feeCents,
          requestedAt: approvedAt.toISOString(),
          status: "settled",
          kind: "payroll",
          isoWeek,
          timesheetId: ts.id,
          expectedGrossCents: gross,
          payoutStatus: "SETTLED",
          providerRef: `DEMO-${person.tag}-${p.suffix}`,
          paidAt: approvedAt.toISOString(),
          reconciledAt: new Date(approvedAt.getTime() + 3 * DAY).toISOString(),
          reconciledNetCents: Math.round(gross * 0.62),
          settledAt: new Date(approvedAt.getTime() + 3 * DAY).toISOString(),
        };
        await appendFile(advFile(fp.user.id), JSON.stringify(rec) + "\n", "utf8");
      }

      if (p.invoice && !person.payroll) {
        const inv = await prisma.invoice.create({
          data: {
            number: `ZF-INV-DEMO-${String(++seq).padStart(3, "0")}`,
            type: "SELF_BILL_FREELANCER",
            status: p.invoice,
            timesheetId: ts.id,
            recipientTenantId: tenantId,
            issuerFreelancerId: fp.id,
            vatTreatment: "REVERSE_CHARGE",
            vatRate: 0,
            subtotalCents: gross,
            vatCents: 0,
            totalCents: gross,
            issuedAt: approvedAt,
          },
        });
        await prisma.payment.create({
          data: {
            invoiceId: inv.id,
            amountCents: gross,
            method: "SEPA_INSTANT",
            status: p.invoice === "PAID" ? "SETTLED" : "PENDING",
            debtorIban: "NL91ABNA0417164300",
            creditorIban: fp.payoutIban ?? "NL91ABNA0417164300",
            endToEndId: `E2E-DEMO-${id}`,
            submittedAt: approvedAt,
            settledAt: p.invoice === "PAID" ? settledAt : null,
          },
        });
      }

      if (["APPROVED", "PAID"].includes(p.ts) && !person.payroll) {
        await prisma.modelAgreement.create({
          data: {
            reference: `ZF-MOD-DEMO-${String(++seq).padStart(3, "0")}`,
            freelancerId: fp.id,
            tenantId,
            branchId: person.branchId,
            shiftId: id,
            assignmentId: assignment.id,
            type: "VRIJE_VERVANGING",
            status: "ACTIVE",
            templateKey: "zekerflex/vrije-vervanging",
            templateVersion: "2024.1",
            freelancerLegalName: fp.user.fullName,
            freelancerKvkNumber: fp.kvkNumber,
            clientLegalName: clientName,
            clientKvkNumber: tenant?.kvkNumber ?? null,
            hourlyRateCents: person.rate,
            scopeDescription: p.title,
            freelancerSignedAt: new Date(startsAt.getTime() - 2 * DAY),
            clientSignedAt: new Date(startsAt.getTime() - 2 * DAY),
          },
        });
      }
    }
    console.log(
      `  ${fp.user.fullName}: 1 in te vullen + 3 afgeronde + 1 geannuleerd${person.payroll ? " (uitzendkracht — payroll-spoor)" : ""}.`,
    );
  }
}

// --- Full freelancer journey for one demo account ------------------------
// Liam Bakker (liam.gold@freelancer.nl) krijgt alle statussen zodat elke
// freelancer-flow te demonstreren is: reactie in afwachting, uitgekozen klus,
// vervanging met reactie, en gearchiveerde klussen in elke uren-fase.
async function writeFreelancerJourney(tenantId) {
  console.log("→ Freelancer-journey (Liam Bakker) …");
  const [fp, tenant] = await Promise.all([
    prisma.freelancerProfile.findFirst({
      where: { user: { email: "liam.gold@freelancer.nl" } },
      select: { id: true, kvkNumber: true, payoutIban: true, user: { select: { id: true, fullName: true } } },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, kvkNumber: true, companyRegistration: { select: { legalName: true } } },
    }),
  ]);
  const eva = await prisma.freelancerProfile.findFirst({
    where: { user: { email: "eva.platinum@freelancer.nl" } },
    select: { id: true, user: { select: { id: true, fullName: true } } },
  });
  if (!fp || !tenant) {
    console.log("  (Liam of opdrachtgever niet gevonden — overgeslagen)");
    return;
  }

  const branchId = "demo_loc_rtm";
  const rate = 2500;
  const clientName = tenant.companyRegistration?.legalName ?? tenant.name;

  // Liam is de ZZP-demo (facturatie + modelovereenkomst + betaalkeuze). Reset
  // een eventueel oud fiscaal profiel dat hem per ongeluk uitzendkracht maakte.
  await mkdir(FISCAL_DIR, { recursive: true });
  await writeFile(
    join(FISCAL_DIR, `${fp.user.id}.json`),
    JSON.stringify(
      {
        workerKind: "zzp",
        vatNumber: "NL003456789B01", vatValid: true, vatStatus: "validated",
        vatCheckedAt: new Date(now.getTime() - 40 * DAY).toISOString(), vatRequested: false,
        kvkNumber: fp.kvkNumber ?? "60000003", korApplies: false,
        bsnLast4: null, bsnHash: null, loonheffingskorting: true,
        invoiceMode: "reverse-billing",
        iban: fp.payoutIban ?? "NL91ABNA0417164300", ibanValid: true,
        completedAt: new Date(now.getTime() - 40 * DAY).toISOString(),
        updatedAt: new Date(now.getTime() - 40 * DAY).toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  // Clean slate for Liam: keep only seed history (shift_past_*); drop every
  // other assignment (auto-matched demo klussen, stray test shifts) + rebuild.
  const wipeAssignments = await prisma.shiftAssignment.findMany({
    where: { freelancerId: fp.id, NOT: { shiftId: { startsWith: "shift_past_" } } },
    select: { id: true, shiftId: true, timesheet: { select: { id: true } } },
  });
  const wipeTs = wipeAssignments.map((a) => a.timesheet?.id).filter(Boolean);
  if (wipeTs.length) {
    await prisma.payment.deleteMany({ where: { invoice: { timesheetId: { in: wipeTs } } } });
    await prisma.invoice.deleteMany({ where: { timesheetId: { in: wipeTs } } });
  }
  await prisma.modelAgreement.deleteMany({ where: { assignmentId: { in: wipeAssignments.map((a) => a.id) } } });
  await prisma.timesheet.deleteMany({ where: { id: { in: wipeTs } } });
  await prisma.shiftAssignment.deleteMany({ where: { id: { in: wipeAssignments.map((a) => a.id) } } });
  await prisma.shift.deleteMany({ where: { id: { startsWith: "demo_shift_fl_" } } });

  // Remove stray non-seed / non-demo shifts (test cruft) that nobody is on.
  const strays = await prisma.shift.findMany({
    where: { NOT: [{ id: { startsWith: "shift_" } }, { id: { startsWith: "demo_" } }] },
    select: { id: true, _count: { select: { assignments: true } } },
  });
  const strayIds = strays.filter((s) => s._count.assignments === 0).map((s) => s.id);
  if (strayIds.length) {
    await prisma.shiftMatch.deleteMany({ where: { shiftId: { in: strayIds } } });
    await prisma.modelAgreement.deleteMany({ where: { shiftId: { in: strayIds } } });
    await prisma.shift.deleteMany({ where: { id: { in: strayIds } } });
    console.log(`  ${strayIds.length} losse test-klussen opgeruimd.`);
  }

  const dur = 5 * 3_600_000;
  const billable = 5 * 60 - 30;
  const gross = Math.round((billable / 60) * rate);

  const JOURNEY = [
    { id: "demo_shift_fl_upcoming", title: "Merchandiser dagdienst — jouw klus", day: 2, hour: 9, shiftStatus: "FILLED", ts: "DRAFT" },
    { id: "demo_shift_fl_replace", title: "Sampling actie — vervanging gevraagd", day: 5, hour: 16, shiftStatus: "FILLED", ts: "DRAFT", replace: true },
    { id: "demo_shift_fl_todo", title: "Vakkenvullen avonddienst — vul je uren in", day: -1, hour: 16, shiftStatus: "COMPLETED", ts: "DRAFT", gps: true,
      desc: "Je hebt deze klus gewerkt. Controleer hieronder je uren (de GPS-registratie staat al ingevuld — pas alleen aan wat afwijkt) en dien ze in bij de opdrachtgever. Na goedkeuring kies je hoe snel je wordt uitbetaald." },
    { id: "demo_shift_fl_submitted", title: "Kassadienst zaterdag — ingediend", day: -6, hour: 10, shiftStatus: "COMPLETED", ts: "SUBMITTED" },
    { id: "demo_shift_fl_approved", title: "Orderpicker ochtend — goedgekeurd", day: -10, hour: 8, shiftStatus: "COMPLETED", ts: "APPROVED", invoice: "ISSUED" },
    { id: "demo_shift_fl_paid", title: "Teamleider dagdienst — uitbetaald", day: -18, hour: 12, shiftStatus: "COMPLETED", ts: "PAID", invoice: "PAID", review: true },
    { id: "demo_shift_fl_cancelled", title: "Bezorger avond — geannuleerd", day: -8, hour: 17, shiftStatus: "CANCELLED", ts: null, cancelled: true },
  ];

  let seq = 0;
  for (const j of JOURNEY) {
    const startsAt = at(j.day, j.hour);
    const endsAt = new Date(startsAt.getTime() + dur);
    await prisma.shift.upsert({
      where: { id: j.id },
      create: {
        id: j.id, branchId, title: j.title,
        description: j.desc ?? "Demo-klus voor de volledige freelancer-flow.",
        minSkillRating: 0, startsAt, endsAt, breakMinutes: 30, hourlyRateCents: rate, positions: 1,
        status: j.shiftStatus,
      },
      update: { startsAt, endsAt, hourlyRateCents: rate, status: j.shiftStatus, title: j.title, description: j.desc ?? "Demo-klus voor de volledige freelancer-flow." },
    });

    const assignment = await prisma.shiftAssignment.upsert({
      where: { shiftId_freelancerId: { shiftId: j.id, freelancerId: fp.id } },
      create: {
        shiftId: j.id, freelancerId: fp.id, source: "ACCEPTED",
        acceptedAt: new Date(startsAt.getTime() - 3 * DAY),
        cancelledAt: j.cancelled ? new Date(startsAt.getTime() - DAY) : null,
        cancelReason: j.cancelled ? "Afgezegd door flexwerker: ziek" : null,
      },
      update: { cancelledAt: j.cancelled ? new Date(startsAt.getTime() - DAY) : null },
      select: { id: true },
    });

    if (j.ts) {
      const paid = j.ts === "PAID";
      const done = ["SUBMITTED", "APPROVED", "PAID"].includes(j.ts);
      const ts = await prisma.timesheet.upsert({
        where: { assignmentId: assignment.id },
        create: {
          assignmentId: assignment.id, freelancerId: fp.id, branchId,
          scheduledStart: startsAt, scheduledEnd: endsAt, breakMinutes: 30, hourlyRateCents: rate,
          actualStart: j.gps ? new Date(startsAt.getTime() - 4 * 60_000) : done ? startsAt : null,
          actualEnd: j.gps ? new Date(endsAt.getTime() + 18 * 60_000) : done ? endsAt : null,
          billableMinutes: done ? billable : 0,
          status: j.ts,
          submittedAt: done ? new Date(endsAt.getTime() + 3_600_000) : null,
          approvedAt: ["APPROVED", "PAID"].includes(j.ts) ? new Date(endsAt.getTime() + 2 * DAY) : null,
        },
        update: {
          status: j.ts, billableMinutes: done ? billable : 0,
          ...(j.gps ? { actualStart: new Date(startsAt.getTime() - 4 * 60_000), actualEnd: new Date(endsAt.getTime() + 18 * 60_000) } : {}),
        },
        select: { id: true },
      });

      if (j.invoice) {
        const invId = `demo_inv_${j.id}`;
        await prisma.invoice.deleteMany({ where: { id: invId } });
        const inv = await prisma.invoice.create({
          data: {
            id: invId, number: `ZF-INV-DEMO-${String(++seq).padStart(3, "0")}`,
            type: "SELF_BILL_FREELANCER", status: j.invoice, timesheetId: ts.id,
            recipientTenantId: tenantId, issuerFreelancerId: fp.id,
            vatTreatment: "REVERSE_CHARGE", vatRate: 0,
            subtotalCents: gross, vatCents: 0, totalCents: gross,
            issuedAt: new Date(endsAt.getTime() + 2 * DAY),
          },
        });
        await prisma.payment.create({
          data: {
            invoiceId: inv.id, amountCents: gross, method: "SEPA_INSTANT",
            status: paid ? "SETTLED" : "PENDING",
            debtorIban: "NL91ABNA0417164300", creditorIban: fp.payoutIban ?? "NL91ABNA0417164300",
            endToEndId: `E2E-DEMO-${j.id}`,
            submittedAt: new Date(endsAt.getTime() + 2 * DAY),
            settledAt: paid ? new Date(endsAt.getTime() + 2 * DAY + 60_000) : null,
          },
        });
      }

      if (["APPROVED", "PAID"].includes(j.ts)) {
        const ref = `ZF-MOD-DEMO-${String(++seq).padStart(3, "0")}`;
        await prisma.modelAgreement.deleteMany({ where: { assignmentId: assignment.id } });
        await prisma.modelAgreement.create({
          data: {
            reference: ref, freelancerId: fp.id, tenantId, branchId, shiftId: j.id, assignmentId: assignment.id,
            type: "VRIJE_VERVANGING", status: "ACTIVE",
            templateKey: "zekerflex/vrije-vervanging", templateVersion: "2024.1",
            freelancerLegalName: fp.user.fullName, freelancerKvkNumber: fp.kvkNumber,
            clientLegalName: clientName, clientKvkNumber: tenant.kvkNumber,
            hourlyRateCents: rate, scopeDescription: j.title,
            freelancerSignedAt: new Date(startsAt.getTime() - 2 * DAY),
            clientSignedAt: new Date(startsAt.getTime() - 2 * DAY),
          },
        });
      }
    }

    // --- replacement request Liam raised, with a response from Eva ---
    if (j.replace && eva) {
      const rec = {
        id: "demo-rev-req-fl",
        at: new Date(now.getTime() - 4 * 3_600_000).toISOString(),
        userId: fp.user.id, freelancerName: fp.user.fullName,
        assignmentId: assignment.id, shiftId: j.id, shiftTitle: j.title,
        branch: "Rotterdam Centrum", startsAt: startsAt.toISOString(),
        note: "Ik zit die dag helaas vast bij een andere opdracht — wie kan overnemen?",
        status: "open",
        responses: [
          {
            userId: eva.user.id, name: eva.user.fullName,
            at: new Date(now.getTime() - 2 * 3_600_000).toISOString(),
            note: "Ik kan het overnemen, ik ken deze opdrachtgever goed.",
          },
        ],
      };
      await mkdir(REPLACEMENT_DIR, { recursive: true });
      await writeFile(join(REPLACEMENT_DIR, "demo-rev-req-fl.json"), JSON.stringify(rec, null, 2), "utf8");
    }

    // --- Liam's own written review of the opdrachtgever (readable back) ---
    if (j.review) {
      await mkdir(REVIEWS_DIR, { recursive: true });
      const cf = reviewFile("company", tenantId);
      const kept = existsSync(cf)
        ? (await readFile(cf, "utf8")).split("\n").filter(Boolean).filter((l) => {
            try { return JSON.parse(l).id !== "demo-rev-liam"; } catch { return true; }
          })
        : [];
      kept.push(JSON.stringify({
        id: "demo-rev-liam", subjectType: "company", subjectId: tenantId,
        authorId: fp.user.id, authorName: fp.user.fullName, authorRole: "freelancer",
        rating: 5, text: "Strak geregeld en op tijd betaald. De contactpersoon op locatie was top. Graag weer.",
        shiftId: j.id, shiftTitle: j.title,
        at: new Date(endsAt.getTime() + 3 * DAY).toISOString(),
      }));
      await writeFile(cf, kept.join("\n") + "\n", "utf8");
    }
  }

  // --- a pending reaction (tegenbod in afwachting) on an open klus ---
  await mkdir(OFFERS_DIR, { recursive: true });
  const openShift = await prisma.shift.findFirst({
    where: { id: { startsWith: "demo_shift_" }, status: "OPEN", startsAt: { gte: new Date() } },
    select: { id: true, title: true, hourlyRateCents: true, branch: { select: { name: true } } },
  });
  if (openShift) {
    const offer = {
      id: "demo-offer-fl-01",
      at: new Date(now.getTime() - 6 * 3_600_000).toISOString(),
      userId: fp.user.id, freelancerName: fp.user.fullName,
      shiftId: openShift.id, shiftTitle: openShift.title, branch: openShift.branch.name,
      listedRateCents: openShift.hourlyRateCents,
      proposedRateCents: openShift.hourlyRateCents + 150,
      note: "Ervaren met dit type klus, kan direct starten.",
      status: "pending", respondedAt: null,
    };
    await writeFile(join(OFFERS_DIR, "demo-offer-fl-01.json"), JSON.stringify(offer, null, 2), "utf8");
  }

  // --- reviews about Liam (zodat zijn beoordeling/rating gevuld is) ---
  await mkdir(REVIEWS_DIR, { recursive: true });
  const ff = reviewFile("freelancer", fp.user.id);
  const keptF = existsSync(ff)
    ? (await readFile(ff, "utf8")).split("\n").filter(Boolean).filter((l) => {
        try { return !String(JSON.parse(l).id).startsWith("demo-rev-fl"); } catch { return true; }
      })
    : [];
  const hqAdmin = await prisma.user.findFirst({ where: { email: "hq@supermarktketen.nl" }, select: { id: true, fullName: true } });
  if (hqAdmin) {
    keptF.push(JSON.stringify({
      id: "demo-rev-fl-01", subjectType: "freelancer", subjectId: fp.user.id,
      authorId: hqAdmin.id, authorName: hqAdmin.fullName, authorRole: "employer",
      rating: 5, text: "Zeer betrouwbaar, op tijd en zelfstandig. Absolute aanrader.",
      shiftId: "demo_shift_fl_paid", shiftTitle: "Teamleider dagdienst",
      at: new Date(now.getTime() - 15 * DAY).toISOString(),
    }));
    keptF.push(JSON.stringify({
      id: "demo-rev-fl-02", subjectType: "freelancer", subjectId: fp.user.id,
      authorId: hqAdmin.id, authorName: hqAdmin.fullName, authorRole: "employer",
      rating: 4, text: "Prima gewerkt, goede communicatie vooraf.",
      shiftId: "demo_shift_fl_approved", shiftTitle: "Orderpicker ochtend",
      at: new Date(now.getTime() - 9 * DAY).toISOString(),
    }));
  }
  await writeFile(ff, keptF.join("\n") + (keptF.length ? "\n" : ""), "utf8");

  console.log(`  Journey klaar. Log in als Liam Bakker (liam.gold@freelancer.nl) — wachtwoord Zeker!2026.`);
}

// --- Test reviews (with written text) for the opdrachtgever ---------------
// Visible under Werkgever → Instellingen → "Reviews van freelancers" and via
// the review-sterren in de topbar (/werkgever/reviews).
async function writeTestReviews(tenantId) {
  console.log("→ Test-reviews (met bijschrift)…");
  const authors = await prisma.user.findMany({
    where: { email: { in: ["eva.platinum@freelancer.nl", "noa.silver@freelancer.nl", "sam.bronze@freelancer.nl"] } },
    select: { id: true, fullName: true, email: true },
  });
  const by = (e) => authors.find((a) => a.email === e);

  const TEXTS = [
    {
      email: "eva.platinum@freelancer.nl",
      rating: 5,
      shiftTitle: "Instore demonstratie",
      text:
        "Super fijne opdrachtgever! Duidelijke briefing vooraf, alles lag klaar op locatie en de contactpersoon was heel behulpzaam. Uren werden dezelfde dag nog goedgekeurd. Zeker voor herhaling vatbaar.",
      daysAgo: 3,
    },
    {
      email: "noa.silver@freelancer.nl",
      rating: 4,
      shiftTitle: "Kassamedewerker weekend",
      text:
        "Prettige dag gehad. Team was gezellig en de instructie was oké. Enige minpuntje: het was in het begin even zoeken naar wie de leiding had. Verder netjes geregeld en op tijd betaald.",
      daysAgo: 8,
    },
    {
      email: "sam.bronze@freelancer.nl",
      rating: 5,
      shiftTitle: "Vakkenvullen avonddienst",
      text:
        "Top geregeld van A tot Z. Vriendelijke ontvangst, goede werksfeer en eerlijk over de taken. Ik werk hier graag nog een keer.",
      daysAgo: 14,
    },
  ];

  await mkdir(REVIEWS_DIR, { recursive: true });
  const path = reviewFile("company", tenantId);

  // Keep non-demo reviews, drop any earlier demo ones, then append fresh.
  let kept = [];
  if (existsSync(path)) {
    for (const line of (await readFile(path, "utf8")).split("\n").filter(Boolean)) {
      try {
        const rec = JSON.parse(line);
        if (!String(rec.id).startsWith("demo-rev-")) kept.push(line);
      } catch {
        /* skip */
      }
    }
  }

  let n = 0;
  for (let i = 0; i < TEXTS.length; i += 1) {
    const t = TEXTS[i];
    const a = by(t.email);
    if (!a) continue;
    const rec = {
      id: `demo-rev-${String(i + 1).padStart(2, "0")}`,
      subjectType: "company",
      subjectId: tenantId,
      authorId: a.id,
      authorName: a.fullName,
      authorRole: "freelancer",
      rating: t.rating,
      text: t.text,
      shiftTitle: t.shiftTitle,
      at: new Date(now.getTime() - t.daysAgo * DAY).toISOString(),
    };
    kept.push(JSON.stringify(rec));
    n += 1;
  }
  await writeFile(path, kept.join("\n") + (kept.length ? "\n" : ""), "utf8");
  console.log(`  ${n} test-reviews met tekst geplaatst voor de opdrachtgever.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
