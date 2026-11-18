import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 18 nov 2026: "Terug naar inloggen" op /verifieer-email leek niets te doen. Wie daar staat is ingelogd met een nog
// onbevestigd account; /login stuurt een ingelogde meteen door (/start → /verifieer-email). De link logt daarom eerst uit.

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("/verifieer-email: terug naar inloggen logt eerst uit", () => {
  it("de voettekst van de ingelogde staat is een formulier met de uitlogactie, geen gewone link naar /login", () => {
    const pagina = lees("app/verifieer-email/page.tsx");
    expect(pagina).toContain("<form action={uitloggenNaarInloggen}>");
    // het blok "ongeldige link" (zonder sessie) houdt zijn gewone link: dat is één keer
    expect(pagina.match(/<Link href="\/login"/g)?.length ?? 0).toBe(1);
  });
  it("de actie logt uit en landt op het inlogformulier", () => {
    const acties = lees("lib/auth/actions.ts");
    expect(acties).toMatch(/export async function uitloggenNaarInloggen[\s\S]*?signOut\(\{ redirectTo: "\/login" \}\)/);
  });
});
