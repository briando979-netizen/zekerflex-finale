import type { Instrumentation } from "next";

// Next.js runs this once per server start. On the Node server the error journal
// starts (lib/ops/error-journal.ts): warnings, errors and failures in pages and
// server actions are kept in the database, so they survive a deploy. The
// imports sit inside the "nodejs" branch on purpose: webpack drops that branch
// from the edge bundle (middleware), which has no database or node:crypto.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // not while `next build` prerenders: there is no database there
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    try {
      const { startErrorJournal } = await import("@/lib/ops/error-journal");
      startErrorJournal();
    } catch (err) {
      // the site must start even if the journal can't
      console.error(JSON.stringify({ level: "error", message: "error journal not started", error: String(err) }));
    }
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { recordRequestError } = await import("@/lib/ops/error-journal");
      recordRequestError(error, request, context);
    } catch {
      // reporting an error may never cause another one
    }
  }
};
