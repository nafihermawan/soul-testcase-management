/**
 * Parser laporan JSON Playwright → daftar entri hasil yang bisa dicocokkan ke
 * Test Case (lewat External Test ID atau tcId).
 *
 * Murni & tanpa I/O supaya bisa dipakai di client (pratinjau sebelum kirim).
 *
 * Bentuk laporan Playwright JSON:
 *   { suites: [ { file, specs: [ { title, ok, tests: [{ results: [{ status }] }] } ],
 *                 suites: [ ...bersarang... ] } ], stats: {...} }
 *
 * ID diambil dari judul spec di dalam kurung siku, mis. "[LG-001] should login…".
 */

export type ReportEntryStatus = "PASS" | "FAIL" | "SKIPPED";

export type ReportEntry = {
  externalTestId: string;
  status: ReportEntryStatus;
  scriptPath: string | null;
  title: string;
};

export type ParsedReport = {
  entries: ReportEntry[];
  /** Jumlah spec yang tidak punya ID ber-kurung siku (dilewati). */
  withoutId: number;
  /** Judul spec tanpa ID (untuk ditampilkan sebagai daftar "dilewati"). */
  withoutIdTitles: string[];
  errors: string[];
};

/** Batas aman jumlah entri yang diproses sekali kirim. */
export const MAX_REPORT_ENTRIES = 1000;

/** Ambil ID dari judul, mis. "[LG-001] should login" → "LG-001". */
const ID_PATTERN = /\[([A-Za-z0-9][A-Za-z0-9_-]*)\]/;

type AnyRec = Record<string, unknown>;

const asRec = (v: unknown): AnyRec | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as AnyRec) : null;

const asStr = (v: unknown): string | null => (typeof v === "string" ? v : null);

function specStatus(spec: AnyRec): ReportEntryStatus {
  const tests = Array.isArray(spec.tests) ? spec.tests : [];
  const results: AnyRec[] = [];
  for (const t of tests) {
    const tr = asRec(t);
    if (!tr || !Array.isArray(tr.results)) continue;
    for (const r of tr.results) {
      const rr = asRec(r);
      if (rr) results.push(rr);
    }
  }

  // Semua percobaan di-skip → SKIPPED (tidak mengubah status automation).
  if (results.length > 0 && results.every((r) => r.status === "skipped")) {
    return "SKIPPED";
  }
  if (spec.ok === true) return "PASS";
  if (spec.ok === false) return "FAIL";
  // Tanpa flag `ok`: anggap PASS kalau ada hasil yang passed.
  return results.some((r) => r.status === "passed") ? "PASS" : "FAIL";
}

export function parsePlaywrightReport(input: unknown): ParsedReport {
  const errors: string[] = [];
  const root = asRec(input);
  if (!root) {
    return {
      entries: [],
      withoutId: 0,
      withoutIdTitles: [],
      errors: ["File bukan JSON yang valid."],
    };
  }
  if (!Array.isArray(root.suites)) {
    return {
      entries: [],
      withoutId: 0,
      withoutIdTitles: [],
      errors: [
        "Format tidak dikenali. Pastikan file berasal dari `npx playwright test --reporter=json`.",
      ],
    };
  }

  const byId = new Map<string, ReportEntry>();
  const withoutIdTitles: string[] = [];
  let withoutId = 0;

  const walk = (suites: unknown[], inheritedFile: string | null) => {
    for (const s of suites) {
      const suite = asRec(s);
      if (!suite) continue;
      const file = asStr(suite.file) ?? inheritedFile;

      if (Array.isArray(suite.specs)) {
        for (const sp of suite.specs) {
          const spec = asRec(sp);
          if (!spec) continue;
          const title = asStr(spec.title) ?? "";
          const m = title.match(ID_PATTERN);
          if (!m) {
            withoutId += 1;
            withoutIdTitles.push(title || "(tanpa judul)");
            continue;
          }
          const externalTestId = m[1];
          byId.set(externalTestId, {
            externalTestId,
            status: specStatus(spec),
            scriptPath: asStr(spec.file) ?? file ?? null,
            title,
          });
          if (byId.size >= MAX_REPORT_ENTRIES) return;
        }
      }

      if (Array.isArray(suite.suites)) walk(suite.suites, file);
      if (byId.size >= MAX_REPORT_ENTRIES) return;
    }
  };

  walk(root.suites, null);

  if (byId.size === 0 && withoutId === 0) {
    errors.push("Tidak ada test yang terbaca dari laporan ini.");
  }

  return { entries: Array.from(byId.values()), withoutId, withoutIdTitles, errors };
}
