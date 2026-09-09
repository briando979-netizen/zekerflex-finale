import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Seat-allocation lock.
//
// Taking a seat on a shift is a check-then-write: count the live assignments,
// compare against `shift.positions`, then create a ShiftAssignment. Under the
// default READ COMMITTED isolation two of these running at once both read
// `taken = positions - 1`, both pass the check and both insert - the shift is
// overbooked. `@@unique([shiftId, freelancerId])` does not help: it only stops
// the *same* freelancer taking a seat twice.
//
// Every transaction that allocates (or reallocates) a seat MUST call this as
// its first statement. It takes a Postgres transaction-scoped advisory lock
// keyed on the shift, so concurrent accept / auto-assign / self-apply /
// replacement transactions queue behind each other instead of racing. The
// lock is released automatically when the transaction commits or rolls back.
// ---------------------------------------------------------------------------

// Arbitrary namespace so this never collides with another advisory lock.
const SEAT_LOCK_NAMESPACE = 0x5a465354; // "ZFST"

/**
 * Serialise seat allocation for one shift within the current transaction.
 * Blocks until any other seat-allocating transaction for the same shift has
 * committed or rolled back.
 */
export async function lockShiftSeats(
  tx: Prisma.TransactionClient,
  shiftId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${SEAT_LOCK_NAMESPACE}, hashtext(${shiftId}))`;
}
