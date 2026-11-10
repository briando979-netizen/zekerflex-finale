import { afterEach, beforeAll, describe, expect, it } from "vitest";

// Waar de Bouwer de code ophaalt (deploy/bouwer/werker/werkkopie.mjs): GitHub en onze
// eigen Git-server, elk met een eigen leestoken via een credential helper. Het token
// staat nooit in de git-opdracht (alleen de naam van de omgevingsvariabele) en gaat
// nooit naar processen die door de AI gewijzigde code draaien.

type Werkkopie = {
  bronOpties: (bron: string) => string[];
  omgevingZonderSleutel: () => Record<string, string | undefined>;
};

describe("Bouwer: leestokens voor GitHub en Forgejo", () => {
  let w: Werkkopie;

  beforeAll(async () => {
    // gewone .mjs zonder typen (draait in de bouwer-container)
    const pad = new URL("../deploy/bouwer/werker/werkkopie.mjs", import.meta.url).href;
    w = (await import(/* @vite-ignore */ pad)) as Werkkopie;
  });

  afterEach(() => {
    delete process.env.BOUWER_GITHUB_LEES_TOKEN;
    delete process.env.BOUWER_FORGEJO_TOKEN;
  });

  it("zonder token anoniem, zoals bij een openbare repo", () => {
    expect(w.bronOpties("github")).toEqual([]);
    expect(w.bronOpties("forgejo")).toEqual([]);
    expect(w.bronOpties("onbekend")).toEqual([]);
  });

  it("met token een credential helper per host, met de naam van de variabele en niet het token zelf", () => {
    process.env.BOUWER_GITHUB_LEES_TOKEN = "github_pat_geheim";
    process.env.BOUWER_FORGEJO_TOKEN = "forgejo_geheim";
    const gh = w.bronOpties("github").join(" ");
    const fj = w.bronOpties("forgejo").join(" ");
    expect(gh).toContain("credential.https://github.com.helper=");
    expect(gh).toContain("username=x-access-token");
    expect(gh).toContain("$BOUWER_GITHUB_LEES_TOKEN");
    expect(fj).toContain("credential.https://git.37-97-226-24.sslip.io.helper=");
    expect(fj).toContain("username=bouwer-lezen");
    expect(fj).toContain("$BOUWER_FORGEJO_TOKEN");
    for (const tekst of [gh, fj]) {
      expect(tekst).not.toContain("github_pat_geheim");
      expect(tekst).not.toContain("forgejo_geheim");
    }
  });

  it("de tokens gaan nooit mee naar door de AI gewijzigde code", () => {
    process.env.BOUWER_GITHUB_LEES_TOKEN = "github_pat_geheim";
    process.env.BOUWER_FORGEJO_TOKEN = "forgejo_geheim";
    const env = w.omgevingZonderSleutel();
    expect(env).not.toHaveProperty("BOUWER_GITHUB_LEES_TOKEN");
    expect(env).not.toHaveProperty("BOUWER_FORGEJO_TOKEN");
    expect(env).not.toHaveProperty("BOUWER_TOKEN");
  });
});
