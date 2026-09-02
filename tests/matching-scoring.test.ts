import { describe, expect, it } from "vitest";
import {
  resolveMatchingConfig,
  scoreCandidateSignals,
  skillScore,
  travelScore,
} from "@/lib/matching/score";

describe("travelScore", () => {
  it("is 1 for a zero-minute commute and decays monotonically", () => {
    expect(travelScore(0, 75)).toBe(1);
    expect(travelScore(15, 75)).toBeGreaterThan(travelScore(30, 75));
    expect(travelScore(30, 75)).toBeGreaterThan(travelScore(60, 75));
  });

  it("floors at ~0.05 once at or beyond the cap", () => {
    expect(travelScore(75, 75)).toBeCloseTo(0.05, 2);
    expect(travelScore(200, 75)).toBeCloseTo(0.05, 2);
  });
});

describe("skillScore", () => {
  it("normalises a 0-5 rating into 0-1", () => {
    expect(skillScore(5, 0)).toBe(1);
    expect(skillScore(2.5, 0)).toBe(0.5);
  });

  it("returns 0 when a rating is required but unknown", () => {
    expect(skillScore(null, 3)).toBe(0);
    expect(skillScore(null, 0)).toBe(0.5);
  });
});

describe("resolveMatchingConfig", () => {
  it("normalises weights to sum to 1", () => {
    const cfg = resolveMatchingConfig({
      weights: { reliability: 2, travel: 1, skill: 1 },
    });
    const sum =
      cfg.weights.reliability + cfg.weights.travel + cfg.weights.skill;
    expect(sum).toBeCloseTo(1, 6);
    expect(cfg.weights.reliability).toBeCloseTo(0.5, 6);
  });

  it("falls back to defaults for an empty / invalid config", () => {
    const cfg = resolveMatchingConfig(null);
    expect(cfg.minScore).toBeGreaterThan(0);
    expect(cfg.travelModes.length).toBeGreaterThan(0);
    expect(cfg.autoAcceptance).toBeNull();
  });
});

describe("scoreCandidateSignals", () => {
  const shift = {
    location: { latitude: 52.37, longitude: 4.9 },
    minSkillRating: 3,
    branchGeofenceRadiusMeters: 150,
  };
  const config = resolveMatchingConfig({
    minScore: 0.5,
    maxTravelMinutes: 60,
  });

  it("marks a strong nearby candidate eligible", () => {
    const res = scoreCandidateSignals(
      {
        home: { latitude: 52.372, longitude: 4.903 },
        reliabilityScore: 0.9,
        acceptanceScore: 0.8,
        skillRating: 4.5,
        travel: {
          mode: "BICYCLING",
          durationMinutes: 8,
          distanceMeters: 1900,
          approximate: false,
        },
      },
      shift,
      config,
    );
    expect(res.eligible).toBe(true);
    expect(res.withinGeofence).toBe(true);
    expect(res.score).toBeGreaterThan(0.7);
  });

  it("rejects a candidate over the travel cap", () => {
    const res = scoreCandidateSignals(
      {
        home: { latitude: 51.5, longitude: 5.5 },
        reliabilityScore: 0.95,
        acceptanceScore: 0.9,
        skillRating: 5,
        travel: {
          mode: "DRIVING",
          durationMinutes: 95,
          distanceMeters: 90000,
          approximate: false,
        },
      },
      shift,
      config,
    );
    expect(res.eligible).toBe(false);
    expect(res.ineligibleReason).toMatch(/exceeds cap/);
  });

  it("rejects a candidate below the required skill rating", () => {
    const res = scoreCandidateSignals(
      {
        home: { latitude: 52.372, longitude: 4.903 },
        reliabilityScore: 0.9,
        acceptanceScore: 0.8,
        skillRating: 2,
        travel: {
          mode: "TRANSIT",
          durationMinutes: 20,
          distanceMeters: 8000,
          approximate: false,
        },
      },
      shift,
      config,
    );
    expect(res.eligible).toBe(false);
    expect(res.ineligibleReason).toMatch(/Skill rating/);
  });
});
