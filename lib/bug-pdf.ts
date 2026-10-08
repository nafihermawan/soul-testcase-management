/**
 * Generator "Laporan Bug" PDF ringkas (A4, dioptimalkan 1 halaman) untuk modal
 * eksekusi Test Run, tabel Bugs Tracker, dan modal detail bug.
 *
 * Sengaja memakai jsPDF saja TANPA html2canvas: link evidence harus benar-benar
 * bisa diklik di PDF, sedangkan html2canvas meraster halaman jadi gambar
 * sehingga hyperlink-nya hilang. Semua digambar sebagai teks/vektor — hasilnya
 * tajam dan file-nya kecil.
 *
 * Tata letak (atas → bawah): header dokumen, JUDUL BUG, metadata grid 2 kolom,
 * lalu section Precondition / Expected Result / Actual Result / Evidence —
 * masing-masing dengan label Title Case + garis pemisah persis di bawah label.
 *
 * Catatan: URL evidence adalah presigned URL (R2), jadi bisa dibuka tanpa login
 * sampai masa berlakunya habis.
 */

export type BugPdfEvidence = {
  fileName: string;
  /** Presigned URL — buka tanpa login sampai kedaluwarsa. */
  url: string | null;
  mimeType?: string | null;
};

export type BugPdfData = {
  bugCode: string;
  title: string;
  severity: string | null;
  status: string;
  precondition?: string | null;
  expectedResult?: string | null;
  actualResult?: string | null;
  runName?: string | null;
  environment?: string | null;
  moduleName?: string | null;
  reporter?: string | null;
  createdAt?: string | null;
  evidence: BugPdfEvidence[];
};

const M = 12; // margin halaman (mm)
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - M * 2;
/** Lebar efektif teks: dikurangi sedikit sebagai padding kanan aman. */
const TEXT_W = CONTENT_W - 2;
const GUTTER = 8; // jarak antar kolom metadata
const FOOTER_Y = PAGE_H - 10;

const INK = { title: "#0F172A", text: "#334155", muted: "#64748B", line: "#E2E8F0" };
const LINK = "#1D4ED8";

/**
 * Jarak vertikal konsisten (padanan Tailwind): label section `pb-1 mb-2`,
 * container section `mb-4`, dan judul bug → metadata dirapatkan.
 */
const GAP = {
  /** Judul bug → metadata grid (rapat, tanpa whitespace berlebih). */
  titleToMeta: 3,
  /** Label → garis pemisah tepat di bawah label (≈ pb-1). */
  labelToLine: 2.5,
  /**
   * Garis label → isi teks (≈ pt-2 + mb-2). Dipakai SAMA RATA oleh semua
   * section (Precondition, Expected Result, Actual Result, Evidence) supaya
   * napas di bawah divider seragam.
   */
  belowLine: 5.2,
  /** Antar section (≈ mb-4). */
  section: 4.5,
  /** Tinggi satu baris isi teks (mm). */
  lineHeight: 4.3,
};

type Doc = import("jspdf").jsPDF;

/** Nilai enum → teks rapi ("IN_PROGRESS" → "In Progress"). */
function prettyEnum(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "—";
  return v
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Ganti newline jadi satu spasi supaya paragraf tidak pecah aneh. */
const flat = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/**
 * Pecah teks jadi baris yang PASTI muat di `width`. `splitTextToSize` hanya
 * memotong di spasi, jadi token panjang (URL / nama file tanpa spasi) dipecah
 * paksa per karakter — inilah "break-words" agar teks tidak terpotong di margin.
 */
function wrapLines(doc: Doc, text: string, width: number): string[] {
  const out: string[] = [];
  for (const line of doc.splitTextToSize(text, width) as string[]) {
    if (doc.getTextWidth(line) <= width) {
      out.push(line);
      continue;
    }
    let chunk = "";
    for (const ch of line) {
      if (doc.getTextWidth(chunk + ch) > width && chunk) {
        out.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    if (chunk) out.push(chunk);
  }
  return out;
}

/** Gaya label section: slate-500, semibold, ≈ text-[11px]. */
function setLabelStyle(doc: Doc) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(INK.muted);
}

/**
 * Section berlabel: label Title Case, garis pemisah PERSIS di bawah label,
 * lalu isi teks. Mengembalikan posisi y berikutnya (dengan jarak `mb-4`).
 */
function labeledSection(doc: Doc, label: string, text: string, y: number, maxLines = 8): number {
  setLabelStyle(doc);
  doc.text(label, M, y);

  const lineY = y + GAP.labelToLine;
  doc.setDrawColor(INK.line);
  doc.setLineWidth(0.2);
  doc.line(M, lineY, PAGE_W - M, lineY);

  const lines = wrapLines(doc, flat(text) || "—", TEXT_W).slice(0, maxLines);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(INK.text);
  doc.text(lines, M, lineY + GAP.belowLine);

  return lineY + GAP.belowLine + lines.length * GAP.lineHeight + GAP.section;
}

export async function downloadBugPdf(data: BugPdfData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  // ---------- Header dokumen ----------
  // Judul utama = nama dokumen ("QA Bug Report"); brand Soulparking tetap
  // tertulis di footer supaya tidak ada pengulangan di header.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(INK.title);
  doc.text("QA Bug Report", M, M + 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(INK.muted);
  doc.text(
    `Dibuat ${new Date().toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`,
    PAGE_W - M,
    M + 3,
    { align: "right" }
  );

  doc.setDrawColor(INK.title);
  doc.setLineWidth(0.6);
  doc.line(M, M + 9.5, PAGE_W - M, M + 9.5);

  let y = M + 16;

  // ---------- Judul bug (paling atas, tepat di bawah garis header) ----------
  // Ukurannya sengaja text-sm (≈10,5pt) agar tidak mendominasi dokumen.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(INK.title);
  const titleLines = wrapLines(doc, flat(data.title) || "—", TEXT_W).slice(0, 3);
  doc.text(titleLines, M, y);
  y += titleLines.length * 5 + GAP.titleToMeta;

  // ---------- Metadata grid 2 kolom (key-value, tanpa badge) ----------
  const metaRows: [string, string][][] = [
    [
      ["Test Run", flat(data.runName) || "—"],
      ["Module", flat(data.moduleName) || "—"],
    ],
    [
      ["Environment", flat(data.environment) || "—"],
      ["Reporter (QA)", flat(data.reporter) || "—"],
    ],
    [
      ["Tanggal", data.createdAt ? new Date(data.createdAt).toLocaleDateString("id-ID") : "—"],
      ["Bug ID", data.bugCode],
    ],
    [
      ["Status", prettyEnum(data.status)],
      ["Severity", prettyEnum(data.severity)],
    ],
  ];
  const colW = (CONTENT_W - GUTTER) / 2;
  const rowH = 10;
  metaRows.forEach((row, r) => {
    row.forEach(([label, value], c) => {
      const x = M + c * (colW + GUTTER);
      const rowY = y + r * rowH;
      // Label Title Case (bukan uppercase), slate-500 semibold.
      setLabelStyle(doc);
      doc.text(label, x, rowY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(INK.text);
      const oneLine = wrapLines(doc, value, colW - 2)[0];
      doc.text(oneLine ?? "—", x, rowY + 4.2);
    });
  });
  y += metaRows.length * rowH + GAP.section;

  // ---------- Section isi (label + garis persis di bawah label) ----------
  /**
   * Batas baris dihitung dari sisa tinggi halaman (bukan angka mati) supaya isi
   * sepanjang mungkin ikut tercetak — tinggal menyisakan ruang untuk Evidence.
   */
  const maxLinesFor = (reserve = 0) =>
    Math.max(2, Math.floor((FOOTER_Y - 8 - reserve - y) / GAP.lineHeight));

  y = labeledSection(doc, "Precondition", data.precondition ?? "", y, Math.min(5, maxLinesFor()));
  y = labeledSection(doc, "Expected Result", data.expectedResult ?? "", y, Math.min(8, maxLinesFor()));
  y = labeledSection(doc, "Actual Result", data.actualResult ?? "", y, maxLinesFor(22));

  // ---------- Evidence: hyperlink nama file (tanpa URL mentah) ----------
  setLabelStyle(doc);
  doc.text("Evidence", M, y);
  const evidenceLineY = y + GAP.labelToLine;
  doc.setDrawColor(INK.line);
  doc.setLineWidth(0.2);
  doc.line(M, evidenceLineY, PAGE_W - M, evidenceLineY);
  y = evidenceLineY + GAP.belowLine;

  const withUrl = data.evidence.filter((e) => e.url);
  if (withUrl.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(INK.muted);
    doc.text("Tidak ada file evidence.", M, y);
  } else {
    withUrl.forEach((e, i) => {
      const prefix = `${i + 1}. `;
      // Nama file aman dari terpotong: dipecah paksa kalau perlu (break-words).
      const name =
        wrapLines(doc, e.fileName, TEXT_W - 26)[0] ?? e.fileName;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(INK.text);
      doc.text(prefix, M, y);
      doc.setTextColor(LINK);
      // Hyperlink aktif — dibuka tanpa login (presigned URL). URL mentah tidak
      // dicetak karena tombol [Buka Link] sudah bisa diklik.
      doc.textWithLink(name, M + doc.getTextWidth(prefix), y, { url: e.url as string });
      doc.setFont("helvetica", "bold");
      doc.textWithLink("[Buka Link]", M + doc.getTextWidth(prefix) + doc.getTextWidth(name) + 3, y, {
        url: e.url as string,
      });
      y += 6;
    });
  }

  // ---------- Footer ----------
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(INK.muted);
    doc.text("Soulparking Test Case Management · dibuat otomatis dari sistem", M, FOOTER_Y);
    doc.text(`Halaman ${p}/${pageCount}`, PAGE_W - M, FOOTER_Y, { align: "right" });
  }

  doc.save(`bug-${data.bugCode}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
