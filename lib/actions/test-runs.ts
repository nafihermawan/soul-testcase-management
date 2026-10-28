"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { ACTIVE_RUN_STATUSES, ACTIVE_RUN_TC_SCOPE, type RunStatusValue } from "@/lib/run-status";
import { ACTIVE_BUG_STATUSES, SKIP_REASON_OTHER } from "@/lib/qa-metrics";

export type TestRunActionState = {
  error?: string;
  success?: boolean;
};

type ResultStatus = "PASS" | "FAIL" | "BLOCKED" | "SKIPPED" | "NOT_RUN";

/** Label status hasil untuk pesan error yang dibaca user. */
const RESULT_STATUS_LABEL: Record<ResultStatus, string> = {
  PASS: "Passed",
  FAIL: "Failed",
  BLOCKED: "Blocked",
  SKIPPED: "Skipped",
  NOT_RUN: "Untested",
};

/**
 * Error tak terduga di server. Kode error yang lazim (Prisma `P2003`/`P2002`
 * maupun SQLSTATE dari driver `pg` — app ini pakai adapter @prisma/adapter-pg)
 * dipetakan ke pesan yang bisa ditindaklanjuti. Di luar produksi pesan aslinya
 * ikut disertakan supaya penyebabnya langsung kelihatan, bukan "terjadi
 * kesalahan" yang tidak menjelaskan apa pun.
 */
function handleError(error: unknown): TestRunActionState {
  console.error("test-runs action error:", error);
  const code = (error as { code?: unknown } | null)?.code;

  if (code === "P2003" || code === "23503") {
    return { error: "Project / suite / test case yang dipilih tidak valid di database." };
  }
  if (code === "P2002" || code === "23505") {
    return { error: "Data sudah ada (duplikat)." };
  }
  if (code === "P2025") return { error: "Data yang ingin diubah tidak ditemukan." };
  if (code === "23502") return { error: "Ada kolom wajib yang belum terisi." };
  if (code === "22P02") return { error: "Format nilai tidak valid untuk kolom database." };

  const detail = error instanceof Error ? error.message : String(error);
  return {
    error:
      process.env.NODE_ENV === "production"
        ? "Terjadi kesalahan. Coba lagi."
        : `Terjadi kesalahan: ${detail}`,
  };
}

/** Kumpulkan semua TestCase di dalam suite (termasuk semua sub-suite rekursif).
 *
 *  TC berstatus DEPRECATED sengaja DIKECUALIKAN di sini, bukan di UI: form
 *  Express Run mengirim `suiteIds` (suite milik TC yang dicentang) dan server
 *  mengekspansi seluruh isi suite itu — tanpa filter ini, satu TC deprecated di
 *  suite yang sama ikut tertarik masuk ke run walau sudah disembunyikan di UI. */
async function collectTestCasesInSuite(suiteId: string): Promise<string[]> {
  const ids: string[] = [];
  const stack = [suiteId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const suite = await prisma.suite.findUnique({
      where: { id: current },
      include: { children: { select: { id: true } } },
    });
    if (!suite) continue;
    stack.push(...suite.children.map((c) => c.id));
  }
  const tcs = await prisma.testCase.findMany({
    where: { suiteId: { in: ids }, status: { not: "DEPRECATED" } },
    select: { id: true },
  });
  return tcs.map((t) => t.id);
}

/** Pesan penolakan standar untuk TC berstatus Deprecated. */
function deprecatedMessage(tcIds: string[]): string {
  const shown = tcIds.slice(0, 3).join(", ");
  const rest = tcIds.length > 3 ? ` dan ${tcIds.length - 3} lainnya` : "";
  return `Test Case ${shown}${rest} berstatus Deprecated dan tidak dapat dimasukkan ke dalam Active Run.`;
}

/**
 * Validasi "pre-add": tolak TC deprecated yang diminta EKSPLISIT ke dalam run.
 *
 * `allowed` berisi id yang SUDAH ada di run — dipakai jalur edit supaya run
 * warisan (dibuat sebelum aturan ini ada) tetap bisa diedit; keanggotaannya
 * tidak digugurkan, dan QA tetap bisa menandainya Skipped dengan alasan
 * "Deprecated" saat eksekusi.
 *
 * Jalur BULK (suite terpilih) tidak lewat sini: kasus itu di-exclude diam-diam
 * oleh `collectTestCasesInSuite`, bukan ditolak.
 */
async function deprecatedSelectionError(
  testCaseIds: string[],
  allowed: Set<string>
): Promise<string | null> {
  const candidates = Array.from(new Set(testCaseIds.filter(Boolean))).filter(
    (id) => !allowed.has(id)
  );
  if (candidates.length === 0) return null;

  const deprecated = await prisma.testCase.findMany({
    where: { id: { in: candidates }, status: "DEPRECATED" },
    select: { tcId: true },
    orderBy: { tcId: "asc" },
  });
  if (deprecated.length === 0) return null;
  return deprecatedMessage(deprecated.map((t) => t.tcId));
}

/** Buat Test Run baru (Express Run) dari daftar suite/TC terpilih.
 *  projectIds: daftar project yang dipilih; projectId pertama dipakai sebagai primary run. */
export async function createTestRun(
  projectIds: string[],
  name: string,
  suiteIds: string[],
  testCaseIds: string[],
  opts?: {
    sprint?: string;
    taskLink?: string;
    activityType?: string;
    environment?: string;
    platforms?: string[];
    /** Bug asal (General Finding) — run dibuat dari tombol "Test" di Bugs Tracker. */
    sourceBugId?: string | null;
  }
): Promise<TestRunActionState & { runId?: string }> {
  const user = await requireRole("QA");
  const runName = name.trim() || `Test Run ${new Date().toLocaleString("id-ID")}`;
  const projectId = projectIds[0] ?? "";

  try {
    // Run baru: tidak ada keanggotaan lama, jadi semua TC deprecated ditolak.
    const deprecated = await deprecatedSelectionError(testCaseIds, new Set());
    if (deprecated) return { error: deprecated };

    const selected = new Set<string>(testCaseIds);
    for (const suiteId of suiteIds) {
      const collected = await collectTestCasesInSuite(suiteId);
      collected.forEach((id) => selected.add(id));
    }
    if (selected.size === 0) {
      return { error: "Tidak ada test case yang dipilih." };
    }
    if (!projectId) {
      return { error: "Project wajib dipilih." };
    }

    const testCases = await prisma.testCase.findMany({
      where: { id: { in: Array.from(selected) } },
      select: { id: true, title: true },
    });

    // Rujukan bug opsional: divalidasi dulu supaya id yang salah tidak
    // menggagalkan pembuatan run (FK-nya jadi null, bukan error).
    let sourceBugId: string | null = null;
    if (opts?.sourceBugId?.trim()) {
      const bug = await prisma.bug.findUnique({
        where: { id: opts.sourceBugId.trim() },
        select: { id: true },
      });
      sourceBugId = bug?.id ?? null;
    }

    const run = await prisma.testRun.create({
      data: {
        name: runName,
        projectId,
        // Run baru = "Open" (siap ditest, belum ada eksekusi). Begitu hasil
        // pertama masuk, `startRunIfPending` menaikkannya ke IN_PROGRESS.
        status: "PENDING",
        sourceBugId,
        activityType: opts?.activityType?.trim() || null,
        platforms:
          opts?.platforms && opts.platforms.length > 0
            ? opts.platforms.join(", ")
            : null,
        environment: opts?.environment?.trim() || null,
        sprint: opts?.sprint?.trim() || null,
        taskLink: opts?.taskLink?.trim() || null,
        createdById: user.id,
        results: {
          create: testCases.map((tc) => ({
            testCaseId: tc.id,
            titleSnapshot: tc.title,
            status: "NOT_RUN",
          })),
        },
      },
    });

    revalidatePath("/test-runs");
    revalidatePath(`/test-runs/${run.id}`);
    return { success: true, runId: run.id };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Perbarui Test Run yang sudah ada: field run + sinkronisasi daftar TC-nya.
 *
 * Hasil eksekusi untuk TC yang TETAP dipilih dipertahankan apa adanya (status,
 * actual result, bug yang menempel); TC yang dibuang hasilnya dihapus; TC baru
 * ditambahkan sebagai NOT_RUN.
 */
export async function updateTestRun(
  runId: string,
  projectIds: string[],
  name: string,
  suiteIds: string[],
  testCaseIds: string[],
  opts?: {
    sprint?: string;
    taskLink?: string;
    activityType?: string;
    environment?: string;
    platforms?: string[];
  }
): Promise<TestRunActionState & { runId?: string }> {
  await requireRole("QA");
  const runName = name.trim();
  const projectId = projectIds[0] ?? "";

  try {
    if (!runName) return { error: "Nama run wajib diisi." };
    if (!projectId) return { error: "Project wajib dipilih." };

    const run = await prisma.testRun.findUnique({
      where: { id: runId },
      select: { id: true },
    });
    if (!run) return { error: "Run tidak ditemukan." };

    const existing = await prisma.testRunResult.findMany({
      where: { runId },
      select: { testCaseId: true },
    });
    const existingIds = new Set(existing.map((r) => r.testCaseId));

    // TC deprecated yang SUDAH ada di run dibiarkan (run warisan tetap bisa
    // diedit); permintaan memasukkannya BARU yang ditolak.
    const deprecated = await deprecatedSelectionError(testCaseIds, existingIds);
    if (deprecated) return { error: deprecated };

    // Sama seperti create: TC terpilih = yang dicentang + seluruh isi suite terpilih.
    const selected = new Set<string>(testCaseIds);
    for (const suiteId of suiteIds) {
      const collected = await collectTestCasesInSuite(suiteId);
      collected.forEach((id) => selected.add(id));
    }
    if (selected.size === 0) return { error: "Tidak ada test case yang dipilih." };

    const toAdd = Array.from(selected).filter((id) => !existingIds.has(id));
    const toRemove = Array.from(existingIds).filter((id) => !selected.has(id));

    const addedCases = toAdd.length
      ? await prisma.testCase.findMany({
          where: { id: { in: toAdd } },
          select: { id: true, title: true },
        })
      : [];

    await prisma.$transaction([
      prisma.testRun.update({
        where: { id: runId },
        data: {
          name: runName,
          projectId,
          activityType: opts?.activityType?.trim() || null,
          platforms:
            opts?.platforms && opts.platforms.length > 0 ? opts.platforms.join(", ") : null,
          environment: opts?.environment?.trim() || null,
          sprint: opts?.sprint?.trim() || null,
          taskLink: opts?.taskLink?.trim() || null,
        },
      }),
      ...(toRemove.length
        ? [
            prisma.testRunResult.deleteMany({
              where: { runId, testCaseId: { in: toRemove } },
            }),
          ]
        : []),
      ...(addedCases.length
        ? [
            prisma.testRunResult.createMany({
              data: addedCases.map((tc) => ({
                runId,
                testCaseId: tc.id,
                titleSnapshot: tc.title,
                status: "NOT_RUN" as const,
              })),
            }),
          ]
        : []),
    ]);

    revalidatePath("/test-runs");
    revalidatePath(`/test-runs/${runId}`);
    return { success: true, runId };
  } catch (error) {
    return handleError(error);
  }
}

/** Update status/actual result satu TestRunResult. */
export async function updateRunResult(
  resultId: string,
  data: {
    status: ResultStatus;
    actualResult?: string;
    /** Catatan hasil PASS, sekaligus "Alasan Blocked" saat status BLOCKED. */
    notes?: string;
    /** Hanya relevan saat status SKIPPED; status lain selalu dikosongkan. */
    skipReason?: string;
    /** Keterangan bebas, hanya dipakai saat alasannya "Lainnya". */
    skipReasonNote?: string;
  }
): Promise<TestRunActionState> {
  const user = await requireRole("QA");
  try {
    // Blocked wajib punya alasan: kalau tidak, tidak ada konteks kenapa TC ini
    // dilewati — dan riwayat eksekusinya jadi tidak bisa dipertanggungjawabkan.
    // Dijaga di sini (bukan hanya di UI) supaya semua jalur tulis tunduk aturan.
    if (data.status === "BLOCKED" && !data.notes?.trim()) {
      return { error: "Alasan Blocked wajib diisi." };
    }

    const result = await prisma.testRunResult.findUnique({
      where: { id: resultId },
      include: { run: { select: { id: true, status: true } } },
    });
    if (!result) return { error: "Hasil run tidak ditemukan." };

    /**
     * Invariant BUG ↔ HASIL EKSEKUSI: selama masih ada bug aktif (OPEN /
     * IN_PROGRESS) yang tertaut ke hasil ini, statusnya WAJIB FAIL.
     *
     * Tanpa penjagaan ini ringkasan run dan Bugs Tracker bisa saling
     * bertentangan — persis kasus "Failed 0 tapi masih ada bug aktif": TC
     * diubah ke Passed/Skipped sementara bug-nya tetap Open. UI menawarkan dua
     * jalan keluar (tutup bug atau lepaskan dari run) sebelum menyimpan.
     */
    if (data.status !== "FAIL") {
      const linkedActive = await prisma.bug.findMany({
        where: { testRunResultId: resultId, status: { in: [...ACTIVE_BUG_STATUSES] } },
        select: { id: true },
      });
      if (linkedActive.length > 0) {
        return {
          error: `Test case ini masih punya ${linkedActive.length} bug aktif. Tutup bug tersebut (Resolved/Closed) atau lepaskan dari run sebelum mengubah status menjadi ${RESULT_STATUS_LABEL[data.status]}.`,
        };
      }
    }

    await prisma.testRunResult.update({
      where: { id: resultId },
      data: {
        status: data.status,
        actualResult: data.actualResult?.trim() || null,
        notes: data.notes?.trim() || null,
        skipReason:
          data.status === "SKIPPED" ? data.skipReason?.trim() || null : null,
        // Keterangan hanya bermakna untuk alasan "Lainnya"; selain itu dikosongkan
        // supaya tidak ada teks nyangkut di alasan yang tidak dipilih.
        skipReasonNote:
          data.status === "SKIPPED" && data.skipReason?.trim() === SKIP_REASON_OTHER
            ? data.skipReasonNote?.trim() || null
            : null,
        updatedById: user.id,
      },
    });

    // Begitu ada eksekusi, run yang tadinya "Open" (PENDING) jadi "In Progress".
    await startRunIfPending(result.run.id, result.run.status);

    revalidatePath(`/test-runs/${result.run.id}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Run baru dibuat berstatus PENDING ("Open"). Begitu hasil eksekusi pertama
 * masuk, run itu otomatis jadi IN_PROGRESS — aturan ini dipakai jalur executor
 * maupun eksekusi cepat dari halaman Test Case, jadi statusnya tidak bisa
 * "nyangkut" di Open padahal sudah ada yang ditest.
 */
async function startRunIfPending(runId: string, status: string): Promise<void> {
  if (status !== "PENDING") return;
  await prisma.testRun.update({ where: { id: runId }, data: { status: "IN_PROGRESS" } });
  revalidatePath("/test-runs");
}

/**
 * Ubah status sebuah TestRun dari kontrol list (Active Runs & Run History).
 *
 * COMPLETED sengaja DITOLAK di sini: menyelesaikan run wajib lewat halaman
 * detail Test Run karena butuh catatan penyelesaian (overallNotes) — pakai
 * `completeRun` / `completeRunWithSkip`. Kontrol list hanya boleh memindahkan
 * run antar status "belum selesai" (PENDING / IN_PROGRESS / RE_OPEN), sehingga
 * `completedAt` selalu dikosongkan di jalur ini.
 */
export async function setRunStatus(
  runId: string,
  status: RunStatusValue
): Promise<TestRunActionState> {
  await requireRole("QA");
  if (status === "COMPLETED") {
    return {
      error:
        "Status Completed hanya bisa diset dari halaman detail Test Run (butuh catatan penyelesaian).",
    };
  }
  try {
    const run = await prisma.testRun.findUnique({
      where: { id: runId },
      select: { id: true },
    });
    if (!run) return { error: "Test run tidak ditemukan." };

    await prisma.testRun.update({
      where: { id: runId },
      data: {
        status,
        completedAt: null,
      },
    });

    revalidatePath("/test-runs");
    revalidatePath("/test-runs/history");
    revalidatePath("/reports");
    revalidatePath(`/test-runs/${runId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Tetapkan / lepas assignee (QA tester) sebuah run — mendukung lebih dari satu
 * orang. Daftar kosong = lepas semua penugasan. Dipakai dropdown multi-select
 * di tabel Active Runs. Kolom tunggal `assigneeId` lama tetap disinkronkan ke
 * assignee pertama supaya data/permukaan lama tidak ikut kosong.
 */
export async function setRunAssignees(
  runId: string,
  userIds: string[]
): Promise<TestRunActionState> {
  await requireRole("QA");
  try {
    const run = await prisma.testRun.findUnique({
      where: { id: runId },
      select: { id: true },
    });
    if (!run) return { error: "Test run tidak ditemukan." };

    // Buang id kosong + duplikat sebelum divalidasi.
    const ids = Array.from(new Set(userIds.filter(Boolean)));

    if (ids.length > 0) {
      const found = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      if (found.length !== ids.length) return { error: "Ada user yang tidak ditemukan." };
    }

    // Ganti-set: hapus penugasan lama lalu tulis daftar baru dalam satu transaksi.
    await prisma.$transaction([
      prisma.testRunAssignee.deleteMany({ where: { testRunId: runId } }),
      prisma.testRunAssignee.createMany({
        data: ids.map((userId) => ({ testRunId: runId, userId })),
        skipDuplicates: true,
      }),
      prisma.testRun.update({
        where: { id: runId },
        data: { assigneeId: ids[0] ?? null },
      }),
    ]);

    revalidatePath("/test-runs");
    revalidatePath(`/test-runs/${runId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Bug asal run (kalau run dibuat dari tombol "Test" di General Findings) yang
 * perlu ditutup ketika run-nya selesai. `null` bila run tidak punya sumber bug
 * atau bug-nya sudah CLOSED (idempoten — `resolvedAt` tidak di-reset).
 */
async function sourceBugToClose(runId: string): Promise<{ id: string } | null> {
  const run = await prisma.testRun.findUnique({
    where: { id: runId },
    select: { sourceBug: { select: { id: true, status: true } } },
  });
  const bug = run?.sourceBug;
  if (!bug || bug.status === "CLOSED") return null;
  return { id: bug.id };
}

/** Operasi auto-close bug asal untuk digabung ke `$transaction([...])`. */
function closeSourceBugOp(bug: { id: string } | null) {
  return bug
    ? [
        prisma.bug.update({
          where: { id: bug.id },
          data: { status: "CLOSED" as const, resolvedAt: new Date() },
        }),
      ]
    : [];
}

/**
 * Bug yang MASIH AKTIF (belum CLOSED/RESOLVED) dan tertaut ke hasil eksekusi
 * run ini — dasar quality gate "Complete Test Run".
 *
 * Sengaja lewat `testRunResult.runId` (temuan run ini), BUKAN
 * `TestRun.sourceBugId`: bug sumber re-test memang masih aktif saat di-retest,
 * dan justru ditutup OLEH penyelesaian run — kalau ikut dihitung, run re-test
 * tidak akan pernah bisa diselesaikan.
 */
async function activeBugsForRun(runId: string) {
  return prisma.bug.findMany({
    where: { testRunResult: { runId }, status: { in: [...ACTIVE_BUG_STATUSES] } },
    select: { id: true, title: true, status: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Pesan gate yang sama dipakai completeRun & completeRunWithSkip. */
function activeBugGateError(count: number): TestRunActionState {
  return {
    error: `Tidak dapat menyelesaikan Test Run. Masih terdapat ${count} Bug aktif yang belum Closed/Resolved. Silakan selesaikan atau tautkan ulang Bug tersebut terlebih dahulu.`,
  };
}

/**
 * Tandai run selesai. Run yang dibuat dari sebuah bug (re-test General Finding)
 * sekaligus menutup bug asalnya — re-test-nya sudah dijalankan. */
export async function completeRun(
  runId: string,
  overallNotes?: string
): Promise<TestRunActionState> {
  await requireRole("QA");
  try {
    // Run hanya boleh ditutup bila TIDAK ada TC yang masih NOT_RUN — supaya
    // status "Completed" SELALU berarti progress eksekusi 100%. Sisa TC boleh
    // ditandai SKIPPED lewat `completeRunWithSkip` (TC tetap punya status akhir).
    //
    // TC deprecated tidak ikut dihitung: barisnya sudah disembunyikan dari
    // daftar eksekusi (lib/run-status.ts), jadi kalau ikut dihitung ia menjadi
    // penghalang yang tidak terlihat oleh QA.
    const notRun = await prisma.testRunResult.count({
      where: { runId, status: "NOT_RUN", ...ACTIVE_RUN_TC_SCOPE },
    });
    if (notRun > 0) {
      return {
        error: `Masih ada ${notRun} test case yang belum dieksekusi. Eksekusi semuanya, atau pakai "Selesaikan & tandai sisa sebagai Skipped".`,
      };
    }

    // Quality gate: bug temuan run ini harus sudah Closed/Resolved dulu.
    const activeBugs = await activeBugsForRun(runId);
    if (activeBugs.length > 0) return activeBugGateError(activeBugs.length);

    const bug = await sourceBugToClose(runId);
    await prisma.$transaction([
      prisma.testRun.update({
        where: { id: runId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          overallNotes: overallNotes?.trim() || null,
        },
      }),
      ...closeSourceBugOp(bug),
    ]);
    revalidatePath(`/test-runs/${runId}`);
    revalidatePath("/test-runs");
    if (bug) revalidatePath("/bugs");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Selesaikan run dan tandai otomatis semua TC yang belum dieksekusi sebagai SKIPPED. */
export async function completeRunWithSkip(
  runId: string,
  overallNotes?: string
): Promise<TestRunActionState> {
  await requireRole("QA");
  try {
    // Quality gate yang sama: melewati sisa TC bukan alasan menutup run dengan
    // bug aktif masih menggantung.
    const activeBugs = await activeBugsForRun(runId);
    if (activeBugs.length > 0) return activeBugGateError(activeBugs.length);

    const bug = await sourceBugToClose(runId);
    await prisma.$transaction([
      // Sisa TC ditandai SKIPPED — TERMASUK baris TC deprecated yang
      // disembunyikan dari daftar eksekusi, supaya invariantnya tetap utuh:
      // run COMPLETED berarti setiap baris sudah punya status akhir.
      prisma.testRunResult.updateMany({
        where: { runId, status: "NOT_RUN" },
        data: { status: "SKIPPED" },
      }),
      prisma.testRun.update({
        where: { id: runId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          overallNotes: overallNotes?.trim() || null,
        },
      }),
      // Sama seperti completeRun: run re-test yang selesai menutup bug asalnya.
      ...closeSourceBugOp(bug),
    ]);
    revalidatePath(`/test-runs/${runId}`);
    revalidatePath("/test-runs");
    if (bug) revalidatePath("/bugs");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Simpan hasil eksekusi untuk satu TestCase dari modal detail.
 * Update TestRunResult di run aktif terbaru yang berisi TC ini;
 * kalau belum ada, buat TestRunResult baru di run aktif terbaru.
 * Run aktif = IN_PROGRESS atau RE_OPEN (PENDING belum dimulai).
 */
export async function saveExecutionForTestCase(
  testCaseId: string,
  data: {
    status: ResultStatus;
    actualResult?: string;
    notes?: string;
  }
): Promise<TestRunActionState> {
  const user = await requireRole("QA");
  try {
    const tc = await prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: { suite: { select: { projectId: true } } },
    });
    if (!tc) return { error: "Test case tidak ditemukan." };

    // Run aktif terbaru yang berisi TC ini. Run yang SEDANG dieksekusi
    // (IN_PROGRESS/RE_OPEN) menang dulu; run "Open" (PENDING) baru dipakai kalau
    // tidak ada yang sedang berjalan — supaya hasil tidak nyasar ke run lain
    // hanya karena run Open lebih baru dibuat.
    const findResultInRun = (statuses: RunStatusValue[]) =>
      prisma.testRunResult.findFirst({
        where: { testCaseId, run: { status: { in: statuses } } },
        orderBy: { updatedAt: "desc" },
        include: { run: { select: { id: true, status: true } } },
      });
    const existing =
      (await findResultInRun(ACTIVE_RUN_STATUSES)) ?? (await findResultInRun(["PENDING"]));

    if (existing) {
      await prisma.testRunResult.update({
        where: { id: existing.id },
        data: {
          status: data.status,
          actualResult: data.actualResult?.trim() || null,
          notes: data.notes?.trim() || null,
          updatedById: user.id,
        },
      });
      await startRunIfPending(existing.run.id, existing.run.status);
      revalidatePath(`/test-runs/${existing.run.id}`);
    } else {
      // Cabang ini MEMBUAT baris hasil baru di run berjalan, jadi TC Deprecated
      // tidak boleh masuk lewat sini. (Cabang update di atas tetap diizinkan:
      // QA perlu menandai baris Deprecated warisan sebagai Skipped/Deprecated.)
      if (tc.status === "DEPRECATED") {
        return { error: deprecatedMessage([tc.tcId]) };
      }
      // Belum ada run yang memuat TC ini: pakai run berjalan terbaru project,
      // kalau tidak ada baru run "Open" terbaru (Express Run satu TC).
      const activeRun =
        (await prisma.testRun.findFirst({
          where: { status: { in: ACTIVE_RUN_STATUSES }, projectId: tc.suite?.projectId },
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true },
        })) ??
        (await prisma.testRun.findFirst({
          where: { status: "PENDING", projectId: tc.suite?.projectId },
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true },
        }));
      if (activeRun) {
        await prisma.testRunResult.create({
          data: {
            runId: activeRun.id,
            testCaseId,
            titleSnapshot: tc.title,
            status: data.status,
            actualResult: data.actualResult?.trim() || null,
            notes: data.notes?.trim() || null,
            updatedById: user.id,
          },
        });
        await startRunIfPending(activeRun.id, activeRun.status);
        revalidatePath(`/test-runs/${activeRun.id}`);
      } else {
        return { error: "Tidak ada run berjalan untuk project ini." };
      }
    }

    revalidatePath(`/test-cases/${testCaseId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Hapus run (untuk run yang belum dieksekusi / salah buat). */
export async function deleteRun(runId: string): Promise<TestRunActionState> {
  await requireRole("QA");
  try {
    await prisma.testRun.delete({ where: { id: runId } });
    revalidatePath("/test-runs");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}
