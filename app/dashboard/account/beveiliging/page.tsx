import { redirect } from "next/navigation";

// Tweestapsverificatie bestaat niet meer (21 nov 2026, eigenaar; lib/auth/tweestap-aan.ts). Oude links (mail, hulp,
// chat-instellingen) komen hier nog aan en gaan door naar de passkeys: de manier om je account extra te beveiligen.
export default function BeveiligingPage() {
  redirect("/dashboard/account/passkeys");
}
