import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/hierarchy";

export const runtime = "nodejs";

/**
 * Terima hasil eksekusi otomatis dari CI (Playwright/Jest).
 *
 * Payload:
 * {
 *   externalTestId: string,   // wajib, unik
 *   status: "PASS" | "FAIL",  // hasil run CI
 *   scriptPath?: string,      // path file script di repo
 *   title?: string,           // optional — dipakai saat auto-create TestCase
 *   suiteId?: string,         // optional — suite tujuan saat auto-create
 *   timestamp?: string        // ISO, default now
 * }
 *
 * Upsert: kalau externalTestId sudah terdaftar di AutomationLink, update
 * status + lastRunAt; kalau belum, buat TestCase baru (di suite default/
 * uncategorized) sekaligus AutomationLink-nya.
 */
export async function POST(request: Request) {
  await requireUser();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const externalTestId =
    typeof body.externalTestId === "string" ? body.externalTestId.trim() : "";
  if (!externalTestId) {
    return NextResponse.json(
      { error: "externalTestId wajib diisi" },
      { status: 400 }
    );
  }

  const status = body.status === "PASS" ? "PASS" : body.status === "FAIL" ? "FAIL" : null;
  const scriptPath = typeof body.scriptPath === "string" ? body.scriptPath : null;
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
  const suiteId = typeof body.suiteId === "string" ? body.suiteId : null;
  const timestamp = body.timestamp ? new Date(String(body.timestamp)) : new Date();
  if (Number.isNaN(timestamp.getTime())) {
    return NextResponse.json({ error: "timestamp tidak valid" }, { status: 400 });
  }

  try {
    const existing = await prisma.automationLink.findUnique({
      where: { externalTestId },
      include: { testCase: { select: { id: true, tcId: true } } },
    });

    if (existing) {
      const updated = await prisma.automationLink.update({
        where: { id: existing.id },
        data: {
          status: status ? (status === "PASS" ? "AUTOMATED" : "FAILING") : undefined,
          lastResult: status,
          lastRunAt: timestamp,
          scriptPath: scriptPath ?? existing.scriptPath,
        },
        include: { testCase: { select: { id: true, tcId: true } } },
      });
      return NextResponse.json({
        ok: true,
        action: "updated",
        testCaseId: updated.testCase.id,
        tcId: updated.testCase.tcId,
      });
    }

    // Belum terdaftar: buat TestCase + AutomationLink baru.
    // Suite default/uncategorized: suite pertama project, atau null (tanpa suite).
    let targetSuiteId: string | null = suiteId ?? null;
    if (!targetSuiteId) {
      const anySuite = await prisma.suite.findFirst({
        select: { id: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      });
      targetSuiteId = anySuite?.id ?? null;
    }

    const tc = await prisma.testCase.create({
      data: {
        title: title ?? `Auto-created TC (${externalTestId})`,
        tcId: `AUTO-${externalTestId.replace(/[^a-zA-Z0-9_-]/g, "")}`.slice(0, 60),
        suiteId: targetSuiteId,
        status: "DRAFT",
        automation: {
          create: {
            externalTestId,
            status: status ? (status === "PASS" ? "AUTOMATED" : "FAILING") : "NOT_AUTOMATED",
            lastResult: status,
            lastRunAt: timestamp,
            scriptPath,
          },
        },
      },
      select: { id: true, tcId: true },
    });

    return NextResponse.json(
      { ok: true, action: "created", testCaseId: tc.id, tcId: tc.tcId },
      { status: 201 }
    );
  } catch (error) {
    console.error("automation-results error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}
