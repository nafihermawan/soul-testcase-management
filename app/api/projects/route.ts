import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json401 } from "@/lib/api-auth";
import type { SidebarProject, SidebarProjectsPayload } from "@/types/api";

export async function GET() {
  const user = await apiSession();
  if (!user) return json401();

  const rows = await prisma.project.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      platform: true,
      // Dipakai sidebar untuk memetakan halaman /suites/<id> ke platform project.
      suites: { select: { id: true } },
    },
  });

  const projects: SidebarProject[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    platform: p.platform,
    suiteIds: p.suites.map((s) => s.id),
  }));

  return NextResponse.json(projects satisfies SidebarProjectsPayload);
}

export const dynamic = "force-dynamic";
