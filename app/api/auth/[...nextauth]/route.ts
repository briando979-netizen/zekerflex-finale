import { handlers } from "@/lib/auth/nextauth";

export const runtime = "nodejs";

// Plain NextAuth handlers. (A per-IP login throttle was tried here but it could
// interfere with the credentials callback and block all sign-ins, so brute-force
// defence stays on the per-account lockout in lib/auth/login-throttle.ts; an
// IP-level limit belongs in the WAF/edge in front of the app.)
export const { GET, POST } = handlers;
