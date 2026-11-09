// ---------------------------------------------------------------------------
// Saved klussen ("bewaard", the heart on a shift card): kept on the device,
// no server state. The heart writes the list and announces the change with a
// window event, so the klussen feed can show "Bewaard" without a reload.
// Pure (the storage is passed in), so the tests run without a browser.
// ---------------------------------------------------------------------------

export const SAVED_KEY = "zf-saved-shifts";
export const SAVED_EVENT = "zf-saved-shifts";
/** Oldest ids drop off first; ids of klussen that are long gone add nothing. */
export const SAVED_MAX = 200;

type Store = Pick<Storage, "getItem" | "setItem">;

function readList(store: Store | null): string[] {
  if (!store) return [];
  try {
    const v: unknown = JSON.parse(store.getItem(SAVED_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function readSaved(store: Store | null): Set<string> {
  return new Set(readList(store));
}

/** Save or unsave one klus; returns the new set. */
export function toggleSaved(store: Store | null, shiftId: string): Set<string> {
  const list = readList(store);
  const next = list.includes(shiftId) ? list.filter((id) => id !== shiftId) : [...list, shiftId].slice(-SAVED_MAX);
  try {
    store?.setItem(SAVED_KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: nothing saved, the heart reads the list again */
  }
  return new Set(next);
}

/** localStorage, or null where the browser blocks it (private mode, settings). */
export function deviceStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
