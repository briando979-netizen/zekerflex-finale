"use client";

import { usePathname, useRouter } from "next/navigation";
import { berichtenAdres } from "@/lib/chat/berichten-adres";

/** De werker bericht de opdrachtgever van een klus: naar de chatpagina, die het gesprek opent (?klus=). */
export function MessageEmployerButton({
  shiftId,
  label = "Bericht de opdrachtgever",
  className = "btn-ghost w-full py-2 text-sm",
}: {
  shiftId: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <button type="button" onClick={() => router.push(berichtenAdres(pathname, { klus: shiftId }))} className={className}>
      {label}
    </button>
  );
}

/** Het gesprek met ZekerFlex Support, op de chatpagina (?support=1, zoals het hulpcentrum). */
export function SupportChatButton({
  label = "Chat met ZekerFlex Support",
  className = "btn-ghost text-sm",
}: {
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <button type="button" onClick={() => router.push(berichtenAdres(pathname, { support: true }))} className={className}>
      {label}
    </button>
  );
}
