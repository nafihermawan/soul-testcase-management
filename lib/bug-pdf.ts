/**
 * Generator "Laporan Bug" PDF ringkas (A4). Halaman pertama memuat seluruh teks
 * laporan; section Evidence boleh melanjut ke halaman berikutnya bila gambarnya
 * banyak (halaman lanjutan diberi label "Evidence (lanjutan)" + footer).
 *
 * SERVER-ONLY (dipakai route `/api/reports/bug-pdf`): dokumen dirender penuh di
 * Node, dan byte gambar evidence diambil lewat `fetch()` SERVER-TO-SERVER ke R2 —
 * jadi tidak ada preflight/CORS browser yang bisa menggagalkan preview.
 * Konsekuensinya modul ini tidak boleh diimpor komponen klien (jsPDF tetap
 * di-bundle di server saja).
 *
 * Sengaja memakai jsPDF saja TANPA html2canvas: link evidence harus benar-benar
 * bisa diklik di PDF, sedangkan html2canvas meraster halaman jadi gambar
 * sehingga hyperlink-nya hilang. Semua digambar sebagai teks/vektor — hasilnya
 * tajam dan file-nya kecil.
 *
 * Tata letak (atas → bawah): header dokumen, JUDUL BUG, metadata grid 2 kolom
 * (termasuk Link Eksternal sebagai hyperlink), lalu section Precondition /
 * Expected Result / Actual Result / Evidence — masing-masing dengan label Title
 * Case + garis pemisah persis di bawah label. Expected Result & Actual Result
 * dirender sebagai daftar poin (bullet/nomor) bila teksnya berisi baris list.
 *
 * Evidence diperlakukan berbeda per jenis:
 * - GAMBAR (PNG/JPEG)  → thumbnail-nya digambar langsung ke dokumen. Bytenya
 *   diambil server-to-server dari R2, dikirim sebagai data URL Base64, lalu
 *   digambar apa adanya (tanpa canvas — Node tidak punya canvas).
 * - VIDEO / non-gambar → TIDAK dirender sebagai frame/player (jsPDF tidak bisa
 *   decode video), melainkan baris hyperlink biru bergaris bawah.
 * Gambar yang gagal/terlalu besar/formatnya tidak didukung (mis. WebP) otomatis
 * jatuh ke baris hyperlink juga, jadi tidak ada evidence yang hilang dan PDF-nya
 * tidak pernah gagal.
 *
 * Catatan: URL evidence adalah presigned URL (R2), jadi bisa dibuka siapa pun
 * yang memegang dokumen sampai masa berlakunya habis.
 */

import { getFormattedDate, sanitizeFilename } from "@/lib/format";

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
  /** Link referensi eksternal (Jira/GitHub/Drive) — dirender sebagai hyperlink. */
  externalLink?: string | null;
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
/** Biru link dokumen (blue-600) — dipakai SEMUA hyperlink di PDF ini. */
const LINK = "#2563EB";

/**
 * Kartu gambar evidence: selebar container (`TEXT_W`), rasio dijaga, tinggi
 * dibatasi CARD_MAX_H (padanan "max-width 100% + max-height 250px" ≈ 66 mm pada
 * 96 dpi), dengan padding dalam dan jarak antar kartu.
 */
const CARD_MAX_H = 66;
const CARD_PAD = 1.5;
const CARD_GAP = 4;
/** Tinggi satu baris hyperlink evidence (mm). */
const LINK_ROW_H = 4.8;

/** Indentasi gantung untuk item daftar (mm) — teks menjorok dari marker. */
const LIST_INDENT = 4;

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

/** Satu baris konten berformat: `marker` "•"/"1." untuk item daftar, "" untuk paragraf. */
type RichLine = { marker: string; text: string };

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;
const VIDEO_EXT_RE = /\.(mp4|mov|avi|webm|mkv|m4v)$/i;

/**
 * Evidence ini gambar? `mimeType` dipakai lebih dulu; kalau kosong/tidak
 * informatif (mis. octet-stream) baru ditebak dari ekstensi nama file.
 */
function isImageEvidence(e: BugPdfEvidence): boolean {
  const mime = (e.mimeType ?? "").toLowerCase().trim();
  if (mime.startsWith("image/")) return true;
  if (mime.startsWith("video/")) return false;
  if (mime) return false;
  return IMAGE_EXT_RE.test(e.fileName);
}

/** Video (atau bukan) — hanya untuk memilih label baris link yang tepat. */
function isVideoEvidence(e: BugPdfEvidence): boolean {
  const mime = (e.mimeType ?? "").toLowerCase().trim();
  if (mime.startsWith("video/")) return true;
  if (mime) return false;
  return VIDEO_EXT_RE.test(e.fileName);
}

/**
 * Tulis teks hyperlink: biru + garis bawah. jsPDF tidak punya underline native,
 * jadi garisnya digambar manual selebar teks. Font harus sudah di-set pemanggil
 * (dipakai juga untuk mengukur lebar teks).
 */
function linkText(doc: Doc, text: string, x: number, y: number, url: string): number {
  doc.setTextColor(LINK);
  doc.textWithLink(text, x, y, { url });
  const w = doc.getTextWidth(text);
  doc.setDrawColor(LINK);
  doc.setLineWidth(0.2);
  doc.line(x, y + 0.7, x + w, y + 0.7);
  return w;
}

type LoadedImage = { dataUrl: string; w: number; h: number; format: "PNG" | "JPEG"; bytes: number };

/**
 * Kompresi gambar saat di-embed. WAJIB diisi: tanpa ini jsPDF menyimpan PNG
 * hasil decode sebagai piksel mentah (terukur: PNG 1,3 MB → PDF 7,6 MB, yang
 * akan ditolak batas body serverless). Dengan "SLOW" gambar yang sama jadi
 * ±1,0 MB — bahkan lebih kecil dari file PNG aslinya.
 */
const IMAGE_COMPRESSION = "SLOW" as const;

/**
 * Batas ukuran satu gambar yang mau di-embed (byte). Respons route ini adalah
 * PDF-nya sendiri, dan platform serverless (Vercel) membatasi body respons
 * ±4,5 MB — jadi total gambar yang di-embed juga dibatasi (lihat di bawah).
 */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
/**
 * Anggaran total byte gambar yang di-embed di satu dokumen. Terukur: dengan
 * kompresi "SLOW" PDF jadi ±0,5–0,8× byte sumbernya, jadi 4 MB sumber ≈ 2–3 MB
 * PDF — masih di bawah batas body serverless (Vercel ±4,5 MB). Gambar di luar
 * anggaran tetap muncul sebagai baris tautan (dengan keterangan yang jujur).
 */
const MAX_TOTAL_IMAGE_BYTES = 4 * 1024 * 1024;
/** Batas waktu ambil gambar dari R2 (ms). */
const IMAGE_TIMEOUT_MS = 15_000;

/** Dimensi PNG dibaca dari header IHDR (byte 16..24). */
function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24) return null;
  // Magic number PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return w > 0 && h > 0 ? { w, h } : null;
}

/**
 * Dimensi JPEG dibaca dengan memindai marker sampai ketemu SOF (Start Of Frame).
 * Marker tanpa payload (SOI/RSTn/TEM) dilewati, marker lain dilewati sepanjang
 * panjang segmennya.
 */
function jpegSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    // SOF0..SOF15, kecuali DHT (C4), JPG (C8), DAC (CC) yang bukan frame header.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = buf.readUInt16BE(i + 5);
      const w = buf.readUInt16BE(i + 7);
      return w > 0 && h > 0 ? { w, h } : null;
    }
    i += 2 + len;
  }
  return null;
}

/**
 * Hasil pengambilan gambar: sukses, dilewati karena ukuran (bukan error), atau
 * gagal (network/decode/format tidak didukung). Dibedakan supaya baris
 * fallback-nya bisa menjelaskan sebabnya dengan jujur.
 */
type ImageLoadResult =
  | { ok: true; img: LoadedImage }
  | { ok: false; reason: "too_large" | "failed" };

/**
 * Ambil gambar evidence DI SERVER untuk digambar ke PDF.
 *
 * `fetch()` di sini server-to-server sehingga tidak ada CORS/preflight browser
 * yang bisa menggagalkannya. Byte dikirim sebagai data URL Base64 dan digambar
 * apa adanya (Node tidak punya canvas untuk mengecilkan/mengubah format), jadi
 * hanya format yang memang didukung jsPDF & bisa dibaca ukurannya (PNG/JPEG)
 * yang dipreview; selain itu mengembalikan hasil gagal → pemanggil memakai baris
 * tautan.
 *
 * `budget` = sisa anggaran byte dokumen; gambar yang melebihi anggaran dilewati.
 */
async function loadEvidenceImage(url: string, budget: number): Promise<ImageLoadResult> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, reason: "failed" };
    const declared = Number(res.headers.get("content-length") ?? "0");
    const limit = Math.min(MAX_IMAGE_BYTES, budget);
    if (declared > limit) return { ok: false, reason: "too_large" };

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > limit) return { ok: false, reason: "too_large" };

    const size = pngSize(buffer);
    if (size) {
      return {
        ok: true,
        img: {
          dataUrl: `data:image/png;base64,${buffer.toString("base64")}`,
          w: size.w,
          h: size.h,
          format: "PNG",
          bytes: buffer.byteLength,
        },
      };
    }
    const jpeg = jpegSize(buffer);
    if (jpeg) {
      return {
        ok: true,
        img: {
          dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`,
          w: jpeg.w,
          h: jpeg.h,
          format: "JPEG",
          bytes: buffer.byteLength,
        },
      };
    }
    // Format lain (WebP/GIF/BMP/AVIF) tidak bisa digambar tanpa lib gambar.
    return { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * Pecah teks multi-baris jadi baris terstruktur: baris yang dimulai dengan
 * `•` / `-` / `*` dianggap bullet, `1.` / `1)` dianggap item bernomor, sisanya
 * paragraf biasa. Baris kosong dibuang (tidak menghasilkan spasi menggantung).
 */
function parseRichLines(raw: string | null | undefined): RichLine[] {
  const out: RichLine[] = [];
  for (const line of (raw ?? "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const bullet = t.match(/^[•\-*]\s+(.*)$/);
    if (bullet) {
      out.push({ marker: "•", text: bullet[1].trim() });
      continue;
    }
    const numbered = t.match(/^(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      out.push({ marker: `${numbered[1]}.`, text: numbered[2].trim() });
      continue;
    }
    out.push({ marker: "", text: t });
  }
  return out;
}

/**
 * Section berlabel yang isinya daftar poin (bullet/nomor) dengan indentasi
 * gantung — dipakai Expected Result & Actual Result supaya newline/`•` pada
 * teks tidak diratakan jadi satu paragraf. Mengembalikan posisi y berikutnya.
 */
function labeledListSection(
  doc: Doc,
  label: string,
  raw: string | null | undefined,
  y: number,
  maxLines: number
): number {
  setLabelStyle(doc);
  doc.text(label, M, y);

  const lineY = y + GAP.labelToLine;
  doc.setDrawColor(INK.line);
  doc.setLineWidth(0.2);
  doc.line(M, lineY, PAGE_W - M, lineY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(INK.text);

  const items = parseRichLines(raw);
  if (items.length === 0) items.push({ marker: "", text: "—" });

  let cy = lineY + GAP.belowLine;
  let used = 0;
  for (const it of items) {
    if (used >= maxLines) break;
    const width = it.marker ? TEXT_W - LIST_INDENT : TEXT_W;
    const lines = wrapLines(doc, it.text, width).slice(0, maxLines - used);
    if (lines.length === 0) continue;
    if (it.marker) {
      doc.text(it.marker, M, cy);
      doc.text(lines, M + LIST_INDENT, cy);
    } else {
      doc.text(lines, M, cy);
    }
    cy += lines.length * GAP.lineHeight;
    used += lines.length;
  }

  return cy + GAP.section;
}

/** Nama file unduhan standar: BUG-REPORT_<kode bug>_<judul rapi>_<YYYYMMDD>.pdf */
export function bugPdfFileName(data: BugPdfData): string {
  return `BUG-REPORT_${data.bugCode}_${sanitizeFilename(data.title)}_${getFormattedDate()}.pdf`;
}

/**
 * Render dokumen jadi byte PDF (tanpa menyentuh DOM — aman dipanggil di server).
 * Pemanggil (route `/api/reports/bug-pdf`) yang mengirimnya sebagai respons.
 */
export async function renderBugPdf(data: BugPdfData): Promise<ArrayBuffer> {
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
  // Sel opsional boleh membawa `href` (mis. Link Eksternal) supaya nilainya
  // dirender sebagai hyperlink yang bisa diklik.
  type MetaCell = [label: string, value: string, href?: string | null];
  const externalUrl = (data.externalLink ?? "").trim();
  const metaRows: MetaCell[][] = [
    [
      // Temuan ad-hoc (tanpa Test Run) → label "Ad-hoc", bukan strip; nilainya
      // tetap memakai gaya value metadata standar (bold, slate gelap).
      ["Test Run", flat(data.runName) || "Ad-hoc"],
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
    // Link Eksternal menempati kolom kiri (di bawah Status).
    [["Link Eksternal", externalUrl || "—", externalUrl || null]],
  ];
  const colW = (CONTENT_W - GUTTER) / 2;
  const rowH = 10;
  metaRows.forEach((row, r) => {
    row.forEach(([label, value, href], c) => {
      const x = M + c * (colW + GUTTER);
      const rowY = y + r * rowH;
      // Label Title Case (bukan uppercase), slate-500 semibold.
      setLabelStyle(doc);
      doc.text(label, x, rowY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      const allLines = wrapLines(doc, value, colW - 2);
      // Nilai link dipotong satu baris (truncate) + "…" bila masih panjang.
      const oneLine = href && allLines.length > 1 ? `${allLines[0]}…` : allLines[0];
      if (href) {
        // Hyperlink aktif — dibuka di tab/viewer baru (biru + garis bawah).
        linkText(doc, oneLine ?? "—", x, rowY + 4.2, href);
      } else {
        doc.setTextColor(INK.text);
        doc.text(oneLine ?? "—", x, rowY + 4.2);
      }
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

  // Precondition pakai renderer daftar (bukan paragraf `flat()`) supaya baris baru
  // dan bullet tetap terbaca — padanan `whitespace-pre-line` di PDF.
  y = labeledListSection(doc, "Precondition", data.precondition ?? "", y, Math.min(5, maxLinesFor()));

  /**
   * Ruang yang disisakan untuk Evidence dihitung dari isinya: label+garis
   * Evidence, satu kartu gambar (sisa gambar melanjut ke halaman berikutnya),
   * dan satu baris per video/non-gambar. Dibatasi supaya Actual Result tidak
   * tergilas habis.
   */
  const evidImages = data.evidence.filter((e) => e.url && isImageEvidence(e)).length;
  const evidLinks = data.evidence.filter((e) => e.url && !isImageEvidence(e)).length;
  const EVIDENCE_LABEL_H = 10;
  const evidenceReserve = Math.min(
    96,
    EVIDENCE_LABEL_H +
      (evidImages > 0 ? CARD_MAX_H + CARD_PAD * 2 + CARD_GAP : 0) +
      evidLinks * LINK_ROW_H
  );

  y = labeledListSection(doc, "Expected Result", data.expectedResult ?? "", y, Math.min(8, maxLinesFor()));
  y = labeledListSection(
    doc,
    "Actual Result",
    data.actualResult ?? "",
    y,
    maxLinesFor(evidenceReserve)
  );

  // ---------- Evidence: kartu gambar (embed) + hyperlink video/non-gambar ----------
  setLabelStyle(doc);
  doc.text("Evidence", M, y);
  const evidenceLineY = y + GAP.labelToLine;
  doc.setDrawColor(INK.line);
  doc.setLineWidth(0.2);
  doc.line(M, evidenceLineY, PAGE_W - M, evidenceLineY);
  y = evidenceLineY + GAP.belowLine;

  if (data.evidence.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(INK.muted);
    doc.text("Tidak ada file evidence.", M, y);
  } else {
    // Evidence tanpa URL (presign gagal) tetap didaftarkan supaya tidak hilang.
    const withUrl = data.evidence.filter((e) => e.url);
    const imageEvidence = withUrl.filter(isImageEvidence);

    // Byte gambar diambil SERVER-TO-SERVER (bebas CORS) satu per satu dengan
    // anggaran total, supaya PDF yang dikirim tetap di bawah batas respons.
    const loaded = new Map<BugPdfEvidence, ImageLoadResult>();
    let budget = MAX_TOTAL_IMAGE_BYTES;
    for (const e of imageEvidence) {
      const result = await loadEvidenceImage(e.url as string, budget);
      if (result.ok) budget -= result.img.bytes;
      loaded.set(e, result);
    }

    /**
     * SEMUA evidence dirender berurutan sesuai urutan aslinya:
     * - gambar yang berhasil diambil → kartu gambar (lebar container, rasio
     *   dijaga, tinggi dibatasi), bisa diklik ke file aslinya;
     * - gambar yang gagal diambil → baris peringatan + tautan aktif;
     * - video / file non-gambar → baris tautan (tidak pernah jadi frame video).
     * Kalau halaman sudah penuh, isinya LANJUT ke halaman berikutnya, jadi
     * gambar ke-2 dan seterusnya tetap tampil visual — bukan berubah jadi tautan.
     */
    let cy = y;

    /** Pindah halaman bila sisa ruang tidak cukup; halaman lanjutan diberi label. */
    const ensureSpace = (needed: number) => {
      if (cy + needed <= FOOTER_Y - 6) return;
      doc.addPage();
      cy = M + 3;
      setLabelStyle(doc);
      doc.text("Evidence (lanjutan)", M, cy);
      const ly = cy + GAP.labelToLine;
      doc.setDrawColor(INK.line);
      doc.setLineWidth(0.2);
      doc.line(M, ly, PAGE_W - M, ly);
      cy = ly + GAP.belowLine;
    };

    /** Baris tautan bernomor: label tebal + URL biru bergaris bawah (bisa diklik). */
    let linkIndex = 0;
    const drawLinkRow = (
      label: string,
      text: string,
      url: string | null,
      error = false
    ) => {
      ensureSpace(LINK_ROW_H);
      linkIndex += 1;
      const prefix = `${linkIndex}. `;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(INK.text);
      doc.text(prefix, M, cy);
      let lx = M + doc.getTextWidth(prefix);
      doc.setFont("helvetica", "bold");
      // Pesan kegagalan diberi warna peringatan, label lain tetap netral.
      doc.setTextColor(error ? "#B45309" : INK.text);
      doc.text(label, lx, cy);
      lx += doc.getTextWidth(label) + 1.5;
      doc.setFont("helvetica", "normal");
      if (!url) {
        // Tanpa URL: tidak ada yang bisa diklik, cukup nama filenya.
        doc.setTextColor(INK.muted);
        doc.text(wrapLines(doc, text, PAGE_W - M - lx)[0] ?? text, lx, cy);
      } else {
        // URL presigned panjang (±400 karakter) dipotong satu baris + "…" mengikuti
        // konvensi Link Eksternal; kliknya tetap membuka URL utuh.
        const one = wrapLines(doc, text, PAGE_W - M - lx)[0] ?? text;
        const shown = doc.getTextWidth(text) > PAGE_W - M - lx ? `${one}…` : one;
        linkText(doc, shown, lx, cy, url);
      }
      cy += LINK_ROW_H;
    };

    for (const e of data.evidence) {
      if (!e.url) {
        drawLinkRow("Evidence tanpa tautan:", e.fileName, null);
        continue;
      }
      const result = loaded.get(e);
      if (!result || !result.ok) {
        // Bukan gambar (video/dll), atau gambar yang tidak bisa dipreview.
        if (isImageEvidence(e)) {
          drawLinkRow(
            result?.reason === "too_large"
              ? "Preview dilewati (gambar melebihi batas dokumen), buka link:"
              : "Gagal memuat preview gambar, buka link:",
            e.url,
            e.url,
            true
          );
        } else {
          drawLinkRow(
            isVideoEvidence(e) ? "Link Evidence Video:" : "Link Evidence:",
            e.url,
            e.url
          );
        }
        continue;
      }
      const img = result.img;

      // Kartu gambar: fit container sambil menjaga rasio, lalu ditengahkan.
      const scale = Math.min(TEXT_W / img.w, CARD_MAX_H / img.h);
      const w = img.w * scale;
      const h = img.h * scale;
      const boxH = h + CARD_PAD * 2;
      ensureSpace(boxH + CARD_GAP);
      doc.setDrawColor(INK.line);
      doc.setLineWidth(0.2);
      doc.rect(M, cy, TEXT_W, boxH);
      doc.addImage(
        img.dataUrl,
        img.format,
        M + (TEXT_W - w) / 2,
        cy + CARD_PAD,
        w,
        h,
        undefined,
        IMAGE_COMPRESSION
      );
      // Seluruh kartu bisa diklik menuju file aslinya.
      doc.link(M, cy, TEXT_W, boxH, { url: e.url });
      cy += boxH + CARD_GAP;
    }
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

  return doc.output("arraybuffer") as ArrayBuffer;
}
