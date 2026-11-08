import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const customizationSchema = z.object({
  userId: z.string(),
  theme: z.enum(["light", "dark", "auto"]),
  layout: z.enum(["grid", "flex", "masonry"]),
  widgetSize: z.enum(["compact", "normal", "large"]),
  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    background: z.string()
  }).optional(),
  fontSize: z.number().min(12).max(20).optional(),
  refreshInterval: z.number().optional(),
  density: z.enum(["compact", "comfortable", "spacious"]).optional(),
  customCss: z.string().optional()
});

export async function getUserCustomization(userId: string) {
  return await prisma.dashboardCustomization.findUnique({
    where: { userId }
  });
}

export async function updateCustomization(userId: string, data: Partial<z.infer<typeof customizationSchema>>) {
  const validated = customizationSchema.partial().parse(data);
  return await prisma.dashboardCustomization.upsert({
    where: { userId },
    update: validated,
    create: { userId, ...validated }
  });
}

export async function saveDashboardLayout(userId: string, dashboardId: string, layout: any) {
  return await prisma.dashboardLayout.upsert({
    where: { userId_dashboardId: { userId, dashboardId } },
    update: { config: layout },
    create: { userId, dashboardId, config: layout }
  });
}

export async function getDashboardLayout(userId: string, dashboardId: string) {
  return await prisma.dashboardLayout.findUnique({
    where: { userId_dashboardId: { userId, dashboardId } }
  });
}

export async function applyTheme(theme: "light" | "dark") {
  return {
    primary: theme === "dark" ? "#0ea5e9" : "#0284c7",
    secondary: theme === "dark" ? "#64748b" : "#94a3b8",
    accent: theme === "dark" ? "#f59e0b" : "#f97316",
    background: theme === "dark" ? "#0f172a" : "#ffffff",
    text: theme === "dark" ? "#f1f5f9" : "#1e293b"
  };
}
