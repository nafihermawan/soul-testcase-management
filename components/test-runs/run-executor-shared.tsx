"use client";

import { CheckCircle2, CircleSlash, MinusCircle, XCircle } from "lucide-react";
import type { AttachmentItem, BugStatus } from "@/types/api";

export type RunResultItem = {
  id: string;
  status: "PASS" | "FAIL" | "BLOCKED" | "SKIPPED" | "NOT_RUN";
  titleSnapshot: string;
  actualResult: string | null;
  notes: string | null;
  /** Alasan yang dipilih saat status SKIPPED (null untuk status lain). */
  skipReason?: string | null;
  /** Keterangan bebas saat alasannya "Lainnya" (null untuk alasan lain). */
  skipReasonNote?: string | null;
  testCaseId: string;
  /** Evidence yang di-upload pada hasil eksekusi ini. */
  attachments?: AttachmentItem[];
  bugs?: {
    id: string;
    title: string;
    severity: string | null;
    status: string;
    externalLink: string | null;
  }[];
  testCase?: {
    id: string;
    tcId: string;
    title: string;
    priority: string;
    status: string;
    scenario: string | null;
    precondition: string | null;
    testData: string | null;
    steps: string | null;
    expectedResult: string | null;
    createdAt: string | Date;
    /** Section TC — dipakai untuk header kelompok di halaman eksekusi. */
    section?: { id: string; name: string } | null;
    /** Suite + project pemiliknya — dipakai untuk kartu per-Suite. */
    suite?: {
      id: string;
      name: string;
      projectId: string;
      project: { name: string; platform: string | null };
    } | null;
    createdBy: { name: string | null } | null;
  } | null;
};

/**
 * Gaya badge status pasif pada baris TC. Status tidak lagi bisa diubah dari
 * baris — QA harus membuka modal detail eksekusi.
 */
export const STATUS_BADGE: Record<
  RunResultItem["status"],
  { label: string; bg: string; color: string; weight: number }
> = {
  // Pill kontras: latar -100, teks -700. Untested pakai weight medium (kalem).
  NOT_RUN: { label: "Untested", bg: "#F1F5F9", color: "#475569", weight: 500 },
  PASS: { label: "Passed", bg: "#D1FAE5", color: "#047857", weight: 600 },
  FAIL: { label: "Failed", bg: "#FFE4E6", color: "#BE123C", weight: 600 },
  BLOCKED: { label: "Blocked", bg: "#FEF3C7", color: "#B45309", weight: 600 },
  // Skipped sengaja UNGU (bukan amber) agar tidak ketuker dengan Blocked.
  SKIPPED: { label: "Skipped", bg: "#F3E8FF", color: "#7E22CE", weight: 600 },
};

/** Gaya pill status hasil eksekusi — kapsul ringkas, konsisten di semua tempat. */
export const statusPillStyle = (
  badge: (typeof STATUS_BADGE)[RunResultItem["status"]]
): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  flexShrink: 0,
  padding: "0.125rem 0.625rem",
  borderRadius: 999,
  background: badge.bg,
  color: badge.color,
  fontSize: 11,
  // line-height eksplisit supaya tinggi pill seimbang di semua konteks
  // (badge menempel pojok kanan kartu, bukan melebar mengikuti baris).
  lineHeight: 1.35,
  fontWeight: badge.weight,
  whiteSpace: "nowrap",
});

/** Warna status pada BARIS test case: dot + teks (tanpa pill). */
export const ROW_STATUS: Record<RunResultItem["status"], { label: string; dot: string; text: string }> = {
  PASS: { label: "Passed", dot: "#15803D", text: "#15803D" },
  FAIL: { label: "Failed", dot: "#DC2626", text: "#B91C1C" },
  BLOCKED: { label: "Blocked", dot: "#D97706", text: "#B45309" },
  SKIPPED: { label: "Skipped", dot: "#7E22CE", text: "#7E22CE" },
  NOT_RUN: { label: "Untested", dot: "#CBD5E1", text: "#64748B" },
};

/** Opsi segmented control hasil eksekusi di panel Eksekusi. */
export const RESULT_OPTIONS: {
  value: "PASS" | "FAIL" | "BLOCKED" | "SKIPPED";
  label: string;
  icon: typeof CheckCircle2;
  color: string;
  tint: string;
}[] = [
  { value: "PASS", label: "Pass", icon: CheckCircle2, color: "#15803D", tint: "#BBE7CB" },
  { value: "FAIL", label: "Fail", icon: XCircle, color: "#B91C1C", tint: "#FBCACA" },
  { value: "BLOCKED", label: "Blocked", icon: CircleSlash, color: "#D97706", tint: "#FDE3B8" },
  { value: "SKIPPED", label: "Skipped", icon: MinusCircle, color: "#64748B", tint: "#DDE3EA" },
];

export const FONT_MONO = '"Geist Mono", ui-monospace, monospace';
export const FONT_SANS = '"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

/** Tombol sekunder (Edit / Export Report). */
export const BTN_SECONDARY: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  height: 40,
  padding: "0 14px",
  border: "1px solid #DDE2E9",
  borderRadius: 10,
  background: "#fff",
  color: "#0F172A",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

/** Tombol primer kuning (Complete Run). */
export const BTN_PRIMARY: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  height: 40,
  padding: "0 16px",
  border: "1px solid #FFC348",
  borderRadius: 10,
  background: "#FFC348",
  color: "#0F172A",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

/** Kotak 8×8 penanda status pada ringkasan header. */
export function Sq({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }}
    />
  );
}

/** Pemisah vertikal 1×14 pada baris ringkasan. */
export function VSep() {
  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-block", width: 1, height: 14, background: "#E2E8F0", flexShrink: 0 }}
    />
  );
}

/** Angka dengan font Geist Mono 600. */
export function MNum({ children, color }: { children: React.ReactNode; color: string }) {
  return <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color }}>{children}</span>;
}

/**
 * Badge status bug untuk section riwayat bug di modal eksekusi — sekaligus
 * trigger dropdown untuk mengubah statusnya langsung. Palet mengikuti status:
 * Open = rose, In Progress = amber, Closed/Resolved = emerald. Istilah "selesai"
 * memakai CLOSED untuk keduanya (RESOLVED & CLOSED) supaya tidak ada dua
 * sebutan berbeda untuk arti yang sama.
 */
export const BUG_STATUS_BADGE: Record<BugStatus, { label: string; bg: string; color: string; border: string }> = {
  OPEN: { label: "Open", bg: "#FFF1F2", color: "#E11D48", border: "#FECDD3" },
  IN_PROGRESS: { label: "In Progress", bg: "#FFFBEB", color: "#D97706", border: "#FDE68A" },
  RESOLVED: { label: "Closed", bg: "#ECFDF5", color: "#059669", border: "#A7F3D0" },
  CLOSED: { label: "Closed", bg: "#ECFDF5", color: "#059669", border: "#A7F3D0" },
};

/** Severity bug pada Bug Reporting Form (nilai disimpan uppercase, sama dgn data Bug). */
export const SEVERITIES = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
] as const;

/**
 * Bandingkan TC ID secara natural — segmen angkanya dibandingkan sebagai angka
 * ("ovrtm-2" < "ovrtm-10"), dan TC tanpa ID ditaruh paling akhir.
 */
export function compareTcId(a: string, b: string): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Kelompokkan hasil eksekusi per Section TC.
 * Urutan di DALAM tiap section selalu ascending berdasarkan TC ID (bukan urutan
 * kemunculan dari API) supaya daftar mudah dipindai QA. TC tanpa Section
 * dikumpulkan di grup "Tanpa Section" supaya tidak ada yang hilang.
 */
export function groupItemsBySection(items: RunResultItem[]) {
  const groups = new Map<string, { key: string; name: string; items: RunResultItem[] }>();
  for (const it of items) {
    const sec = it.testCase?.section ?? null;
    const key = sec?.id ?? "__none__";
    let g = groups.get(key);
    if (!g) {
      g = { key, name: sec?.name ?? "Tanpa Section", items: [] };
      groups.set(key, g);
    }
    g.items.push(it);
  }
  // forEach (bukan for..of) karena target TS di project ini belum mendukung
  // iterasi MapIterator langsung.
  Array.from(groups.values()).forEach((g) => {
    g.items.sort((a, b) => compareTcId(a.testCase?.tcId ?? "", b.testCase?.tcId ?? ""));
  });
  return Array.from(groups.values());
}

