"use server";

import { signOut } from "@/lib/auth/nextauth";

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
