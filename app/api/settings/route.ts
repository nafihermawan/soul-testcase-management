import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, apiRoleAtLeast, json401, json403 } from "@/lib/api-auth";
import type { SettingsPayload, SettingsProject, SettingsUser } from "@/types/api";

export async function GET() {
  const user = await apiSession();
  if (!user) return json401();
  // Settings (kelola struktur project/suite + admin users) hanya untuk QA.
  if (!apiRoleAtLeast(user.role, "QA")) return json403();

  const projects: SettingsProject[] = await prisma.project.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      description: true,
      platform: true,
      docUrl: true,
      _count: { select: { suites: true } },
    },
  });

  const users: SettingsUser[] = await prisma.user.findMany({
    orderBy: { email: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json({ projects, users } satisfies SettingsPayload);
}

export const dynamic = "force-dynamic";
