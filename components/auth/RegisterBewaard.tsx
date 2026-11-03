"use client";

import { useEffect, useState } from "react";
import { CONCEPT_KEY, parseConcept } from "@/lib/klusconcept/concept";
import { parseWilReageren, WIL_REAGEREN_KEY } from "@/lib/worker/wil-reageren";

// On /register: reassure that the klus from the public site is kept — the
// werkgever's draft (/klus-plaatsen) or the klus a worker wanted to respond to
// (/klussen/[id]). Texts come from AUTH_DICTS with a {klus} placeholder.
export function RegisterBewaard({ type, klusText, reagerenText }: { type: "bedrijf" | "freelancer"; klusText: string; reagerenText: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    try {
      const concept = parseConcept(localStorage.getItem(CONCEPT_KEY));
      const reageren = parseWilReageren(localStorage.getItem(WIL_REAGEREN_KEY));
      if (type === "bedrijf" && concept) setText(klusText.replace("{klus}", concept.title));
      else if (type === "freelancer" && reageren) setText(reagerenText.replace("{klus}", reageren.title));
    } catch {
      /* storage blocked: nothing to show */
    }
  }, [type, klusText, reagerenText]);

  if (!text) return null;
  return (
    <p role="status" className="mb-5 rounded-xl bg-mintwash px-4 py-3 text-sm text-brand-700">
      {text}
    </p>
  );
}
