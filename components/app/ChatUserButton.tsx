"use client";

import { usePathname, useRouter } from "next/navigation";
import { berichtenAdres } from "@/lib/chat/berichten-adres";

/**
 * "Bericht" bij een kandidaat of gebruiker: naar de chatpagina van deze omgeving, die het gesprek meteen opent (?met=).
 * Vroeger stuurde de knop een signaal naar het chatvenster in de hoek; dat venster staat uit (hideDock), dus er gebeurde
 * niets zichtbaars en er ging stil een "Hallo!" naar de ander (17 nov 2026, eigenaar: "ik kan niet op berichten klikken").
 */
export function ChatUserButton({
  toUserId,
  label = "Bericht",
  contextKey,
  subject,
  className = "btn-ghost px-3 py-1.5 text-xs",
}: {
  toUserId: string;
  label?: string;
  contextKey?: string;
  subject?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <button type="button" onClick={() => router.push(berichtenAdres(pathname, { met: toUserId, context: contextKey, onderwerp: subject }))} className={className}>
      {label}
    </button>
  );
}
