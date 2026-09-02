/* eslint-disable no-console */
import {
  PrismaClient,
  type Prisma,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// --- helpers --------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY);
}
function atTime(base: Date, h: number, m = 0): Date {
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}
function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

const PASSWORD = "Zeker!2026";
// A single mod-97-valid NL test IBAN, reused for every freelancer payout.
const TEST_IBAN = "NL91ABNA0417164300";

async function hash(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

// --- reset ---------------------------------------------------------------

async function reset(): Promise<void> {
  // FK-safe order: children first.
  await prisma.analyticsEvent.deleteMany();
  await prisma.jarvisEvent.deleteMany();
  await prisma.upload.deleteMany();
  await prisma.jarvisTurn.deleteMany();
  await prisma.aiUsageLog.deleteMany();
  await prisma.ragChunk.deleteMany();
  await prisma.voiceAnnouncement.deleteMany();
  await prisma.orchestrationFinding.deleteMany();
  await prisma.orchestrationRun.deleteMany();
  await prisma.salesOutreach.deleteMany();
  await prisma.salesLead.deleteMany();
  await prisma.engagementEvent.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.invoiceSequence.deleteMany();
  await prisma.dbaComplianceRecord.deleteMany();
  await prisma.modelAgreement.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.replacementRequest.deleteMany();
  await prisma.gpsEvent.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.timesheet.deleteMany();
  await prisma.shiftMatch.deleteMany();
  await prisma.shiftAssignment.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.freelancerSkill.deleteMany();
  await prisma.pushToken.deleteMany();
  await prisma.webPushSubscription.deleteMany();
  await prisma.diditWebhookEvent.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.identityVerification.deleteMany();
  await prisma.deviceFingerprint.deleteMany();
  await prisma.freelancerProfile.deleteMany();
  await prisma.branchManager.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.user.deleteMany();
  await prisma.companyRegistration.deleteMany();
  await prisma.tenant.deleteMany();
}

// --- seed --------------------------------------------------------------

const RESET_REQUESTED =
  process.env.SEED_RESET === "true" || process.argv.includes("--reset");

async function main(): Promise<void> {
  // --- Data protection ---------------------------------------------------
  // The seed NEVER wipes an initialised database unless explicitly asked
  // (`npm run db:seed:reset`). Existing data and passwords stay untouched.
  const existing = await prisma.tenant.findFirst({
    where: { type: "PLATFORM" },
    select: { id: true },
  });
  if (existing && !RESET_REQUESTED) {
    console.log(
      "→ Database is al geïnitialiseerd — seed overgeslagen. Alle data en " +
        "wachtwoorden blijven behouden.\n" +
        "  Wil je écht opnieuw beginnen: npm run db:seed:reset",
    );
    return;
  }
  if (!existing) {
    console.log("→ Lege database — demo-data plaatsen…");
  } else {
    console.log("→ SEED_RESET aangevraagd — database wordt gewist en opnieuw gevuld…");
    await reset();
  }

  const pwHash = await hash(PASSWORD);

  // ---- Tenants (organizations) ----------------------------------------
  console.log("→ Organizations & locations…");
  const platform = await prisma.tenant.create({
    data: {
      id: "org_platform",
      name: "ZekerFlex B.V.",
      type: "PLATFORM",
      country: "NL",
      kvkNumber: "90000001",
      vatNumber: "NL900000010B01",
    },
  });

  const hqRegistration = await prisma.companyRegistration.create({
    data: {
      kvkNumber: "34567890",
      source: "SEED",
      legalName: "Supermarkt Keten Nederland B.V.",
      tradeName: "Supermarkt Keten NL",
      legalForm: "Besloten Vennootschap",
      status: "ACTIVE",
      isActive: true,
      insolvent: false,
      establishmentNumber: "000012345678",
      street: "Hoofdkantoorlaan",
      houseNumber: "1",
      postalCode: "3542 AD",
      city: "Utrecht",
      country: "NL",
      sbiCodes: ["4711", "4719"],
      activities: [
        { sbiCode: "4711", description: "Supermarkten en dergelijke winkels", isMain: true },
        { sbiCode: "4719", description: "Warenhuizen", isMain: false },
      ],
      registrationDate: addDays(now, -4000),
      employeeCount: 4200,
      vatNumber: "NL345678900B01",
      vatValid: true,
      vatStatus: "validated",
      vatValidatedAt: addDays(now, -10),
      rawProfile: { seeded: true, kvkNumber: "34567890" },
    },
  });

  const hq = await prisma.tenant.create({
    data: {
      id: "org_supermarkt_hq",
      name: "Supermarkt Keten NL",
      type: "ENTERPRISE_HQ",
      country: "NL",
      kvkNumber: "34567890",
      vatNumber: "NL345678900B01",
      ssoEnabled: true,
      ssoIssuerUrl: "https://sso.supermarktketen.nl",
      companyRegistrationId: hqRegistration.id,
    },
  });

  const amsterdam = await prisma.branch.create({
    data: {
      id: "loc_ams_centrum",
      tenantId: hq.id,
      name: "Amsterdam Centrum",
      costCenter: "NL-AMS-001",
      addressLine: "Nieuwezijds Voorburgwal 100",
      postalCode: "1012 SG",
      city: "Amsterdam",
      latitude: 52.3702,
      longitude: 4.8952,
      geofenceRadiusMeters: 150,
      matchingConfig: {
        minScore: 0.55,
        maxTravelMinutes: 60,
        weights: { reliability: 0.4, travel: 0.35, skill: 0.25 },
        travelModes: ["TRANSIT", "BICYCLING", "DRIVING"],
        offerTtlMinutes: 15,
        notificationWaveSize: 5,
        autoAcceptance: {
          enabled: true,
          minScore: 0.82,
          minAcceptanceScore: 0.8,
          minReliabilityScore: 0.9,
          requireWithinGeofence: false,
          maxSeatsToAutoFill: 1,
        },
      } satisfies Prisma.InputJsonValue,
    },
  });

  const utrecht = await prisma.branch.create({
    data: {
      id: "loc_utr_cs",
      tenantId: hq.id,
      name: "Utrecht CS",
      costCenter: "NL-UTR-001",
      addressLine: "Stationshal 12",
      postalCode: "3511 CE",
      city: "Utrecht",
      latitude: 52.0894,
      longitude: 5.1101,
      geofenceRadiusMeters: 120,
      matchingConfig: {
        minScore: 0.5,
        maxTravelMinutes: 70,
        offerTtlMinutes: 20,
        notificationWaveSize: 8,
      } satisfies Prisma.InputJsonValue,
    },
  });

  // ---- Staff users ----------------------------------------------------
  console.log("→ Platform admin, HQ admin, local managers…");
  const platformAdmin = await prisma.user.create({
    data: {
      id: "usr_platform_admin",
      email: "admin@zekerflex.nl",
      fullName: "Priya Platform",
      passwordHash: pwHash,
      kycStatus: "VERIFIED",
      memberships: {
        create: { tenantId: platform.id, role: "PLATFORM_ADMIN" },
      },
    },
  });

  const hqAdmin = await prisma.user.create({
    data: {
      id: "usr_hq_admin",
      email: "hq@supermarktketen.nl",
      fullName: "Hendrik Hoofdkantoor",
      passwordHash: pwHash,
      kycStatus: "VERIFIED",
      memberships: { create: { tenantId: hq.id, role: "HQ_ADMIN" } },
    },
  });

  const disputeManager = await prisma.user.create({
    data: {
      id: "usr_dispute_manager",
      email: "disputes@supermarktketen.nl",
      fullName: "Dana Dispuut",
      passwordHash: pwHash,
      kycStatus: "VERIFIED",
      memberships: { create: { tenantId: hq.id, role: "DISPUTE_MANAGER" } },
    },
  });

  const managerAms = await prisma.user.create({
    data: {
      id: "usr_manager_ams",
      email: "manager.amsterdam@supermarktketen.nl",
      fullName: "Merel Amsterdam",
      passwordHash: pwHash,
      kycStatus: "VERIFIED",
      memberships: { create: { tenantId: hq.id, role: "LOCAL_MANAGER" } },
    },
    include: { memberships: true },
  });
  await prisma.branchManager.create({
    data: {
      membershipId: managerAms.memberships[0]!.id,
      branchId: amsterdam.id,
    },
  });

  const managerUtr = await prisma.user.create({
    data: {
      id: "usr_manager_utr",
      email: "manager.utrecht@supermarktketen.nl",
      fullName: "Ugo Utrecht",
      passwordHash: pwHash,
      kycStatus: "VERIFIED",
      memberships: { create: { tenantId: hq.id, role: "LOCAL_MANAGER" } },
    },
    include: { memberships: true },
  });
  await prisma.branchManager.create({
    data: {
      membershipId: managerUtr.memberships[0]!.id,
      branchId: utrecht.id,
    },
  });

  // ---- Skills -------------------------------------------------------
  console.log("→ Skills…");
  const [vakkenvullen, kassa, teamleider] = await Promise.all([
    prisma.skill.create({
      data: { id: "skill_vakkenvullen", name: "Vakkenvullen", category: "RETAIL" },
    }),
    prisma.skill.create({
      data: { id: "skill_kassa", name: "Kassa", category: "RETAIL" },
    }),
    prisma.skill.create({
      data: { id: "skill_teamleider", name: "Teamleider", category: "RETAIL" },
    }),
  ]);

  // ---- Freelancers -------------------------------------------------
  console.log("→ Freelancers (BRONZE → PLATINUM)…");

  interface FreelancerSpec {
    id: string;
    email: string;
    name: string;
    badge: "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";
    kyc: "VERIFIED" | "PENDING";
    reliability: number;
    acceptance: number;
    home: { lat: number; lng: number; postal: string };
    kvk: string;
    vat: string | null;
    valid: boolean;
    skills: { skillId: string; rating: number; shifts: number }[];
    deviceHash: string;
    sharedDeviceWith?: string;
    quietHours?: { start: number; end: number };
  }

  const specs: FreelancerSpec[] = [
    {
      id: "usr_fl_bronze",
      email: "sam.bronze@freelancer.nl",
      name: "Sam de Vries",
      badge: "BRONZE",
      kyc: "VERIFIED",
      reliability: 0.72,
      acceptance: 0.44,
      home: { lat: 52.3663, lng: 4.901, postal: "1051 JL" },
      kvk: "60000001",
      vat: "NL600000010B01",
      valid: true,
      skills: [{ skillId: vakkenvullen.id, rating: 3.6, shifts: 12 }],
      deviceHash: "hw_sha256_bronze_0001",
    },
    {
      id: "usr_fl_silver",
      email: "noa.silver@freelancer.nl",
      name: "Noa Jansen",
      badge: "SILVER",
      kyc: "VERIFIED",
      reliability: 0.83,
      acceptance: 0.61,
      home: { lat: 52.0801, lng: 5.1235, postal: "3572 KE" },
      kvk: "60000002",
      vat: "NL600000020B01",
      valid: true,
      skills: [
        { skillId: kassa.id, rating: 4.2, shifts: 48 },
        { skillId: vakkenvullen.id, rating: 3.9, shifts: 30 },
      ],
      deviceHash: "hw_sha256_silver_0002",
    },
    {
      id: "usr_fl_gold",
      email: "liam.gold@freelancer.nl",
      name: "Liam Bakker",
      badge: "GOLD",
      kyc: "VERIFIED",
      reliability: 0.94,
      acceptance: 0.86,
      home: { lat: 52.3745, lng: 4.9012, postal: "1018 VN" },
      kvk: "60000003",
      vat: "NL600000030B01",
      valid: true,
      skills: [
        { skillId: vakkenvullen.id, rating: 4.7, shifts: 120 },
        { skillId: kassa.id, rating: 4.4, shifts: 60 },
      ],
      deviceHash: "hw_sha256_gold_0003",
    },
    {
      id: "usr_fl_platinum",
      email: "eva.platinum@freelancer.nl",
      name: "Eva Smit",
      badge: "PLATINUM",
      kyc: "VERIFIED",
      reliability: 0.97,
      acceptance: 0.93,
      home: { lat: 52.0915, lng: 5.1044, postal: "3511 LX" },
      kvk: "60000004",
      vat: "NL600000040B01",
      valid: true,
      skills: [
        { skillId: teamleider.id, rating: 4.8, shifts: 210 },
        { skillId: kassa.id, rating: 4.9, shifts: 180 },
        { skillId: vakkenvullen.id, rating: 4.6, shifts: 150 },
      ],
      deviceHash: "hw_sha256_platinum_0004",
    },
    {
      id: "usr_fl_pending",
      email: "kai.pending@freelancer.nl",
      name: "Kai Mulder",
      badge: "GOLD",
      kyc: "PENDING",
      reliability: 0.8,
      acceptance: 0.7,
      home: { lat: 52.089, lng: 5.11, postal: "3511 CE" },
      kvk: "60000005",
      vat: null,
      valid: false,
      skills: [{ skillId: kassa.id, rating: 4.0, shifts: 20 }],
      // Same hardware as the PLATINUM account -> account-sharing signal.
      deviceHash: "hw_sha256_platinum_0004",
      sharedDeviceWith: "usr_fl_platinum",
      // Behavioural timing: no push pings between 23:00 and 07:00 local.
      quietHours: { start: 23, end: 7 },
    },
  ];

  const freelancerProfiles: Record<string, string> = {}; // userId -> profileId

  for (const s of specs) {
    const home = s.home;

    const user = await prisma.user.create({
      data: {
        id: s.id,
        email: s.email,
        fullName: s.name,
        passwordHash: pwHash,
        kycStatus: s.kyc,
        memberships: { create: { tenantId: platform.id, role: "FREELANCER" } },
      },
    });

    const profile = await prisma.freelancerProfile.create({
      data: {
        id: `fp_${s.id}`,
        userId: user.id,
        kvkNumber: s.kvk,
        vatNumber: s.vat,
        vatValid: s.valid,
        kvkValid: s.valid,
        country: "NL",
        payoutIban: TEST_IBAN,
        homeLatitude: home.lat,
        homeLongitude: home.lng,
        homePostalCode: home.postal,
        timezone: "Europe/Amsterdam",
        quietHoursStart: s.quietHours?.start ?? null,
        quietHoursEnd: s.quietHours?.end ?? null,
        reliabilityScore: s.reliability,
        acceptanceScore: s.acceptance,
        badgeLevel: s.badge,
        shiftsCompleted: s.skills.reduce((a, sk) => a + sk.shifts, 0),
        skills: {
          create: s.skills.map((sk) => ({
            skillId: sk.skillId,
            rating: sk.rating,
            shiftsWorked: sk.shifts,
          })),
        },
        pushTokens: {
          create: {
            token: `fcm-token-${s.id}`,
            platform: s.id.endsWith("gold") ? "ios" : "android",
          },
        },
      },
    });
    freelancerProfiles[user.id] = profile.id;

    await prisma.deviceFingerprint.create({
      data: {
        userId: user.id,
        hardwareHash: s.deviceHash,
        platform: "android",
        trusted: s.kyc === "VERIFIED" && !s.sharedDeviceWith,
        sharedWithUserIds: s.sharedDeviceWith ? [s.sharedDeviceWith] : [],
      },
    });

    const verified = s.kyc === "VERIFIED";
    await prisma.identityVerification.create({
      data: {
        userId: user.id,
        provider: "DIDIT",
        sessionId: `didit_seed_${s.id}`,
        sessionUrl: `https://verify.didit.me/session/didit_seed_${s.id}`,
        workflowId: "seed-workflow",
        vendorData: user.id,
        decisionStatus: verified ? "Approved" : "In Progress",
        documentType: verified ? "PASSPORT" : null,
        documentNumberHash: verified ? `sha256:doc:${s.id}` : null,
        nfcChipVerified: verified,
        livenessScore: verified ? 0.98 : null,
        faceMatchScore: verified ? 0.96 : null,
        status: s.kyc,
        verifiedAt: verified ? addDays(now, -120) : null,
        expiresAt: verified ? addDays(now, 245) : null,
        lastWebhookAt: verified ? addDays(now, -120) : null,
        rawPayload: { seeded: true },
      },
    });

    // Company registration snapshot (KVKBase) for freelancers with a valid KvK.
    if (s.valid) {
      const reg = await prisma.companyRegistration.create({
        data: {
          kvkNumber: s.kvk,
          source: "SEED",
          legalName: `${s.name} (${s.badge.toLowerCase()})`,
          tradeName: s.name,
          legalForm: "Eenmanszaak",
          status: "ACTIVE",
          isActive: true,
          insolvent: false,
          establishmentNumber: `0000${s.kvk}`.slice(-12),
          street: "Voorbeeldstraat",
          houseNumber: "1",
          postalCode: home.postal,
          city: s.home.lat > 52.2 ? "Amsterdam" : "Utrecht",
          country: "NL",
          sbiCodes: ["4711"],
          activities: [
            {
              sbiCode: "4711",
              description: "Supermarkten en dergelijke winkels met een algemeen assortiment",
              isMain: true,
            },
          ],
          registrationDate: addDays(now, -900),
          employeeCount: 1,
          vatNumber: s.vat,
          vatValid: Boolean(s.vat),
          vatStatus: s.vat ? "validated" : null,
          vatValidatedAt: s.vat ? addDays(now, -10) : null,
          rawProfile: { seeded: true, kvkNumber: s.kvk },
        },
      });
      await prisma.freelancerProfile.update({
        where: { id: profile.id },
        data: {
          companyRegistrationId: reg.id,
          kvkValid: true,
          kvkVerifiedAt: addDays(now, -100),
        },
      });
    }
  }

  // Back-reference the shared device on the PLATINUM account too.
  await prisma.deviceFingerprint.updateMany({
    where: { userId: "usr_fl_platinum" },
    data: { sharedWithUserIds: ["usr_fl_pending"], trusted: false },
  });

  const glob = freelancerProfiles;

  // ---- Active job postings (3) -----------------------------------
  console.log("→ Active job postings…");
  const tomorrow = addDays(now, 1);
  const in3 = addDays(now, 3);
  const in7 = addDays(now, 7);

  const shiftA = await prisma.shift.create({
    data: {
      id: "shift_ams_vakkenvullen",
      branchId: amsterdam.id,
      title: "Vakkenvullen avonddienst",
      description: "Aanvullen versafdeling en kruidenierswaren.",
      requiredSkillId: vakkenvullen.id,
      minSkillRating: 0,
      startsAt: atTime(tomorrow, 17, 0),
      endsAt: atTime(tomorrow, 22, 0),
      breakMinutes: 15,
      hourlyRateCents: 1800,
      positions: 2,
      status: "OPEN",
    },
  });

  const shiftB = await prisma.shift.create({
    data: {
      id: "shift_utr_kassa",
      branchId: utrecht.id,
      title: "Kassamedewerker weekend",
      description: "Kassadienst tijdens piekuren.",
      requiredSkillId: kassa.id,
      minSkillRating: 3.5,
      startsAt: atTime(in3, 9, 0),
      endsAt: atTime(in3, 17, 0),
      breakMinutes: 30,
      hourlyRateCents: 1750,
      positions: 1,
      status: "OPEN",
    },
  });

  const shiftC = await prisma.shift.create({
    data: {
      id: "shift_ams_teamleider",
      branchId: amsterdam.id,
      title: "Teamleider dagdienst",
      description: "Aansturen van het winkelteam, openen en afsluiten.",
      requiredSkillId: teamleider.id,
      minSkillRating: 4.0,
      startsAt: atTime(in7, 8, 0),
      endsAt: atTime(in7, 16, 30),
      breakMinutes: 30,
      hourlyRateCents: 2600,
      positions: 1,
      status: "OPEN",
    },
  });

  // ---- Completed shifts + timesheets (2) ------------------------
  console.log("→ Completed shifts, timesheets & GPS trails…");
  const lastWeek = addDays(now, -7);
  const lastWeek2 = addDays(now, -6);

  // TS1: clean submission, ready for approval.
  const pastShiftA = await prisma.shift.create({
    data: {
      id: "shift_past_ams",
      branchId: amsterdam.id,
      title: "Vakkenvullen ochtenddienst",
      requiredSkillId: vakkenvullen.id,
      startsAt: atTime(lastWeek, 17, 0),
      endsAt: atTime(lastWeek, 22, 0),
      breakMinutes: 15,
      hourlyRateCents: 1800,
      positions: 1,
      status: "COMPLETED",
    },
  });
  const assignA = await prisma.shiftAssignment.create({
    data: {
      shiftId: pastShiftA.id,
      freelancerId: glob["usr_fl_gold"]!,
      source: "ACCEPTED",
      acceptedAt: addDays(lastWeek, -2),
    },
  });
  const ts1ActualStart = atTime(lastWeek, 16, 58);
  const ts1ActualEnd = atTime(lastWeek, 22, 5);
  const ts1Billable = minutesBetween(ts1ActualStart, ts1ActualEnd) - 15;
  const timesheet1 = await prisma.timesheet.create({
    data: {
      id: "ts_clean_ams",
      assignmentId: assignA.id,
      freelancerId: glob["usr_fl_gold"]!,
      branchId: amsterdam.id,
      scheduledStart: atTime(lastWeek, 17, 0),
      scheduledEnd: atTime(lastWeek, 22, 0),
      actualStart: ts1ActualStart,
      actualEnd: ts1ActualEnd,
      breakMinutes: 15,
      hourlyRateCents: 1800,
      billableMinutes: ts1Billable,
      status: "SUBMITTED",
      submittedAt: atTime(lastWeek, 22, 10),
    },
  });
  await prisma.gpsEvent.createMany({
    data: [
      {
        timesheetId: timesheet1.id,
        type: "CHECK_IN",
        latitude: 52.3703,
        longitude: 4.8953,
        accuracyMeters: 8,
        recordedAt: ts1ActualStart,
        distanceToBranchMeters: 22,
        withinGeofence: true,
        deviceHash: "hw_sha256_gold_0003",
      },
      {
        timesheetId: timesheet1.id,
        type: "HEARTBEAT",
        latitude: 52.3701,
        longitude: 4.8951,
        accuracyMeters: 12,
        recordedAt: atTime(lastWeek, 19, 0),
        distanceToBranchMeters: 30,
        withinGeofence: true,
        deviceHash: "hw_sha256_gold_0003",
      },
      {
        timesheetId: timesheet1.id,
        type: "CHECK_OUT",
        latitude: 52.3704,
        longitude: 4.8955,
        accuracyMeters: 9,
        recordedAt: ts1ActualEnd,
        distanceToBranchMeters: 35,
        withinGeofence: true,
        deviceHash: "hw_sha256_gold_0003",
      },
    ],
  });

  // TS2: disputed - freelancer left the geofence long before check-out.
  const pastShiftB = await prisma.shift.create({
    data: {
      id: "shift_past_utr",
      branchId: utrecht.id,
      title: "Kassadienst zaterdag",
      requiredSkillId: kassa.id,
      startsAt: atTime(lastWeek2, 9, 0),
      endsAt: atTime(lastWeek2, 17, 0),
      breakMinutes: 30,
      hourlyRateCents: 1750,
      positions: 1,
      status: "COMPLETED",
    },
  });
  const assignB = await prisma.shiftAssignment.create({
    data: {
      shiftId: pastShiftB.id,
      freelancerId: glob["usr_fl_silver"]!,
      source: "ACCEPTED",
      acceptedAt: addDays(lastWeek2, -3),
    },
  });
  const ts2ActualStart = atTime(lastWeek2, 9, 2);
  const ts2ActualEnd = atTime(lastWeek2, 17, 0);
  const ts2Claimed = minutesBetween(ts2ActualStart, ts2ActualEnd) - 30; // 448
  const ts2Proposed = 358; // manager: GPS shows departure ~15:30
  const timesheet2 = await prisma.timesheet.create({
    data: {
      id: "ts_disputed_utr",
      assignmentId: assignB.id,
      freelancerId: glob["usr_fl_silver"]!,
      branchId: utrecht.id,
      scheduledStart: atTime(lastWeek2, 9, 0),
      scheduledEnd: atTime(lastWeek2, 17, 0),
      actualStart: ts2ActualStart,
      actualEnd: ts2ActualEnd,
      breakMinutes: 30,
      hourlyRateCents: 1750,
      billableMinutes: ts2Claimed,
      status: "DISPUTED",
      submittedAt: atTime(lastWeek2, 17, 5),
    },
  });
  await prisma.gpsEvent.createMany({
    data: [
      {
        timesheetId: timesheet2.id,
        type: "CHECK_IN",
        latitude: 52.0895,
        longitude: 5.1102,
        accuracyMeters: 10,
        recordedAt: ts2ActualStart,
        distanceToBranchMeters: 18,
        withinGeofence: true,
        deviceHash: "hw_sha256_silver_0002",
      },
      {
        timesheetId: timesheet2.id,
        type: "HEARTBEAT",
        latitude: 52.0896,
        longitude: 5.1105,
        accuracyMeters: 14,
        recordedAt: atTime(lastWeek2, 12, 0),
        distanceToBranchMeters: 40,
        withinGeofence: true,
        deviceHash: "hw_sha256_silver_0002",
      },
      {
        timesheetId: timesheet2.id,
        type: "HEARTBEAT",
        latitude: 52.0966,
        longitude: 5.1201,
        accuracyMeters: 18,
        recordedAt: atTime(lastWeek2, 15, 40),
        distanceToBranchMeters: 890,
        withinGeofence: false,
        deviceHash: "hw_sha256_silver_0002",
      },
      {
        timesheetId: timesheet2.id,
        type: "CHECK_OUT",
        latitude: 52.097,
        longitude: 5.121,
        accuracyMeters: 20,
        recordedAt: ts2ActualEnd,
        distanceToBranchMeters: 940,
        withinGeofence: false,
        deviceHash: "hw_sha256_silver_0002",
      },
    ],
  });
  await prisma.dispute.create({
    data: {
      id: "dispute_utr_hours",
      timesheetId: timesheet2.id,
      raisedById: managerUtr.id,
      origin: "MANAGER_REVIEW",
      status: "OPEN",
      reason:
        "GPS toont vertrek uit de geofence rond 15:40, check-out om 17:00 op ~940m afstand. Geclaimde uren komen niet overeen met aanwezigheid op locatie.",
      claimedMinutes: ts2Claimed,
      proposedMinutes: ts2Proposed,
    },
  });

  // ---- Model agreements (modelovereenkomsten) ----------------
  console.log("→ Model agreements…");
  const year = now.getUTCFullYear();
  await prisma.counter.upsert({
    where: { key: `model-agreement:${year}` },
    create: { key: `model-agreement:${year}`, value: 2 },
    update: { value: 2 },
  });

  await prisma.modelAgreement.create({
    data: {
      reference: `ZF-MOD-${year}-000001`,
      freelancerId: glob["usr_fl_gold"]!,
      tenantId: hq.id,
      branchId: amsterdam.id,
      shiftId: pastShiftA.id,
      assignmentId: assignA.id,
      type: "VRIJE_VERVANGING",
      status: "ACTIVE",
      templateKey: "zekerflex/vrije-vervanging",
      templateVersion: "2024.1",
      freelancerLegalName: "Liam Bakker (gold)",
      freelancerKvkNumber: "60000003",
      clientLegalName: "Supermarkt Keten Nederland B.V.",
      clientKvkNumber: "34567890",
      hourlyRateCents: 1800,
      scopeDescription: "Vakkenvullen ochtenddienst",
      freelancerSignedAt: addDays(now, -9),
      clientSignedAt: addDays(now, -9),
    },
  });

  await prisma.modelAgreement.create({
    data: {
      reference: `ZF-MOD-${year}-000002`,
      freelancerId: glob["usr_fl_silver"]!,
      tenantId: hq.id,
      branchId: utrecht.id,
      shiftId: pastShiftB.id,
      assignmentId: assignB.id,
      type: "VRIJE_VERVANGING",
      status: "PENDING_CLIENT_SIGNATURE",
      templateKey: "zekerflex/vrije-vervanging",
      templateVersion: "2024.1",
      freelancerLegalName: "Noa Jansen (silver)",
      freelancerKvkNumber: "60000002",
      clientLegalName: "Supermarkt Keten Nederland B.V.",
      clientKvkNumber: "34567890",
      hourlyRateCents: 1750,
      scopeDescription: "Kassadienst zaterdag",
      freelancerSignedAt: addDays(now, -6),
    },
  });

  // ---- DBA compliance records --------------------------------
  console.log("→ DBA compliance metrics…");
  const windowStart = addDays(now, -365);

  await prisma.dbaComplianceRecord.createMany({
    data: [
      {
        freelancerId: glob["usr_fl_platinum"]!,
        branchId: amsterdam.id,
        windowStart,
        windowEnd: now,
        totalMinutes: 55_000,
        engagementCount: 92,
        distinctWeeks: 40,
        maxConsecutiveWeeks: 18,
        clientRevenueShare: 0.55,
        riskLevel: "MEDIUM",
        action: "WARN",
        rationale:
          "917 uur bij één opdrachtgever en 55% omzetaandeel. Nadert de drempels; freelancer aansporen tot spreiding over meerdere opdrachtgevers.",
      },
      {
        freelancerId: glob["usr_fl_gold"]!,
        branchId: amsterdam.id,
        windowStart,
        windowEnd: now,
        totalMinutes: 21_000,
        engagementCount: 34,
        distinctWeeks: 19,
        maxConsecutiveWeeks: 6,
        clientRevenueShare: 0.31,
        riskLevel: "LOW",
        action: "NONE",
        rationale: "Gezond patroon: gespreide inzet en beperkt omzetaandeel.",
      },
      {
        freelancerId: glob["usr_fl_silver"]!,
        branchId: utrecht.id,
        windowStart,
        windowEnd: now,
        totalMinutes: 49_000,
        engagementCount: 74,
        distinctWeeks: 31,
        maxConsecutiveWeeks: 27,
        clientRevenueShare: 0.72,
        riskLevel: "HIGH",
        action: "THROTTLE",
        rationale:
          "27 aaneengesloten weken en 72% omzetaandeel bij Utrecht CS. Nieuwe matches op deze vestiging 28 dagen geblokkeerd wegens risico op schijnzelfstandigheid.",
      },
    ],
  });

  await prisma.freelancerProfile.update({
    where: { id: glob["usr_fl_silver"]! },
    data: { matchingBlockedUntil: addDays(now, 28) },
  });

  // ---- Engagement events (Behavioural Timing Notifier v2) ----
  console.log("→ Engagement events…");
  {
    const goldProfile = glob["usr_fl_gold"]!;
    const eveningHours = [18, 19, 20, 21, 22];
    const events: { freelancerId: string; kind: "APP_OPEN" | "OFFER_RESPONDED" | "CHECK_IN"; occurredAt: Date }[] =
      [];
    for (let d = 1; d <= 35; d += 1) {
      const hits = 1 + (d % 3); // 1-3 opens per day
      for (let i = 0; i < hits; i += 1) {
        const day = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
        day.setHours(
          eveningHours[(d + i) % eveningHours.length]!,
          (d * 7 + i * 13) % 60,
          0,
          0,
        );
        events.push({
          freelancerId: goldProfile,
          kind: i === 0 ? "APP_OPEN" : d % 2 === 0 ? "OFFER_RESPONDED" : "CHECK_IN",
          occurredAt: day,
        });
      }
    }
    await prisma.engagementEvent.createMany({ data: events });
    await prisma.freelancerProfile.update({
      where: { id: goldProfile },
      data: { learnedActiveHours: [17, 18, 19, 20, 21, 22], activeHoursComputedAt: now },
    });
  }

  // ---- Sales leads (Sales-AI) -------------------------------
  console.log("→ Sales leads…");
  await prisma.salesLead.create({
    data: {
      companyName: "Jumbo Supermarkten B.V.",
      kvkNumber: "16074305",
      city: "Veghel",
      sector: "Supermarkten",
      source: "manual",
      status: "NEW",
      notes: "Grote keten, veel vestigingen — hoge flexbehoefte.",
      createdById: platformAdmin.id,
    },
  });
  await prisma.salesLead.create({
    data: {
      companyName: "Restaurant De Kade",
      contactName: "M. Bakker",
      contactEmail: "info@dekade-horeca.nl",
      city: "Rotterdam",
      sector: "Horeca",
      source: "manual",
      status: "NEW",
      score: 68,
      scoreRationale: "Horeca met weekendpieken (heuristiek).",
      createdById: platformAdmin.id,
    },
  });

  // ---- summary ---------------------------------------------
  console.log("\n✔ Seed complete\n");
  console.table([
    { role: "PLATFORM_ADMIN", email: platformAdmin.email, password: PASSWORD },
    { role: "HQ_ADMIN", email: hqAdmin.email, password: PASSWORD },
    { role: "DISPUTE_MANAGER", email: disputeManager.email, password: PASSWORD },
    { role: "LOCAL_MANAGER (Amsterdam)", email: managerAms.email, password: PASSWORD },
    { role: "LOCAL_MANAGER (Utrecht)", email: managerUtr.email, password: PASSWORD },
    ...specs.map((s) => ({
      role: `FREELANCER ${s.badge}${s.kyc === "PENDING" ? " (KYC pending)" : ""}`,
      email: s.email,
      password: PASSWORD,
    })),
  ]);
  console.log(
    `\nOrganizations: ${platform.name} (platform), ${hq.name} (HQ) → ${amsterdam.name}, ${utrecht.name}`,
  );
  console.log(
    `Job postings: ${shiftA.title}, ${shiftB.title}, ${shiftC.title}`,
  );
  console.log(
    `Timesheets: ${timesheet1.id} (SUBMITTED, ready to approve), ${timesheet2.id} (DISPUTED → /admin/disputes)`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
