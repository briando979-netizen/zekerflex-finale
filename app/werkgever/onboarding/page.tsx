import { redirect } from "next/navigation";

// Onboarding now lives on "Jouw start" (/werkgever). Keep this path working.
export default function WerkgeverOnboardingRedirect() {
  redirect("/werkgever");
}
