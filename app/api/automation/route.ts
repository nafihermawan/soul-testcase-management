import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json401, json403 } from "@/lib/api-auth";
import type {
  AutomationPayload,
  AutomationProjectStat,
  AutomationRow,
} from "@/types/api";

// Ambang umur data (hari) agar status dianggap "Stale" (mudah diubah).
const STALE_THRESHOLD_DAYS = 30;

export async function GET() {
  const user = await apiSession();
  if (!user) return json401();
  // Role PRODUCT tidak boleh melihat halaman automation.
  if (user.role === "PRODUCT") return json403("Halaman automation tidak tersedia untuk role Anda.");

  // Project & test case tidak saling bergantung -> ambil paralel (1 round-trip).
  const [projects, tcs] = await Promise.all([
    // Semua project aktif (urut nama)
    prisma.project.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, platform: true },
    }),
    // Semua test case + automation link, join suite + project
    prisma.testCase.findMany({
      where: { status: { not: "DEPRECATED" } },
      orderBy: [{ updatedAt: "desc" }],
      include: {
        suite: { select: { id: true, name: true, projectId: true } },
        automation: true,
      },
    }),
  ]);

  // Lookup project sekali lewat Map (sebelumnya projects.find di dalam loop TC).
  const projectById = new Map(projects.map((p) => [p.id, p]));

  type Stat = {
    total: number;
    automated: number;
    failing: number;
    stale: number;
    unstable: number;
    notAutomated: number;
  };
  // Statistik & suite unik per project dikumpulkan dalam satu kali lintas data
  // (sebelumnya: rows.filter 5x per project + tcs.some di dalam filter ->
  // O(project x suite x TC)).
  const statsByProject = new Map<string, Stat>();
  const suitesByProjectMap = new Map<string, Map<string, { id: string; name: string }>>();

  // Row representasi TC di tabel automation (termasuk yang belum punya link)
  const rows: AutomationRow[] = tcs.map((tc) => {
    const projectId = tc.suite?.projectId ?? null;
    const project = projectId ? projectById.get(projectId) ?? null : null;
    const suiteId = tc.suite?.id ?? null;
    const suiteName = tc.suite?.name ?? null;
    const a = tc.automation;
    const linkStatus = a?.status ?? "NOT_AUTOMATED";
    const stale =
      linkStatus === "AUTOMATED" &&
      !!a?.lastRunAt &&
      Date.now() - new Date(a.lastRunAt).getTime() > STALE_THRESHOLD_DAYS * 86400000;
    const status = stale ? ("STALE" as const) : linkStatus;

    if (projectId) {
      const stat =
        statsByProject.get(projectId) ?? {
          total: 0,
          automated: 0,
          failing: 0,
          stale: 0,
          unstable: 0,
          notAutomated: 0,
        };
      stat.total += 1;
      if (status === "AUTOMATED") stat.automated += 1;
      else if (status === "FAILING") stat.failing += 1;
      else if (status === "STALE") stat.stale += 1;
      else if (status === "UNSTABLE") stat.unstable += 1;
      if (status === "NOT_AUTOMATED" || a?.id == null) stat.notAutomated += 1;
      statsByProject.set(projectId, stat);

      if (tc.suite) {
        let suites = suitesByProjectMap.get(projectId);
        if (!suites) {
          suites = new Map();
          suitesByProjectMap.set(projectId, suites);
        }
        if (!suites.has(tc.suite.id)) {
          suites.set(tc.suite.id, { id: tc.suite.id, name: tc.suite.name });
        }
      }
    }

    return {
      id: tc.id,
      tcId: tc.tcId,
      title: tc.title,
      projectId,
      projectName: project?.name ?? "—",
      platform: project?.platform ?? null,
      suiteId,
      suiteName: suiteName ?? "Tanpa Suite",
      linkId: a?.id ?? null,
      externalTestId: a?.externalTestId ?? null,
      scriptPath: a?.scriptPath ?? null,
      status,
      lastRunAt: a?.lastRunAt ? a.lastRunAt.toISOString() : null,
      lastResult: a?.lastResult ?? null,
    };
  });

  // Statistik per project untuk coverage bar & cards
  const EMPTY_STAT: Stat = {
    total: 0,
    automated: 0,
    failing: 0,
    stale: 0,
    unstable: 0,
    notAutomated: 0,
  };
  const projectStats: AutomationProjectStat[] = projects.map((p) => {
    const s = statsByProject.get(p.id) ?? EMPTY_STAT;
    return {
      projectId: p.id,
      name: p.name,
      platform: p.platform,
      total: s.total,
      automated: s.automated,
      failing: s.failing,
      stale: s.stale,
      unstable: s.unstable,
      notAutomated: s.notAutomated,
      coveragePct:
        s.total > 0
          ? Math.round(((s.automated + s.failing + s.stale + s.unstable) / s.total) * 100)
          : 0,
    };
  });

  // Suite yang dimiliki tiap project (untuk filter dependent)
  const suitesByProject = projects.map((p) => ({
    projectId: p.id,
    suites: Array.from(suitesByProjectMap.get(p.id)?.values() ?? []),
  }));

  const payload: AutomationPayload = {
    projects: projects.map((p) => ({ id: p.id, name: p.name, platform: p.platform })),
    suitesByProject,
    rows,
    projectStats,
  };

  return NextResponse.json(payload);
}

export const dynamic = "force-dynamic";
