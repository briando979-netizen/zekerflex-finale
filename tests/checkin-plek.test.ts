import { describe, expect, it } from "vitest";
import { LAATST_BEKEND_MAX_MS, laatstBekendBruikbaar } from "@/lib/checkin/plek";

const NU = Date.parse("2026-11-09T16:48:00+01:00");

describe("laatstBekendBruikbaar", () => {
  it("met internet telt alleen een verse meting", () => {
    expect(laatstBekendBruikbaar(NU - 60_000, NU, true)).toBe(false);
  });

  it("zonder internet: de plek van hoogstens 5 minuten geleden", () => {
    expect(laatstBekendBruikbaar(NU - 60_000, NU, false)).toBe(true);
    expect(laatstBekendBruikbaar(NU - LAATST_BEKEND_MAX_MS, NU, false)).toBe(true);
    expect(laatstBekendBruikbaar(NU - LAATST_BEKEND_MAX_MS - 1, NU, false)).toBe(false);
    expect(laatstBekendBruikbaar(NU - 60 * 60_000, NU, false)).toBe(false);
  });

  it("klein klokverschil mag, rommel niet", () => {
    expect(laatstBekendBruikbaar(NU + 30_000, NU, false)).toBe(true);
    expect(laatstBekendBruikbaar(NU + 5 * 60_000, NU, false)).toBe(false);
    expect(laatstBekendBruikbaar(Number.NaN, NU, false)).toBe(false);
  });
});
