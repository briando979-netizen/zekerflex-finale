"use client";

/** Opent het printvenster van de browser (QR-codes per tafel). */
export function PrintKnop() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary">
      Printen
    </button>
  );
}
