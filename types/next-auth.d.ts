import type { DefaultSession } from "next-auth";
import type { RoleGrant } from "@/lib/auth/session";

declare module "next-auth" {
  interface User {
    roles?: RoleGrant[];
  }

  interface Session {
    user: {
      id: string;
      roles: RoleGrant[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    roles?: RoleGrant[];
  }
}
