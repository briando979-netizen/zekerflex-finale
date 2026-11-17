import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { InspectTarget } from "@/lib/auth/inspect";
import type { RoleGrant } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { registerAccount } from "@/lib/auth/register";
import { setComp } from "@/lib/billing/comp";
import { trekSessiesIn } from "@/lib/auth/sessie-intrekken";
import { zetEigenTest } from "@/lib/admin/eigen-test";
import { ensureDirectThread, getMessages, listThreadsForUser, postMessage } from "@/lib/messaging/store";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Demo-account: één voorbeeld-werkgever en één voorbeeld-werker met nep-data,
// zodat de eigenaar prospects kan laten zien hoe een echt ZekerFlex-account
// eruitziet. Productieveilig: alles wat hier wordt aangemaakt is óf demo_-
// geprefixt (vestigingen, klussen, matches, urenbriefjes, facturen, betalingen,
// freelancerprofielen) óf de vaste demo-accounts (op hun demo-e-mailadres).
// Echte gegevens worden nooit aangeraakt. Idempotent: twee keer draaien
// verdubbelt niets. De werkgever staat kosteloos (lib/billing/comp.ts), dus de
// demo factureert nooit iets.
// ---------------------------------------------------------------------------

// .test is een gereserveerd testadres (isReservedTestAddress): mail aan de demo-accounts
// blijft in de eigen postbus en kaatst niet terug in info@ (anders ging er echte mail uit).
export const DEMO_WERKGEVER_EMAIL = "demo-werkgever@zekerflex.test";
export const DEMO_WERKER_EMAIL = "demo-werker@zekerflex.test";

const WACHTWOORD_SLEUTEL = "demo:wachtwoord";

// Het demo-wachtwoord staat NOOIT in de broncode (de repo is openbaar). Het wordt bij
// het opzetten willekeurig gemaakt en alleen in KV bewaard; alleen beheer ziet het.
function nieuwWachtwoord(): string {
  const tekens = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // zonder I/O/0/1 tegen verwarring
  const b = randomBytes(10);
  let s = "";
  for (let i = 0; i < 10; i++) s += tekens[(b[i] ?? 0) % tekens.length];
  return `Demo-${s.slice(0, 5)}-${s.slice(5)}`;
}

/** Het demo-wachtwoord uit KV, of null als de demo nog niet is opgezet. Voor het beheerscherm. */
export async function demoWachtwoordTonen(): Promise<string | null> {
  const v = await kvGet<string>(WACHTWOORD_SLEUTEL);
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Het bestaande demo-wachtwoord, of maak er eenmalig een als het er nog niet is. */
async function wachtwoordOfMaak(): Promise<string> {
  const bestaand = await demoWachtwoordTonen();
  if (bestaand) return bestaand;
  const w = nieuwWachtwoord();
  await kvSet(WACHTWOORD_SLEUTEL, w);
  return w;
}

const DEMO_BEDRIJF = "Demo Horeca & Retail (voorbeeld)";

const EXTRA_FREELANCERS = [
  { email: "demo-freelancer-1@zekerflex.test", name: "Demo Noa de Vries", fpId: "demo_fp_noa", kvk: "90000011", lat: 52.37, lng: 4.9, pc: "1011 AB", badge: "SILVER" as const },
  { email: "demo-freelancer-2@zekerflex.test", name: "Demo Sam Jansen", fpId: "demo_fp_sam", kvk: "90000012", lat: 51.92, lng: 4.48, pc: "3011 AD", badge: "BRONZE" as const },
];

const BRANCHES = [
  { id: "demo_loc_demo_ams", name: "Amsterdam Centrum", city: "Amsterdam", addressLine: "Damrak 1", postalCode: "1012 LG", latitude: 52.3759, longitude: 4.8975 },
  { id: "demo_loc_demo_rtm", name: "Rotterdam Centrum", city: "Rotterdam", addressLine: "Coolsingel 40", postalCode: "3011 AD", latitude: 51.9225, longitude: 4.4792 },
];

const OPEN_SHIFTS = [
  { id: "demo_shift_demo_01", branchId: "demo_loc_demo_ams", title: "Bediening lunchservice", rate: 1650, positions: 3, dur: 4, dayOffset: 1, hour: 11 },
  { id: "demo_shift_demo_02", branchId: "demo_loc_demo_ams", title: "Kassamedewerker piekuren", rate: 1700, positions: 2, dur: 6, dayOffset: 1, hour: 12 },
  { id: "demo_shift_demo_03", branchId: "demo_loc_demo_rtm", title: "Vakkenvullen avonddienst", rate: 1650, positions: 3, dur: 5, dayOffset: 2, hour: 17 },
  { id: "demo_shift_demo_04", branchId: "demo_loc_demo_rtm", title: "Orderpicker magazijn", rate: 1650, positions: 4, dur: 8, dayOffset: 2, hour: 7 },
  { id: "demo_shift_demo_05", branchId: "demo_loc_demo_ams", title: "Barista koffiebar", rate: 1650, positions: 1, dur: 6, dayOffset: 3, hour: 8 },
  { id: "demo_shift_demo_06", branchId: "demo_loc_demo_rtm", title: "Evenementhost beursvloer", rate: 1800, positions: 6, dur: 8, dayOffset: 4, hour: 9 },
];

const DAY = 86_400_000;
const PLATFORM_IBAN = "NL91ABNA0417164300";

function at(dayOffset: number, hour: number): Date {
  const d = new Date(Date.now() + dayOffset * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Maak (of vind) een gebruiker op zijn e-mailadres; nooit dubbel. Geeft het userId. */
async function ensureUser(input: Parameters<typeof registerAccount>[0]): Promise<string> {
  const email = input.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return existing.id;
  const { userId } = await registerAccount(input);
  return userId;
}

async function ensureProfile(opts: { userId: string; fpId: string; kvk: string; lat: number; lng: number; pc: string; badge: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM" }): Promise<string> {
  const fp = await prisma.freelancerProfile.upsert({
    where: { userId: opts.userId },
    create: {
      id: opts.fpId,
      userId: opts.userId,
      kvkNumber: opts.kvk,
      homeLatitude: opts.lat,
      homeLongitude: opts.lng,
      homePostalCode: opts.pc,
      payoutIban: PLATFORM_IBAN,
      badgeLevel: opts.badge,
      shiftsCompleted: 12,
    },
    update: { badgeLevel: opts.badge },
    select: { id: true },
  });
  return fp.id;
}

async function match(shiftId: string, freelancerId: string, status: "NOTIFIED" | "VIEWED" | "ACCEPTED"): Promise<void> {
  await prisma.shiftMatch.upsert({
    where: { shiftId_freelancerId: { shiftId, freelancerId } },
    create: {
      shiftId,
      freelancerId,
      score: 0.86,
      scoreBreakdown: { reliability: 0.9, travel: 0.82, skill: 0.85 },
      travelMode: "TRANSIT",
      travelMinutes: 18,
      distanceMeters: 4200,
      withinGeofence: true,
      status,
      notifiedAt: new Date(Date.now() - 2 * 3_600_000),
    },
    update: { status },
  });
}

/** Een afgeronde demo-klus met een ingevuld urenbriefje (SUBMITTED of APPROVED). Geeft het timesheet-id + brutobedrag. */
async function afgerondeKlus(opts: {
  shiftId: string;
  branchId: string;
  title: string;
  rate: number;
  dur: number;
  dayOffset: number;
  hour: number;
  freelancerId: string;
  ts: "SUBMITTED" | "APPROVED";
  approvedById?: string;
}): Promise<{ timesheetId: string; grossCents: number; endsAt: Date }> {
  const startsAt = at(opts.dayOffset, opts.hour);
  const endsAt = new Date(startsAt.getTime() + opts.dur * 3_600_000);
  const breakMinutes = opts.dur >= 6 ? 30 : 15;
  const billable = opts.dur * 60 - breakMinutes;
  const grossCents = Math.round((billable / 60) * opts.rate);

  await prisma.shift.upsert({
    where: { id: opts.shiftId },
    create: { id: opts.shiftId, branchId: opts.branchId, title: opts.title, description: "Afgeronde demo-klus voor het overzicht.", minSkillRating: 0, startsAt, endsAt, breakMinutes, hourlyRateCents: opts.rate, positions: 1, status: "COMPLETED" },
    update: { startsAt, endsAt, title: opts.title, hourlyRateCents: opts.rate, status: "COMPLETED" },
  });

  const assignment = await prisma.shiftAssignment.upsert({
    where: { shiftId_freelancerId: { shiftId: opts.shiftId, freelancerId: opts.freelancerId } },
    create: { shiftId: opts.shiftId, freelancerId: opts.freelancerId, source: "ACCEPTED", acceptedAt: new Date(startsAt.getTime() - 2 * DAY) },
    update: {},
    select: { id: true },
  });

  const submittedAt = new Date(endsAt.getTime() + 3_600_000);
  const approvedAt = opts.ts === "APPROVED" ? new Date(submittedAt.getTime() + DAY) : null;

  const ts = await prisma.timesheet.upsert({
    where: { assignmentId: assignment.id },
    create: {
      assignmentId: assignment.id,
      freelancerId: opts.freelancerId,
      branchId: opts.branchId,
      scheduledStart: startsAt,
      scheduledEnd: endsAt,
      breakMinutes,
      hourlyRateCents: opts.rate,
      actualStart: startsAt,
      actualEnd: endsAt,
      billableMinutes: billable,
      status: opts.ts,
      submittedAt,
      ...(approvedAt ? { approvedAt } : {}),
      ...(approvedAt && opts.approvedById ? { approvedById: opts.approvedById } : {}),
    },
    update: {
      status: opts.ts,
      billableMinutes: billable,
      submittedAt,
      ...(approvedAt ? { approvedAt } : {}),
      ...(approvedAt && opts.approvedById ? { approvedById: opts.approvedById } : {}),
    },
    select: { id: true },
  });

  return { timesheetId: ts.id, grossCents, endsAt };
}

export async function seedDemoAccounts(by: { userId: string; name: string }): Promise<{ werkgeverUserId: string; werkerUserId: string }> {
  // Eén willekeurig wachtwoord voor alle demo-accounts, uit KV (nooit uit de broncode).
  const wachtwoord = await wachtwoordOfMaak();
  const hash = await bcrypt.hash(wachtwoord, 10);

  // 1. Werkgever (opdrachtgever) + tenant.
  const werkgeverUserId = await ensureUser({ type: "bedrijf", fullName: "Demo Beheerder", email: DEMO_WERKGEVER_EMAIL, password: wachtwoord, companyName: DEMO_BEDRIJF, dashboard: "personeel" });
  await prisma.user.update({ where: { id: werkgeverUserId }, data: { emailVerifiedAt: new Date(), passwordHash: hash } });
  const hqMembership = await prisma.membership.findFirst({ where: { userId: werkgeverUserId, role: "HQ_ADMIN" }, select: { tenantId: true } });
  if (!hqMembership) throw new Error("Demo-werkgever heeft geen HQ_ADMIN-lidmaatschap.");
  const tenantId = hqMembership.tenantId;

  // De werkgever (en zijn bedrijf) kosteloos, zodat de demo nooit iets factureert.
  await setComp({ userId: werkgeverUserId, email: DEMO_WERKGEVER_EMAIL, tenantIds: [tenantId], on: true, reason: "demo-account", by });

  // Het demo-bedrijf telt als "eigen test": de klussen (hierna aangemaakt) gelden als testklus,
  // dus ze bereiken geen echte werkers, staan niet in de Google/Indeed-feed en tellen niet als
  // echte vraag (lib/shifts/testklus.ts, lib/public-shifts.ts, lib/matching, lib/admin/*).
  await zetEigenTest("tenant", tenantId, true, { userId: by.userId });

  // 2. Vestigingen.
  for (const b of BRANCHES) {
    await prisma.branch.upsert({
      where: { id: b.id },
      create: { id: b.id, tenantId, name: b.name, addressLine: b.addressLine, postalCode: b.postalCode, city: b.city, latitude: b.latitude, longitude: b.longitude, geofenceRadiusMeters: 150, matchingConfig: { minScore: 0.5, maxTravelMinutes: 75, offerTtlMinutes: 20, notificationWaveSize: 6 } },
      update: { name: b.name, addressLine: b.addressLine, postalCode: b.postalCode, city: b.city, latitude: b.latitude, longitude: b.longitude },
    });
  }

  // 3. Werker (zzp) + profiel.
  const werkerUserId = await ensureUser({ type: "freelancer", fullName: "Demo Werker", email: DEMO_WERKER_EMAIL, password: wachtwoord, workerKind: "zzp" });
  await prisma.user.update({ where: { id: werkerUserId }, data: { emailVerifiedAt: new Date(), kycStatus: "VERIFIED", passwordHash: hash } });
  const werkerFpId = await ensureProfile({ userId: werkerUserId, fpId: "demo_fp_werker", kvk: "90000001", lat: 52.3676, lng: 4.9041, pc: "1012 LG", badge: "GOLD" });

  // Extra demo-freelancers, zodat matches en "actieve freelancers" gevuld zijn.
  const extraFpIds: string[] = [];
  for (const f of EXTRA_FREELANCERS) {
    const uid = await ensureUser({ type: "freelancer", fullName: f.name, email: f.email, password: wachtwoord, workerKind: "zzp" });
    await prisma.user.update({ where: { id: uid }, data: { emailVerifiedAt: new Date(), kycStatus: "VERIFIED", passwordHash: hash } });
    extraFpIds.push(await ensureProfile({ userId: uid, fpId: f.fpId, kvk: f.kvk, lat: f.lat, lng: f.lng, pc: f.pc, badge: f.badge }));
  }

  // 4. Open klussen.
  for (const s of OPEN_SHIFTS) {
    const startsAt = at(s.dayOffset, s.hour);
    const endsAt = new Date(startsAt.getTime() + s.dur * 3_600_000);
    const data = { branchId: s.branchId, title: s.title, description: `${s.title} — voorbeeldklus. Reageer en volg de flow.`, minSkillRating: 0, startsAt, endsAt, breakMinutes: s.dur >= 6 ? 30 : 15, hourlyRateCents: s.rate, positions: s.positions, status: "OPEN" as const };
    await prisma.shift.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
  }

  // 5. Een paar reacties (matches) op open klussen.
  const fp0 = extraFpIds[0];
  const fp1 = extraFpIds[1];
  if (fp0) {
    await match("demo_shift_demo_01", fp0, "NOTIFIED");
    await match("demo_shift_demo_03", fp0, "VIEWED");
  }
  if (fp1) await match("demo_shift_demo_01", fp1, "ACCEPTED");

  // 6. Eén in te vullen urenbriefje bij de werkgever (KPI "uren goedkeuren"), door een extra freelancer.
  if (fp0) {
    await afgerondeKlus({ shiftId: "demo_shift_demo_sub", branchId: "demo_loc_demo_ams", title: "Schoonmaak avonddienst", rate: 1650, dur: 4, dayOffset: -1, hour: 17, freelancerId: fp0, ts: "SUBMITTED" });
  }

  // 7. Werker: één ingediend + één goedgekeurd met factuur en betaling (vult facturen + "besteed deze maand" + "uitbetaald").
  await afgerondeKlus({ shiftId: "demo_shift_demo_wsub", branchId: "demo_loc_demo_rtm", title: "Kassadienst weekend", rate: 1750, dur: 6, dayOffset: -4, hour: 10, freelancerId: werkerFpId, ts: "SUBMITTED" });
  const betaald = await afgerondeKlus({ shiftId: "demo_shift_demo_inv", branchId: "demo_loc_demo_ams", title: "Bediening lunchservice", rate: 1900, dur: 5, dayOffset: -9, hour: 11, freelancerId: werkerFpId, ts: "APPROVED", approvedById: werkgeverUserId });

  const issuedAt = new Date(betaald.endsAt.getTime() + 2 * DAY);
  await prisma.invoice.upsert({
    where: { id: "demo_inv_01" },
    create: {
      id: "demo_inv_01",
      number: "ZF-INV-DEMO-001",
      type: "SELF_BILL_FREELANCER",
      status: "PAID",
      timesheetId: betaald.timesheetId,
      issuerFreelancerId: werkerFpId,
      recipientTenantId: tenantId,
      vatTreatment: "REVERSE_CHARGE",
      vatRate: 0,
      subtotalCents: betaald.grossCents,
      vatCents: 0,
      totalCents: betaald.grossCents,
      issuedAt,
      paidAt: new Date(issuedAt.getTime() + 60_000),
    },
    update: { status: "PAID", subtotalCents: betaald.grossCents, totalCents: betaald.grossCents, issuedAt },
  });
  await prisma.payment.upsert({
    where: { invoiceId: "demo_inv_01" },
    create: {
      invoiceId: "demo_inv_01",
      method: "SEPA_INSTANT",
      status: "SETTLED",
      amountCents: betaald.grossCents,
      debtorIban: PLATFORM_IBAN,
      creditorIban: PLATFORM_IBAN,
      endToEndId: "E2E-DEMO-INV-001",
      submittedAt: issuedAt,
      settledAt: new Date(issuedAt.getTime() + 60_000),
    },
    update: { status: "SETTLED", amountCents: betaald.grossCents },
  });

  // 8. Chat tussen werkgever en werker (alleen als er nog niets staat: idempotent).
  const thread = await ensureDirectThread(werkgeverUserId, werkerUserId, { subject: "Bediening lunchservice", shiftId: "demo_shift_demo_inv", shiftTitle: "Bediening lunchservice" });
  const bestaande = await getMessages(thread.id, 5);
  if (bestaande.length === 0) {
    await postMessage(thread.id, werkgeverUserId, "Hoi! Bedankt voor je aanmelding op de lunchdienst. Kun je er zaterdag om 11:00 zijn?", "text");
    await postMessage(thread.id, werkerUserId, "Ja hoor, dat lukt. Zal ik me melden bij de ingang aan het Damrak?", "text");
    await postMessage(thread.id, werkgeverUserId, "Top, precies. Vraag naar de bedrijfsleider. Fijne dienst!", "text");
    await postMessage(thread.id, werkerUserId, "Helder, tot zaterdag!", "text");
  }

  return { werkgeverUserId, werkerUserId };
}

export async function clearDemoAccounts(): Promise<void> {
  const emails = [DEMO_WERKGEVER_EMAIL, DEMO_WERKER_EMAIL, ...EXTRA_FREELANCERS.map((e) => e.email)];
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true, memberships: { select: { tenantId: true, role: true } } } });
  const werkgever = users.find((u) => u.email === DEMO_WERKGEVER_EMAIL) ?? null;
  const werker = users.find((u) => u.email === DEMO_WERKER_EMAIL) ?? null;
  const tenantId = werkgever?.memberships.find((m) => m.role === "HQ_ADMIN")?.tenantId ?? null;

  // Chat tussen werkgever en werker weg.
  if (werkgever && werker) {
    for (const t of await listThreadsForUser(werkgever.id, false)) {
      if (t.kind === "direct" && t.participants.includes(werker.id)) {
        await kvDelete(`chat-thread:${t.id}`).catch(() => undefined);
        await kvDelete(`chat-messages:${t.id}`).catch(() => undefined);
      }
    }
  }

  // Demo-klusdata (demo_shift_demo*): betalingen → facturen → urenbriefjes → toewijzingen → matches → klussen.
  const shiftIds = (await prisma.shift.findMany({ where: { id: { startsWith: "demo_shift_demo" } }, select: { id: true } })).map((s) => s.id);
  if (shiftIds.length) {
    const tsIds = (await prisma.timesheet.findMany({ where: { assignment: { shiftId: { in: shiftIds } } }, select: { id: true } })).map((t) => t.id);
    if (tsIds.length) {
      await prisma.payment.deleteMany({ where: { invoice: { timesheetId: { in: tsIds } } } });
      await prisma.invoice.deleteMany({ where: { timesheetId: { in: tsIds } } });
    }
    await prisma.timesheet.deleteMany({ where: { assignment: { shiftId: { in: shiftIds } } } });
    await prisma.shiftAssignment.deleteMany({ where: { shiftId: { in: shiftIds } } });
    await prisma.shiftMatch.deleteMany({ where: { shiftId: { in: shiftIds } } });
    await prisma.shift.deleteMany({ where: { id: { in: shiftIds } } });
  }
  // Losse demo-facturen op id-prefix (voor de zekerheid).
  await prisma.payment.deleteMany({ where: { invoice: { id: { startsWith: "demo_inv_" } } } });
  await prisma.invoice.deleteMany({ where: { id: { startsWith: "demo_inv_" } } });

  await prisma.branch.deleteMany({ where: { id: { startsWith: "demo_loc_demo" } } });
  await prisma.freelancerProfile.deleteMany({ where: { id: { startsWith: "demo_fp_" } } });

  if (werkgever) {
    await setComp({ userId: werkgever.id, email: werkgever.email, tenantIds: tenantId ? [tenantId] : [], on: false, reason: "demo weggehaald", by: { userId: werkgever.id, name: "demo" } }).catch(() => undefined);
  }
  // Eigen-test-markering en het demo-wachtwoord weg.
  if (tenantId) await zetEigenTest("tenant", tenantId, false, { userId: werkgever?.id ?? "demo" }).catch(() => undefined);
  await kvDelete(WACHTWOORD_SLEUTEL).catch(() => undefined);

  // Gebruikers (cascade: lidmaatschappen + profiel), daarna de lege demo-tenant.
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
}

/** Een nieuw willekeurig wachtwoord zetten voor alle demo-accounts (voor als het oude is rondgegaan).
 *  Werkt alleen als de demo bestaat; geeft het nieuwe wachtwoord terug, of null. */
export async function demoWachtwoordVernieuwen(): Promise<string | null> {
  const emails = [DEMO_WERKGEVER_EMAIL, DEMO_WERKER_EMAIL, ...EXTRA_FREELANCERS.map((e) => e.email)];
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  if (users.length === 0) return null;
  const w = nieuwWachtwoord();
  const hash = await bcrypt.hash(w, 10);
  await kvSet(WACHTWOORD_SLEUTEL, w);
  await prisma.user.updateMany({ where: { email: { in: emails } }, data: { passwordHash: hash } });
  // Al ingelogde demo-sessies vervallen, zodat een rondgegaan wachtwoord echt wordt afgesneden.
  await Promise.all(users.map((u) => trekSessiesIn(u.id).catch(() => undefined)));
  return w;
}

export async function demoAccountStatus(): Promise<{ werkgever: boolean; werker: boolean }> {
  const [wg, wk] = await Promise.all([
    prisma.user.findUnique({ where: { email: DEMO_WERKGEVER_EMAIL }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: DEMO_WERKER_EMAIL }, select: { id: true } }),
  ]);
  return { werkgever: Boolean(wg), werker: Boolean(wk) };
}

async function inspectTargetFor(email: string): Promise<InspectTarget | null> {
  const user = await prisma.user.findFirst({
    where: { email, disabledAt: null },
    include: { memberships: { include: { scopedBranches: { select: { branchId: true } } } } },
  });
  if (!user) return null;
  const roles: RoleGrant[] = user.memberships.map((m) => ({ role: m.role, organizationId: m.tenantId, locationIds: m.scopedBranches.map((b) => b.branchId) }));
  return { sub: user.id, email: user.email, name: user.fullName, roles };
}

export async function demoInspectTargets(): Promise<{ werkgever: InspectTarget | null; werker: InspectTarget | null }> {
  const [werkgever, werker] = await Promise.all([inspectTargetFor(DEMO_WERKGEVER_EMAIL), inspectTargetFor(DEMO_WERKER_EMAIL)]);
  return { werkgever, werker };
}
