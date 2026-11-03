"use client";

/** Opent het printvenster van de browser (dagplanning op papier). */
export function PrintKnop() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-full bg-schw-orange px-6 py-3 font-bold text-schw-night">
      Printen
    </button>
  );
}
