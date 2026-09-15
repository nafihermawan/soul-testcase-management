import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json401 } from "@/lib/api-auth";
import type { SuiteOption, SuitesPayload } from "@/types/api";

/**
 * GET /api/suites
 * Daftar SEMUA suite (flat, lintas project) untuk dropdown "Suite / Module"
 * di form bug ad-hoc. Sengaja tidak butuh projectId dulu supaya pemilihnya
 * tetap satu dropdown, dan tiap opsi menyertakan nama project agar suite
 * bernama sama antar project tetap bisa dibedakan.
 */
export async function GET() {
  const user = await apiSession();
  if (!user) return json401();

  const suites = await prisma.suite.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      project: { select: { name: true } },
    },
    orderBy: [{ project: { name: "asc" } }, { order: "asc" }, { createdAt: "asc" }],
  });

  const rows: SuiteOption[] = suites.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    projectName: s.project.name,
  }));

  return NextResponse.json({ suites: rows } satisfies SuitesPayload);
}

export const dynamic = "force-dynamic";
