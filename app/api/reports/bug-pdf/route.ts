import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json400, json401, json404, json500 } from "@/lib/api-auth";
import { toAttachmentItems } from "@/lib/attachments";
import { entityCode } from "@/lib/format";
import { bugPdfFileName, renderBugPdf, type BugPdfData } from "@/lib/bug-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/reports/bug-pdf?bugId=<id>
 *
 * Generator "QA Bug Report" FULL SERVER-SIDE: dokumen dirakit di Node dan byte
 * gambar evidence diambil server-to-server dari R2, jadi tidak ada fetch gambar
 * dari browser dan tidak ada aturan CORS bucket yang bisa menggagalkannya.
 *
 * Respons: application/pdf (dibuka di viewer baru oleh tombol Export PDF).
 */
export async function GET(request: Request) {
  const user = await apiSession();
  if (!user) return json401();

  const bugId = (new URL(request.url).searchParams.get("bugId") ?? "").trim();
  if (!bugId) return json400("bugId wajib diisi.");

  try {
    const bug = await prisma.bug.findUnique({
      where: { id: bugId },
      include: {
        testCase: {
          select: { id: true, tcId: true, title: true, expectedResult: true, precondition: true },
        },
        suite: { select: { id: true, name: true } },
        testRunResult: {
          select: {
            run: { select: { id: true, name: true, environment: true } },
            /** Alasan Skip milik hasil eksekusi yang melahirkan bug ini. */
            status: true,
            skipReason: true,
            skipReasonNote: true,
          },
        },
        createdBy: { select: { name: true } },
        attachments: {
          orderBy: { createdAt: "desc" },
          include: { uploadedBy: { select: { name: true } } },
        },
      },
    });
    if (!bug) return json404("Bug tidak ditemukan.");

    // Attachment di-presign di server (bucket private) → URL inilah yang dipakai
    // dokumen untuk hyperlink DAN untuk diambil bytenya oleh server ini sendiri.
    const attachments = await toAttachmentItems(bug.attachments);

    const data: BugPdfData = {
      bugCode: entityCode("BUG", bug.id),
      title: bug.title,
      severity: bug.severity,
      status: bug.status,
      // Precondition: kolom bug lebih dulu, fallback ke Test Case — aturan yang
      // sama dengan tampilan modal detail (satu sumber kebenaran, lihat modal).
      precondition: bug.precondition?.trim() || bug.testCase?.precondition?.trim() || null,
      expectedResult: bug.testCase?.expectedResult ?? bug.expectedResult,
      actualResult: bug.description,
      externalLink: bug.externalLink,
      runName: bug.testRunResult?.run?.name ?? null,
      environment: bug.environment ?? bug.testRunResult?.run?.environment ?? null,
      // Suite hidup dulu; snapshot riwayat tetap dipakai setelah suite dihapus.
      moduleName: bug.suite?.name ?? bug.suiteName ?? null,
      reporter: bug.createdBy?.name ?? null,
      createdAt: bug.createdAt.toISOString(),
      // Baris "Alasan Skipped" pada PDF mengambil alasan dari hasil eksekusi yang
      // tertaut ke bug ini (satu sumber, bukan disalin ke kolom bug), dan hanya
      // saat hasilnya MEMANG berstatus SKIPPED — sama seperti laporan cetak Test
      // Run, supaya alasan lama tidak nyangkut setelah statusnya berubah.
      skipReason:
        bug.testRunResult?.status === "SKIPPED" ? bug.testRunResult.skipReason : null,
      skipReasonNote:
        bug.testRunResult?.status === "SKIPPED" ? bug.testRunResult.skipReasonNote : null,
      evidence: attachments.map((a) => ({
        fileName: a.fileName,
        url: a.url,
        mimeType: a.mimeType,
      })),
    };

    const pdf = await renderBugPdf(data);

    return new NextResponse(pdf, {
      headers: {
        "content-type": "application/pdf",
        // `attachment` (bukan `inline`) = browser LANGSUNG mengunduh file,
        // tidak membuka tab/viewer baru. Nama file di sini satu-satunya sumber;
        // klien memakai nama yang sama dari header ini.
        "content-disposition": `attachment; filename="${bugPdfFileName(data)}"`,
        // Tidak boleh di-cache sama sekali: PDF harus selalu dibuat ulang dari
        // data terbaru (evidence bisa berubah setelah bug diedit).
        "cache-control": "no-store, no-cache, must-revalidate",
        pragma: "no-cache",
        expires: "0",
      },
    });
  } catch (error) {
    console.error("bug-pdf gagal:", bugId, error);
    return json500("Gagal membuat PDF.");
  }
}
