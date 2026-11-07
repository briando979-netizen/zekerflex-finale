import { SITE, CONTACTS } from "@/lib/seo";

// ---------------------------------------------------------------------------
// OpenAPI 3.1 voor de reserverings-API voor AI-assistenten (app/api/agent/horeca,
// lib/horeca/agent-server.ts). Beschrijft alleen wat echt bestaat. Openbaar op
// /api/agent/horeca/openapi.json en genoemd in /llms.txt.
// ---------------------------------------------------------------------------

const FOUT = {
  description: "Fout, met een uitleg in gewone taal.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/Fout" } } },
};

const ZAAK_SLUG = { name: "slug", in: "path", required: true, description: "Het korte adres van de zaak, uit de lijst met zaken.", schema: { type: "string", pattern: "^[a-z0-9-]{1,80}$" } };
const TOKEN = { name: "token", in: "path", required: true, description: "Het token uit het antwoord bij het reserveren.", schema: { type: "string" } };

export function horecaAgentSpec(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: `${SITE.name}: tafel reserveren bij restaurants en cafés`,
      version: "1.0.0",
      description:
        "Voor AI-assistenten die namens een gast een tafel reserveren bij een horecazaak op ZekerFlex. Zoek een zaak, bekijk de vrije tijden en reserveer. " +
        "Reserveren is gratis; er wordt niets betaald. De gast krijgt een bevestiging per mail met een link om zelf te annuleren, de zaak krijgt een seintje. " +
        "Er is geen sleutel nodig. Stuur bij het reserveren een eigen Idempotency-Key mee: hetzelfde verzoek nog een keer geeft dan dezelfde reservering terug in plaats van een tweede. " +
        "Vraag altijd eerst de gast om toestemming voordat je reserveert, en gebruik zijn echte naam, e-mailadres en telefoonnummer.",
      contact: { name: SITE.name, email: CONTACTS.partners, url: SITE.url },
    },
    servers: [{ url: `${SITE.url}/api/agent/horeca`, description: "Productie" }],
    paths: {
      "/": {
        get: {
          operationId: "zakenZoeken",
          summary: "Zaken waar je online kunt reserveren",
          parameters: [{ name: "plaats", in: "query", required: false, description: "Alleen zaken in deze plaats (deel van de naam is genoeg).", schema: { type: "string" } }],
          responses: {
            "200": { description: "De zaken.", content: { "application/json": { schema: { type: "object", properties: { zaken: { type: "array", items: { $ref: "#/components/schemas/Zaak" } } } } } } },
            "429": FOUT,
            "503": FOUT,
          },
        },
      },
      "/{slug}": {
        get: {
          operationId: "zaakBekijken",
          summary: "Eén zaak met openingstijden en regels",
          parameters: [ZAAK_SLUG],
          responses: { "200": { description: "De zaak.", content: { "application/json": { schema: { type: "object", properties: { zaak: { $ref: "#/components/schemas/Zaak" } } } } } }, "404": FOUT, "429": FOUT, "503": FOUT },
        },
      },
      "/{slug}/beschikbaarheid": {
        get: {
          operationId: "vrijeTijden",
          summary: "Vrije tijden op een dag",
          parameters: [
            ZAAK_SLUG,
            { name: "datum", in: "query", required: true, description: "De dag, als JJJJ-MM-DD (Nederlandse tijd).", schema: { type: "string", format: "date" } },
            { name: "personen", in: "query", required: true, description: "Met hoeveel personen.", schema: { type: "integer", minimum: 1, maximum: 100 } },
          ],
          responses: {
            "200": {
              description: "Vrije en volle tijden (UU:MM, Nederlandse tijd).",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      datum: { type: "string" },
                      personen: { type: "integer" },
                      vrij: { type: "array", items: { type: "string", example: "19:00" } },
                      vol: { type: "array", items: { type: "string" } },
                      melding: { type: "string", description: "Uitleg als er niets vrij is (dicht, groep te groot)." },
                    },
                  },
                },
              },
            },
            "404": FOUT,
            "422": FOUT,
            "429": FOUT,
            "503": FOUT,
          },
        },
      },
      "/{slug}/reserveringen": {
        post: {
          operationId: "reserveren",
          summary: "Een tafel reserveren",
          parameters: [
            ZAAK_SLUG,
            { name: "Idempotency-Key", in: "header", required: false, description: "Een eigen unieke sleutel per reservering (1–200 tekens). Sterk aangeraden.", schema: { type: "string" } },
          ],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/NieuweReservering" } } } },
          responses: {
            "201": { description: "Gereserveerd.", content: { "application/json": { schema: { $ref: "#/components/schemas/ReserveringAntwoord" } } } },
            "200": { description: "Dezelfde Idempotency-Key en hetzelfde verzoek: de eerdere reservering (herhaald: true).", content: { "application/json": { schema: { $ref: "#/components/schemas/ReserveringAntwoord" } } } },
            "404": FOUT,
            "409": { ...FOUT, description: "Deze Idempotency-Key hoort bij een ander verzoek, of het eerste verzoek loopt nog." },
            "422": { ...FOUT, description: "Kan niet: tijd vol, dicht, groep te groot, te ver vooruit of gegevens onvolledig. De uitleg staat in error.message." },
            "429": FOUT,
            "503": FOUT,
          },
        },
      },
      "/reserveringen/{token}": {
        get: {
          operationId: "reserveringBekijken",
          summary: "Een reservering bekijken",
          parameters: [TOKEN],
          responses: { "200": { description: "De reservering.", content: { "application/json": { schema: { $ref: "#/components/schemas/ReserveringAntwoord" } } } }, "404": FOUT, "429": FOUT },
        },
        delete: {
          operationId: "reserveringAnnuleren",
          summary: "Een reservering annuleren",
          description: "Kan zolang de reservering bevestigd is en nog niet begonnen. Daarna: bel de zaak.",
          parameters: [TOKEN],
          responses: {
            "200": { description: "Geannuleerd.", content: { "application/json": { schema: { $ref: "#/components/schemas/ReserveringAntwoord" } } } },
            "404": FOUT,
            "409": { ...FOUT, description: "Al geannuleerd." },
            "412": { ...FOUT, description: "Te laat om online te annuleren." },
            "429": FOUT,
          },
        },
      },
    },
    components: {
      schemas: {
        Fout: {
          type: "object",
          properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string", description: "Uitleg in gewone taal, geschikt om aan de gast te tonen." } } } },
        },
        Tijdvak: { type: ["object", "null"], properties: { van: { type: "string", example: "12:00" }, tot: { type: "string", example: "22:00" } } },
        Zaak: {
          type: "object",
          properties: {
            slug: { type: "string" },
            naam: { type: "string" },
            soort: { type: "string", description: "restaurant, cafe, lunchroom, bar of hotel" },
            plaats: { type: "string" },
            adres: { type: "string" },
            telefoon: { type: "string" },
            website: { type: "string", format: "uri" },
            openingstijden: { type: "object", description: "Per dag (maandag … zondag); null = dicht.", additionalProperties: { $ref: "#/components/schemas/Tijdvak" } },
            reserveren: {
              type: "object",
              properties: {
                groterDanBellen: { type: "integer", description: "Grootste groep die online kan; groter: bellen." },
                dagenVooruit: { type: "integer" },
                elkeMinuten: { type: "integer", description: "Om de hoeveel minuten er een tijd is." },
                tafelBezetMinuten: { type: "integer" },
              },
            },
          },
        },
        NieuweReservering: {
          type: "object",
          required: ["datum", "tijd", "personen", "naam", "email", "telefoon"],
          properties: {
            datum: { type: "string", format: "date", example: "2026-12-24" },
            tijd: { type: "string", pattern: "^\\d{2}:\\d{2}$", example: "19:00", description: "Een vrije tijd uit /beschikbaarheid." },
            personen: { type: "integer", minimum: 1, maximum: 100 },
            naam: { type: "string", minLength: 2, maxLength: 80 },
            email: { type: "string", format: "email", description: "Hier komt de bevestiging met de annuleerlink." },
            telefoon: { type: "string", minLength: 6, maxLength: 40 },
            opmerking: { type: "string", maxLength: 500, description: "Bijvoorbeeld allergieën of een kinderstoel." },
          },
        },
        ReserveringAntwoord: {
          type: "object",
          properties: {
            herhaald: { type: "boolean" },
            reservering: {
              type: "object",
              properties: {
                id: { type: "string" },
                status: { type: "string", enum: ["BEVESTIGD", "AANGEKOMEN", "NIET_GEKOMEN", "GEANNULEERD"] },
                statusTekst: { type: "string" },
                datum: { type: "string" },
                tijd: { type: "string" },
                personen: { type: "integer" },
                naam: { type: "string" },
                zaak: { type: "object", properties: { slug: { type: "string" }, naam: { type: "string" } } },
                token: { type: "string", description: "Bewaar dit: hiermee bekijk of annuleer je deze reservering." },
                links: { type: "object", properties: { bekijken: { type: "string" }, annuleren: { type: "string" }, annulerenVoorDeGast: { type: "string" } } },
              },
            },
          },
        },
      },
    },
  };
}
