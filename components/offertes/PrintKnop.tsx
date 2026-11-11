"use client";

export function PrintKnop() {
  return (
    <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={() => window.print()}>
      Afdrukken
    </button>
  );
}
