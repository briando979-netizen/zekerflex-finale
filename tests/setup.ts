// Minimal env so `lib/env.ts` validates during unit tests. Individual tests
// that need infrastructure (Prisma/Redis) should mock those modules.
const e = process.env as Record<string, string | undefined>;
e.NODE_ENV ??= "test";
e.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
e.REDIS_URL ??= "redis://localhost:6379";
e.APP_BASE_URL = "http://localhost:3000";
e.AUTH_SECRET ??= "test-secret-000000000000000000000000000000";
e.DIDIT_API_KEY ??= "didit_test_key";
e.DIDIT_WORKFLOW_ID ??= "wf_test";
e.DIDIT_WEBHOOK_SECRET ??= "didit-webhook-secret-000000000000";
e.KVKBASE_API_KEY ??= "kvk_test_000000000000000000000000";
// Throwaway VAPID keypair (P-256) for the Web Push send tests.
e.WEBPUSH_VAPID_PUBLIC_KEY ??=
  "BK2RR6yVZztLzqyIJn59NJzlvVKOfWnlobzTFivH1dCGlPdkkeUKVeeRN9KZQFNCyqV144Uj5algbNjFaVUu0MI";
e.WEBPUSH_VAPID_PRIVATE_KEY ??= "5s9zcgmIy0FbBTC7hE1CKfkPtoU16FD-18PT7wAyJ6Y";
e.LLM_EMBED_MODEL ??= "nomic-embed-test";
e.RAG_EMBED_DIM ??= "8";
// Fast, bounded retries in tests.
e.LLM_RETRY_MAX ??= "3";
e.LLM_RETRY_BASE_MS ??= "1";
e.LLM_RETRY_MAX_WAIT_MS ??= "2000";
// Deterministic, independent of the local .env.
e.LLM_MODEL ??= "llama3.1:8b";
e.LLM_TIMEOUT_MS ??= "30000";
// Sales-recruiter motor: pinned off so tests never discover / send.
e.SALES_ENGINE_ENABLED = "false";
e.SALES_AUTOPILOT_ENABLED = "false";

// Klok verzetten voor een meting (14 nov 2026): ZF_TEST_KLOK_VERZET_MS=<ms> laat elke `new Date()` en `Date.now()` zoveel
// later lopen, zodat de hele suite "over een week" of "over een maand" gedraaid kan worden en tijdbommen vooraf omvallen
// (de controle draait in UTC en houdt dan elke uitrol tegen). Tests met vi.useFakeTimers/setSystemTime merken er niets
// van: die vervangen Date zelf. Zonder de variabele verandert er niets.
const klokVerzet = Number(process.env.ZF_TEST_KLOK_VERZET_MS ?? 0);
if (Number.isFinite(klokVerzet) && klokVerzet !== 0) {
  const EchteDate = Date;
  const nu = () => EchteDate.now() + klokVerzet;
  class VerzetteDate extends EchteDate {
    constructor(...a: ConstructorParameters<typeof Date>) {
      if (a.length === 0) super(nu());
      else super(...(a as [number]));
    }
    static override now(): number {
      return nu();
    }
  }
  globalThis.Date = VerzetteDate as DateConstructor;
}
