"use client";

import { useI18n } from "@/components/i18n/I18nProvider";
import { FREELANCER_DICTS, type FreelancerDict } from "@/lib/i18n/freelancer";

/**
 * Freelancer-app dictionary (NL/EN/PL/RO/UK) for the current locale. Kept out
 * of I18nProvider so shop and employer pages don't download every worker
 * language; it holds functions, so it can't come from the server as a prop.
 */
export function useFT(): FreelancerDict {
  return FREELANCER_DICTS[useI18n().locale];
}
