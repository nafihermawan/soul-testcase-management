"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRefresh } from "@/lib/client/refresh-context";
import { Bug, CheckCircle2, ChevronDown, ChevronRight, CircleSlash, ExternalLink, FolderOpen, MinusCircle, Paperclip, Pencil, X, XCircle } from "lucide-react";
import { completeRun, completeRunWithSkip, deleteRun, updateRunResult } from "@/lib/actions/test-runs";
import { createBug, unlinkBugFromRunResult } from "@/lib/actions/automation-bugs";
import { ConfirmDialog, Spinner, Toast, useToast } from "@/components/ui/feedback";
import { entityCode, runCodeOf } from "@/lib/format";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { ListTextarea } from "@/components/ui/list-textarea";
import { Select } from "@/components/ui/select";
import { BugDetailModal } from "@/components/bugs/bug-detail-modal";
import { EditRunModal } from "@/components/test-runs/edit-run-modal";
import type { ExpressRunInitial } from "@/components/test-runs/express-run";
import type { AttachmentItem, BugRow, BugStatus, BugsPayload } from "@/types/api";

export type RunResultItem = {
  id: string;
  status: "PASS" | "FAIL" | "BLOCKED" | "SKIPPED" | "NOT_RUN";
  titleSnapshot: string;
  actualResult: string | null;
  notes: string | null;
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
    steps: string | null;
    expectedResult: string | null;
    createdAt: string | Date;
    /** Section TC — dipakai untuk header kelompok di halaman eksekusi. */
    section?: { id: string; name: string } | null;
    suiteName?: string | null;
    createdBy: { name: string | null } | null;
  } | null;
};

const STATUSES = [
  { value: "PASS", label: "Pass", icon: CheckCircle2, color: "#059669", bg: "#ECFDF5", activeBg: "#059669" },
  { value: "FAIL", label: "Fail", icon: XCircle, color: "#E11D48", bg: "#FFF1F2", activeBg: "#E11D48" },
  { value: "BLOCKED", label: "Blocked", icon: CircleSlash, color: "#D97706", bg: "#FFFBEB", activeBg: "#D97706" },
  { value: "SKIPPED", label: "Skipped", icon: MinusCircle, color: "#374151", bg: "#F9FAFB", activeBg: "#374151" },
] as const;

/**
 * Gaya badge status pasif pada baris TC. Status tidak lagi bisa diubah dari
 * baris — QA harus membuka modal detail eksekusi.
 */
const STATUS_BADGE: Record<
  RunResultItem["status"],
  { label: string; bg: string; color: string; border: string; bold?: boolean }
> = {
  NOT_RUN: { label: "Untested", bg: "#F1F5F9", color: "#475569", border: "#E2E8F0" },
  PASS: { label: "Passed", bg: "#ECFDF5", color: "#047857", border: "#A7F3D0", bold: true },
  FAIL: { label: "Failed", bg: "#FFF1F2", color: "#BE123C", border: "#FECDD3", bold: true },
  BLOCKED: { label: "Blocked", bg: "#FFFBEB", color: "#B45309", border: "#FDE68A", bold: true },
  SKIPPED: { label: "Skipped", bg: "#F1F5F9", color: "#334155", border: "#CBD5E1", bold: true },
};

/**
 * Badge status bug untuk section riwayat bug di modal eksekusi.
 * Kontras sengaja tinggi (teks gelap di atas latar soft + border tipis) supaya
 * langsung terbaca; RESOLVED & CLOSED sama-sama hijau sesuai artinya "selesai".
 */
const BUG_STATUS_BADGE: Record<BugStatus, { label: string; bg: string; color: string; border: string }> = {
  OPEN: { label: "Open", bg: "#FEF2F2", color: "#B91C1C", border: "#FECACA" },
  IN_PROGRESS: { label: "In Progress", bg: "#FFFBEB", color: "#B45309", border: "#FDE68A" },
  RESOLVED: { label: "Resolved", bg: "#ECFDF5", color: "#047857", border: "#A7F3D0" },
  CLOSED: { label: "Closed", bg: "#DCFCE7", color: "#166534", border: "#86EFAC" },
};

/** Badge severity bug: amber tegas untuk MEDIUM, makin merah makin berat. */
const BUG_SEVERITY_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  CRITICAL: { bg: "#FEF2F2", color: "#B91C1C", border: "#FECACA" },
  HIGH: { bg: "#FFF7ED", color: "#C2410C", border: "#FED7AA" },
  MEDIUM: { bg: "#FFFBEB", color: "#B45309", border: "#FDE68A" },
  LOW: { bg: "#F1F5F9", color: "#475569", border: "#CBD5E1" },
};

/** Severity bug pada Bug Reporting Form (nilai disimpan uppercase, sama dgn data Bug). */
const SEVERITIES = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
] as const;

/**
 * Bandingkan TC ID secara natural — segmen angkanya dibandingkan sebagai angka
 * ("ovrtm-2" < "ovrtm-10"), dan TC tanpa ID ditaruh paling akhir.
 */
function compareTcId(a: string, b: string): number {
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
function groupItemsBySection(items: RunResultItem[]) {
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

export function RunExecutor({
  runId,
  runName,
  isCompleted,
  canEdit = true,
  results,
  projects = [],
  createdAt,
  completedAt,
  qaName,
  sprint,
  taskLink,
  activityType,
  platforms,
  environment,
  suites = [],
}: {
  runId: string;
  runName: string;
  isCompleted: boolean;
  canEdit?: boolean;
  results: RunResultItem[];
  projects?: {
    projectId: string;
    projectName: string;
    suites: string[];
    items: RunResultItem[];
  }[];
  createdAt?: Date;
  completedAt?: Date | null;
  qaName?: string | null;
  sprint?: string | null;
  taskLink?: string | null;
  activityType?: string | null;
  platforms?: string | null;
  environment?: string | null;
  suites?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const refresh = useRefresh();
  const [items, setItems] = useState(results);
  // Sinkronkan items bila parent me-refetch (data server otoritatif) —
  // menjamin perubahan status langsung tampil tanpa refresh manual.
  useEffect(() => {
    setItems(results);
  }, [results]);

  // Cermin lokal struktur projects (items ber-status) agar update status
  // bisa langsung dirender di kartu tanpa me-refetch seluruh halaman.
  const [groups, setGroups] = useState(projects);
  useEffect(() => {
    setGroups(projects);
  }, [projects]);

  // Nilai awal untuk modal Edit Run, diturunkan dari data run yang sedang tampil.
  const editInitial: ExpressRunInitial = useMemo(
    () => ({
      name: runName,
      activityType: activityType ?? "",
      environment: environment ?? "",
      platforms: (platforms ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      sprint: sprint ?? "",
      taskLink: taskLink ?? "",
      projectIds: Array.from(new Set(groups.map((g) => g.projectId).filter(Boolean))),
      testCaseIds: groups.flatMap((g) => g.items.map((it) => it.testCaseId)),
    }),
    [runName, activityType, environment, platforms, sprint, taskLink, groups]
  );
  // Accordion per project: default semua expanded
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(projects.map((p) => [p.projectId, true]))
  );
  // Accordion per Section TC: default semua expanded. Kuncinya sectionId
  // (unik lintas suite) atau "__none__" untuk kelompok "Tanpa Section".
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) =>
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const [modalItem, setModalItem] = useState<RunResultItem | null>(null);
  // Bug yang sedang dibuka di Bug Detail Modal (dari badge bug di baris TC).
  const [bugDetailId, setBugDetailId] = useState<string | null>(null);
  const [bugItem, setBugItem] = useState<RunResultItem | null>(null);
  const [metaOpen, setMetaOpen] = useState(true);
  // Popover breakdown project & suite
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [breakdownPos, setBreakdownPos] = useState<{ top: number; left: number } | null>(null);
  const breakdownRef = useRef<HTMLButtonElement | null>(null);
  const [bugTitle, setBugTitle] = useState("");
  const [bugDesc, setBugDesc] = useState("");
  const [bugExpectedResult, setBugExpectedResult] = useState("");
  const [bugSeverity, setBugSeverity] = useState("");
  const [bugError, setBugError] = useState<string | null>(null);
  const [bugPending, setBugPending] = useState(false);
  const [unlinkPending, setUnlinkPending] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  // Modal ringkasan + overall notes sebelum Complete (Completion Summary)
  const [completeOpen, setCompleteOpen] = useState(false);
  const [overallNotes, setOverallNotes] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  // Modal report
  const [reportOpen, setReportOpen] = useState(false);
  const { toast, showToast, dismissToast } = useToast();

  /**
   * Patch satu hasil run di SEMUA cermin lokal sekaligus: flat list (`items`),
   * mirror per-project yang benar-benar dirender kartunya (`groups`), dan item
   * yang sedang dibuka di modal. Tanpa ini, perubahan bisa tersimpan ke server
   * tapi tidak terlihat di UI (kartu & statistik memakai `groups`).
   */
  const patchResult = (resultId: string, patch: Partial<RunResultItem>) => {
    setItems((prev) => prev.map((r) => (r.id === resultId ? { ...r, ...patch } : r)));
    setGroups((prev) =>
      prev.map((g) =>
        g.items.some((it) => it.id === resultId)
          ? {
              ...g,
              items: g.items.map((it) => (it.id === resultId ? { ...it, ...patch } : it)),
            }
          : g
      )
    );
    setModalItem((prev) => (prev && prev.id === resultId ? { ...prev, ...patch } : prev));
  };

  /** Terapkan perubahan pada daftar hasil run, di flat list maupun mirror per-project. */
  const mapResults = (fn: (r: RunResultItem) => RunResultItem) => {
    setItems((prev) => prev.map(fn));
    setGroups((prev) => prev.map((g) => ({ ...g, items: g.items.map(fn) })));
    setModalItem((prev) => (prev ? fn(prev) : prev));
  };

  /** Patch satu bug di semua cermin lokal (dipakai Bug Detail Modal). */
  const patchBug = (bugId: string, patch: Partial<NonNullable<RunResultItem["bugs"]>[number]>) => {
    mapResults((r) =>
      r.bugs?.some((b) => b.id === bugId)
        ? { ...r, bugs: r.bugs.map((b) => (b.id === bugId ? { ...b, ...patch } : b)) }
        : r
    );
  };

  /** Buang satu bug dari semua cermin lokal setelah dihapus. */
  const removeBug = (bugId: string) => {
    mapResults((r) =>
      r.bugs?.some((b) => b.id === bugId) ? { ...r, bugs: r.bugs.filter((b) => b.id !== bugId) } : r
    );
  };

  /**
   * Bug yang di-RESOLVED/CLOSED otomatis membuat TestRunResult FAIL-nya jadi
   * PASS di server; cermin lokal disamakan supaya kartu tidak menampilkan data
   * basi sampai halaman di-reload.
   */
  const handleBugStatusChange = (bugId: string, status: BugStatus) => {
    patchBug(bugId, { status });
    if (status !== "RESOLVED" && status !== "CLOSED") return;
    const owner = items.find((r) => r.bugs?.some((b) => b.id === bugId));
    if (owner && owner.status === "FAIL") patchResult(owner.id, { status: "PASS" });
  };

  const saveBug = async () => {
    if (!bugItem) return;
    if (!bugTitle.trim()) {
      setBugError("Judul bug wajib diisi.");
      return;
    }
    setBugError(null);
    setBugPending(true);
    const res = await createBug({
      title: bugTitle,
      description: bugDesc,
      expectedResult: bugExpectedResult,
      severity: bugSeverity || undefined,
      testCaseId: bugItem.testCaseId,
      testRunResultId: bugItem.id,
    });
    setBugPending(false);
    if (res.error) {
      setBugError(res.error);
      return;
    }
    setBugItem(null);
    setBugTitle("");
    setBugDesc("");
    setBugExpectedResult("");
    setBugSeverity("");
    showToast("Bug berhasil dibuat.", "success");
    refresh();
  };

  const unlinkBug = async (bugId: string, runResultId: string) => {
    setUnlinkPending(bugId);
    const res = await unlinkBugFromRunResult(bugId, runResultId);
    setUnlinkPending(null);
    if (res.error) {
      showToast(res.error, "error");
      return;
    }
    setItems((prev) =>
      prev.map((r) =>
        r.id === runResultId ? { ...r, bugs: (r.bugs ?? []).filter((b) => b.id !== bugId) } : r
      )
    );
    showToast("Bug dilepas dari hasil run.", "success");
  };

  const passed = items.filter((i) => i.status === "PASS").length;
  const failed = items.filter((i) => i.status === "FAIL").length;
  const untested = items.filter((i) => i.status === "NOT_RUN").length;

  // Run ID deterministik dari runId: sp{02}-YYYYMMDD-XXXX
  const runCode = runCodeOf({ id: runId, sprint, createdAt: createdAt ?? new Date() });

  // Ekstrak kode environment dari label (mis. "Development (DEV)" -> "DEV")
  const envShort = (env: string): string => {
    const m = env.match(/\(([^)]+)\)/);
    return m ? m[1] : env;
  };

  // Label platform human-readable dari CSV (mis. "WEB,MOBILE" -> "Web, Mobile")
  const PLATFORM_LABELS: Record<string, string> = {
    WEB: "Web",
    MOBILE: "Mobile",
    HARDWARE: "Hardware",
    API: "API",
  };
  const platformLabel = (v: string | null | undefined): string =>
    v
      ? v
          .split(",")
          .map((p) => PLATFORM_LABELS[p.trim().toUpperCase()] ?? p.trim())
          .filter(Boolean)
          .join(", ")
      : "—";

  // Stats per project
  const projectStats = groups.map((p) => {
    const pPassed = p.items.filter((i) => i.status === "PASS").length;
    const pFailed = p.items.filter((i) => i.status === "FAIL").length;
    const pUntested = p.items.filter((i) => i.status === "NOT_RUN").length;
    const pPct = p.items.length > 0 ? Math.round((pPassed / p.items.length) * 100) : 0;
    return { ...p, passed: pPassed, failed: pFailed, untested: pUntested, pct: pPct };
  });

  // --- Complete Run flow ---
  // Complete selalu lewat Completion Summary Modal dulu: QA me-review catatan
  // per TC dan mengisi overall notes sebelum status run diubah.
  const handleCompleteClick = () => {
    setCompleteOpen(true);
  };

  const finalizeComplete = async () => {
    setCompleting(true);
    // Ada TC untested -> server menandainya SKIPPED sekaligus menyelesaikan run.
    const res =
      untested > 0
        ? await completeRunWithSkip(runId, overallNotes)
        : await completeRun(runId, overallNotes);
    setCompleting(false);
    if (res.error) {
      showToast(res.error, "error");
      return;
    }
    setCompleteOpen(false);
    showToast("Test run diselesaikan.", "success");
    refresh();
  };

  // --- Report export helpers ---
  const reportRows = items.map((item) => ({
    tcId: item.testCase?.tcId ?? "—",
    title: item.titleSnapshot,
    suite: item.testCase?.suiteName ?? "—",
    status: item.status,
    actualResult: item.actualResult ?? "",
  }));

  const exportCsv = () => {
    const header = ["TC ID", "Title", "Suite", "Status", "Actual Result"];
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header.join(","), ...reportRows.map((r) => [r.tcId, r.title, r.suite, r.status, r.actualResult].map(esc).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `test-run-${runCode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setReportOpen(false);
    showToast("CSV report diunduh.", "success");
  };

  const copySlackSummary = async () => {
    const lines = [
      `*Test Run Report: ${runName}*`,
      `Run ID: ${runCode} | ${activityType ?? ""}${environment ? ` | Env: ${envShort(environment)}` : ""}`,
      `Total: ${items.length} TC | Passed: ${passed} | Failed: ${failed} | Skipped: ${items.filter((i) => i.status === "SKIPPED").length} | Untested: ${untested}`,
      "",
      ...reportRows.map((r) => `• ${r.tcId} - ${r.title} (${r.suite}): ${r.status}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setReportOpen(false);
      showToast("Ringkasan Slack disalin.", "success");
    } catch {
      showToast("Gagal menyalin ke clipboard.", "error");
    }
  };

  const exportPdf = () => {
    setReportOpen(false);
    // Buka dedicated report view (auto window.print di sana), bukan print overlay UI.
    window.open(`/test-runs/${runId}/report`, "_blank", "noopener,noreferrer");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Modal Edit Run — setelah simpan, data run di halaman ini disegarkan
          (refresh dari RefreshContext) sehingga daftar TC & metadata ikut
          berubah tanpa reload halaman. */}
      {editOpen && (
        <EditRunModal
          runId={runId}
          runName={runName}
          initial={editInitial}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            showToast("Run diperbarui.", "success");
            refresh();
          }}
        />
      )}

      {/* Summary / Page Header Card */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E5E7EB",
          borderRadius: 12,
          boxShadow: "0px 1px 2px rgba(16, 24, 40, 0.04)",
          padding: 24,
        }}
      >
        {/* Row 1: Title + badges (kiri) | Status pill (kanan) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>
              {runName}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {/* Aksi sekunder: buka modal Edit Run, tepat di kiri Complete Run.
                Base style kedua tombol sengaja identik (tinggi, radius, padding,
                font) — bedanya hanya warna/border. */}
            {!isCompleted && canEdit && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                title="Edit run ini"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  height: 40,
                  padding: "0 16px",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  background: "#fff",
                  color: "#334155",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  transition: "background-color 0.15s ease, color 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              >
                <Pencil size={15} /> Edit
              </button>
            )}
            {!isCompleted && canEdit ? (
            <button
              type="button"
              onClick={handleCompleteClick}
              disabled={completing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                height: 40,
                padding: "0 16px",
                borderRadius: 8,
                border: "none",
                background: "#FFC348",
                color: "#0F172A",
                fontWeight: 700,
                fontSize: 14,
                cursor: completing ? "wait" : "pointer",
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!completing) e.currentTarget.style.background = "#F0B53D";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#FFC348";
              }}
            >
              {completing ? "Menyelesaikan..." : "Complete Run"}
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div
                style={{
                  padding: "0.4rem 1rem",
                  borderRadius: 999,
                  background: "#ECFDF5",
                  color: "#047857",
                  border: "1px solid #A7F3D0",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                }}
              >
                Run Completed
              </div>
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.4rem 1rem",
                  borderRadius: 8,
                  border: "1px solid #D1D5DB",
                  background: "#fff",
                  color: "#374151",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                }}
              >
                Export Report <ChevronDown size={14} aria-hidden="true" />
              </button>
            </div>
          )}
          </div>
        </div>

        {/* Row 2: Overall Execution Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#6B7280" }}>
            Total: {items.length} TC
          </span>
          <span style={{ fontSize: 14, color: "#047857", fontWeight: 600 }}>
            | Passed: {passed}
          </span>
          <span style={{ fontSize: 14, color: "#BE123C", fontWeight: 600 }}>
            | Failed: {failed}
          </span>
          <span style={{ fontSize: 14, color: "#6B7280", fontWeight: 600 }}>
            | Untested: {untested}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={() => setMetaOpen((v) => !v)}
              aria-expanded={metaOpen}
              title={metaOpen ? "Tutup rincian" : "Lihat rincian"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.2rem 0.1rem",
                border: "none",
                background: "transparent",
                color: metaOpen ? "#1E293B" : "#64748B",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 1,
                transition: "color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#1E293B")}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = metaOpen ? "#1E293B" : "#64748B";
              }}
            >
              <span>Detail</span>
              {/* ChevronDown sbg dasar: 180° = menunjuk ke atas saat terbuka. */}
              <ChevronDown
                size={14}
                aria-hidden="true"
                style={{
                  transform: metaOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.3s ease-in-out",
                }}
              />
            </button>
          </div>
        </div>

        {/* Collapsible halus: grid-rows 0fr <-> 1fr */}
        <div
          style={{
            display: "grid",
            transition:
              "grid-template-rows 0.3s ease-in-out, opacity 0.3s ease-in-out, padding-top 0.3s ease-in-out, border-top 0.3s ease-in-out, margin-top 0.3s ease-in-out",
            gridTemplateRows: metaOpen ? "1fr" : "0fr",
            opacity: metaOpen ? 1 : 0,
            marginTop: metaOpen ? "1rem" : 0,
            paddingTop: metaOpen ? "1rem" : 0,
            borderTop: metaOpen ? "1px solid #F1F5F9" : "1px solid transparent",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <div style={{ background: "rgba(248, 250, 252, 0.6)", borderRadius: 12, padding: "1rem 1.25rem" }}>
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "1.5rem", alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8", marginBottom: "0.2rem" }}>Run ID</div>
        <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12, fontWeight: 600, color: "#1E293B", wordBreak: "break-all" }}>{runCode}</div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8", marginBottom: "0.2rem" }}>Projects Covered</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#1E293B" }}>
          {projects.length === 1 ? (
            projects[0].projectName
          ) : projects.length > 1 ? (
            <button
              ref={breakdownRef}
              type="button"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setBreakdownPos({ top: rect.bottom + 6, left: rect.left });
                setBreakdownOpen((v) => !v);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                border: "none",
                background: "none",
                padding: 0,
                color: "#2563EB",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {projects.length} Projects ⓘ
            </button>
          ) : (
            "—"
          )}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8", marginBottom: "0.2rem" }}>Suites Included</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#1E293B" }}>
          {suites.length === 1 ? (
            <Link href={`/suites/${suites[0].id}`} style={{ color: "#2563EB", textDecoration: "none", fontWeight: 600 }}>
              {suites[0].name}
            </Link>
          ) : suites.length > 1 ? (
            <button
              type="button"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setBreakdownPos({ top: rect.bottom + 6, left: rect.left });
                setBreakdownOpen((v) => !v);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                border: "none",
                background: "none",
                padding: 0,
                color: "#2563EB",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {suites.length} Suites ⓘ
            </button>
          ) : (
            "—"
          )}
        </div>
      </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8", marginBottom: "0.2rem" }}>Type</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#1E293B" }} >{activityType ?? "—"}</div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8", marginBottom: "0.2rem" }}>Platform</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#1E293B" }} >{platformLabel(platforms)}</div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8", marginBottom: "0.2rem" }}>Environment</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#1E293B" }} >{environment ? envShort(environment) : "—"}</div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8", marginBottom: "0.2rem" }}>Sprint</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#1E293B" }} >{sprint ?? "—"}</div>
      </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8", marginBottom: "0.2rem" }}>QA / Tester</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#1E293B" }} >{qaName ?? "—"}</div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8", marginBottom: "0.2rem" }}>Task Link</div>
        <div style={{ fontSize: 12 }}>
          {taskLink ? (
            <a
              href={taskLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", color: "#2563EB", textDecoration: "none", fontWeight: 600 }}
            >
              <ExternalLink size={12} /> Open Card
            </a>
          ) : (
            "—"
          )}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8", marginBottom: "0.2rem" }}>Timestamps</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#1E293B" }}>
          <div>Created: {createdAt ? createdAt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) + ", " + createdAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
          <div style={{ marginTop: "0.25rem" }}>Completed: {completedAt ? completedAt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) + ", " + completedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
        </div>
      </div>
      </div>
  </div>
</div>
        </div>
      </div>
    </div>

      {/* Accordion per Project (default expanded) */}
      {projectStats.length === 0 && (
        <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Belum ada test case dalam run ini.
        </div>
      )}
      {projectStats.map((p) => {
        const open = openProjects[p.projectId] ?? true;
        return (
          <div
            key={p.projectId}
            style={{
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "0px 1px 2px rgba(16, 24, 40, 0.04)",
              overflow: "hidden",
            }}
          >
            {/* Accordion header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.85rem 1.25rem",
                background: "#F8FAFC",
                borderBottom: open ? "1px solid var(--border)" : "none",
                cursor: "pointer",
                flexWrap: "wrap",
              }}
              onClick={() =>
                setOpenProjects((prev) => ({ ...prev, [p.projectId]: !open }))
              }
            >
              <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#111827" }}>
                {p.projectName}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {/* Area kanan header project hanya berisi chevron accordion. */}
                <span style={{ color: "#6B7280", display: "inline-flex", transition: "transform 0.2s ease", transform: open ? "rotate(180deg)" : "none" }}>
                  <ChevronDown size={16} aria-hidden="true" />
                </span>
              </div>
            </div>

            {/* Accordion body: hierarki Project -> Section -> kartu TC */}
            {open && (
              <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column" }}>
                {groupItemsBySection(p.items).map((sec) => {
                  const secOpen = !collapsedSections[sec.key];
                  return (
                    <div key={sec.key}>
                      {/* Header Section — klik untuk collapse/expand. Chevron
                          berputar halus; ikon folder tetap sebagai penanda. */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleSection(sec.key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleSection(sec.key);
                          }
                        }}
                        aria-expanded={secOpen}
                        aria-label={`${sec.name} — ${sec.items.length} test case`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 4px",
                          marginTop: 16,
                          marginBottom: 8,
                          borderBottom: "1px solid #F1F5F9",
                          cursor: "pointer",
                          userSelect: "none",
                        }}
                      >
                        <ChevronRight
                          size={12}
                          style={{
                            color: "#94A3B8",
                            flexShrink: 0,
                            transform: secOpen ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform 0.15s ease",
                          }}
                        />
                        <FolderOpen size={12} style={{ color: "#94A3B8", flexShrink: 0 }} />
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#334155",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {sec.name}
                        </span>
                      </div>
                      {secOpen && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                          {sec.items.map((item) => (
                            <RunItemCard
                              key={item.id}
                              item={item}
                              isCompleted={isCompleted}
                              canEdit={canEdit}
                              unlinkPending={unlinkPending}
                              onOpenDetail={() => setModalItem(item)}
                              onOpenBugDetail={setBugDetailId}
                              onUnlinkBug={(bugId) => void unlinkBug(bugId, item.id)}
                              onOpenBug={() => {
                                setBugItem(item);
                                setBugTitle(item.titleSnapshot);
                                setBugDesc("");
                                setBugExpectedResult(item.testCase?.expectedResult ?? "");
                                setBugSeverity("MEDIUM");
                                setBugError(null);
                                setBugPending(false);
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Modal: Detail & Execution */}
      {modalItem && (
        <ExecutionModal
          item={modalItem}
          canEdit={canEdit}
          onClose={() => setModalItem(null)}
          onAttachmentsChange={(list) => patchResult(modalItem.id, { attachments: list })}
          onOpenBugDetail={setBugDetailId}
          onSave={async (data) => {
            const res = await updateRunResult(modalItem.id, {
              status: data.status,
              actualResult: data.actualResult,
              notes: data.notes,
            });
            if (res.error) return res;

            // Patch cermin lokal (termasuk `groups` yang dirender kartunya).
            patchResult(modalItem.id, {
              status: data.status,
              actualResult: data.actualResult ?? null,
              notes: data.notes ?? null,
            });

            // Mode Fail: buat Bug Ticket yang otomatis ter-link ke TC + hasil run ini.
            if (data.bug) {
              const bugRes = await createBug({
                title: data.bug.title,
                description: data.actualResult,
                expectedResult: modalItem.testCase?.expectedResult ?? undefined,
                severity: data.bug.severity || undefined,
                testCaseId: modalItem.testCaseId,
                testRunResultId: modalItem.id,
              });
              if (bugRes.error) return { error: bugRes.error };
              if (bugRes.bugId) {
                patchResult(modalItem.id, {
                  bugs: [
                    ...(modalItem.bugs ?? []),
                    {
                      id: bugRes.bugId,
                      title: data.bug.title,
                      severity: data.bug.severity || null,
                      status: "OPEN",
                      externalLink: null,
                    },
                  ],
                });
              }
            }
            return { success: true };
          }}
        />
      )}

      {isCompleted && canEdit && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>

        </div>
      )}

      {/* Modal: Detail Bug (dibuka dari badge bug di baris TC) */}
      {bugDetailId && (
        <BugDetailModal
          bugId={bugDetailId}
          onClose={() => setBugDetailId(null)}
          onStatusChange={handleBugStatusChange}
          onDeleted={removeBug}
        />
      )}

      {/* Modal: Buat Bug Baru (dari hasil Fail) */}
      {bugItem && (
        <BugModal
          item={bugItem}
          title={bugTitle}
          description={bugDesc}
          expectedResult={bugExpectedResult}
          severity={bugSeverity}
          error={bugError}
          pending={bugPending}
          onTitleChange={setBugTitle}
          onDescriptionChange={setBugDesc}
          onExpectedResultChange={setBugExpectedResult}
          onSeverityChange={setBugSeverity}
          onClose={() => {
            if (!bugPending) setBugItem(null);
          }}
          onSave={() => void saveBug()}
        />
      )}

      {/* Confirm hapus run */}
      <ConfirmDialog
        open={confirmDelete}
        title="Hapus Run?"
        message={
          <>
            Test run <strong>{runName}</strong> beserta seluruh hasil eksekusinya akan dihapus
            permanen.
          </>
        }
        pending={deletePending}
        onConfirm={async () => {
          setDeletePending(true);
          await deleteRun(runId);
          setDeletePending(false);
          showToast("Test run dihapus.", "success");
          router.push("/test-runs");
        }}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* Modal: Completion Summary — review catatan per TC + overall notes */}
      {completeOpen && (
        <CompleteRunModal
          items={items}
          untested={untested}
          overallNotes={overallNotes}
          onOverallNotesChange={setOverallNotes}
          onCancel={() => setCompleteOpen(false)}
          onConfirm={() => void finalizeComplete()}
          completing={completing}
        />
      )}

      {/* Modal: Report export options */}
      {reportOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Export Report"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 260,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
            }}
            onClick={() => setReportOpen(false)}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 440,
                background: "#fff",
                borderRadius: 12,
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
                overflow: "hidden",
                animation: "modalIn 0.18s ease-out",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>Export Report</h3>
                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.25rem 0 0" }}>
                  {runName} · {items.length} TC ({passed} passed)
                </p>
              </div>
              <div style={{ padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <button
                  type="button"
                  onClick={exportPdf}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0.7rem 0.9rem",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    background: "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 16 }}>📄</span>
                  <span>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "#111827" }}>
                      PDF Document
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#6B7280" }}>
                      Laporan formal untuk management/stakeholder
                    </div>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={exportCsv}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0.7rem 0.9rem",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    background: "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 16 }}>📊</span>
                  <span>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "#111827" }}>
                      CSV / Excel
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#6B7280" }}>
                      Raw data untuk analisis internal
                    </div>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void copySlackSummary()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0.7rem 0.9rem",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    background: "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 16 }}>💬</span>
                  <span>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "#111827" }}>
                      Copy Slack Summary
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#6B7280" }}>
                      Ringkasan Markdown ke clipboard
                    </div>
                  </span>
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  padding: "0.9rem 1.25rem",
                  borderTop: "1px solid var(--border)",
                  background: "var(--surface-muted)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  style={{
                    padding: "0.45rem 1rem",
                    borderRadius: 8,
                    border: "1px solid var(--border-strong)",
                    background: "#fff",
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Popover breakdown project & suite */}
      {breakdownOpen && breakdownPos && (
        createPortal(
          <div
            style={{
              position: "fixed",
              top: breakdownPos.top,
              left: breakdownPos.left,
              zIndex: 9999,
              background: "#FFFFFF",
              boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              padding: "12px 16px",
              minWidth: 260,
              animation: "modalIn 0.15s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: "0.5rem" }}>
              Cakupan Project &amp; Suite
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: 13 }}>
              {projectStats.map((p) => {
                // Hitung TC per suite di project ini
                const suiteCounts = new Map<string, number>();
                for (const item of p.items) {
                  const suiteName = item.testCase?.suiteName ?? "Tanpa Suite";
                  suiteCounts.set(suiteName, (suiteCounts.get(suiteName) ?? 0) + 1);
                }
                return (
                  <div key={p.projectId}>
                    <div style={{ fontWeight: 600, color: "#374151", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      <span style={{ fontSize: 11 }}>🔹</span> {p.projectName}
                    </div>
                    <div style={{ marginLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                      {Array.from(suiteCounts.entries()).map(([suiteName, count]) => (
                        <div key={suiteName} style={{ color: "#6B7280", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <span style={{ fontSize: 10 }}>└─</span>
                          <span>{suiteName}</span>
                          <span style={{ color: "#9CA3AF", fontSize: 12 }}>({count} TC)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body
        )
      )}

      {/* Toast */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

/* Card item test case dalam accordion project/suite */
function RunItemCard({
  item,
  isCompleted,
  canEdit,
  unlinkPending,
  onOpenDetail,
  onOpenBugDetail,
  onUnlinkBug,
  onOpenBug,
}: {
  item: RunResultItem;
  isCompleted: boolean;
  canEdit: boolean;
  unlinkPending: string | null;
  onOpenDetail: () => void;
  /** Buka Bug Detail Modal untuk bug yang menempel di hasil eksekusi ini. */
  onOpenBugDetail: (bugId: string) => void;
  onUnlinkBug: (bugId: string) => void;
  onOpenBug: () => void;
}) {
  const attachedBugs = item.bugs ?? [];
  const badge = STATUS_BADGE[item.status];
  const evidenceCount = item.attachments?.length ?? 0;
  /** Actual result hanya ditampilkan saat eksekusi gagal atau terblokir. */
  const showActualResult = item.status === "FAIL" || item.status === "BLOCKED";
  return (
    <div
      onClick={onOpenDetail}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#CBD5E1")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#E2E8F0")}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.625rem",
        padding: "1rem",
        borderRadius: 12,
        border: "1px solid #E2E8F0",
        background: "#fff",
        cursor: "pointer",
        transition: "border-color 0.15s ease",
      }}
    >
      {/* Blok 1 — judul (kiri) | indikator evidence + badge status pasif (kanan) */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "#1E293B", lineHeight: 1.375 }}>
            {item.testCase?.tcId && (
              <>
                <span style={{ fontFamily: "var(--font-mono, monospace)", color: "#64748B", fontWeight: 500 }}>
                  {item.testCase.tcId}
                </span>
                {" - "}
              </>
            )}
            {item.titleSnapshot}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
          {/* Indikator evidence: ikon paperclip polos, sejajar dengan badge status.
              Angka hanya muncul kalau file lebih dari satu. */}
          {evidenceCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail();
              }}
              title={`${evidenceCount} Evidence Attached`}
              aria-label={`${evidenceCount} Evidence Attached`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                padding: 2,
                border: "none",
                background: "transparent",
                color: "#94A3B8",
                fontSize: "0.72rem",
                fontWeight: 600,
                lineHeight: 1,
                cursor: "pointer",
                transition: "color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#475569")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#94A3B8")}
            >
              <Paperclip size={13} />
              {evidenceCount > 1 && evidenceCount}
            </button>
          )}
          {/* Indikator status pasif: perubahan status hanya lewat modal detail */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              flexShrink: 0,
              padding: "0.25rem 0.75rem",
              borderRadius: 999,
              background: badge.bg,
              color: badge.color,
              border: `1px solid ${badge.border}`,
              fontSize: "0.75rem",
              fontWeight: badge.bold ? 700 : 600,
              whiteSpace: "nowrap",
            }}
          >
            {badge.label}
          </span>
        </div>
      </div>

      {/* Blok 2 — hasil eksekusi. Hanya relevan saat eksekusi gagal/terblokir;
          untuk PASS / SKIPPED / belum dieksekusi blok ini disembunyikan. */}
      {showActualResult && item.actualResult && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "#475569",
            lineHeight: 1.55,
            background: "#F8FAFC",
            borderLeft: "2px solid #CBD5E1",
            paddingLeft: "0.75rem",
            paddingTop: "0.375rem",
            paddingBottom: "0.375rem",
            borderRadius: "0 6px 6px 0",
          }}
        >
          <span style={{ fontWeight: 700, color: "#334155" }}>Actual Result: </span>
          {item.actualResult}
        </div>
      )}

      {/* Blok 3 — bug ticket yang ter-link ke hasil eksekusi ini */}
      {item.status === "FAIL" && canEdit && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          {attachedBugs.length > 0 ? (
            attachedBugs.map((b) => {
              const bugCode = entityCode("BUG", b.id);
              return (
                <span key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  {/* Badge -> Bug Detail Modal (bukan lagi lompat ke /bugs) */}
                  <button
                    type="button"
                    title="Buka detail bug"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenBugDetail(b.id);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      padding: "0.25rem 0.625rem",
                      background: "#FFF1F2",
                      border: "1px solid #FECDD3",
                      color: "#BE123C",
                      borderRadius: 6,
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "0.6875rem",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#FFE4E6")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#FFF1F2")}
                  >
                    <Bug size={12} /> {bugCode}
                  </button>
                  {b.externalLink && (
                    <a
                      href={b.externalLink}
                      target="_blank"
                      rel="noreferrer"
                      title="Buka link eksternal bug"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        color: "#BE123C",
                        opacity: 0.7,
                      }}
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                  {!isCompleted && (
                    <button
                      type="button"
                      title="Lepas bug dari hasil run ini"
                      disabled={unlinkPending === b.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnlinkBug(b.id);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 2,
                        border: "none",
                        borderRadius: 4,
                        background: "transparent",
                        color: "#BE123C",
                        cursor: unlinkPending === b.id ? "progress" : "pointer",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#FFE4E6")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
              );
            })
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenBug();
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.35rem 0.85rem",
                borderRadius: 8,
                border: "1px solid var(--danger)",
                background: "#fff",
                color: "var(--danger)",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              <Bug size={13} /> Buat Bug
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* Modal: ringkasan hasil pengujian sebelum run diselesaikan (Completion Summary). */
function CompleteRunModal({
  items,
  untested,
  overallNotes,
  onOverallNotesChange,
  onCancel,
  onConfirm,
  completing,
}: {
  items: RunResultItem[];
  untested: number;
  overallNotes: string;
  onOverallNotesChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  completing: boolean;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !completing) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel, completing]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Rangkum hanya TC yang benar-benar diisi QA (notes dan/atau actual result).
  const noted = items.filter((i) => (i.notes ?? "").trim() || (i.actualResult ?? "").trim());

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "0.5rem",
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Complete Test Run"
      onClick={() => {
        if (!completing) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 260,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 576,
          maxHeight: "85vh",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #F1F5F9",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          animation: "modalIn 0.18s ease-out",
        }}
      >
        {/* Body: satu-satunya area yang scroll; footer di bawahnya tetap terlihat. */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: "#0F172A" }}>
              Complete Test Run
            </h3>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem", color: "#64748B", lineHeight: 1.5 }}>
              Review hasil pengujian dan tambahkan catatan akhir sebelum menyelesaikan run.
            </p>
          </div>

          {untested > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.5rem",
                padding: "0.65rem 0.85rem",
                borderRadius: 8,
                background: "#FFFBEB",
                border: "1px solid #FDE68A",
                color: "#B45309",
                fontSize: "0.78rem",
                lineHeight: 1.5,
              }}
            >
              <span aria-hidden="true">⚠️</span>
              <span>
                Masih terdapat <strong>{untested} Test Case</strong> yang belum dieksekusi. Test Case
                tersebut akan otomatis ditandai sebagai <strong>Skipped</strong>.
              </span>
            </div>
          )}

          <div>
            <div style={labelStyle}>Case Notes</div>
            <div
              style={{
                maxHeight: 220,
                overflowY: "auto",
                padding: "0.75rem",
                paddingRight: 4,
                border: "1px solid #E2E8F0",
                borderRadius: 12,
                background: "rgba(248, 250, 252, 0.5)",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {noted.length === 0 ? (
                <div style={{ fontSize: "0.75rem", color: "#94A3B8", fontStyle: "italic", padding: "0.5rem" }}>
                  Tidak ada catatan spesifik pada test case.
                </div>
              ) : (
                noted.map((it) => {
                  const b = STATUS_BADGE[it.status];
                  return (
                    <div
                      key={it.id}
                      style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, padding: "0.6rem 0.75rem" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                        <span
                          style={{
                            fontFamily: "var(--font-mono, monospace)",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            color: "#475569",
                          }}
                        >
                          {it.testCase?.tcId ?? "—"}
                        </span>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "0.15rem 0.55rem",
                            borderRadius: 999,
                            background: b.bg,
                            color: b.color,
                            border: `1px solid ${b.border}`,
                            fontSize: "0.68rem",
                            fontWeight: b.bold ? 700 : 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {b.label}
                        </span>
                      </div>
                      <div style={{ marginTop: "0.2rem", fontSize: "0.78rem", fontWeight: 600, color: "#1F2937" }}>
                        {it.titleSnapshot}
                      </div>
                      {(it.actualResult ?? "").trim() !== "" && (
                        <div style={{ marginTop: "0.25rem", fontSize: "0.74rem", color: "#475569", lineHeight: 1.5 }}>
                          <span style={{ fontWeight: 600, color: "#64748B" }}>Actual: </span>
                          {it.actualResult}
                        </div>
                      )}
                      {(it.notes ?? "").trim() !== "" && (
                        <div style={{ marginTop: "0.2rem", fontSize: "0.74rem", color: "#475569", lineHeight: 1.5 }}>
                          <span style={{ fontWeight: 600, color: "#64748B" }}>Notes: </span>
                          {it.notes}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <label htmlFor="overall-testing-notes" style={labelStyle}>
              Overall Testing Notes
            </label>
            <textarea
              id="overall-testing-notes"
              value={overallNotes}
              onChange={(e) => onOverallNotesChange(e.target.value)}
              placeholder="Tuliskan rangkuman hasil pengujian seluruh run di sini..."
              style={{
                width: "100%",
                height: 96,
                padding: "0.75rem",
                border: "1px solid #E2E8F0",
                borderRadius: 8,
                fontSize: "0.75rem",
                color: "#1F2937",
                background: "#fff",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#FBBF24";
                e.currentTarget.style.boxShadow = "0 0 0 2px #FDE68A";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#E2E8F0";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>
        </div>

        {/* Footer: di luar area scroll supaya tombol aksi selalu terlihat. */}
        <div
          style={{
            flex: "none",
            padding: "1rem 1.5rem",
            borderTop: "1px solid #F1F5F9",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.75rem",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={completing}
            style={{
              height: 34,
              padding: "0 0.75rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#475569",
              background: "transparent",
              border: "none",
              borderRadius: 8,
              cursor: completing ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={completing}
            style={{
              height: 34,
              padding: "0 1rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#0F172A",
              background: "#FFC348",
              border: "none",
              borderRadius: 8,
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
              cursor: completing ? "wait" : "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!completing) e.currentTarget.style.background = "#F0B53D";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
          >
            {completing ? "Menyelesaikan..." : "Complete Run"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* Modal: Buat Bug Baru (dari hasil Fail) */
function BugModal({
  item,
  title,
  description,
  expectedResult,
  severity,
  error,
  pending,
  onTitleChange,
  onDescriptionChange,
  onExpectedResultChange,
  onSeverityChange,
  onClose,
  onSave,
}: {
  item: RunResultItem;
  title: string;
  description: string;
  expectedResult: string;
  severity: string;
  error: string | null;
  pending: boolean;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onExpectedResultChange: (v: string) => void;
  onSeverityChange: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const canSave = title.trim().length > 0;

  const tcCode = item.testCase?.tcId ?? null;

  const labelBase: React.CSSProperties = {
    display: "block",
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#374151",
  };

  const inputBase: React.CSSProperties = {
    width: "100%",
    padding: "0.55rem 0.75rem",
    border: "1px solid #D1D5DB",
    borderRadius: 8,
    fontSize: "0.85rem",
    color: "#111827",
    background: "#fff",
    outline: "none",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  };

  const inputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "#F59E0B";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(245,158,11,0.18)";
  };
  const inputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "#D1D5DB";
    e.currentTarget.style.boxShadow = "none";
  };

  const useTcTitle = () => {
    if (!item.testCase?.title) return;
    onTitleChange(item.testCase.title);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buat Bug Baru"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 250,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(15, 23, 42, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={pending ? undefined : onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 512,
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: 16,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          animation: "modalIn 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.75rem",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h3
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#0F172A",
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              Buat Bug Baru
            </h3>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 10,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontSize: "0.72rem", fontWeight: 500, color: "#6B7280" }}>
                Related to:
              </span>
              {tcCode ? (
                <span
                  title={tcCode}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    maxWidth: 260,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#334155",
                    background: "#F1F5F9",
                    border: "1px solid #E2E8F0",
                    borderRadius: 6,
                    padding: "2px 8px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  TC: {tcCode}
                </span>
              ) : (
                <span style={{ fontSize: "0.8rem", color: "#9CA3AF" }}>—</span>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            disabled={pending}
            style={{
              width: 28,
              height: 28,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: "#9CA3AF",
              cursor: pending ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!pending) e.currentTarget.style.color = "#4B5563";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#9CA3AF";
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.1rem",
          }}
        >
          {/* Judul Bug */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                marginBottom: 6,
              }}
            >
              <label style={labelBase}>
                Judul Bug <span style={{ color: "#EF4444" }}>*</span>
              </label>
              {item.testCase?.title ? (
                <button
                  type="button"
                  onClick={useTcTitle}
                  style={{
                    border: "none",
                    background: "none",
                    padding: 0,
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    color: "#2563EB",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#1D4ED8";
                    e.currentTarget.style.textDecoration = "underline";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#2563EB";
                    e.currentTarget.style.textDecoration = "none";
                  }}
                >
                  ⚡ Gunakan Judul TC
                </button>
              ) : null}
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Masukan judul ringkas isu/bug..."
              style={inputBase}
              onFocus={inputFocus}
              onBlur={inputBlur}
              disabled={pending}
            />
          </div>

          {/* Severity */}
          <div>
            <label style={{ ...labelBase, marginBottom: 8 }}>
              Severity <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((opt) => {
                const active = severity === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    disabled={pending}
                    onClick={() => onSeverityChange(opt)}
                    style={{
                      padding: "0.5rem 0",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                      border: `1px solid ${active ? "#111827" : "#E5E7EB"}`,
                      borderRadius: 8,
                      background: active ? "#111827" : "#FFFFFF",
                      color: active ? "#FFFFFF" : "#4B5563",
                      cursor: pending ? "not-allowed" : "pointer",
                      transition: "background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!active && !pending) {
                        e.currentTarget.style.background = "#F9FAFB";
                        e.currentTarget.style.borderColor = "#D1D5DB";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "#FFFFFF";
                        e.currentTarget.style.borderColor = "#E5E7EB";
                      }
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expected Result (auto-fill dari Test Case, editable) */}
          <div>
            <label style={{ ...labelBase, marginBottom: 6 }}>
              Expected Result
            </label>
            <textarea
              value={expectedResult}
              onChange={(e) => onExpectedResultChange(e.target.value)}
              placeholder="Hasil ekspektasi dari skenario test case..."
              rows={2}
              style={{
                ...inputBase,
                resize: "vertical",
                lineHeight: 1.5,
                background: "#F9FAFB",
              }}
              onFocus={inputFocus}
              onBlur={inputBlur}
              disabled={pending}
            />
          </div>

          {/* Deskripsi / Langkah Reproduksi */}
          <div>
            <label style={{ ...labelBase, marginBottom: 6 }}>
              Deskripsi / Langkah Reproduksi
            </label>
            <textarea
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Tuliskan langkah reproduksi atau catatan hasil eksekusi..."
              rows={4}
              style={{
                ...inputBase,
                resize: "vertical",
                lineHeight: 1.5,
              }}
              onFocus={inputFocus}
              onBlur={inputBlur}
              disabled={pending}
            />
          </div>

          {error && <div style={{ fontSize: "0.82rem", color: "#DC2626" }}>{error}</div>}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "0.6rem",
            padding: "1rem 1.5rem",
            borderTop: "1px solid #E5E7EB",
            background: "#F8FAFC",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{
              padding: "0.5rem 1.15rem",
              border: "1px solid #D1D5DB",
              borderRadius: 8,
              background: "#fff",
              color: "#374151",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: pending ? "not-allowed" : "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!pending) e.currentTarget.style.background = "#F9FAFB";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#fff";
            }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={pending || !canSave}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.5rem 1.25rem",
              borderRadius: 8,
              border: "none",
              background: pending || !canSave ? "#FDE68A" : "#F59E0B",
              color: "#111827",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: pending || !canSave ? "not-allowed" : "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!pending && canSave) e.currentTarget.style.background = "#D97706";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                pending || !canSave ? "#FDE68A" : "#F59E0B";
            }}
          >
            {pending ? (
              <>
                <Spinner size={14} /> Menyimpan...
              </>
            ) : (
              <>
                <Bug size={14} /> Simpan Bug
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ExecutionModal({
  item,
  canEdit,
  onClose,
  onAttachmentsChange,
  onOpenBugDetail,
  onSave,
}: {
  item: RunResultItem;
  canEdit: boolean;
  onClose: () => void;
  /** Teruskan daftar attachment terbaru ke parent (update in-place). */
  onAttachmentsChange?: (list: AttachmentItem[]) => void;
  /** Buka Bug Detail Modal dari daftar riwayat bug TC ini. */
  onOpenBugDetail?: (bugId: string) => void;
  onSave: (data: {
    status: RunResultItem["status"];
    actualResult?: string;
    notes?: string;
    /** Diisi hanya di mode Fail: bug baru yang dibuat & otomatis ter-link ke TC ini. */
    bug?: { title: string; severity: string };
  }) => Promise<{ success?: boolean; error?: string }>;
}) {
  const [status, setStatus] = useState<RunResultItem["status"]>(item.status);
  const [actualResult, setActualResult] = useState(item.actualResult ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  // Default judul bug: [BUG] - <judul TC>
  const [bugTitle, setBugTitle] = useState(`[BUG] - ${item.titleSnapshot}`);
  const [bugSeverity, setBugSeverity] = useState("MEDIUM");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const tc = item.testCase;
  const stepsList = (tc?.steps ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  /**
   * Riwayat bug milik TEST CASE ini (bukan hanya hasil eksekusi run ini).
   * Sengaja diambil per testCaseId supaya bug yang sudah RESOLVED/CLOSED —
   * termasuk yang sudah melepas tautan run-nya — tetap tampil riwayatnya.
   */
  const [linkedBugs, setLinkedBugs] = useState<BugRow[]>([]);
  const [bugsLoading, setBugsLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bugs?testCaseId=${encodeURIComponent(item.testCaseId)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as BugsPayload;
        if (!cancelled) setLinkedBugs(data.bugs);
      } catch {
        if (!cancelled) setLinkedBugs([]);
      } finally {
        if (!cancelled) setBugsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.testCaseId]);

  const sectionLabel: React.CSSProperties = {
    fontSize: "0.72rem",
    fontWeight: 600,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    margin: "0 0 0.4rem",
  };

  // Mode Fail -> form berubah jadi Bug Reporting Form.
  const isFail = status === "FAIL";
  const hasLinkedBug = (item.bugs?.length ?? 0) > 0;
  /**
   * Sudah pernah disimpan ke DB? Dilihat dari DATA TERSIMPAN (status bukan
   * NOT_RUN, atau sudah ada actual result / notes) — bukan draft di form,
   * supaya label baru berubah setelah benar-benar tersimpan.
   */
  const hasSavedExecution =
    item.status !== "NOT_RUN" ||
    (item.actualResult ?? "").trim() !== "" ||
    (item.notes ?? "").trim() !== "";

  const bugLabelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.69rem",
    fontWeight: 700,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: "0.3rem",
  };

  const bugFieldStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    padding: "0 0.75rem",
    fontSize: "0.75rem",
    color: "#1F2937",
    background: "#fff",
    outline: "none",
    boxSizing: "border-box",
  };

  /** Gaya field eksekusi (Actual Result / Notes) — disamakan dengan field modal. */
  const execFieldStyle: React.CSSProperties = {
    border: "1px solid #D1D5DB",
    borderRadius: 6,
    padding: "0.5rem 0.6rem",
    fontSize: "0.78rem",
    outline: "none",
  };

  const save = async () => {
    if (saving) return; // penjaga double-click
    setMsg(null);

    // Validasi khusus mode Fail: judul bug (kalau bug baru akan dibuat) dan
    // langkah reproduksi wajib diisi.
    if (isFail) {
      if (!hasLinkedBug && !bugTitle.trim()) {
        setMsg("Judul bug wajib diisi.");
        return;
      }
      if (!actualResult.trim()) {
        setMsg("Actual result / langkah reproduksi wajib diisi.");
        return;
      }
    }

    setSaving(true);
    const res = await onSave({
      status,
      actualResult,
      notes,
      // Bug hanya dibuat sekali per hasil eksekusi; kalau sudah ada yang
      // ter-link, submit berikutnya cukup memperbarui detail eksekusi.
      bug: isFail && !hasLinkedBug ? { title: bugTitle.trim(), severity: bugSeverity } : undefined,
    });
    if (res.error) {
      setSaving(false);
      setMsg(res.error);
      return;
    }
    // Sukses: tutup modal otomatis (data sudah dipatch ke daftar induk).
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Detail & Eksekusi"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid var(--border)",
          overflow: "hidden",
          animation: "modalIn 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.75rem",
            padding: "1.25rem 1.5rem",
          }}
        >
          <div style={{ minWidth: 0 }}>
            {tc && (
              <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.72rem", color: "#9CA3AF", fontWeight: 500 }}>
                {tc.tcId}
              </span>
            )}
            <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0.3rem 0 0", color: "#111827", lineHeight: 1.35 }}>
              {item.titleSnapshot}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              borderRadius: 6,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Garis pemisah di bawah judul modal — sengaja TIDAK full-width:
            diberi margin kiri-kanan 1.5rem (px-6) agar selaras batas kontainer. */}
        <div
          aria-hidden="true"
          style={{ flexShrink: 0, height: 1, background: "var(--border)", margin: "0 1.5rem" }}
        />

        {/* Bagian STATIS: metadata, skenario, expected result, dan test steps.
            Sengaja tidak ikut scroll supaya konteks TC selalu terlihat. */}
        <div
          style={{
            flexShrink: 0,
            padding: "1.25rem 1.5rem 0",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* Metadata */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "1rem",
              background: "rgba(248, 250, 252, 0.8)",
              border: "1px solid rgba(229, 231, 235, 0.8)",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            <div>
              <span style={{ display: "block", color: "#9CA3AF", fontWeight: 500, fontSize: "0.72rem", marginBottom: "0.25rem" }}>Priority</span>
              <span style={{ fontWeight: 600, color: "#1F2937", fontSize: "0.82rem" }}>{tc?.priority ?? "—"}</span>
            </div>
            <div>
              <span style={{ display: "block", color: "#9CA3AF", fontWeight: 500, fontSize: "0.72rem", marginBottom: "0.25rem" }}>Status</span>
              <span style={{ fontWeight: 600, color: "#1F2937", fontSize: "0.82rem" }}>{tc?.status ?? "—"}</span>
            </div>
            <div>
              <span style={{ display: "block", color: "#9CA3AF", fontWeight: 500, fontSize: "0.72rem", marginBottom: "0.25rem" }}>Author</span>
              <span style={{ fontWeight: 600, color: "#1F2937", fontSize: "0.82rem" }}>{tc?.createdBy?.name ?? "—"}</span>
            </div>
            <div>
              <span style={{ display: "block", color: "#9CA3AF", fontWeight: 500, fontSize: "0.72rem", marginBottom: "0.25rem" }}>Dibuat</span>
              <span style={{ fontWeight: 500, color: "#374151", fontSize: "0.82rem" }}>
                {tc?.createdAt
                  ? new Date(tc.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
                  : "—"}
              </span>
            </div>
          </div>

          {/* Skenario */}
          {tc?.scenario && (
            <div>
              <h4 style={sectionLabel}>Deskripsi / Skenario</h4>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "#374151", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {tc.scenario}
              </p>
            </div>
          )}

          {/* Expected Result */}
          {tc?.expectedResult && (
            <div>
              <h4 style={sectionLabel}>Expected Result</h4>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "#374151", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {tc.expectedResult}
              </p>
            </div>
          )}

          {/* Test Steps */}
          {stepsList.length > 0 && (
            <div>
              <h4 style={sectionLabel}>Test Steps</h4>
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                  <thead style={{ background: "#F9FAFB", borderBottom: "1px solid var(--border)", color: "#6B7280", textAlign: "left" }}>
                    <tr>
                      <th style={{ padding: "0.5rem 0.6rem", width: 44, textAlign: "center", fontWeight: 600, borderRight: "1px solid var(--border)" }}>#</th>
                      <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>Step Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stepsList.map((step, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.5rem 0.6rem", textAlign: "center", fontWeight: 600, color: "#9CA3AF", borderRight: "1px solid var(--border)" }}>{i + 1}</td>
                        <td style={{ padding: "0.5rem 0.75rem", color: "#374151", lineHeight: 1.55 }}>{step}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Frame EKSEKUSI — flex child yang boleh menyusut (flex:1 + minHeight:0)
            supaya kartu di dalamnya tidak meluap melebihi tinggi modal.
            Scroll-nya ada DI DALAM kartu (lihat isi form eksekusi). */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            padding: "1.25rem 1.5rem",
          }}
        >
          {/* Execution form — satu-satunya area yang scroll (flex:1 +
              minHeight:0) supaya bagian statis di atas & footer tetap di tempat. */}
          <div
            style={{
              background: "rgba(248, 250, 252, 0.8)",
              border: "1px solid rgba(229, 231, 235, 0.8)",
              borderRadius: 8,
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              // Tanpa `gap`: jarak antar bagian diatur margin masing-masing,
              // supaya judul "Eksekusi" tidak berjarak terlalu jauh dari tombol.
              // Ikut menyusut agar isi yang scroll punya batas tinggi nyata.
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <h4 style={{ ...sectionLabel, flexShrink: 0 }}>Eksekusi</h4>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", flexShrink: 0 }}>
              {STATUSES.map((s) => {
                const Icon = s.icon;
                const isActive = status === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={isActive}
                    title={isActive ? "Klik lagi untuk membatalkan (Untested)" : `Tandai ${s.label}`}
                    onClick={() => setStatus(isActive ? "NOT_RUN" : s.value)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.35rem 0.9rem",
                      borderRadius: 6,
                      // Tidak aktif: border tipis senada (lembut). Aktif: solid penuh.
                      border: `1px solid ${isActive ? s.color : `${s.color}4D`}`,
                      background: isActive ? s.activeBg : s.bg,
                      color: isActive ? "#fff" : s.color,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: canEdit ? "pointer" : "not-allowed",
                      transition: "background-color 0.15s ease, color 0.15s ease",
                    }}
                  >
                    <Icon size={14} /> {s.label}
                  </button>
                );
              })}
            </div>

            {/* Garis pemisah inset (bukan full-width) antara tombol status dan
                input Actual Result. Ditaruh DI LUAR area scroll supaya tetap
                diam menemani tombol status. */}
            <div
              aria-hidden="true"
              style={{ flexShrink: 0, height: 1, background: "#E2E8F0", margin: "0.6rem 0 0.9rem" }}
            />

            {/* Isi eksekusi — HANYA bagian ini yang scroll. Header kartu &
                tombol status di atasnya tetap di tempat (flexShrink: 0). */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.9rem",
              }}
            >
            {isFail ? (
              <>
                {/* Bug Reporting Form: tampil otomatis ketika status Fail */}
                {hasLinkedBug ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.4rem",
                      padding: "0.5rem 0.7rem",
                      borderRadius: 8,
                      background: "#FEF2F2",
                      border: "1px solid #FECDD3",
                      color: "#B91C1C",
                      fontSize: "0.72rem",
                      lineHeight: 1.5,
                    }}
                  >
                    <Bug size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>
                      Bug sudah terhubung ke hasil eksekusi ini — menyimpan hanya memperbarui detail
                      eksekusi, bukan membuat bug baru.
                    </span>
                  </div>
                ) : (
                  <>
                    <div>
                      <label style={bugLabelStyle}>
                        Bug Title <span style={{ color: "#E11D48" }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={bugTitle}
                        onChange={(e) => setBugTitle(e.target.value)}
                        disabled={!canEdit}
                        placeholder="Ringkasan singkat isu/bug yang ditemukan..."
                        style={{ ...bugFieldStyle, height: 36 }}
                      />
                    </div>

                    <div>
                      <label style={bugLabelStyle}>Severity</label>
                      <Select
                        value={bugSeverity}
                        onChange={(e) => setBugSeverity(e.target.value)}
                        disabled={!canEdit}
                        ariaLabel="Severity bug"
                      >
                        {SEVERITIES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </>
                )}

                <div>
                  <label style={bugLabelStyle}>
                    Actual Result / Reproduction Steps <span style={{ color: "#E11D48" }}>*</span>
                  </label>
                  <ListTextarea
                    value={actualResult}
                    onChange={setActualResult}
                    disabled={!canEdit}
                    rows={4}
                    ariaLabel="Actual Result / Reproduction Steps"
                    placeholder="Jelaskan hasil aktual dan langkah reproduksi ditemukannya bug..."
                    style={{ ...bugFieldStyle, padding: "0.5rem 0.75rem" }}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#4B5563", marginBottom: "0.3rem" }}>
                    Actual Result
                  </label>
                  <ListTextarea
                    value={actualResult}
                    onChange={setActualResult}
                    disabled={!canEdit}
                    rows={2}
                    ariaLabel="Actual Result"
                    placeholder="Tulis hasil aktual eksekusi..."
                    style={execFieldStyle}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#4B5563", marginBottom: "0.3rem" }}>
                    Notes
                  </label>
                  <ListTextarea
                    value={notes}
                    onChange={setNotes}
                    disabled={!canEdit}
                    rows={2}
                    ariaLabel="Notes"
                    placeholder="Catatan tambahan..."
                    style={execFieldStyle}
                  />
                </div>
              </>
            )}

            {/* Evidence: screenshot/video untuk hasil eksekusi ini */}
            <div style={{ marginTop: "0.9rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748B", marginBottom: "0.4rem" }}>
                EVIDENCE
              </div>
              <AttachmentsPanel
                owner={{ testRunResultId: item.id }}
                attachments={item.attachments ?? []}
                canEdit={canEdit}
                onChange={onAttachmentsChange}
                compact
              />
            </div>

            {/* Riwayat bug Test Case ini — termasuk yang sudah resolved/closed,
                supaya jejak bug tidak hilang setelah TC-nya jadi Pass. */}
            <div style={{ marginTop: "0.9rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748B", marginBottom: "0.4rem" }}>
                LINKED BUGS &amp; HISTORY
              </div>

              {bugsLoading ? (
                <div style={{ fontSize: "0.75rem", color: "#94A3B8" }}>Memuat riwayat bug…</div>
              ) : linkedBugs.length === 0 ? (
                <div style={{ fontSize: "0.75rem", color: "#94A3B8", fontStyle: "italic" }}>
                  Belum ada bug yang pernah dilaporkan untuk test case ini.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {linkedBugs.map((b) => {
                    const st = BUG_STATUS_BADGE[b.status];
                    return (
                      <div
                        key={b.id}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.2rem",
                          padding: "0.5rem 0.65rem",
                          border: "1px solid #E2E8F0",
                          borderRadius: 8,
                          background: "#fff",
                        }}
                      >
                        {/* Baris 1 — ID bug (kiri) + severity & status (kanan) */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "0.5rem",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => onOpenBugDetail?.(b.id)}
                            title="Buka detail bug"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                              border: "none",
                              background: "none",
                              padding: 0,
                              color: "#BE123C",
                              fontFamily: "var(--font-mono, monospace)",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                              cursor: onOpenBugDetail ? "pointer" : "default",
                            }}
                            onMouseEnter={(e) => {
                              if (onOpenBugDetail) e.currentTarget.style.textDecoration = "underline";
                            }}
                            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                          >
                            <Bug size={12} /> {entityCode("BUG", b.id)}
                          </button>

                          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexShrink: 0 }}>
                            {b.severity &&
                              (() => {
                                const sv = BUG_SEVERITY_BADGE[b.severity] ?? BUG_SEVERITY_BADGE.LOW;
                                return (
                                  <span
                                    style={{
                                      padding: "0.1rem 0.45rem",
                                      borderRadius: 999,
                                      fontSize: "0.6875rem",
                                      fontWeight: 700,
                                      letterSpacing: "0.02em",
                                      background: sv.bg,
                                      color: sv.color,
                                      border: `1px solid ${sv.border}`,
                                    }}
                                  >
                                    {b.severity}
                                  </span>
                                );
                              })()}
                            <span
                              style={{
                                padding: "0.1rem 0.45rem",
                                borderRadius: 999,
                                fontSize: "0.6875rem",
                                fontWeight: 700,
                                letterSpacing: "0.02em",
                                background: st.bg,
                                color: st.color,
                                border: `1px solid ${st.border}`,
                              }}
                            >
                              {st.label}
                            </span>
                          </div>
                        </div>

                        {/* Baris 2 — judul bug */}
                        <div
                          style={{
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            color: "#334155",
                            lineHeight: 1.4,
                          }}
                        >
                          {b.title}
                        </div>

                        {/* Baris 3 — metadata ringkas */}
                        <div style={{ fontSize: "0.66rem", color: "#94A3B8" }}>
                          {new Date(b.createdAt).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          {b.resolvedAt
                            ? ` · Selesai ${new Date(b.resolvedAt).toLocaleDateString("id-ID", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}`
                            : ""}
                          {b.run ? ` · ${b.run.name}` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            </div>
          </div>
        </div>

        {/* Footer: ikut fixed di bawah modal, terpisah dari area scroll.
            Tanpa border atas sesuai permintaan — pemisahnya cukup latar putih. */}
        {canEdit && (
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "0.75rem",
              padding: "0.9rem 1.5rem",
              background: "#fff",
            }}
          >
            {msg && <div style={{ flex: 1, fontSize: "0.75rem", color: "#B91C1C" }}>{msg}</div>}
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              style={{
                padding: "0.5rem 1.25rem",
                border: "none",
                borderRadius: 6,
                background: isFail ? "#E11D48" : "#FFC107",
                color: isFail ? "#fff" : "#0F172A",
                fontSize: "0.78rem",
                fontWeight: 700,
                cursor: saving ? "wait" : "pointer",
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = isFail ? "#BE123C" : "#E0A800")}
              onMouseLeave={(e) => (e.currentTarget.style.background = isFail ? "#E11D48" : "#FFC107")}
            >
              {saving
                ? "Menyimpan..."
                : isFail && !hasLinkedBug
                  ? "Laporkan Bug & Simpan"
                  : hasSavedExecution
                    ? "Edit Detail"
                    : "Simpan Detail"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
