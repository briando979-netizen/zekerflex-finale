import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import {
  createTenant,
  getTenant,
  updateTenant,
  listTenants,
  getTenantStats,
  getTenantHierarchy,
  deleteTenant,
} from "@/lib/tenants";
import {
  addTenantDomain,
  getTenantDomains,
  removeTenantDomain,
} from "@/lib/tenants/white-label";
import {
  createTeam,
  getTeamHierarchy,
  addTeamMember,
  getTeamMembers,
} from "@/lib/tenants/teams";
import { getSsoConfig, configureSso } from "@/lib/tenants/sso";
import { getTenantAuditTrail } from "@/lib/tenants/compliance";
import { recordAuditEvent } from "@/lib/tenants/compliance";

/**
 * GET /api/tenants
 * List all tenants (admin only) or get specific tenant
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("id");
    const action = searchParams.get("action");

    if (tenantId) {
      if (action === "stats") {
        const stats = await getTenantStats(tenantId);
        return NextResponse.json(stats);
      }

      if (action === "hierarchy") {
        const hierarchy = await getTenantHierarchy(tenantId);
        return NextResponse.json(hierarchy);
      }

      if (action === "domains") {
        const domains = await getTenantDomains(tenantId);
        return NextResponse.json(domains);
      }

      if (action === "sso") {
        const sso = await getSsoConfig(tenantId);
        return NextResponse.json(sso);
      }

      if (action === "teams") {
        const teams = await getTeamHierarchy(tenantId);
        return NextResponse.json(teams);
      }

      if (action === "audit") {
        const limit = parseInt(searchParams.get("limit") || "50");
        const offset = parseInt(searchParams.get("offset") || "0");
        const audit = await getTenantAuditTrail(tenantId, { limit, offset });
        return NextResponse.json(audit);
      }

      // Get single tenant
      const tenant = await getTenant(tenantId);
      return NextResponse.json(tenant);
    }

    // List all tenants (admin only)
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const tenants = await listTenants(limit, offset);
    return NextResponse.json(tenants);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tenants
 * Create new tenant
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, ...data } = body;

    // Route by action
    if (action === "add-domain") {
      const tenantId = data.tenantId;
      const domain = await addTenantDomain(tenantId, {
        domain: data.domain,
        isPrimary: data.isPrimary,
        logoUrl: data.logoUrl,
        faviconUrl: data.faviconUrl,
        brandColors: data.brandColors,
        customCss: data.customCss,
      });

      await recordAuditEvent({
        tenantId,
        action: "DOMAIN_ADDED",
        actorId: user.id,
        targetType: "Domain",
        targetId: domain.id,
        changes: { domain: data.domain },
      });

      return NextResponse.json(domain);
    }

    if (action === "remove-domain") {
      const tenantId = data.tenantId;
      await removeTenantDomain(tenantId, data.domainId);

      await recordAuditEvent({
        tenantId,
        action: "DOMAIN_REMOVED",
        actorId: user.id,
        targetType: "Domain",
        targetId: data.domainId,
      });

      return NextResponse.json({ success: true });
    }

    if (action === "create-team") {
      const tenantId = data.tenantId;
      const team = await createTeam(tenantId, {
        name: data.name,
        description: data.description,
        parentId: data.parentId,
      });

      await recordAuditEvent({
        tenantId,
        action: "TEAM_CREATED",
        actorId: user.id,
        targetType: "Team",
        targetId: team.id,
        changes: { name: team.name },
      });

      return NextResponse.json(team);
    }

    if (action === "add-team-member") {
      const tenantId = data.tenantId;
      const member = await addTeamMember(tenantId, {
        userId: data.userId,
        teamId: data.teamId,
        role: data.role as any,
        title: data.title,
        department: data.department,
      });

      await recordAuditEvent({
        tenantId,
        action: "MEMBER_ADDED",
        actorId: user.id,
        targetType: "TeamMember",
        targetId: member.id,
      });

      return NextResponse.json(member);
    }

    if (action === "configure-sso") {
      const tenantId = data.tenantId;
      const sso = await configureSso(tenantId, data.config);

      await recordAuditEvent({
        tenantId,
        action: "SSO_CONFIGURED",
        actorId: user.id,
        targetType: "SsoProvider",
        targetId: sso.id,
        changes: { provider: sso.provider },
      });

      return NextResponse.json(sso);
    }

    // Create new tenant
    const tenant = await createTenant(data, user.id);
    return NextResponse.json(tenant, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/tenants/:id
 * Update tenant configuration
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const tenantId = body.tenantId;

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenantId required" },
        { status: 400 }
      );
    }

    const { action, ...data } = body;

    // Route by action
    if (action === "verify-domain") {
      // Verify domain ownership
      // This would be implemented in white-label.ts
      return NextResponse.json({ success: true });
    }

    // Default: update tenant
    const updated = await updateTenant(tenantId, data, user.id);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tenants/:id
 * Delete tenant
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const tenantId = body.tenantId;

    if (!tenantId) {
      return NextResponse.json(
        { error: "tenantId required" },
        { status: 400 }
      );
    }

    await deleteTenant(tenantId, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error(error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
