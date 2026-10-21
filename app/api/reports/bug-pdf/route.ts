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
        testRunResult: { select: { run: { select: { id: true, name: true, environment: true } } } },
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
      moduleName: bug.suite?.name ?? null,
      reporter: bug.createdBy?.name ?? null,
      createdAt: bug.createdAt.toISOString(),
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
        // `inline` supaya tab baru dari tombol Export PDF langsung menampilkan
        // dokumen (viewer PDF punya tombol simpan sendiri).
        "content-disposition": `inline; filename="${bugPdfFileName(data)}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("bug-pdf gagal:", bugId, error);
    return json500("Gagal membuat PDF.");
  }
}
