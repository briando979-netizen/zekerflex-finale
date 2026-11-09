import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/.well-known/apple-app-site-association/route";

// Apple App Site Association (passkeys en universele links in de iPhone-app):
// alleen met een Team ID, en alleen de schermen van de app.

afterEach(() => {
  delete process.env.APPLE_TEAM_ID;
  delete process.env.APNS_TOPIC;
});

describe("/.well-known/apple-app-site-association", () => {
  it("zonder (geldige) Team ID: 404", async () => {
    expect((await GET()).status).toBe(404);
    process.env.APPLE_TEAM_ID = "te kort";
    expect((await GET()).status).toBe(404);
  });

  it("met Team ID: passkeys en de schermen van de app, als JSON zonder doorverwijzing", async () => {
    process.env.APPLE_TEAM_ID = "TEAM123456";
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    const aasa = (await res.json()) as { webcredentials: { apps: string[] }; applinks: { details: { appIDs: string[]; components: Record<string, string>[] }[] } };
    expect(aasa.webcredentials.apps).toEqual(["TEAM123456.com.zekerflex.app"]);
    expect(aasa.applinks.details[0]!.appIDs).toEqual(["TEAM123456.com.zekerflex.app"]);
    const paden = aasa.applinks.details[0]!.components.map((c) => c["/"]);
    expect(paden).toContain("/dashboard*");
    expect(paden).toContain("/id-scan*");
    expect(paden).not.toContain("/*"); // de site zelf blijft in de browser
  });
});
