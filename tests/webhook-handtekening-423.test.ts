import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handtekeningOngeldigJson, handtekeningOngeldigTekst } from "@/lib/webhooks/handtekening";

// CrowdSec telt 400/403 (http-probing) en POST-401/403 (http-generic-bf) als inbraak; een verkeerd token
// bij Twilio of Stripe mocht het adres van die dienst dus niet kunnen laten blokkeren. 423 telt nergens.
// Dit is een bewuste afwijking van het besluit van 86 om 403 te laten staan.

const lees = (pad: string) => readFileSync(new URL(`../${pad}`, import.meta.url), "utf8");

describe("ongeldige webhook-handtekening: 423 met eigen code", () => {
  it("de tekstvariant (Twilio) geeft 423 en de code in een kop", async () => {
    const res = handtekeningOngeldigTekst();
    expect(res.status).toBe(423);
    expect(res.headers.get("x-zf-code")).toBe("handtekening_ongeldig");
  });

  it("de JSON-variant (Stripe, Didit) geeft 423 met code en Nederlandse tekst", async () => {
    const res = handtekeningOngeldigJson();
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: { code: "handtekening_ongeldig", message: "Ongeldige handtekening" } });
  });

  it.each(["voice", "gather", "menu", "sms", "status", "wachtrij", "wachtrij/klaar", "wachtrij/medewerker", "terugbellen"])("Twilio-route %s weigert met 423 en niet met 403", (naam) => {
    const bron = lees(`app/api/telephony/${naam}/route.ts`);
    expect(bron).toMatch(/if \(!signatureValid\(request, params\)\) return handtekeningOngeldigTekst\(\);/);
    expect(bron).not.toMatch(/status: 403/);
  });

  it.each(["app/api/webhooks/stripe/route.ts", "app/api/webhooks/didit/route.ts", "app/api/issuing/authorize/route.ts"])(
    "%s geeft bij een foute handtekening 423",
    (pad) => {
      const bron = lees(pad);
      expect(bron).toContain("return handtekeningOngeldigJson();");
      expect(bron).not.toMatch(/invalid signature"\s*\},\s*\{\s*status: 40[01]/);
    },
  );
});