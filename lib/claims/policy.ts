// ---------------------------------------------------------------------------
// Tunable policy constants for the cancellation / no-show penalty system.
// No "opzegtermijn" (notice period) or collections timeline existed anywhere
// in the codebase before this — these are reasonable defaults, not a legal
// requirement baked into the platform; change them here if the business
// decides on different numbers.
// ---------------------------------------------------------------------------

/** Cancelling an accepted shift at least this many hours before it starts is free. */
export const NOTICE_HOURS = 24;

/** A shift this far past its start time with no check-in and no cancellation counts as a no-show. */
export const NO_SHOW_GRACE_MINUTES = 60;

/** Days a cancellation-penalty invoice has to be paid before the free statutory reminder goes out; also the term of the platform invoice (PLATFORM_FEE, voorwaarden art. 4: 14 dagen). */
export const INVOICE_DUE_DAYS = 14;

/** Dagen die het bedrijf heeft voor de factuur van de werker (SELF_BILL_FREELANCER): 30, zoals de site en de voorwaarden beloven. De platformfactuur blijft op INVOICE_DUE_DAYS. */
export const WERKER_FACTUUR_DAGEN = 30;

/** Days the WIK-mandated free 14-day notice gives on top of the due date before incassokosten may apply. */
export const WIK_REMINDER_GRACE_DAYS = 14;

/** Days after escalation (incassokosten charged) before the debtor is banned from the platform. */
export const INCASSO_TO_BAN_DAYS = 14;

/** Reliability-score penalty applied on a late cancellation (reliabilityScore lives on FreelancerProfile). */
export const LATE_CANCEL_RELIABILITY_PENALTY = 0.05;

/** Reliability-score penalty applied on a confirmed no-show — steeper than a late cancel. */
export const NO_SHOW_RELIABILITY_PENALTY = 0.15;
