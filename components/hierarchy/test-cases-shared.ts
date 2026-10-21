"use client";

import type React from "react";

export type TestCase = {
  id: string;
  tcId: string;
  title: string;
  scenario: string | null;
  precondition: string | null;
  steps: string | null;
  testData: string | null;
  expectedResult: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "DRAFT" | "ACTIVE" | "DEPRECATED";
  /** Jenis skenario: POSITIVE / NEGATIVE; null = belum dipilih. */
  type: "POSITIVE" | "NEGATIVE" | null;
  sectionId: string | null;
  createdAt?: string | Date;
  createdBy?: { name: string | null } | null;
};

/** Section (dari DB) dengan state accordion lokal. */
export type Section = {
  id: string;
  name: string;
  description?: string | null;
  open: boolean;
};

export const priorityTone = (p: TestCase["priority"]) =>
  p === "CRITICAL" ? "danger" : p === "HIGH" ? "warning" : p === "MEDIUM" ? "info" : "neutral";
export const statusTone = (s: TestCase["status"]) =>
  s === "ACTIVE" ? "success" : s === "DEPRECATED" ? "neutral" : "warning";
/** Tone teks Type (tanpa pill): Positive hijau, Negative rose, belum dipilih netral. */
export const typeTone = (t: TestCase["type"]) =>
  t === "NEGATIVE" ? "rose" : t === "POSITIVE" ? "emerald" : "neutral";

/** Warna teks per tone — dipakai dropdown teks polos (tanpa pill). */
export const TONE_TEXT: Record<string, string> = {
  danger: "var(--danger)",
  warning: "#B45309",
  info: "var(--info)",
  success: "var(--success)",
  neutral: "var(--text-secondary)",
  emerald: "#059669",
  rose: "#E11D48",
};

/**
 * Dropdown inline TANPA pill: teks polos berwarna + chevron tipis bawaan
 * komponen Select. Background, border, dan padding pill dihapus supaya baris
 * tabel tetap bersih; selnya masih bisa diklik untuk ubah nilai inline.
 */
export const plainSelectStyle = (tone: string): React.CSSProperties => ({
  background: "transparent",
  border: "none",
  borderRadius: 0,
  padding: 0,
  // Badge teks (Priority/Status): kecil, tebal, sedikit renggang.
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.025em",
  color: TONE_TEXT[tone] ?? "var(--text-secondary)",
});

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  fontSize: "0.875rem",
  color: "var(--text)",
  background: "#fff",
};

export const btnYellow: React.CSSProperties = {
  padding: "0.5rem 1.25rem",
  borderRadius: 8,
  border: "none",
  background: "#FFB622",
  color: "#1F2937",
  fontWeight: 700,
  fontSize: "0.85rem",
  cursor: "pointer",
};

/** Tombol aksi sekunder di toolbar (Export / Import) — bordered putih. */
/** Item di dalam menu dropdown Export. */
export const exportMenuItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  width: "100%",
  padding: "0.5rem 0.75rem",
  fontSize: "0.84rem",
  fontWeight: 500,
  color: "#334155",
  background: "transparent",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  textAlign: "left",
  whiteSpace: "nowrap",
};

/** Tombol aksi primer kuning (Tambah Section / Tambah Case). */
/** Jumlah baris per pemanggilan impor (server action) — progres tampil per batch. */
export const IMPORT_BATCH_SIZE = 25;

export const TC_EXPORT_HEADER = [
  "section",
  "title",
  "tcid",
  "type",
  "scenario",
  "precondition",
  "steps",
  "testData",
  "expectedResult",
  "priority",
  "status",
] as const;
