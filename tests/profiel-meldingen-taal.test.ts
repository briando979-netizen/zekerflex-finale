import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// /dashboard/profiel (13 nov 2026): het formulier voor naam en telefoon toonde labels en meldingen ("Gegevens
// opgeslagen.") altijd in het Nederlands, ook in de vijftalige werker-app. Nu geeft de actie een code mee en kiest het
// formulier de tekst in de taal van de werker (texts uit lib/i18n/freelancer.ts, sectie persoonForm). Werkgever en
// studio houden de Nederlandse standaard (components/app/personal-info-texts.ts).

const h = vi.hoisted(() => ({ fout: null as unknown }));

vi.mock("@/lib/auth", () => ({ requirePrincipal: async () => ({ userId: "u1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/onboarding/wie-ben-jij-opslag", () => ({ bewaarOpleiding: async () => null }));
vi.mock("@/lib/profile/personal", async () => {
  const { z } = await import("zod");
  return {
    updatePersonalInfoSchema: z.object({ fullName: z.string().trim().min(2, "Vul je volledige naam in").max(120), phone: z.string().trim().max(40).optional().or(z.literal("")) }),
    updatePersonalInfo: async () => {
      if (h.fout) throw h.fout;
    },
  };
});

import { AppError } from "@/lib/errors";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { PERSONAL_INFO_NL } from "@/components/app/personal-info-texts";
import { updatePersonalInfoAction } from "@/app/dashboard/profiel/actions";

const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;
const vorm = (velden: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(velden)) f.set(k, v);
  return f;
};
const leeg = { ok: false, message: "" };

describe("naam en telefoon in de taal van de werker", () => {
  it("de actie geeft een code mee: opgeslagen, naam, naamVast of mislukt", async () => {
    h.fout = null;
    expect(await updatePersonalInfoAction(leeg, vorm({ fullName: "Anna de Vries", phone: "" }))).toMatchObject({ ok: true, code: "opgeslagen" });
    expect(await updatePersonalInfoAction(leeg, vorm({ fullName: "A" }))).toMatchObject({ ok: false, code: "naam" });
    h.fout = AppError.naamVastgezet("Je naam is bevestigd met je identiteitsbewijs.");
    expect(await updatePersonalInfoAction(leeg, vorm({ fullName: "Anna de Vries" }))).toMatchObject({ ok: false, code: "naamVast" });
    h.fout = new Error("db weg");
    expect(await updatePersonalInfoAction(leeg, vorm({ fullName: "Anna de Vries" }))).toMatchObject({ ok: false, code: "mislukt" });
    // de Nederlandse message blijft er voor wie geen vertaling meegeeft
    expect((await updatePersonalInfoAction(leeg, vorm({ fullName: "Anna de Vries" }))).message).toBe("Opslaan is mislukt. Probeer het opnieuw.");
  });

  it("elke taal heeft de labels en de vier meldingen; alleen het Nederlands is Nederlands", () => {
    expect(FREELANCER_DICTS.nl.persoonForm).toEqual(PERSONAL_INFO_NL);
    for (const taal of TALEN) {
      const t = FREELANCER_DICTS[taal].persoonForm;
      for (const k of ["naam", "telefoon", "optioneel", "opslaan", "bezig"] as const) expect(t[k].length, `${taal}.${k}`).toBeGreaterThan(1);
      for (const k of ["opgeslagen", "naam", "naamVast", "mislukt"] as const) expect(t.meldingen[k].length, `${taal}.meldingen.${k}`).toBeGreaterThan(5);
      if (taal !== "nl") expect(t.meldingen.opgeslagen, taal).not.toBe(PERSONAL_INFO_NL.meldingen.opgeslagen);
    }
  });

  it("het formulier toont geen vaste Nederlandse tekst meer, en de werkerpagina geeft de vertaling mee", () => {
    const form = readFileSync("components/app/PersonalInfoForm.tsx", "utf8");
    for (const nl of ["Volledige naam", "Telefoonnummer", "(optioneel)", "Opslaan"]) expect(form, nl).not.toContain(`>${nl}`);
    expect(form).toContain("texts.meldingen[state.code]");
    expect(readFileSync("app/dashboard/profiel/page.tsx", "utf8")).toContain("texts={dict.persoonForm}");
  });
});
