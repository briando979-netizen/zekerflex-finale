import { describe, expect, it } from "vitest";
import { isGoodbye, isGreetingOnly, looksLikeVoicemail } from "@/lib/telephony/intents";

// De voorbeelden zijn geanonimiseerde transcripties van echte gesprekken, inclusief
// de fouten van de spraakherkenning.
describe("looksLikeVoicemail", () => {
  it.each([
    "Dit is de voicemail van 06 12345678 spreek uw bericht in na de toon.",
    "Het spijt me maar de persoon die je belt is niet beschikbaar. Laat een bericht achter na de toon.",
    "Uw stem wordt niet waar genomen staat uw telefoon op dempen. Neem na de toon alstublieft opnieuw op.",
    "Ik ben op dit moment niet aanwezig, maar je kunt een bericht achterlaten. Fijne dag nog.",
    "Welkom bij bedrijf X onze telefonische verkoop is gesloten. Wij zijn telefonisch bereikbaar van maandag tot en met donderdag.",
    "Welkom bij bedrijf X op dit moment is ons kantoor in Hengelo gesloten.",
    "We zijn van maandag tot en met donderdagochtend telefonisch te bereiken van 8 tot 12:30.",
    "Op dit moment kunnen we je helaas niet te woord staan.",
    "Please leave a message after the tone.",
  ])("herkent: %s", (text) => {
    expect(looksLikeVoicemail(text)).toBe(true);
  });

  it.each([
    "Hallo.",
    "Hey hallo",
    "Ja.",
    "Nee ik had zeg maar op dit moment niet.",
    "Ik zoek loodgieters in mijn bedrijf.",
    "Bel mij later.",
    "Hallo Hoi mevrouw, Kan ik ergens mee helpen?",
    "Hartelijk welkom bij bedrijf X.",
    "Ik heb een vraag over de betaling die ik nog niet heb gekregen.",
  ])("ziet een mens niet aan voor een voicemail: %s", (text) => {
    expect(looksLikeVoicemail(text)).toBe(false);
  });
});

describe("isGreetingOnly", () => {
  it.each(["hallo", "Hallo.", "Hallo?", "Hallo, hallo!", "hallo hallo hallo", "Hey hallo", "Hallo goedendag", "Yo.", "Goedendag", "goede dag", "Goedemiddag", "Hello"])(
    "begroeting: %s",
    (text) => {
      expect(isGreetingOnly(text, false)).toBe(true);
    },
  );

  it.each(["Hallo, ik zoek personeel", "Goedendag ik wil een werknemer", "Yo ja pakken dan.", "goed bezig", "Ja."])("geen begroeting: %s", (text) => {
    expect(isGreetingOnly(text, true)).toBe(false);
  });

  it("telt 'dag' alleen als eerste reactie als begroeting", () => {
    expect(isGreetingOnly("Dag!", true)).toBe(true);
    expect(isGreetingOnly("Dag!", false)).toBe(false);
  });
});

describe("isGoodbye", () => {
  it("hangt niet op bij 'dag' als eerste reactie", () => {
    expect(isGoodbye("Dag, met Jan", true)).toBe(false);
    expect(isGoodbye("Dag", true)).toBe(false);
  });

  it("'dag' later in het gesprek is wel afscheid", () => {
    expect(isGoodbye("Dag", false)).toBe(true);
    expect(isGoodbye("Oké, dag!", false)).toBe(true);
  });

  it("herkent afscheid ook als eerste reactie", () => {
    expect(isGoodbye("Doei.", true)).toBe(true);
    expect(isGoodbye("Nee bedankt", true)).toBe(true);
  });

  it("negeert lange zinnen waar 'bedankt' toevallig in staat", () => {
    expect(isGoodbye("Bedankt voor het bellen, maar ik zoek wel personeel voor volgende week", false)).toBe(false);
  });

  it("ziet een begroeting niet aan voor afscheid", () => {
    expect(isGoodbye("Goedendag", false)).toBe(false);
    expect(isGoodbye("Hallo.", true)).toBe(false);
  });
});
