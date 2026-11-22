import { cookies } from "next/headers";
import { inAndroidApp } from "@/lib/app-mode-server";
import { WELKOM_COOKIE } from "@/lib/welkom/slides";

/**
 * De terugknop op inloggen en aanmelden: naar de welkomstcarrousel als iemand daarvandaan kwam (in de app, of in de browser
 * na de carrousel), anders naar de voorpagina (22 nov 2026, eigenaar: "die stukjes die voor de inlog bij de app komen" ook in de browser).
 */
export async function welkomTerug(): Promise<"/welkom" | "/"> {
  if (await inAndroidApp()) return "/welkom";
  return (await cookies()).get(WELKOM_COOKIE)?.value === "1" ? "/welkom" : "/";
}
