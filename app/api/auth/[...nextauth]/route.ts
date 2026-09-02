import { handlers } from "@/lib/auth/nextauth";

export const runtime = "nodejs";

export const { GET, POST } = handlers;
