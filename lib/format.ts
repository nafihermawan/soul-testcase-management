/**
 * Helper format/tampilan ringkas.
 */

/* ---------- Prefix platform untuk ID (suite code & TC ID) ---------- */

/**
 * Kode platform yang dipakai sebagai prefix ID suite & test case.
 * Diubah di satu tempat ini saja kalau mapping-nya berubah.
 */
export const PLATFORM_PREFIXES = {
  WEB: "web",
  MOBILE: "mob",
  HARDWARE: "hdw",
  API: "api",
} as const;

/** Prefix fallback saat Project.platform belum diisi. */
export const DEFAULT_PLATFORM_PREFIX = "gen";

/** Prefix platform (lowercase) dari nilai enum Project.platform. */
export function platformPrefix(platform: string | null | undefined): string {
  if (!platform) return DEFAULT_PLATFORM_PREFIX;
  const key = platform.toUpperCase() as keyof typeof PLATFORM_PREFIXES;
  return PLATFORM_PREFIXES[key] ?? platform.toLowerCase();
}

/** Kode deterministik & human-readable dari id CUID: `PREFIX-YYYY-XXXX` (huruf kecil).
 *  (mis. bug-2026-001) */
export function entityCode(prefix: string, id: string): string {
  const year = new Date().getFullYear();
  const hash = id.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toLowerCase() || "0000";
  return `${prefix.toLowerCase()}-${year}-${hash}`;
}

/* ---------- Run code: sprint-tanggal-kode unik ---------- */

export type RunCodeInput = {
  id: string;
  sprint?: string | null;
  createdAt: string | Date;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Kode run deterministik: `sp{02}-YYYYMMDD-{4}` — sprint (angka dari label,
 * contoh "Sprint 3" -> sp03), tanggal pembuatan, dan 4 karakter campur huruf/angka
 * turunan id (mis. sp03-20260901-k87h).
 */
export function runCodeOf({ id, sprint, createdAt }: RunCodeInput): string {
  const sprintMatch = sprint?.match(/(\d+)/);
  const sprintSeg = sprintMatch
    ? `sp${pad2(Number(sprintMatch[1]))}`
    : "spna";
  const d = new Date(createdAt ?? Date.now());
  const dateSeg =
    String(d.getUTCFullYear()) +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate());
  const hash =
    id.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toLowerCase() || "zz0z";
  return `${sprintSeg}-${dateSeg}-${hash}`;
}

/**
 * Ringkas nama fitur/suite jadi prefix TC ID.
 * Aturan: huruf pertama tiap kata dipertahankan; dari sisa huruf, vokal
 * a/e/i/o dibuang (u dipertahankan) dan huruf yang sudah muncul di-skip.
 * Antar kata disambung tanpa spasi.
 * Contoh: "Attendance" -> "Atndc", "Bug" -> "Bug", "Login Failed" -> "LgnFld".
 */
export function featurePrefixFromName(name: string): string {
  const words = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "TC";
  const make = (w: string): string => {
    let out = w.charAt(0);
    const seen = new Set<string>(out);
    for (let i = 1; i < w.length; i++) {
      const ch = w[i];
      if (["a", "e", "i", "o"].includes(ch)) continue;
      if (seen.has(ch)) continue;
      seen.add(ch);
      out += ch;
    }
    return out.charAt(0).toUpperCase() + out.slice(1);
  };
  return words.map(make).join("");
}

/* ---------- Rentang bulan untuk filter (format "YYYY-MM") ---------- */

const MONTH_SHORT_ID = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

/** Validasi & normalisasi "YYYY-MM". Mengembalikan null bila tidak valid. */
export function parseMonthKey(value: string | null | undefined): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec((value ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 1970 || year > 9999) return null;
  return { year, month };
}

/** Label singkat sebuah bulan, mis. "Sep 2026". */
export function monthLabel(key: string): string {
  const p = parseMonthKey(key);
  if (!p) return key;
  return `${MONTH_SHORT_ID[p.month - 1]} ${p.year}`;
}

/**
 * Ubah rentang bulan jadi rentang tanggal [gte, lt) untuk filter createdAt.
 * - from & to sama / hanya from → satu bulan penuh.
 * - from & to berbeda → dari awal bulan `from` sampai akhir bulan `to`.
 * `from`/`to` yang tidak valid diabaikan.
 */
export function monthRangeToDateRange(
  from?: string | null,
  to?: string | null
): { gte: Date; lt: Date } | null {
  const f = parseMonthKey(from);
  const t = parseMonthKey(to) ?? f;
  if (!f || !t) return null;
  // Tukar bila urutan terbalik agar rentang selalu valid.
  const [start, end] =
    f.year * 12 + f.month <= t.year * 12 + t.month ? [f, t] : [t, f];
  return {
    gte: new Date(Date.UTC(start.year, start.month - 1, 1)),
    // Awal bulan setelah `end` (eksklusif).
    lt: new Date(Date.UTC(end.year, end.month, 1)),
  };
}

/** Geser "YYYY-MM" sebanyak delta bulan. */
export function shiftMonthKey(key: string, delta: number): string {
  const p = parseMonthKey(key);
  if (!p) return key;
  const total = p.year * 12 + (p.month - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/* ---------- Parsing referensi dokumentasi (multi-baris) ---------- */

export type DocRefLine = {
  /** Teks/awalan baris referensi, mis. "PRD", "TRD", atau label markdown. */
  label: string;
  /** URL bila baris memuat tautan; null bila baris teks biasa. */
  url: string | null;
};

function firstUrlOfLine(line: string): string | null {
  const md = line.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
  if (md) return md[2];
  const plain = line.match(/https?:\/\/[^\s]+/);
  return plain ? plain[0] : null;
}

/** Ambil URL pertama dari teks dokumentasi (untuk fallback tautan tunggal). */
export function firstUrlOf(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const line of text.split("\n")) {
    const url = firstUrlOfLine(line);
    if (url) return url;
  }
  return null;
}

/**
 * Pecah teks dokumentasi per baris jadi daftar referensi.
 * Mendukung:
 *  - markdown link `[label](https://…)` / `- [label](https://…)`
 *  - `Nama: https://…` / `- Nama: https://…`
 *  - URL polos `https://…`
 * Baris lain dikembalikan sebagai teks biasa.
 */
export function parseReferenceLines(text: string | null | undefined): DocRefLine[] {
  if (!text) return [];
  const lines: DocRefLine[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    // Buang bullet "- " / "* " di awal bila ada.
    const content = line.replace(/^[-*]\s+/, "");
    const url = firstUrlOfLine(content);
    if (url) {
      const mdLabel = content.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      const named = content.match(/^(.+?):\s*(https?:\/\/.*)$/);
      let label = content.replace(/\(https?:\/\/[^\s)]+\)/g, "").trim();
      if (mdLabel) label = mdLabel[1];
      else if (named) label = named[1].trim();
      else if (label === url) label = url;
      lines.push({ label: label || url, url });
    } else {
      lines.push({ label: content, url: null });
    }
  }
  return lines;
}
