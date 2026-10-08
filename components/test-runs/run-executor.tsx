"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRefresh } from "@/lib/client/refresh-context";
import { AlertTriangle, Bug, Check, CheckCircle2, ChevronDown, ChevronRight, CircleSlash, Copy, ExternalLink, FolderOpen, MinusCircle, Paperclip, Pencil, X, XCircle } from "lucide-react";
import { completeRun, completeRunWithSkip, deleteRun, updateRunResult } from "@/lib/actions/test-runs";
import { createBug, updateBug, updateBugStatus } from "@/lib/actions/automation-bugs";
import { ConfirmDialog, Spinner, Toast, useToast } from "@/components/ui/feedback";
import { entityCode, runCodeOf } from "@/lib/format";
import {
  AttachmentsPanel,
  type AttachmentsPanelHandle,
} from "@/components/attachments/attachments-panel";
import { ListTextarea } from "@/components/ui/list-textarea";
import { Select } from "@/components/ui/select";
import { BugDetailModal } from "@/components/bugs/bug-detail-modal";
import { EditRunModal } from "@/components/test-runs/edit-run-modal";
import type { ExpressRunInitial } from "@/components/test-runs/express-run";
import type { AttachmentItem, BugEditableFields, BugRow, BugStatus, BugsPayload } from "@/types/api";

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
const statusPillStyle = (
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
  fontWeight: badge.weight,
  whiteSpace: "nowrap",
});

/**
 * Badge status bug untuk section riwayat bug di modal eksekusi.
 * Kontras sengaja tinggi (teks gelap di atas latar soft + border tipis) supaya
 * langsung terbaca. Istilah "selesai" di sini memakai CLOSED untuk keduanya
 * (RESOLVED & CLOSED) dengan badge netral abu — supaya tidak ada dua sebutan
 * berbeda untuk arti yang sama.
 */
const BUG_STATUS_BADGE: Record<BugStatus, { label: string; bg: string; color: string; border: string }> = {
  OPEN: { label: "Open", bg: "#FEF2F2", color: "#B91C1C", border: "#FECACA" },
  IN_PROGRESS: { label: "In Progress", bg: "#FFFBEB", color: "#B45309", border: "#FDE68A" },
  RESOLVED: { label: "Closed", bg: "#F1F5F9", color: "#047857", border: "#E2E8F0" },
  CLOSED: { label: "Closed", bg: "#F1F5F9", color: "#047857", border: "#E2E8F0" },
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
  // Accordion per SUITE (kartu teratas daftar eksekusi): default expanded.
  const [openSuites, setOpenSuites] = useState<Record<string, boolean>>({});
  // Accordion per Section TC: default semua expanded. Kuncinya sectionId
  // (unik lintas suite) atau "__none__" untuk kelompok "Tanpa Section".
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) =>
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const [modalItem, setModalItem] = useState<RunResultItem | null>(null);
  // Bug yang sedang dibuka di Bug Detail Modal (dari badge bug di baris TC).
  const [bugDetailId, setBugDetailId] = useState<string | null>(null);
  /** Sinyal patch bug untuk ExecutionModal (daftar "Linked Bugs" hidup di sana). */
  const [bugPatch, setBugPatch] = useState<{ id: string; patch: BugEditableFields } | null>(null);
  const [bugItem, setBugItem] = useState<RunResultItem | null>(null);
  const [metaOpen, setMetaOpen] = useState(false);
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  // Modal ringkasan + overall notes sebelum Complete (Completion Summary)
  const [completeOpen, setCompleteOpen] = useState(false);
  const [overallNotes, setOverallNotes] = useState("");
  // Gate Complete Run: muncul kalau masih ada bug OPEN yang tertaut ke run ini.
  const [bugGateOpen, setBugGateOpen] = useState(false);
  const [bugGateReason, setBugGateReason] = useState("");
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

  /**
   * Patch satu bug setelah Edit Bug sukses: badge bug di baris TC (`mapResults`)
   * plus daftar "Linked Bugs" milik ExecutionModal, yang di-patch lewat sinyal
   * `bugPatch` karena state-nya hidup di komponen itu.
   */
  const patchBug = (bugId: string, patch: BugEditableFields) => {
    mapResults((r) =>
      r.bugs?.some((b) => b.id === bugId)
        ? {
            ...r,
            bugs: r.bugs.map((b) =>
              b.id === bugId
                ? { ...b, title: patch.title, severity: patch.severity, externalLink: patch.externalLink }
                : b
            ),
          }
        : r
    );
    // Objek baru tiap kali -> effect di ExecutionModal ikut jalan lagi.
    setBugPatch({ id: bugId, patch });
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

  /**
   * Kelompok untuk DAFTAR eksekusi: per SUITE (kartu teratas), bukan per
   * project. Diturunkan dari `groups` (cermin lokal yang ikut ter-patch) supaya
   * perubahan status tetap langsung tampil. TC tanpa suite dikumpulkan di grup
   * "Tanpa Suite" supaya tidak ada yang hilang.
   */
  const suiteStats = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        projectName: string;
        platform: string | null;
        items: RunResultItem[];
      }
    >();
    for (const g of groups) {
      for (const item of g.items) {
        const suite = item.testCase?.suite ?? null;
        const key = suite?.id ?? `__no_suite__${g.projectId}`;
        const entry = map.get(key) ?? {
          key,
          name: suite?.name ?? "Tanpa Suite",
          projectName: suite?.project?.name ?? g.projectName,
          platform: suite?.project?.platform ?? null,
          items: [] as RunResultItem[],
        };
        entry.items.push(item);
        map.set(key, entry);
      }
    }
    return Array.from(map.values());
  }, [groups]);

  // --- Complete Run flow ---
  /**
   * Bug ber-status OPEN yang masih tertaut ke hasil eksekusi run ini (unik per
   * bug). Dipakai sebagai gate: run tidak boleh langsung diselesaikan selama
   * masih ada bug OPEN — QA harus mengisi alasan force-complete dulu.
   */
  const openBugs = useMemo(() => {
    const map = new Map<string, { id: string; title: string }>();
    for (const item of items) {
      for (const b of item.bugs ?? []) {
        if (b.status === "OPEN" && !map.has(b.id)) map.set(b.id, { id: b.id, title: b.title });
      }
    }
    return Array.from(map.values());
  }, [items]);

  // Complete selalu lewat Completion Summary Modal dulu: QA me-review catatan
  // per TC dan mengisi overall notes sebelum status run diubah.
  const handleCompleteClick = () => {
    setCompleteOpen(true);
  };

  /**
   * @param forceReason Alasan force-complete saat masih ada bug OPEN (dari gate
   *   modal). Tanpa argumen dan ada bug OPEN, fungsi ini menahan penyelesaian
   *   dan membuka gate modal.
   */
  const finalizeComplete = async (forceReason?: string) => {
    if (!forceReason && openBugs.length > 0) {
      setCompleteOpen(false);
      setBugGateReason("");
      setBugGateOpen(true);
      return;
    }

    setCompleting(true);
    // Catatan alasan dibawa serta ke overallNotes supaya jejaknya tersimpan.
    const notes = forceReason
      ? `${overallNotes.trim()}\n\n[Force complete — masih ada ${openBugs.length} bug OPEN] ${forceReason.trim()}`.trim()
      : overallNotes;
    // Ada TC untested -> server menandainya SKIPPED sekaligus menyelesaikan run.
    const res =
      untested > 0
        ? await completeRunWithSkip(runId, notes)
        : await completeRun(runId, notes);
    setCompleting(false);
    if (res.error) {
      showToast(res.error, "error");
      return;
    }
    setCompleteOpen(false);
    setBugGateOpen(false);
    showToast("Test run diselesaikan.", "success");
    refresh();
  };

  // --- Report export helpers ---
  const reportRows = items.map((item) => ({
    tcId: item.testCase?.tcId ?? "—",
    title: item.titleSnapshot,
    suite: item.testCase?.suite?.name ?? "—",
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
                  gap: 6,
                  // Tinggi ditentukan padding saja (tanpa `height` tetap) supaya
                  // ringkas dan sejajar dengan tombol action lain di app.
                  padding: "0.375rem 0.75rem",
                  borderRadius: 8,
                  border: "1px solid #CBD5E1",
                  background: "#fff",
                  color: "#334155",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  transition: "background-color 0.15s ease, color 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              >
                <Pencil size={13} /> Edit
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
                gap: 6,
                padding: "0.375rem 0.75rem",
                borderRadius: 8,
                border: "none",
                background: "#FFC348",
                color: "#0F172A",
                fontWeight: 700,
                fontSize: "0.75rem",
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
                  gap: "0.35rem",
                  padding: "0.375rem 0.75rem",
                  borderRadius: 8,
                  border: "1px solid #D1D5DB",
                  background: "#fff",
                  color: "#374151",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              >
                Export Report <ChevronDown size={13} aria-hidden="true" />
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

      {/* Daftar eksekusi: kartu teratas = SUITE, di dalamnya Section (folder),
          baru kartu TC. Section tidak lagi digabung lintas suite. */}
      {suiteStats.length === 0 && (
        <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Belum ada test case dalam run ini.
        </div>
      )}
      {suiteStats.map((s) => {
        const open = openSuites[s.key] ?? true;
        return (
          <div
            key={s.key}
            style={{
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "0px 1px 2px rgba(16, 24, 40, 0.04)",
              overflow: "hidden",
            }}
          >
            {/* Header Suite Card: nama suite + breadcrumb project (kiri);
                badge Platform + jumlah TC + chevron (kanan). */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                padding: "0.85rem 1.25rem",
                background: "#F8FAFC",
                // Border dibuat transparan (bukan `none`) + di-transition agar
                // tingginya tidak "melompat" 1px saat buka/tutup.
                borderBottom: `1px solid ${open ? "var(--border)" : "transparent"}`,
                transition: "border-color 300ms ease-in-out",
                cursor: "pointer",
                flexWrap: "wrap",
              }}
              onClick={() => setOpenSuites((prev) => ({ ...prev, [s.key]: !open }))}
            >
              <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#111827" }}>
                {s.name}
              </span>
              {/* Konteks project (dulu kartu tersendiri) kini jadi breadcrumb. */}
              <span style={{ fontSize: "0.72rem", color: "#94A3B8" }}>{s.projectName}</span>

              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {s.platform && (
                  <span
                    style={{
                      padding: "0.1rem 0.45rem",
                      borderRadius: 999,
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                      background: "#F1F5F9",
                      color: "#475569",
                      border: "1px solid #E2E8F0",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {platformLabel(s.platform)}
                  </span>
                )}
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    color: "#64748B",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.items.length} TC
                </span>
                <span
                  style={{
                    color: "#6B7280",
                    display: "inline-flex",
                    transition: "transform 300ms ease-in-out",
                    transform: open ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  <ChevronDown size={16} aria-hidden="true" />
                </span>
              </div>
            </div>

            {/* Body Suite: Section-section DI DALAM suite ini. Aksen border kiri
                + margin bertingkat menegaskan bahwa Section milik suite di
                atasnya. Buka/tutup pakai trik grid-rows 0fr ↔ 1fr. */}
            <div
              style={{
                display: "grid",
                gridTemplateRows: open ? "1fr" : "0fr",
                opacity: open ? 1 : 0,
                transition: "grid-template-rows 300ms ease-in-out, opacity 300ms ease-in-out",
              }}
            >
              <div style={{ overflow: "hidden", minHeight: 0 }}>
                <div
                  style={{
                    padding: "0.5rem 0.75rem 0.75rem",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {groupItemsBySection(s.items).map((sec) => {
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
                            padding: "8px 10px",
                            marginTop: 8,
                            // Folder parent: latar slate-50 tipis + teks tegas.
                            background: "rgba(248, 250, 252, 0.8)",
                            borderRadius: 6,
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                        >
                          <ChevronRight
                            size={13}
                            style={{
                              color: "#64748B",
                              flexShrink: 0,
                              transform: secOpen ? "rotate(90deg)" : "rotate(0deg)",
                              transition: "transform 300ms ease-in-out",
                            }}
                          />
                          <FolderOpen size={13} style={{ color: "#64748B", flexShrink: 0 }} />
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#1E293B",
                            }}
                          >
                            {sec.name}
                          </span>
                        </div>

                        {/* Isi Section — juga pakai grid-rows agar animasinya
                            konsisten dengan kartu suite di atasnya. */}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateRows: secOpen ? "1fr" : "0fr",
                            opacity: secOpen ? 1 : 0,
                            transition:
                              "grid-template-rows 300ms ease-in-out, opacity 300ms ease-in-out",
                          }}
                        >
                          <div style={{ overflow: "hidden", minHeight: 0 }}>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              {sec.items.map((item) => (
                                <RunItemCard
                                  key={item.id}
                                  item={item}
                                  isCompleted={isCompleted}
                                  canEdit={canEdit}
                                  onOpenDetail={() => setModalItem(item)}
                                  onOpenBugDetail={setBugDetailId}
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
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Modal: Detail & Execution */}
      {modalItem && (
        <ExecutionModal
          item={modalItem}
          canEdit={canEdit}
          environment={environment ?? null}
          onClose={() => setModalItem(null)}
          onAttachmentsChange={(list) => patchResult(modalItem.id, { attachments: list })}
          onOpenBugDetail={setBugDetailId}
          bugPatch={bugPatch}
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

            if (data.bug) {
              /**
               * Mode "edit": QA hanya menambah detail/evidence pada bug yang
               * sama — tidak ada record bug baru.
               */
              if (data.bug.mode === "edit" && data.bug.id) {
                const upRes = await updateBug({
                  bugId: data.bug.id,
                  title: data.bug.title,
                  description: data.actualResult,
                  severity: data.bug.severity || undefined,
                  expectedResult: modalItem.testCase?.expectedResult ?? undefined,
                });
                if (upRes.error) return { error: upRes.error };
                patchBug(data.bug.id, {
                  title: data.bug.title,
                  description: data.actualResult ?? null,
                  severity: data.bug.severity || null,
                  externalLink: null,
                });
                return { success: true };
              }

              /**
               * Mode "new": buat Bug BARU (Bug ID baru) yang ter-link ke TC +
               * hasil eksekusi ini. Bug lama sudah di-Resolve lewat tombol di
               * form, jadi riwayatnya tetap tercatat.
               */
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

                /**
                 * Retest Fail karena ISSUE BERBEDA: bug lama ditandai CLOSED
                 * SETELAH bug baru tersimpan. Close memicu aturan auto-pass
                 * (hasil FAIL yang tertaut jadi PASS), jadi status pilihan QA
                 * ditulis ulang di akhir supaya hasilnya tetap seperti dipilih.
                 */
                if (data.bug.closeOldBugId) {
                  await updateBugStatus(data.bug.closeOldBugId, "CLOSED");
                  await updateRunResult(modalItem.id, { status: data.status });
                  mapResults((r) =>
                    r.bugs?.some((b) => b.id === data.bug?.closeOldBugId)
                      ? {
                          ...r,
                          bugs: r.bugs.map((b) =>
                            b.id === data.bug?.closeOldBugId ? { ...b, status: "CLOSED" } : b
                          ),
                        }
                      : r
                  );
                }
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
          onUpdated={patchBug}
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
          environment={environment ?? null}
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

      {/* Modal: gate bug OPEN — konfirmasi + alasan wajib sebelum Complete */}
      {bugGateOpen && (
        <BugOpenConfirmModal
          bugs={openBugs}
          reason={bugGateReason}
          onReasonChange={setBugGateReason}
          onReview={() => setBugGateOpen(false)}
          onConfirm={() => void finalizeComplete(bugGateReason)}
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
                  const suiteName = item.testCase?.suite?.name ?? "Tanpa Suite";
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

/* Baris item test case (flat list) dalam accordion project/suite */
function RunItemCard({
  item,
  isCompleted,
  canEdit,
  onOpenDetail,
  onOpenBugDetail,
  onOpenBug,
}: {
  item: RunResultItem;
  isCompleted: boolean;
  canEdit: boolean;
  onOpenDetail: () => void;
  /** Buka Bug Detail Modal untuk bug yang menempel di hasil eksekusi ini. */
  onOpenBugDetail: (bugId: string) => void;
  onOpenBug: () => void;
}) {
  const attachedBugs = item.bugs ?? [];
  const badge = STATUS_BADGE[item.status];
  const evidenceCount = item.attachments?.length ?? 0;
  /** Actual result hanya ditampilkan saat eksekusi gagal atau terblokir. */
  const showActualResult = item.status === "FAIL" || item.status === "BLOCKED";
  /** Slot bug: ada bug ter-link, atau tautan "Buat Bug" (FAIL & belum ada bug). */
  const hasBugLinks =
    attachedBugs.length > 0 ||
    (attachedBugs.length === 0 && item.status === "FAIL" && !isCompleted && canEdit);

  /** Link bug polos (ikon + ID) — hover = underline sederhana, tanpa pill/box. */
  const renderBugLinks = () => (
    <>
      {attachedBugs.map((b) => (
        <button
          key={b.id}
          type="button"
          title="Buka detail bug"
          onClick={(e) => {
            e.stopPropagation();
            onOpenBugDetail(b.id);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            padding: 0,
            border: "none",
            background: "transparent",
            color: "#BE123C",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.6875rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
        >
          <Bug size={12} /> {entityCode("BUG", b.id)}
        </button>
      ))}
      {attachedBugs.length === 0 && item.status === "FAIL" && !isCompleted && canEdit && (
        <button
          type="button"
          title="Buat bug dari hasil eksekusi ini"
          onClick={(e) => {
            e.stopPropagation();
            onOpenBug();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            padding: 0,
            border: "none",
            background: "transparent",
            color: "#BE123C",
            fontSize: "0.6875rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
        >
          <Bug size={12} /> Buat Bug
        </button>
      )}
    </>
  );
  return (
    <div
      onClick={onOpenDetail}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
        // Flat list: tanpa border/card individual — cukup garis pemisah tipis.
        // Indentasi kiri 2.5rem (pl-10) menegaskan TC ini anak dari folder di atas.
        padding: "0.7rem 0.75rem 0.7rem 2.5rem",
        borderBottom: "1px solid #F1F5F9",
        background: "transparent",
        cursor: "pointer",
        transition: "background-color 0.15s ease",
      }}
    >
      {/* Blok 1 — judul (kiri) | indikator evidence + badge status pasif (kanan) */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: "0.85rem", color: "#334155", lineHeight: 1.4 }}>
            {item.testCase?.tcId && (
              <span
                style={{
                  display: "inline-block",
                  marginRight: 6,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: "#F1F5F9",
                  color: "#64748B",
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: 11,
                  fontWeight: 500,
                  verticalAlign: "middle",
                }}
              >
                {item.testCase.tcId}
              </span>
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

          {/* Pill status hasil eksekusi (Passed/Failed/Untested/…) — kontras. */}
          <span style={statusPillStyle(badge)}>{badge.label}</span>
        </div>
      </div>

      {/* Blok hasil eksekusi: deskripsi di kiri, link bug di POJOK KANAN
          dalam container yang sama. Hanya tampil saat gagal/terblokir. */}
      {showActualResult && item.actualResult && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.75rem",
            fontSize: "0.75rem",
            color: "#475569",
            lineHeight: 1.55,
            background: "#F8FAFC",
            borderLeft: "2px solid #CBD5E1",
            paddingLeft: "0.75rem",
            paddingRight: "0.6rem",
            paddingTop: "0.375rem",
            paddingBottom: "0.375rem",
            borderRadius: "0 6px 6px 0",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700, color: "#334155" }}>Actual Result: </span>
            {item.actualResult}
          </div>

          {hasBugLinks && (
            <div
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              {renderBugLinks()}
            </div>
          )}
        </div>
      )}

      {/* Kalau box Actual Result tidak tampil (mis. TC sudah Passed karena
          bug-nya selesai), link bug tetap muncul sebagai teks polos. */}
      {!(showActualResult && item.actualResult) && hasBugLinks && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {renderBugLinks()}
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
    textTransform: "none",
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
                        <span style={statusPillStyle(b)}>{b.label}</span>
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

/**
 * Gate Complete Run — masih ada bug OPEN yang tertaut ke run ini. Run TIDAK
 * langsung diselesaikan: QA memilih meninjau bug dulu, atau force complete
 * dengan alasan tertulis (wajib).
 */
function BugOpenConfirmModal({
  bugs,
  reason,
  onReasonChange,
  onReview,
  onConfirm,
  completing,
}: {
  bugs: { id: string; title: string }[];
  reason: string;
  onReasonChange: (v: string) => void;
  onReview: () => void;
  onConfirm: () => void;
  completing: boolean;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !completing) onReview();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onReview, completing]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Tombol force-complete hanya aktif kalau alasannya sudah diisi.
  const canConfirm = reason.trim().length > 0 && !completing;

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#64748B",
    marginBottom: "0.5rem",
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Selesaikan Test Run dengan Bug Open?"
      onClick={() => {
        if (!completing) onReview();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 270,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
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
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.1rem",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: "#0F172A" }}>
            Selesaikan Test Run dengan Bug Open?
          </h3>

          {/* Warning + jumlah bug */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.5rem",
              padding: "0.7rem 0.85rem",
              borderRadius: 10,
              background: "#FFF7ED",
              border: "1px solid #FED7AA",
              color: "#9A3412",
              fontSize: "0.8rem",
              lineHeight: 1.5,
            }}
          >
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Masih terdapat <strong>{bugs.length}</strong> bug aktif berstatus{" "}
              <strong>OPEN</strong> pada Test Run ini.
            </span>
          </div>

          {/* Daftar ringkas bug OPEN (ID + judul) */}
          <div>
            <span style={labelStyle}>Bug open ({bugs.length})</span>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                maxHeight: "11rem",
                overflowY: "auto",
              }}
            >
              {bugs.map((b, idx) => (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.4rem 0",
                    borderBottom: idx < bugs.length - 1 ? "1px solid #F1F5F9" : "none",
                  }}
                >
                  <Bug size={12} style={{ flexShrink: 0, color: "#DC2626" }} />
                  <span
                    style={{
                      flexShrink: 0,
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "0.7rem",
                      color: "#64748B",
                    }}
                  >
                    {entityCode("BUG", b.id)}
                  </span>
                  <span
                    title={b.title}
                    style={{
                      minWidth: 0,
                      fontSize: "0.78rem",
                      color: "#334155",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {b.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Alasan force-complete (wajib) */}
          <div>
            <label htmlFor="bug-open-reason" style={labelStyle}>
              Catatan / Remarks <span style={{ color: "#E11D48" }}>*</span>
            </label>
            <textarea
              id="bug-open-reason"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Alasan menyelesaikan run meskipun masih ada bug open..."
              style={{
                width: "100%",
                height: 84,
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
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.72rem", color: "#94A3B8" }}>
              Wajib diisi untuk menyelesaikan run saat bug masih OPEN.
            </p>
          </div>
        </div>

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
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={onReview}
            disabled={completing}
            style={{
              height: 34,
              padding: "0 0.85rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#334155",
              background: "#fff",
              border: "1px solid #CBD5E1",
              borderRadius: 8,
              cursor: completing ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!completing) e.currentTarget.style.background = "#F8FAFC";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            Tinjau Bug History
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            title={canConfirm ? undefined : "Isi catatan dulu untuk melanjutkan"}
            style={{
              height: 34,
              padding: "0 1rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#fff",
              background: "#DC2626",
              border: "none",
              borderRadius: 8,
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
              cursor: canConfirm ? "pointer" : "not-allowed",
              opacity: canConfirm ? 1 : 0.5,
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (canConfirm) e.currentTarget.style.background = "#B91C1C";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#DC2626")}
          >
            {completing ? "Menyelesaikan..." : "Selesaikan dengan Catatan"}
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
  environment,
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
  /** Environment run — read-only, ikut Test Run (diturunkan di server). */
  environment: string | null;
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
    textTransform: "none",
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

          {/* Environment — read-only: bug dari eksekusi mewarisi env run ini. */}
          <div>
            <label style={{ ...labelBase, marginBottom: 6 }}>
              Environment <span style={{ fontWeight: 500, color: "#9CA3AF" }}>(dari Test Run)</span>
            </label>
            <input
              type="text"
              value={environment ?? "—"}
              readOnly
              disabled
              title="Environment mengikuti Test Run terkait."
              style={{ ...inputBase, background: "#F9FAFB", color: "#6B7280" }}
            />
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

/** Batas lebar kolom kiri split panel modal eksekusi (persen dari lebar modal). */
const SPLIT_MIN_PCT = 40;
const SPLIT_MAX_PCT = 70;
/** Lebar area drag divider (px). */
const SPLIT_DIVIDER_W = 8;
/** Durasi transisi buka/tutup modal eksekusi (ms). Animasi keluar ditahan
 *  selama ini sebelum komponen benar-benar di-unmount. */
const MODAL_TRANSITION_MS = 300;
/** Jepit lebar kolom kiri ke rentang yang diizinkan. */
const clampSplit = (pct: number) => Math.min(SPLIT_MAX_PCT, Math.max(SPLIT_MIN_PCT, pct));

function ExecutionModal({
  item,
  canEdit,
  environment,
  onClose,
  onAttachmentsChange,
  onOpenBugDetail,
  bugPatch,
  onSave,
}: {
  item: RunResultItem;
  canEdit: boolean;
  /** Environment run — read-only, ditampilkan di form bug mode Fail. */
  environment: string | null;
  onClose: () => void;
  /** Teruskan daftar attachment terbaru ke parent (update in-place). */
  onAttachmentsChange?: (list: AttachmentItem[]) => void;
  /** Buka Bug Detail Modal dari daftar riwayat bug TC ini. */
  onOpenBugDetail?: (bugId: string) => void;
  /** Patch bug hasil Edit Bug dari parent — dipakai untuk update `linkedBugs` in-place. */
  bugPatch?: { id: string; patch: BugEditableFields } | null;
  onSave: (data: {
    status: RunResultItem["status"];
    actualResult?: string;
    notes?: string;
    /**
     * Mode Fail saja:
     * - `new`  → buat Bug BARU (ID baru) ter-link ke TC + hasil run ini;
     * - `edit` → perbarui bug yang sedang ter-link (tanpa record baru).
     * `closeOldBugId` = bug lama yang harus di-Close otomatis saat bug baru
     * disimpan (Retest Fail karena issue berbeda).
     */
    bug?: {
      mode: "new" | "edit";
      id?: string;
      closeOldBugId?: string;
      title: string;
      severity: string;
    };
  }) => Promise<{ success?: boolean; error?: string }>;
}) {
  const [status, setStatus] = useState<RunResultItem["status"]>(item.status);
  const [actualResult, setActualResult] = useState(item.actualResult ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  // Judul bug default KOSONG — diisi QA, atau ter-prefill dari bug aktif saat
  // mode "edit" (lihat effect activeBug di bawah).
  const [bugTitle, setBugTitle] = useState("");
  const [bugSeverity, setBugSeverity] = useState("MEDIUM");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  /**
   * Animasi buka/tutup. `entered` dipasang setelah frame pertama benar-benar
   * digambar — pakai DOUBLE rAF, karena satu rAF bisa ter-batch dengan commit
   * React sehingga frame opacity-0 tidak pernah dilukis dan transisinya diam.
   * `closing` menahan modal tetap ter-mount sampai animasi keluar selesai.
   */
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const shown = entered && !closing;

  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  // Baru benar-benar unmount (via onClose) setelah transisi keluar selesai.
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClose, MODAL_TRANSITION_MS);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

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
  // Accordion Bug History — default tertutup agar hemat ruang visual.
  const [bugHistoryOpen, setBugHistoryOpen] = useState(false);
  // Status tombol "Salin" Test Data (kembali normal setelah 2 detik).
  const [testDataCopied, setTestDataCopied] = useState(false);

  /**
   * Bug AKTIF yang menempel ke hasil eksekusi ini (fallback: bug aktif mana pun
   * di riwayat TC). Dasar tab "Edit Bug Aktif" + penentu mode form.
   */
  const activeBug =
    (item.bugs ?? []).find((b) => b.status === "OPEN" || b.status === "IN_PROGRESS") ??
    linkedBugs.find((b) => b.status === "OPEN" || b.status === "IN_PROGRESS") ??
    null;

  /**
   * Mode form bug (hanya relevan saat status Fail):
   * - "edit" → QA menambah detail/evidence pada bug aktif (default bila ada);
   * - "new"  → Retest Fail karena ISSUE BERBEDA: bug lama di-Resolve, bug baru dibuat.
   */
  const [bugMode, setBugMode] = useState<"new" | "edit">("new");
  /** Sekali QA memilih "buat bug baru", pilihan itu tidak ditimpa lagi. */
  const [userChoseNewBug, setUserChoseNewBug] = useState(false);
  const appliedBugRef = useRef<string | null>(null);

  useEffect(() => {
    if (userChoseNewBug) return;
    setBugMode(activeBug ? "edit" : "new");
  }, [activeBug, userChoseNewBug]);

  // Prefill judul & severity dari bug aktif (sekali per bug) supaya mode edit
  // langsung memperlihatkan isi bug yang sedang diperbarui.
  useEffect(() => {
    if (!activeBug) return;
    if (appliedBugRef.current === activeBug.id) return;
    appliedBugRef.current = activeBug.id;
    setBugTitle(activeBug.title);
    setBugSeverity(activeBug.severity ?? "MEDIUM");
  }, [activeBug]);

  /**
   * Split panel yang bisa di-resize: lebar kolom kiri dalam persen, dibatasi
   * SPLIT_MIN_PCT–SPLIT_MAX_PCT agar layout tetap proporsional.
   */
  const [splitPct, setSplitPct] = useState(58);
  const [dragging, setDragging] = useState(false);
  // Divider "aktif" = sedang di-hover atau di-fokus (keyboard).
  const [dividerActive, setDividerActive] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  // Handle panel Evidence (mode deferred): commit saat Simpan, reset saat Batal.
  const evidenceRef = useRef<AttachmentsPanelHandle>(null);

  // Pantau pergeseran mouse real-time selama drag; berhenti saat mouseup.
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const el = gridRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width) return;
      // Kurangi setengah lebar divider supaya panel tidak "melompat" saat
      // divider mulai di-grab (titik acuan = tengah divider).
      const pct = ((e.clientX - rect.left - SPLIT_DIVIDER_W / 2) / rect.width) * 100;
      setSplitPct(clampSplit(pct));
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  // Saat drag: kunci kursor & matikan seleksi teks supaya tidak ikut tersorot.
  useEffect(() => {
    if (!dragging) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging]);
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

  // Edit Bug dari parent (via Bug Detail Modal) -> patch `linkedBugs` in-place,
  // tanpa refetch, supaya daftar riwayat tidak menampilkan judul/severity basi.
  useEffect(() => {
    if (!bugPatch) return;
    setLinkedBugs((prev) =>
      prev.map((b) => (b.id === bugPatch.id ? { ...b, ...bugPatch.patch } : b))
    );
  }, [bugPatch]);

  /**
   * Label section standar modal: text-xs / bold / slate-500 / uppercase /
   * tracking-wider. Dipakai semua heading section agar hierarki label vs isi
   * konsisten.
   */
  const sectionLabel: React.CSSProperties = {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    margin: "0 0 0.4rem",
  };

  // Mode Fail -> form berubah jadi Bug Reporting Form.
  const isFail = status === "FAIL";
  /**
   * Sudah pernah disimpan ke DB? Dilihat dari DATA TERSIMPAN (status bukan
   * NOT_RUN, atau sudah ada actual result / notes) — bukan draft di form,
   * supaya label baru berubah setelah benar-benar tersimpan.
   */
  const hasSavedExecution =
    item.status !== "NOT_RUN" ||
    (item.actualResult ?? "").trim() !== "" ||
    (item.notes ?? "").trim() !== "";

  /**
   * Mode modal: TC yang SUDAH pernah dieksekusi dibuka dalam mode view
   * (read-only) lebih dulu — QA harus klik "Edit" untuk mengubahnya. TC yang
   * belum pernah dieksekusi langsung masuk mode edit.
   */
  const [isEditing, setIsEditing] = useState(!hasSavedExecution);
  /** Efektif editable: butuh izin edit (canEdit) DAN sedang di mode edit. */
  const editable = canEdit && isEditing;

  /**
   * Form pelaporan bug (mode Fail) hanya relevan saat MENGEDIT. Di mode view
   * cukup tampilkan hasil eksekusi sebagai teks polos tanpa input box.
   */
  const showBugForm = isFail && editable;

  /**
   * Teks polos hasil eksekusi untuk mode view — tanpa border/background/shadow.
   * Nilai kosong jatuh ke placeholder italic muted.
   */
  const renderResultText = (value: string | null | undefined, empty: string) =>
    (value ?? "").trim() ? (
      <p
        style={{
          margin: 0,
          fontSize: "0.75rem",
          color: "#1E293B",
          whiteSpace: "pre-wrap",
          lineHeight: 1.6,
        }}
      >
        {value}
      </p>
    ) : (
      <p style={{ margin: 0, fontSize: "0.75rem", color: "#94A3B8", fontStyle: "italic" }}>
        {empty}
      </p>
    );

  /** Salin Test Data ke clipboard (tombol ringkas di samping nilainya). */
  const copyTestData = async () => {
    const value = tc?.testData ?? "";
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setTestDataCopied(true);
      setTimeout(() => setTestDataCopied(false), 2000);
    } catch {
      // clipboard tidak tersedia — abaikan
    }
  };

  /** Tombol "Batal": buang draft form + evidence tertunda, kembali ke mode view. */
  const cancelEdit = () => {
    // Evidence yang belum di-commit dibuang; tidak ada API yang pernah dipanggil.
    evidenceRef.current?.reset();
    setStatus(item.status);
    setActualResult(item.actualResult ?? "");
    setNotes(item.notes ?? "");
    setBugTitle("");
    setBugSeverity("MEDIUM");
    setMsg(null);
    setIsEditing(false);
  };

  const bugLabelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.69rem",
    fontWeight: 700,
    color: "#64748B",
    textTransform: "none",
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

  /** Tab "✎ Edit Bug Aktif": isi form dari bug aktif supaya bisa diperbarui. */
  const useCurrentBug = () => {
    setUserChoseNewBug(false);
    setBugMode("edit");
    setMsg(null);
    if (activeBug) {
      appliedBugRef.current = activeBug.id;
      setBugTitle(activeBug.title);
      setBugSeverity(activeBug.severity ?? "MEDIUM");
    }
  };

  /**
   * Tab "+ Laporkan Bug Baru": kosongkan form. Bug lama di-Resolve otomatis
   * SAAT SIMPAN (bukan sekarang), jadi belum ada data yang berubah di sini.
   */
  const startNewBug = () => {
    setUserChoseNewBug(true);
    setBugMode("new");
    setMsg(null);
    setBugTitle("");
    setBugSeverity("MEDIUM");
    setActualResult("");
  };

  /**
   * Gaya tab pemilih mode bug — mengikuti aksen amber brand Soulparking:
   * aktif = bg amber-100 + teks amber-800 semibold + border amber-300,
   * non-aktif = netral (slate-500) dengan border tipis.
   */
  const bugTabStyle = (active: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3rem",
    padding: "0.35rem 0.6rem",
    borderRadius: 8,
    border: `1px solid ${active ? "#FCD34D" : "#E2E8F0"}`,
    background: active ? "#FEF3C7" : "#fff",
    color: active ? "#92400E" : "#64748B",
    fontSize: "0.7rem",
    fontWeight: active ? 600 : 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
    // Ring fokus senada brand (dipakai browser saat tab di-fokus keyboard).
    outlineColor: "#F59E0B",
    transition: "background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease",
  });

  const save = async () => {
    if (saving) return; // penjaga double-click
    setMsg(null);

    // Validasi khusus mode Fail: judul bug + langkah reproduksi wajib diisi.
    if (isFail) {
      if (!bugTitle.trim()) {
        setMsg("Judul bug wajib diisi.");
        return;
      }
      if (!actualResult.trim()) {
        setMsg("Actual result / langkah reproduksi wajib diisi.");
        return;
      }
    }

    setSaving(true);

    // Evidence (mode edit) baru diunggah/dihapus ke server saat Simpan diklik.
    // Kalau gagal, modal tetap terbuka supaya QA bisa mengulang.
    if (editable) {
      const ev = await evidenceRef.current?.commit();
      if (ev && !ev.ok) {
        setSaving(false);
        setMsg(ev.error ?? "Gagal menyimpan evidence.");
        return;
      }
    }

    const res = await onSave({
      status,
      actualResult,
      notes,
      // Mode Fail: "edit" memperbarui bug yang sudah ter-link, "new" membuat bug
      // BARU (dipakai saat retest gagal karena issue berbeda).
      bug: isFail
        ? {
            mode: bugMode === "edit" && activeBug ? "edit" : "new",
            id: bugMode === "edit" ? activeBug?.id : undefined,
            // Bug aktif yang di-Close otomatis saat bug baru disimpan.
            closeOldBugId: bugMode === "new" ? activeBug?.id : undefined,
            title: bugTitle.trim(),
            severity: bugSeverity,
          }
        : undefined,
    });
    if (res.error) {
      setSaving(false);
      setMsg(res.error);
      return;
    }
    // Sukses: tutup modal dengan animasi (data sudah dipatch ke daftar induk).
    setClosing(true);
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
        // Backdrop: fade in/out.
        opacity: shown ? 1 : 0,
        transition: "opacity 300ms ease-out",
      }}
      onClick={() => setClosing(true)}
    >
      <div
        ref={gridRef}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 1024,
          maxHeight: "85vh",
          display: "grid",
          // Tiga track: kolom kiri (persen, bisa di-resize) — divider — kanan.
          gridTemplateColumns: `${splitPct}% ${SPLIT_DIVIDER_W}px minmax(0, 1fr)`,
          gridTemplateRows: "minmax(0, 1fr)",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid var(--border)",
          overflow: "hidden",
          // Kotak modal: fade + scale + naik sedikit (translate-y-2 -> 0).
          opacity: shown ? 1 : 0,
          transform: shown ? "translateY(0) scale(1)" : "translateY(8px) scale(0.95)",
          transition: "opacity 300ms ease-out, transform 300ms ease-out",
          willChange: "opacity, transform",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tombol tutup — melayang di sudut kanan atas modal. */}
        <button
          type="button"
          aria-label="Tutup"
          onClick={() => setClosing(true)}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0.25rem",
            lineHeight: 1,
            border: "none",
            background: "transparent",
            color: "#64748B",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          <X size={14} />
        </button>

        {/* ===== KOLOM KIRI — info detail Test Case =====
            Berisi ID & judul, metadata, skenario, expected result, dan test
            steps. Lebarnya bisa diubah lewat divider di sebelah kanannya. */}
        <div
          style={{
            gridColumn: "1",
            minWidth: 0,
            minHeight: 0,
            overflowY: "auto",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* ID + Judul Test Case */}
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

          {/* Metadata */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "1rem",
              background: "rgba(248, 250, 252, 0.5)",
              border: "1px solid rgba(226, 232, 240, 0.8)",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            <div>
              <span style={{ display: "block", color: "#94A3B8", fontWeight: 500, fontSize: "0.6875rem", marginBottom: "0.25rem" }}>Priority</span>
              <span style={{ fontWeight: 600, color: "#1E293B", fontSize: "0.75rem" }}>{tc?.priority ?? "—"}</span>
            </div>
            <div>
              <span style={{ display: "block", color: "#94A3B8", fontWeight: 500, fontSize: "0.6875rem", marginBottom: "0.25rem" }}>Status</span>
              <span style={{ fontWeight: 600, color: "#1E293B", fontSize: "0.75rem" }}>{tc?.status ?? "—"}</span>
            </div>
            <div>
              <span style={{ display: "block", color: "#94A3B8", fontWeight: 500, fontSize: "0.6875rem", marginBottom: "0.25rem" }}>Author</span>
              <span style={{ fontWeight: 600, color: "#1E293B", fontSize: "0.75rem" }}>{tc?.createdBy?.name ?? "—"}</span>
            </div>
            <div>
              <span style={{ display: "block", color: "#94A3B8", fontWeight: 500, fontSize: "0.6875rem", marginBottom: "0.25rem" }}>Dibuat</span>
              <span style={{ fontWeight: 600, color: "#1E293B", fontSize: "0.75rem" }}>
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
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#1E293B", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {tc.scenario}
              </p>
            </div>
          )}

          {/* Precondition — ditampilkan setelah Deskripsi/Skenario. */}
          {tc?.precondition?.trim() && (
            <div>
              <h4 style={sectionLabel}>Precondition</h4>
              <ul
                style={{
                  margin: 0,
                  background: "rgba(254, 243, 199, 0.4)",
                  border: "1px solid rgba(252, 211, 77, 0.5)",
                  borderRadius: 8,
                  padding: "0.7rem 1rem 0.7rem 1.8rem",
                  fontSize: "0.75rem",
                  color: "#1E293B",
                  lineHeight: 1.6,
                }}
              >
                {tc.precondition
                  .split("\n")
                  // Buang bullet manual ("•", "-", "*") supaya tidak dobel
                  // dengan marker <li> bawaan browser.
                  .map((line) => line.trim().replace(/^[•\-*]\s*/, "").trim())
                  .filter(Boolean)
                  .map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
              </ul>
            </div>
          )}

          {/* Test Data — parameter data uji (key-value / list) apa adanya.
              Teks polos (light) + tombol salin ringkas, selaras dengan
              Deskripsi & Expected Result. */}
          {tc?.testData?.trim() && (
            <div>
              <h4 style={sectionLabel}>Test Data</h4>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                <p
                  style={{
                    margin: 0,
                    flex: 1,
                    minWidth: 0,
                    fontSize: "0.75rem",
                    color: "#1E293B",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.6,
                  }}
                >
                  {tc.testData}
                </p>
                <button
                  type="button"
                  onClick={() => void copyTestData()}
                  title={testDataCopied ? "Tersalin" : "Salin Test Data"}
                  aria-label="Salin Test Data"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    color: "#64748B",
                    cursor: "pointer",
                    lineHeight: 1,
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#0F172A")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#64748B")}
                >
                  {testDataCopied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          {/* Expected Result */}
          {tc?.expectedResult && (
            <div>
              <h4 style={sectionLabel}>Expected Result</h4>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#1E293B", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
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

        {/* ===== DIVIDER INTERAKTIF — drag kiri/kanan untuk ubah lebar kolom =====
            Area drag 8px dengan garis 2px di tengahnya; menyala amber saat
            hover/drag. Bisa juga digeser dengan tombol panah saat difokus. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Ubah lebar panel"
          aria-valuenow={Math.round(splitPct)}
          aria-valuemin={SPLIT_MIN_PCT}
          aria-valuemax={SPLIT_MAX_PCT}
          tabIndex={0}
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onMouseEnter={() => setDividerActive(true)}
          onMouseLeave={() => setDividerActive(false)}
          onFocus={() => setDividerActive(true)}
          onBlur={() => setDividerActive(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              setSplitPct((p) => clampSplit(p - 2));
            }
            if (e.key === "ArrowRight") {
              e.preventDefault();
              setSplitPct((p) => clampSplit(p + 2));
            }
          }}
          style={{
            gridColumn: "2",
            display: "flex",
            justifyContent: "center",
            cursor: "col-resize",
            userSelect: "none",
            touchAction: "none",
            outline: "none",
          }}
        >
          {/* Garis tipis indikator — amber saat hover/drag/fokus. */}
          <div
            aria-hidden="true"
            style={{
              width: 2,
              height: "100%",
              background: dragging || dividerActive ? "#FBBF24" : "#E2E8F0",
              transition: "background-color 0.15s ease",
            }}
          />
        </div>

        {/* ===== KOLOM KANAN — panel aksi eksekusi QA =====
            Latar tipis memisahkannya dari kolom info (batasnya kini divider
            interaktif). Judul & tombol status tetap di atas (tidak ikut
            scroll); isi form + tombol simpan berada di bawahnya. */}
        <div
          style={{
            gridColumn: "3",
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            // Disamakan dengan card metadata di kolom kiri (bg-slate-50/50).
            background: "rgba(248, 250, 252, 0.5)",
            borderLeft: "1px solid rgba(226, 232, 240, 0.8)",
          }}
        >
          {/* Judul panel eksekusi — tetap di atas, tidak ikut scroll. */}
          <div style={{ flexShrink: 0, padding: "1.25rem 1.25rem 0" }}>
            <h4
              style={{
                ...sectionLabel,
                fontSize: "1.125rem",
                fontWeight: 600,
                textTransform: "none",
                margin: "0 0 0.25rem",
              }}
            >
              Eksekusi
            </h4>

            {/* Catatan subtle: bug lama di-Resolve otomatis saat bug baru disimpan. */}
            {isFail && activeBug && bugMode === "new" && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 400,
                  color: "#64748B",
                  margin: "0 0 0.6rem",
                }}
              >
                Bug lama akan otomatis ditandai Closed saat bug baru disimpan.
              </div>
            )}

            {/* Garis pemisah tipis (inset) antara judul panel dan isi form. */}
            <div aria-hidden="true" style={{ flexShrink: 0, height: 1, background: "#E2E8F0" }} />
          </div>

          {/* Isi eksekusi — HANYA bagian ini yang scroll. Judul panel &
              tombol status di atasnya tetap di tempat (flexShrink: 0). */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: "0.9rem 1.25rem 1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.9rem",
            }}
          >
            {showBugForm ? (
              <>
                {/* Dua tab sederhana: perbarui bug aktif atau laporkan bug baru. */}
                {activeBug && (
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={useCurrentBug}
                      disabled={!editable}
                      style={bugTabStyle(bugMode === "edit")}
                    >
                      ✎ Edit Bug Aktif
                    </button>
                    <button
                      type="button"
                      onClick={startNewBug}
                      disabled={!editable}
                      style={bugTabStyle(bugMode === "new")}
                    >
                      + Laporkan Bug Baru
                    </button>
                  </div>
                )}

                <div>
                  <label style={bugLabelStyle}>
                    Bug Title <span style={{ color: "#E11D48" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={bugTitle}
                    onChange={(e) => setBugTitle(e.target.value)}
                    disabled={!editable}
                    placeholder="Ringkasan singkat isu/bug yang ditemukan..."
                    style={{ ...bugFieldStyle, height: 36 }}
                  />
                </div>

                <div>
                  <label style={bugLabelStyle}>Severity</label>
                  <Select
                    value={bugSeverity}
                    onChange={(e) => setBugSeverity(e.target.value)}
                    disabled={!editable}
                    ariaLabel="Severity bug"
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label style={bugLabelStyle}>
                    Environment{" "}
                    <span style={{ fontWeight: 500, color: "#9CA3AF" }}>(dari Test Run)</span>
                  </label>
                  <input
                    type="text"
                    value={environment ?? "—"}
                    readOnly
                    disabled
                    title="Environment mengikuti Test Run terkait."
                    style={{
                      ...bugFieldStyle,
                      height: 36,
                      background: "#F9FAFB",
                      color: "#6B7280",
                    }}
                  />
                </div>

                <div>
                  <label style={bugLabelStyle}>
                    Bug Detail <span style={{ color: "#E11D48" }}>*</span>
                  </label>
                  <ListTextarea
                    value={actualResult}
                    onChange={setActualResult}
                    disabled={!editable}
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
                  <label style={{ ...sectionLabel, display: "block" }}>
                    Actual Result
                  </label>
                  {editable ? (
                    <ListTextarea
                      value={actualResult}
                      onChange={setActualResult}
                      rows={2}
                      ariaLabel="Actual Result"
                      placeholder="Tulis hasil aktual eksekusi..."
                      style={execFieldStyle}
                    />
                  ) : (
                    /* Mode view: teks polos tanpa border/background. */
                    renderResultText(actualResult, "Belum ada hasil aktual.")
                  )}
                </div>

                <div>
                  <label style={{ ...sectionLabel, display: "block" }}>
                    Notes
                  </label>
                  {editable ? (
                    <ListTextarea
                      value={notes}
                      onChange={setNotes}
                      rows={2}
                      ariaLabel="Notes"
                      placeholder="Catatan tambahan..."
                      style={execFieldStyle}
                    />
                  ) : (
                    renderResultText(notes, "Tidak ada catatan.")
                  )}
                </div>
              </>
            )}

            {/* Evidence: header inline (label kiri + tombol kanan), lalu preview
                file yang diunggah. */}
            <div style={{ marginTop: "0.9rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  marginBottom: "0.5rem",
                }}
              >
                <span style={{ ...sectionLabel, margin: 0, fontWeight: 600 }}>Evidence</span>
                {editable && (
                  <button
                    type="button"
                    onClick={() => evidenceRef.current?.pick()}
                    title="Tambah file evidence"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: 0,
                      border: "none",
                      background: "transparent",
                      color: "#D97706",
                      fontSize: "0.76rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Paperclip size={12} /> Tambah File
                  </button>
                )}
              </div>
              <AttachmentsPanel
                owner={{ testRunResultId: item.id }}
                attachments={item.attachments ?? []}
                canEdit={editable}
                onChange={onAttachmentsChange}
                handleRef={evidenceRef}
                deferred
                compact
                plain
                hideTrigger
              />
            </div>

            {/* Riwayat bug Test Case ini — termasuk yang sudah resolved/closed,
                supaya jejak bug tidak hilang setelah TC-nya jadi Pass.
                Berbentuk accordion (default tertutup) agar hemat ruang. */}
            <div style={{ marginTop: "0.9rem" }}>
              <button
                type="button"
                aria-expanded={bugHistoryOpen}
                onClick={() => setBugHistoryOpen((v) => !v)}
                title={bugHistoryOpen ? "Tutup riwayat bug" : "Buka riwayat bug"}
                style={{
                  ...sectionLabel,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  width: "100%",
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                <ChevronDown
                  size={13}
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    transform: bugHistoryOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 300ms ease-in-out",
                  }}
                />
                Bug History{!bugsLoading && linkedBugs.length > 0 ? ` (${linkedBugs.length})` : ""}
              </button>

              {/* Buka/tutup pakai trik `grid-template-rows` 0fr ↔ 1fr supaya
                  halus — konten tetap ter-mount, tidak muncul/hilang patah. */}
              <div
                style={{
                  display: "grid",
                  gridTemplateRows: bugHistoryOpen ? "1fr" : "0fr",
                  opacity: bugHistoryOpen ? 1 : 0,
                  transition: "grid-template-rows 300ms ease-in-out, opacity 300ms ease-in-out",
                }}
              >
                <div
                  style={{
                    overflow: "hidden",
                    minHeight: 0,
                    paddingTop: bugHistoryOpen ? "0.5rem" : 0,
                    transition: "padding-top 300ms ease-in-out",
                  }}
                >
                  {bugsLoading ? (
                    <div style={{ fontSize: "0.75rem", color: "#94A3B8" }}>
                      Memuat riwayat bug…
                    </div>
                  ) : linkedBugs.length === 0 ? (
                    <div style={{ fontSize: "0.75rem", color: "#94A3B8", fontStyle: "italic" }}>
                      Belum ada bug yang pernah dilaporkan untuk test case ini.
                    </div>
                  ) : (
                    /* List polos: SATU baris per bug — ikon + judul di kiri, badge
                       status di kanan — tanpa kotak pembungkus; batas tinggi +
                       scroll supaya tidak memanjang. */
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        maxHeight: "12rem",
                        overflowY: "auto",
                      }}
                    >
                      {linkedBugs.map((b, idx) => {
                        const st = BUG_STATUS_BADGE[b.status];
                        // Metadata tetap dibawa sebagai tooltip judul — baris
                        // metadatanya sendiri sudah dihapus agar tetap 1 baris.
                        const meta = [
                          new Date(b.createdAt).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          }),
                          b.resolvedAt
                            ? `Selesai ${new Date(b.resolvedAt).toLocaleDateString("id-ID", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}`
                            : "",
                          b.run ? b.run.name : "",
                        ]
                          .filter(Boolean)
                          .join(" · ");

                        return (
                          <div
                            key={b.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              // Baris polos: tanpa kotak/border card — hanya garis
                              // pemisah halus antar baris (kalau lebih dari satu).
                              padding: "0.4rem 0",
                              borderBottom:
                                idx < linkedBugs.length - 1 ? "1px solid #F1F5F9" : "none",
                            }}
                          >
                            {/* Ikon bug + judulnya. Judul tetap jadi pintu
                                masuk ke Bug Detail (ID-nya sudah dihapus). */}
                            <Bug size={12} style={{ flexShrink: 0, color: "#DC2626" }} />
                            <button
                              type="button"
                              onClick={() => onOpenBugDetail?.(b.id)}
                              title={meta ? `${b.title} — ${meta}` : b.title}
                              style={{
                                flex: 1,
                                minWidth: 0,
                                border: "none",
                                background: "none",
                                padding: 0,
                                textAlign: "left",
                                fontSize: "0.75rem",
                                color: "#334155",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                cursor: onOpenBugDetail ? "pointer" : "default",
                              }}
                              onMouseEnter={(e) => {
                                if (onOpenBugDetail)
                                  e.currentTarget.style.textDecoration = "underline";
                              }}
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.textDecoration = "none")
                              }
                            >
                              {b.title}
                            </button>

                            <span
                              style={{
                                flexShrink: 0,
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
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Blok bawah panel: pilihan status eksekusi + tombol Simpan, diam di
              dasar panel (bukan ikut scroll). Blok ini selalu tampil supaya
              status tetap terlihat saat read-only; tombol Simpan hanya dirender
              saat punya hak edit. Tanpa garis pemisah di atas tombol simpan. */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              padding: "0.9rem 1.25rem",
              background: "#fff",
            }}
          >
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              {STATUSES.map((s) => {
                const Icon = s.icon;
                const isActive = status === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    disabled={!editable}
                    aria-pressed={isActive}
                    title={isActive ? "Klik lagi untuk membatalkan (Untested)" : `Tandai ${s.label}`}
                    onClick={() => setStatus(isActive ? "NOT_RUN" : s.value)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      padding: "0.375rem 0.5rem",
                      borderRadius: 6,
                      // Tidak aktif: border tipis senada (lembut). Aktif: solid penuh.
                      border: `1px solid ${isActive ? s.color : `${s.color}4D`}`,
                      background: isActive ? s.activeBg : s.bg,
                      color: isActive ? "#fff" : s.color,
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                      // Mode view: tombol status ikut diredupkan agar state
                      // read-only terbaca (bukan hanya tidak bisa diklik).
                      opacity: editable ? 1 : 0.6,
                      cursor: editable ? "pointer" : "not-allowed",
                      transition: "background-color 0.15s ease, color 0.15s ease",
                    }}
                  >
                    <Icon size={14} /> {s.label}
                  </button>
                );
              })}
            </div>

            {canEdit && (
              <>
                {/* Garis pembatas tipis non-full-width (inset dari padding blok)
                    di atas tombol aksi. */}
                <div aria-hidden="true" style={{ height: 1, background: "#E2E8F0" }} />

                {editable && msg && (
                  <div style={{ fontSize: "0.75rem", color: "#B91C1C" }}>{msg}</div>
                )}

                {/* Mode view: satu tombol "Edit". Mode edit: "Batal" + simpan.
                    Tombol hug-contents, rata kanan. */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  {!editable ? (
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      style={{
                        padding: "0.5rem 1.25rem",
                        border: "none",
                        borderRadius: 6,
                        background: "#FFC107",
                        color: "#0F172A",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "background-color 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#E0A800")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC107")}
                    >
                      Edit
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={saving}
                        style={{
                          padding: "0.5rem 1rem",
                          border: "1px solid #E2E8F0",
                          borderRadius: 6,
                          background: "#F8FAFC",
                          color: "#334155",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: saving ? "not-allowed" : "pointer",
                          transition: "background-color 0.15s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                      >
                        Batal
                      </button>
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
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: saving ? "wait" : "pointer",
                          transition: "background-color 0.15s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = isFail ? "#BE123C" : "#E0A800")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = isFail ? "#E11D48" : "#FFC107")}
                      >
                        {saving
                          ? "Menyimpan..."
                          : isFail && bugMode === "new"
                            ? "Simpan Bug Baru"
                            : "Simpan Eksekusi"}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
