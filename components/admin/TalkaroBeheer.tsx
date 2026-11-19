"use client";

import { useState } from "react";

// Toont het beheerwachtwoord van Talkaro met een kopieerknop. Het wachtwoord komt
// als gewone tekst binnen (de serverpagina leest het uit de omgeving en geeft het
// alleen aan een platformbeheerder); dit bestand neemt niets uit prisma/kv/mail mee.
export function TalkaroWachtwoord({ token }: { token: string }) {
  const [gekopieerd, setGekopieerd] = useState(false);

  if (!token) {
    return (
      <p className="text-[0.8125rem]" style={{ color: "var(--a-mute)" }} role="status">
        Het beheerwachtwoord is nog niet ingesteld op deze server.
      </p>
    );
  }

  async function kopieer() {
    try {
      await navigator.clipboard.writeText(token);
      setGekopieerd(true);
      setTimeout(() => setGekopieerd(false), 2000);
    } catch {
      // Kopiëren mag niet overal; je kunt het wachtwoord dan zelf selecteren.
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <code
        className="block overflow-x-auto whitespace-nowrap rounded px-3 py-2 text-[0.8125rem]"
        style={{ border: "1px solid var(--a-border)", color: "var(--a-text)" }}
      >
        {token}
      </code>
      <div>
        <button
          type="button"
          onClick={kopieer}
          className="rounded px-3 py-1.5 text-[0.8125rem] font-medium"
          style={{ border: "1px solid var(--a-border)", color: "var(--a-text)", background: "transparent" }}
        >
          {gekopieerd ? "Gekopieerd ✓" : "Kopieer wachtwoord"}
        </button>
      </div>
    </div>
  );
}
