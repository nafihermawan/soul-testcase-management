import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json400, json401 } from "@/lib/api-auth";
import type { SuiteMoveTargetsPayload } from "@/types/api";

/**
 * GET /api/suites/options?projectId=<id>
 *
 * Suite beserta section-nya DI DALAM SATU PROJECT — bahan pemilih tujuan
 * "Pindahkan Test Case / Section". Sengaja tanpa daftar test case supaya ringan
 * dan cukup di-fetch saat modalnya dibuka.
 */
export async function GET(request: Request) {
  const user = await apiSession();
  if (!user) return json401();

  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return json400("projectId wajib diisi.");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) return json400("Project tidak ditemukan.");

  const suites = await prisma.suite.findMany({
    where: { projectId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      sections: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true },
      },
    },
  });

  return NextResponse.json({ project, suites } satisfies SuiteMoveTargetsPayload);
}

export const dynamic = "force-dynamic";
