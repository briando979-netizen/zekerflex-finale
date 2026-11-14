// Klok verzetten voor een meting (14 nov 2026). Met ZF_TEST_KLOK_VERZET_MS=<ms> loopt elke `new Date()` en `Date.now()`
// zoveel later, zodat de hele suite "over een week" of "over een maand" gedraaid kan worden en tijdbommen vooraf omvallen
// (de controle draait in UTC en houdt dan elke uitrol tegen). Tests met vi.useFakeTimers/setSystemTime merken er niets
// van: die vervangen Date zelf. Zonder de variabele verandert er niets. Eigen modulebestand (niet in tests/setup.ts): dat
// is een scriptbestand, en een globale declaratie daarin laat tsc het hele project opnieuw controleren (>2,9 GB, te veel
// voor de Bouwer-container).
export {};

const klokVerzet = Number(process.env.ZF_TEST_KLOK_VERZET_MS ?? 0);
if (Number.isFinite(klokVerzet) && klokVerzet !== 0) {
  const EchteDate = Date;
  const nu = () => EchteDate.now() + klokVerzet;
  class VerzetteDate extends EchteDate {
    constructor(...a: unknown[]) {
      if (a.length === 0) super(nu());
      else super(...(a as [number]));
    }
    static override now(): number {
      return nu();
    }
  }
  globalThis.Date = VerzetteDate as DateConstructor;
}
