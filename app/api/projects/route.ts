import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json401 } from "@/lib/api-auth";
import type { SidebarProject, SidebarProjectsPayload } from "@/types/api";

export async function GET() {
  const user = await apiSession();
  if (!user) return json401();

  const projects: SidebarProject[] = await prisma.project.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, code: true, platform: true },
  });

  return NextResponse.json(projects satisfies SidebarProjectsPayload);
}

export const dynamic = "force-dynamic";
