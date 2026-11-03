import { describe, expect, it } from "vitest";
import { kortPad, voorstelPad } from "@/lib/voorstel/subdomein";

describe("voorstel op een eigen subdomein", () => {
  it("toont het voorstel op de kale paden", () => {
    expect(voorstelPad("schwarzwald", "/")).toBe("/voorstel/schwarzwald");
    expect(voorstelPad("schwarzwald", "/activiteiten/buggy-rijden")).toBe("/voorstel/schwarzwald/activiteiten/buggy-rijden");
    expect(voorstelPad("schwarzwald", "/restaurant/bbq")).toBe("/voorstel/schwarzwald/restaurant/bbq");
  });

  it("laat links naar het basispad, de eigen API en bestanden ongemoeid", () => {
    expect(voorstelPad("schwarzwald", "/voorstel/schwarzwald/beheer")).toBe("/voorstel/schwarzwald/beheer");
    expect(voorstelPad("schwarzwald", "/api/voorstel/schwarzwald/agenda")).toBe("/api/voorstel/schwarzwald/agenda");
    expect(voorstelPad("schwarzwald", "/_next/static/chunks/app.js")).toBe("/_next/static/chunks/app.js");
    expect(voorstelPad("schwarzwald", "/icon.svg")).toBe("/icon.svg");
    // het videoplaatje van YouTubeEmbed (gedeelde openbare route)
    expect(voorstelPad("schwarzwald", "/api/media/youtube/noGuN2eDQWo")).toBe("/api/media/youtube/noGuN2eDQWo");
  });

  it("houdt de rest van ZekerFlex dicht", () => {
    expect(voorstelPad("schwarzwald", "/api/auth/session")).toBeNull();
    expect(voorstelPad("schwarzwald", "/api/admin/users")).toBeNull();
    expect(voorstelPad("schwarzwald", "/api/voorstel/schwarzwaldx")).toBeNull();
    expect(voorstelPad("schwarzwald", "/sw.js")).toBeNull();
    // ZekerFlex-pagina's worden voorstelpaden en bestaan daar dus niet (404)
    expect(voorstelPad("schwarzwald", "/admin")).toBe("/voorstel/schwarzwald/admin");
    expect(voorstelPad("schwarzwald", "/login")).toBe("/voorstel/schwarzwald/login");
  });

  it("maakt korte adressen voor de adresbalk, en die komen weer bij dezelfde pagina uit", () => {
    expect(kortPad("/voorstel/schwarzwald")).toBe("/");
    expect(kortPad("/voorstel/schwarzwald/restaurant/bbq")).toBe("/restaurant/bbq");
    expect(kortPad("/voorstel/schwarzwaldx/y")).toBe("/voorstel/schwarzwaldx/y");
    expect(kortPad("/restaurant/bbq")).toBe("/restaurant/bbq");
    for (const lang of ["/voorstel/schwarzwald", "/voorstel/schwarzwald/activiteiten/buggy-rijden", "/voorstel/schwarzwald/beheer"]) {
      expect(voorstelPad("schwarzwald", kortPad(lang))).toBe(lang);
    }
  });

  it("weigert onbekende voorstellen", () => {
    expect(voorstelPad("onbekend", "/")).toBeNull();
    expect(voorstelPad(null, "/")).toBeNull();
  });
});
