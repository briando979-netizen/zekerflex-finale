const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|earlier)\s+instructions/i,
  /(?:reveal|show|print)\s+(?:the\s+)?(?:system|developer)\s+prompt/i,
  /(?:developer\s+message|hidden\s+instructions)\s*(?:are|is|please|now)?/i,
  /bypass\s+(auth|authorization|security|approval)/i,
  /execute\s+(an?\s+)?(admin|privileged|unauthorized)\s+action/i,
  /do\s+not\s+log|disable\s+(audit|logging)/i,
];

export interface PromptGuardResult {
  allowed: boolean;
  reason?: "instruction_override" | "secret_exfiltration" | "privilege_escalation";
}

/** Detects high-signal attempts to override Jarvis boundaries before model use. */
export function inspectPrompt(input: string): PromptGuardResult {
  if (INJECTION_PATTERNS[0]!.test(input)) {
    return { allowed: false, reason: "instruction_override" };
  }
  if (INJECTION_PATTERNS[1]!.test(input) || INJECTION_PATTERNS[2]!.test(input)) {
    return { allowed: false, reason: "secret_exfiltration" };
  }
  if (INJECTION_PATTERNS.slice(3).some((pattern) => pattern.test(input))) {
    return { allowed: false, reason: "privilege_escalation" };
  }
  return { allowed: true };
}