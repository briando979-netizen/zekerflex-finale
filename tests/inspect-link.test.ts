import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { decodeSession, encodeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { inspectSessionFor, mintInspectLink, verifyInspectLink, VIEW_AS_COOKIE } from "@/lib/auth/inspect";

const tester = {
  sub: "usr_test",
  email: "playreview@zekerflex.com",
  name: "Google Play Review",
  roles: [{ role: "FREELANCER" as const, organizationId: "t1", locationIds: [] }],
};

describe("read-only inspection links", () => {
  it("round-trips a test account and refuses admin/sales accounts", async () => {
    const { token } = await mintInspectLink(tester, 24);
    expect((await verifyInspectLink(token))?.email).toBe(tester.email);
    await expect(
      mintInspectLink({ ...tester, roles: [{ role: "PLATFORM_ADMIN", organizationId: "t1", locationIds: [] }] }, 24),
    ).rejects.toThrow();
    expect(await verifyInspectLink("not-a-token")).toBeNull();
  });

  it("turns ?zf_inspect into a read-only session cookie (and app mode with app=1)", async () => {
    const { token } = await mintInspectLink(tester, 24);
    const res = await middleware(new NextRequest(new URL(`https://www.zekerflex.com/login?zf_inspect=${token}&app=1`)));
    const session = res.cookies.get(SESSION_COOKIE)?.value;
    const claims = await decodeSession(session);
    expect(claims?.sub).toBe("usr_test");
    expect(claims?.inspect).toBe(true);
    expect(res.cookies.get("zf_app")?.value).toBe("1");
  });

  it("'Bekijk als': view-as session applies outside /admin (read-only) but the admin area keeps the admin session", async () => {
    const viewAs = await inspectSessionFor(tester);
    const admin = await encodeSession({
      sub: "usr_admin",
      email: "admin@zekerflex.com",
      name: "Admin",
      roles: [{ role: "PLATFORM_ADMIN", organizationId: "t1", locationIds: [] }],
    });
    // a write in the dashboard while viewing as → refused
    const w = new NextRequest(new URL("https://www.zekerflex.com/api/me/bank-verify"), { method: "POST" });
    w.cookies.set(SESSION_COOKIE, admin);
    w.cookies.set(VIEW_AS_COOKIE, viewAs);
    expect((await middleware(w)).status).toBe(403);
    // the admin's own API (e.g. to stop viewing) still works as the admin
    const a = new NextRequest(new URL("https://www.zekerflex.com/api/admin/view-as"), { method: "POST" });
    a.cookies.set(SESSION_COOKIE, admin);
    a.cookies.set(VIEW_AS_COOKIE, viewAs);
    expect((await middleware(a)).status).not.toBe(403);
  });

  it("refuses every write from an inspection session", async () => {
    const session = await inspectSessionFor(tester);
    const req = new NextRequest(new URL("https://www.zekerflex.com/api/me/bank-verify"), { method: "POST" });
    req.cookies.set(SESSION_COOKIE, session);
    const res = await middleware(req);
    expect(res.status).toBe(403);
  });
});
