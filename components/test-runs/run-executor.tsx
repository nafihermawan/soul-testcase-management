"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRefresh } from "@/lib/client/refresh-context";
import { AlertTriangle, Bug, Check, CheckCircle2, ChevronDown, CircleSlash, Copy, Cpu, ExternalLink, FolderOpen, Lock, MinusCircle, Monitor, Paperclip, Pencil, Plus, Server, Smartphone, X, XCircle } from "lucide-react";
import { completeRun, completeRunWithSkip, deleteRun, updateRunResult } from "@/lib/actions/test-runs";
import { createBug, updateBug, updateBugStatus } from "@/lib/actions/automation-bugs";
import { ConfirmDialog, Spinner, Toast, useToast } from "@/components/ui/feedback";
import { entityCode, formatCase, runCodeOf } from "@/lib/format";
import { SKIP_REASON_OPTIONS, SKIP_REASON_OTHER } from "@/lib/qa-metrics";
import {
  AttachmentsPanel,
  type AttachmentsPanelHandle,
} from "@/components/attachments/attachments-panel";
import { ListTextarea } from "@/components/ui/list-textarea";
import { BulletText } from "@/components/ui/bullet-text";
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
  // line-height eksplisit supaya tinggi pill seimbang di semua konteks
  // (badge menempel pojok kanan kartu, bukan melebar mengikuti baris).
  lineHeight: 1.35,
  fontWeight: badge.weight,
  whiteSpace: "nowrap",
});

/** Warna status pada BARIS test case: dot + teks (tanpa pill). */
const ROW_STATUS: Record<RunResultItem["status"], { label: string; dot: string; text: string }> = {
  PASS: { label: "Passed", dot: "#15803D", text: "#15803D" },
  FAIL: { label: "Failed", dot: "#DC2626", text: "#B91C1C" },
  BLOCKED: { label: "Blocked", dot: "#D97706", text: "#B45309" },
  SKIPPED: { label: "Skipped", dot: "#7E22CE", text: "#7E22CE" },
  NOT_RUN: { label: "Untested", dot: "#CBD5E1", text: "#64748B" },
};

/** Opsi segmented control hasil eksekusi di panel Eksekusi. */
const RESULT_OPTIONS: {
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

const FONT_MONO = '"Geist Mono", ui-monospace, monospace';
const FONT_SANS = '"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

/** Tombol sekunder (Edit / Export Report). */
const BTN_SECONDARY: React.CSSProperties = {
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
const BTN_PRIMARY: React.CSSProperties = {
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
function Sq({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }}
    />
  );
}

/** Pemisah vertikal 1×14 pada baris ringkasan. */
function VSep() {
  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-block", width: 1, height: 14, background: "#E2E8F0", flexShrink: 0 }}
    />
  );
}

/** Angka dengan font Geist Mono 600. */
function MNum({ children, color }: { children: React.ReactNode; color: string }) {
  return <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color }}>{children}</span>;
}

/**
 * Badge status bug untuk section riwayat bug di modal eksekusi — sekaligus
 * trigger dropdown untuk mengubah statusnya langsung. Palet mengikuti status:
 * Open = rose, In Progress = amber, Closed/Resolved = emerald. Istilah "selesai"
 * memakai CLOSED untuk keduanya (RESOLVED & CLOSED) supaya tidak ada dua
 * sebutan berbeda untuk arti yang sama.
 */
const BUG_STATUS_BADGE: Record<BugStatus, { label: string; bg: string; color: string; border: string }> = {
  OPEN: { label: "Open", bg: "#FFF1F2", color: "#E11D48", border: "#FECDD3" },
  IN_PROGRESS: { label: "In Progress", bg: "#FFFBEB", color: "#D97706", border: "#FDE68A" },
  RESOLVED: { label: "Closed", bg: "#ECFDF5", color: "#059669", border: "#A7F3D0" },
  CLOSED: { label: "Closed", bg: "#ECFDF5", color: "#059669", border: "#A7F3D0" },
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

  /**
   * Ikon per platform — label platform tidak boleh memakai ikon yang salah
   * (ikon HP untuk suite Hardware, dsb). Nilai CSV multi-platform (mis.
   * "WEB,MOBILE") memakai ikon platform PERTAMANYA.
   */
  const PLATFORM_ICONS: Record<string, typeof Smartphone> = {
    WEB: Monitor,
    MOBILE: Smartphone,
    HARDWARE: Cpu,
    API: Server,
  };
  const platformIcon = (v: string | null | undefined): typeof Smartphone =>
    PLATFORM_ICONS[(v ?? "").split(",")[0].trim().toUpperCase()] ?? Smartphone;

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
    <div
      style={{
        fontFamily: FONT_SANS,
        color: "#0F172A",
        background: "#fff",
        border: "1px solid #E3E7EE",
        borderRadius: 18,
        overflow: "hidden",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
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

      {/* Header — padding 22px, baris demi baris gap 16px. */}
      <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16, flexShrink: 0 }}>
        {/* Row 1: judul | aksi */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "#0F172A",
              margin: 0,
              lineHeight: 1.2,
              minWidth: 0,
              // Kata panjang tanpa spasi pun tetap dipatahkan, tidak melebar.
              overflowWrap: "break-word",
            }}
          >
            {runName}
          </h1>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {!isCompleted && canEdit && (
              <button
                type="button"
                className="btn-radius-10"
                onClick={() => setEditOpen(true)}
                title="Edit run ini"
                style={BTN_SECONDARY}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              >
                <Pencil size={15} aria-hidden="true" /> Edit
              </button>
            )}
            {!isCompleted && canEdit ? (
              <button
                type="button"
                className="btn-radius-10"
                onClick={handleCompleteClick}
                disabled={completing}
                style={{ ...BTN_PRIMARY, cursor: completing ? "wait" : "pointer" }}
                onMouseEnter={(e) => {
                  if (!completing) e.currentTarget.style.background = "#F0B53D";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#FFC348";
                }}
              >
                <Check size={16} strokeWidth={2.4} aria-hidden="true" />
                {completing ? "Menyelesaikan..." : "Complete Run"}
              </button>
            ) : (
              <>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#15803D",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{ width: 7, height: 7, borderRadius: "50%", background: "#15803D", flexShrink: 0 }}
                  />
                  Run Completed
                </span>
                <button
                  type="button"
                  className="btn-radius-10"
                  onClick={() => setReportOpen(true)}
                  style={BTN_SECONDARY}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  Export Report <ChevronDown size={14} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Row 2: ringkasan hasil | toggle Detail */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", fontSize: 13, color: "#475569" }}>
            <span>
              Total <MNum color="#0F172A">{items.length}</MNum> TC
            </span>
            <VSep />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Sq color="#15803D" /> Passed <MNum color="#15803D">{passed}</MNum>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Sq color="#DC2626" /> Failed <MNum color="#B91C1C">{failed}</MNum>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Sq color="#CBD5E1" /> Untested <MNum color="#334155">{untested}</MNum>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setMetaOpen((v) => !v)}
            aria-expanded={metaOpen}
            title={metaOpen ? "Tutup rincian" : "Lihat rincian"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              height: 30,
              padding: 0,
              border: "none",
              background: "transparent",
              color: "#64748B",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#1E293B")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#64748B")}
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

        {/* Collapsible halus: grid-rows 0fr <-> 1fr */}
        <div
          style={{
            display: "grid",
            transition:
              "grid-template-rows 0.3s ease-in-out, opacity 0.3s ease-in-out, padding-top 0.3s ease-in-out, border-top 0.3s ease-in-out, margin-top 0.3s ease-in-out",
            gridTemplateRows: metaOpen ? "1fr" : "0fr",
            opacity: metaOpen ? 1 : 0,
            marginTop: metaOpen ? 0 : -16,
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

      {/* Inset divider (bukan full width). */}
      <div style={{ margin: "0 22px", height: 1, background: "#E8ECF1", flexShrink: 0 }} />

      {/* Daftar suite — mengisi sisa tinggi card & scroll sendiri. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: "20px 22px 24px",
        }}
      >
      {suiteStats.length === 0 && (
        <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Belum ada test case dalam run ini.
        </div>
      )}
      {suiteStats.map((s) => {
        const open = openSuites[s.key] ?? true;
        const PlatformIcon = platformIcon(s.platform);
        return (
          <div
            key={s.key}
            style={{
              border: "1px solid #E3E7EE",
              borderRadius: 14,
              overflow: "hidden",
              // 8px ruang kosong di dasar box.
              paddingBottom: 8,
            }}
          >
            {/* Suite header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "8px 12px 8px 10px",
                background: "#F8FAFC",
                borderBottom: `1px solid ${open ? "#EEF1F5" : "transparent"}`,
                transition: "border-color 300ms ease-in-out",
              }}
            >
              <button
                type="button"
                onClick={() => setOpenSuites((prev) => ({ ...prev, [s.key]: !open }))}
                aria-expanded={open}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  minHeight: 44,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  minWidth: 0,
                }}
              >
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  style={{
                    color: "#64748B",
                    flexShrink: 0,
                    transform: open ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 300ms ease-in-out",
                  }}
                />
                <span style={{ fontSize: 16, fontWeight: 600, color: "#0F172A" }}>{s.name}</span>
                <span style={{ fontSize: 13, color: "#64748B", whiteSpace: "nowrap" }}>{s.projectName}</span>
              </button>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  paddingRight: 6,
                  fontSize: 13,
                  color: "#475569",
                }}
              >
                {s.platform && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                    <PlatformIcon size={14} aria-hidden="true" /> {platformLabel(s.platform)}
                  </span>
                )}
                {s.platform && <VSep />}
                <span style={{ whiteSpace: "nowrap" }}>
                  <MNum color="#0F172A">{s.items.length}</MNum> TC
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
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {groupItemsBySection(s.items).map((sec) => {
                    const secOpen = !collapsedSections[sec.key];
                    return (
                      <div key={sec.key}>
                        {/* Header Section — tanpa background; toggle via tombol chevron. */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "14px 18px 8px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSection(sec.key)}
                            aria-expanded={secOpen}
                            aria-label={`${sec.name} — ${sec.items.length} test case`}
                            style={{
                              width: 24,
                              height: 24,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: 0,
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              flexShrink: 0,
                            }}
                          >
                            <ChevronDown
                              size={14}
                              aria-hidden="true"
                              style={{
                                color: "#94A3B8",
                                transform: secOpen ? "rotate(0deg)" : "rotate(-90deg)",
                                transition: "transform 200ms ease-in-out",
                              }}
                            />
                          </button>
                          <FolderOpen size={15} aria-hidden="true" style={{ color: "#64748B", flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{sec.name}</span>
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

      </div>

      {/* Modal: Detail & Execution */}
      {modalItem && (
        <ExecutionModal
          item={modalItem}
          canEdit={canEdit}
          environment={environment ?? null}
          onClose={() => setModalItem(null)}
          onOpenBugDetail={setBugDetailId}
          /**
           * Bug ditutup dari Bug History → aksi server membalik hasil FAIL yang
           * tertaut jadi PASS, jadi cermin lokal (kartu + penghitung) ikut
           * di-patch di tempat — tanpa refetch halaman.
           */
          onAutoPass={() => patchResult(modalItem.id, { status: "PASS" })}
          onAttachmentsChange={(list) => patchResult(modalItem.id, { attachments: list })}
          bugPatch={bugPatch}
          onSave={async (data) => {
            const res = await updateRunResult(modalItem.id, {
              status: data.status,
              actualResult: data.actualResult,
              notes: data.notes,
              skipReason: data.skipReason,
              skipReasonNote: data.skipReasonNote,
            });
            if (res.error) return res;

            // Patch cermin lokal (termasuk `groups` yang dirender kartunya).
            patchResult(modalItem.id, {
              status: data.status,
              actualResult: data.actualResult ?? null,
              notes: data.notes ?? null,
              // Server mengosongkan alasan/keterangan untuk status non-SKIPPED — samakan.
              skipReason:
                data.status === "SKIPPED" ? data.skipReason?.trim() || null : null,
              skipReasonNote:
                data.status === "SKIPPED" && data.skipReason?.trim() === SKIP_REASON_OTHER
                  ? data.skipReasonNote?.trim() || null
                  : null,
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
  const st = ROW_STATUS[item.status];
  const evidenceCount = item.attachments?.length ?? 0;
  /** Actual result ditampilkan saat eksekusi gagal atau terblokir. */
  const showActualResult =
    (item.status === "FAIL" || item.status === "BLOCKED") && !!item.actualResult;
  /** Tautan "Buat Bug" muncul saat FAIL, belum ada bug, run masih aktif. */
  const canCreateBug = attachedBugs.length === 0 && item.status === "FAIL" && !isCompleted && canEdit;

  /** Link bug polos (ikon + ID) — tanpa underline, hover menggelap. */
  const bugLinkStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: 0,
    border: "none",
    background: "transparent",
    color: "#B91C1C",
    fontFamily: FONT_MONO,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const renderBugLinks = () => (
    <>
      {attachedBugs.map((b) => (
        <button
          key={b.id}
          type="button"
          title="Buka detail bug"
          aria-label={`Buka bug ${entityCode("BUG", b.id)}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenBugDetail(b.id);
          }}
          style={bugLinkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#7F1D1D")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#B91C1C")}
        >
          <Bug size={14} aria-hidden="true" /> {entityCode("BUG", b.id)}
        </button>
      ))}
      {canCreateBug && (
        <button
          type="button"
          title="Buat bug dari hasil eksekusi ini"
          onClick={(e) => {
            e.stopPropagation();
            onOpenBug();
          }}
          style={bugLinkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#7F1D1D")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#B91C1C")}
        >
          <Bug size={14} aria-hidden="true" /> Buat Bug
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
        margin: "0 18px 0 52px",
        padding: "12px 0",
        borderBottom: "1px solid #F1F4F8",
        background: "transparent",
        cursor: "pointer",
        transition: "background-color 0.15s ease",
      }}
    >
      {/* Satu baris: TC ID · judul · lampiran · status */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span
          style={{
            width: 118,
            flexShrink: 0,
            fontFamily: FONT_MONO,
            fontSize: 12,
            fontWeight: 500,
            color: "#64748B",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.testCase?.tcId ?? "—"}
        </span>

        <span
          title={item.titleSnapshot}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 14,
            fontWeight: 500,
            color: "#0F172A",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.titleSnapshot}
        </span>

        {evidenceCount > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail();
            }}
            title={`${evidenceCount} lampiran`}
            aria-label={`${evidenceCount} lampiran`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: 0,
              border: "none",
              background: "transparent",
              color: "#64748B",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Paperclip size={14} aria-hidden="true" />
            {evidenceCount}
          </button>
        )}

        <span
          style={{
            width: 96,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            fontSize: 13,
            fontWeight: 600,
            color: st.text,
            whiteSpace: "nowrap",
          }}
        >
          <span
            aria-hidden="true"
            style={{ width: 7, height: 7, borderRadius: "50%", background: st.dot, flexShrink: 0 }}
          />
          {st.label}
        </span>
      </div>

      {/* Box Actual Result — hanya saat Failed/Blocked; tepi kiri rata dengan judul. */}
      {showActualResult && (
        <div
          style={{
            margin: "10px 0 2px 132px",
            padding: "10px 14px",
            background: "#FFFBFB",
            border: "1px solid #FBE1E1",
            borderRadius: 10,
            display: "flex",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#991B1B" }}>Actual Result</span>
            <span style={{ fontSize: 13, lineHeight: 1.55, color: "#334155", whiteSpace: "pre-wrap" }}>
              {item.actualResult}
            </span>
          </div>
          {(attachedBugs.length > 0 || canCreateBug) && (
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {renderBugLinks()}
            </div>
          )}
        </div>
      )}

      {/* Kalau box Actual Result tidak tampil, link bug tetap muncul. */}
      {!showActualResult && (attachedBugs.length > 0 || canCreateBug) && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
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
              className="thin-scrollbar"
              style={{
                maxHeight: 220,
                overflowY: "auto",
                padding: "0.75rem",
                // Ruang untuk scrollbar supaya tidak menempel ke tepi kartu.
                paddingRight: 12,
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
                      {/* ID di kiri, badge status menempel di pojok kanan ATAS
                          walau judulnya panjang/berbaris. */}
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
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
                      {/* Actual Result & Notes: label di barisnya sendiri, isinya
                          dirender sebagai paragraf/daftar berpoin (satu baris per
                          poin) supaya tidak menumpuk jadi paragraf panjang. */}
                      {(it.actualResult ?? "").trim() !== "" && (
                        <div style={{ marginTop: "0.35rem" }}>
                          <span
                            style={{
                              display: "block",
                              marginBottom: 2,
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              color: "#64748B",
                            }}
                          >
                            Actual Result
                          </span>
                          <BulletText
                            text={it.actualResult as string}
                            itemStyle={{ fontSize: "0.74rem", lineHeight: 1.55, color: "#475569" }}
                          />
                        </div>
                      )}
                      {(it.notes ?? "").trim() !== "" && (
                        <div style={{ marginTop: "0.3rem" }}>
                          <span
                            style={{
                              display: "block",
                              marginBottom: 2,
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              color: "#64748B",
                            }}
                          >
                            Notes
                          </span>
                          <BulletText
                            text={it.notes as string}
                            itemStyle={{ fontSize: "0.74rem", lineHeight: 1.55, color: "#475569" }}
                          />
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
  onOpenBugDetail,
  onAutoPass,
  onAttachmentsChange,
  bugPatch,
  onSave,
}: {
  item: RunResultItem;
  canEdit: boolean;
  /** Environment run — read-only, ditampilkan di form bug mode Fail. */
  environment: string | null;
  onClose: () => void;
  /** Buka Bug Detail Modal dari daftar riwayat bug TC ini. */
  onOpenBugDetail?: (bugId: string) => void;
  /**
   * Bug ditutup dari Bug History → hasil eksekusi ini otomatis PASS. Parent
   * memakai ini untuk ikut memperbarui kartu/daftar lokalnya tanpa refetch.
   */
  onAutoPass?: () => void;
  /** Teruskan daftar attachment terbaru ke parent (update in-place, tanpa refetch). */
  onAttachmentsChange?: (list: AttachmentItem[]) => void;
  /** Patch bug hasil Edit Bug dari parent — dipakai untuk update `linkedBugs` in-place. */
  bugPatch?: { id: string; patch: BugEditableFields } | null;
  onSave: (data: {
    status: RunResultItem["status"];
    actualResult?: string;
    notes?: string;
    /** Diisi hanya saat status SKIPPED. */
    skipReason?: string;
    /** Keterangan bebas, diisi hanya saat alasannya "Lainnya". */
    skipReasonNote?: string;
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
  /** Alasan wajib saat status SKIPPED (lihat SKIP_REASON_OPTIONS). */
  const [skippedReason, setSkippedReason] = useState(item.skipReason ?? "");
  /** Keterangan bebas — hanya dipakai saat alasannya "Lainnya". */
  const [skippedReasonNote, setSkippedReasonNote] = useState(item.skipReasonNote ?? "");
  const [actualResult, setActualResult] = useState(item.actualResult ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  // Judul bug default KOSONG — diisi QA, atau ter-prefill dari bug aktif saat
  // mode "edit" (lihat effect activeBug di bawah).
  const [bugTitle, setBugTitle] = useState("");
  const [bugSeverity, setBugSeverity] = useState("MEDIUM");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  /**
   * Jumlah file evidence yang masih tertahan di klien (mode deferred, belum
   * di-commit). Dipakai bersama attachment tersimpan untuk menilai "evidence
   * sudah diunggah" pada validasi tombol Simpan.
   */
  const [pendingEvidence, setPendingEvidence] = useState(0);

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
  // Toast + guard khusus modal ini (ubah status bug langsung dari Bug History).
  const { toast, showToast, dismissToast } = useToast();
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);

  /**
   * Ubah status bug langsung dari badge di Bug History. Daftarnya dicerminkan ke
   * state lokal dan di-patch IN-PLACE setelah sukses (tanpa refetch halaman),
   * jadi warna & label badge langsung ikut berubah.
   */
  const changeBugStatus = async (bugId: string, status: BugStatus) => {
    if (statusPendingId) return;
    setStatusPendingId(bugId);
    const res = await updateBugStatus(bugId, status);
    setStatusPendingId(null);
    if (res?.error) {
      showToast(res.error, "error");
      return;
    }
    const isDone = status === "CLOSED" || status === "RESOLVED";
    setLinkedBugs((prev) =>
      prev.map((b) =>
        b.id === bugId
          ? { ...b, status, resolvedAt: isDone ? new Date().toISOString() : null }
          : b
      )
    );
    /**
     * Bug ditutup = defect sudah diperbaiki, jadi eksekusi ini ikut PASS —
     * disetel LANGSUNG di state modal (tombol hasil jadi Pass aktif) tanpa
     * refetch halaman. "Actual Result" lama dibuang dari state supaya artefak
     * hasil Fail yang sudah diperbaiki tidak ikut tersimpan lagi; aksi server
     * sendiri juga sudah membalik hasil FAIL yang tertaut jadi PASS.
     */
    if (isDone) {
      setStatus("PASS");
      setActualResult("");
      onAutoPass?.();
    }
    showToast(
      isDone
        ? `Status bug diubah ke ${BUG_STATUS_BADGE[status].label} — status eksekusi diset ke Pass.`
        : `Status bug berhasil diubah ke ${BUG_STATUS_BADGE[status].label}.`,
      "success"
    );
  };

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
   * "Actual Result" hanya dipakai hasil Fail/Blocked (dipakai untuk menentukan
   * apakah nilainya ikut disimpan).
   */
  const usesActualResult = status === "FAIL" || status === "BLOCKED";

  /**
   * Section "Evidence" tampil saat penguji memilih Pass/Fail/Blocked, dan
   * disembunyikan saat Skipped. Saat modal baru dibuka (belum ada status yang
   * dipilih) section ini juga belum tampil — muncul begitu tombol Pass/Fail/
   * Blocked diklik.
   */
  const showsEvidence = status === "PASS" || usesActualResult;

  /**
   * Evidence hanya WAJIB untuk Fail/Blocked. Di Pass, evidence opsional — tidak
   * pernah menghambat aktifnya tombol Simpan.
   */
  const requiresEvidence = usesActualResult;

  /**
   * Section "Actual Result" hanya relevan untuk hasil Fail/Blocked — artefak
   * hasil lama tidak boleh muncul lagi setelah eksekusi berpindah ke Pass
   * (mis. karena bug-nya sudah ditutup).
   */
  const showActualResultBlock = usesActualResult && (actualResult ?? "").trim() !== "";

  /** Evidence "sudah diunggah" = ada file tersimpan atau file tertunda di klien. */
  const hasEvidence = (item.attachments?.length ?? 0) + pendingEvidence > 0;

  // Section Evidence yang disembunyikan melepas panel-nya (file tertunda ikut
  // dibuang), jadi penghitungnya ikut di-nol-kan supaya tidak ada angka basi.
  useEffect(() => {
    if (!showsEvidence) setPendingEvidence(0);
  }, [showsEvidence]);

  /**
   * Tombol "Simpan Eksekusi" DISABLED sampai penguji memilih status
   * (selain NOT_RUN). Aturan tambahan per status:
   * - PASS         : aktif langsung (evidence opsional);
   * - SKIPPED      : wajib memilih alasan — dan, kalau alasannya "Lainnya",
   *                  wajib mengisi keterangannya;
   * - FAIL/BLOCKED : wajib ada evidence, atau sudah ada catatan.
   */
  const saveBlocked =
    status === "NOT_RUN" ||
    (status === "SKIPPED" &&
      (skippedReason === "" ||
        (skippedReason === SKIP_REASON_OTHER && skippedReasonNote.trim() === ""))) ||
    (requiresEvidence && !hasEvidence && (notes ?? "").trim() === "");

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
    setSkippedReason(item.skipReason ?? "");
    setSkippedReasonNote(item.skipReasonNote ?? "");
    setActualResult(item.actualResult ?? "");
    setNotes(item.notes ?? "");
    setBugTitle("");
    setBugSeverity("MEDIUM");
    setMsg(null);
    setIsEditing(false);
  };

  /** Kotak warna severity (8×8) untuk field Severity. */
  const sevColor = (sev: string): string =>
    sev === "CRITICAL" ? "#B91C1C" : sev === "HIGH" ? "#EA580C" : sev === "MEDIUM" ? "#CA8A04" : "#94A3B8";

  /** Blok Bug History (accordion) — satu kotak bordered, dipakai kedua state. */
  const renderBugHistory = () => (
    <div style={{ border: "1px solid #E3E7EE", borderRadius: 12, overflow: "hidden" }}>
      <button
        type="button"
        aria-expanded={bugHistoryOpen}
        onClick={() => setBugHistoryOpen((v) => !v)}
        style={{
          padding: "12px 14px",
          border: "none",
          background: "#FFFFFF",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          width: "100%",
          cursor: "pointer",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Bug size={15} aria-hidden="true" style={{ color: "#B91C1C" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Bug History</span>
          {!bugsLoading && linkedBugs.length > 0 && (
            <span style={{ fontFamily: FONT_MONO, fontWeight: 600, color: "#64748B" }}>
              {linkedBugs.length}
            </span>
          )}
        </span>
        <ChevronDown
          size={15}
          aria-hidden="true"
          style={{
            color: "#64748B",
            transform: bugHistoryOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 300ms ease-in-out",
          }}
        />
      </button>

      {bugHistoryOpen && (
        <div style={{ borderTop: "1px solid #EEF1F5" }}>
          {bugsLoading ? (
            <div style={{ padding: "12px 14px", fontSize: 13, color: "#94A3B8" }}>
              Memuat riwayat bug…
            </div>
          ) : linkedBugs.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 13, color: "#94A3B8" }}>
              Belum ada bug yang pernah dilaporkan untuk test case ini.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {linkedBugs.map((b, idx) => {
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
                      gap: 12,
                      padding: "12px 14px",
                      borderBottom: idx < linkedBugs.length - 1 ? "1px solid #F1F4F8" : "none",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenBugDetail?.(b.id)}
                      title={meta ? `${b.title} — ${meta}` : b.title}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        border: "none",
                        background: "none",
                        padding: 0,
                        textAlign: "left",
                        cursor: onOpenBugDetail ? "pointer" : "default",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: "#0F172A",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {b.title}
                      </span>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: "#64748B" }}>
                        {entityCode("BUG", b.id)}
                      </span>
                    </button>

                    {/* Dropdown status bug — polos, tanpa pill/latar warna. */}
                    <Select
                      size="sm"
                      value={b.status === "RESOLVED" ? "CLOSED" : b.status}
                      disabled={!canEdit || statusPendingId === b.id}
                      ariaLabel={`Ubah status bug ${entityCode("BUG", b.id)}`}
                      chevronColor="#94A3B8"
                      style={{
                        flexShrink: 0,
                        width: "auto",
                        height: 32,
                        padding: "0 8px 0 10px",
                        border: "1px solid #E3E7EE",
                        background: "#FFFFFF",
                        color: "#0F172A",
                        fontSize: 13,
                        fontWeight: 500,
                        boxShadow: "none",
                        gap: 7,
                      }}
                      onChange={(e) => void changeBugStatus(b.id, e.target.value as BugStatus)}
                    >
                      <option value="OPEN">Open</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="CLOSED">Closed</option>
                    </Select>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  /** Tab "Edit Bug Aktif": isi form dari bug aktif supaya bisa diperbarui. */
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
      /**
       * Actual Result hanya milik hasil Fail/Blocked (section-nya pun cuma
       * muncul di status itu). Untuk status lain, kirim BALIK nilai tersimpan
       * apa adanya supaya tidak ada draft tak terlihat yang ikut tersimpan.
       */
      actualResult: usesActualResult ? actualResult : item.actualResult ?? "",
      /**
       * Notes hanya milik hasil PASS (field-nya pun cuma muncul di status itu).
       * Untuk status lain, kirim BALIK nilai tersimpan apa adanya supaya catatan
       * lama tidak terhapus hanya karena field-nya tidak ditampilkan — dan draft
       * yang tidak terlihat tidak pernah ikut tersimpan.
       */
      notes: status === "PASS" ? notes : item.notes ?? "",
      skipReason: skippedReason,
      skipReasonNote: skippedReasonNote,
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
          maxWidth: "min(1280px, calc(100vw - 48px))",
          height: "min(860px, calc(100vh - 48px))",
          // Flex row: lebar HANYA diatur di panel (bukan di kontennya).
          display: "flex",
          flexDirection: "row",
          userSelect: dragging ? "none" : undefined,
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
        {/* ===== KOLOM KIRI — info detail Test Case =====
            Berisi ID & judul, metadata, skenario, expected result, dan test
            steps. Lebarnya bisa diubah lewat divider di sebelah kanannya. */}
        <div
          style={{
            flex: "1 1 0",
            minWidth: 480,
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
              <span style={{ fontWeight: 600, color: "#1E293B", fontSize: "0.75rem" }}>{formatCase(tc?.priority) || "—"}</span>
            </div>
            <div>
              <span style={{ display: "block", color: "#94A3B8", fontWeight: 500, fontSize: "0.6875rem", marginBottom: "0.25rem" }}>Status</span>
              <span style={{ fontWeight: 600, color: "#1E293B", fontSize: "0.75rem" }}>{formatCase(tc?.status) || "—"}</span>
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
            flex: `0 0 ${SPLIT_DIVIDER_W}px`,
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
            // Lebar panel (bukan kontennya). Konten di dalam selalu 100%.
            flex: "0 0 auto",
            width: `${100 - splitPct}%`,
            minWidth: 420,
            maxWidth: "60%",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            // Panel putih, sama seperti kolom kiri — pemisahnya hanya garis tipis.
            background: "#FFFFFF",
            borderLeft: "1px solid #EEF1F5",
            fontFamily: FONT_SANS,
          }}
        >
          {/* Panel header */}
          <div
            style={{
              flexShrink: 0,
              padding: "20px 18px 14px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 600, color: "#0F172A" }}>Eksekusi</span>
            <button
              type="button"
              className="btn-radius-9"
              onClick={onClose}
              aria-label="Tutup"
              style={{
                width: 36,
                height: 36,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <X size={18} color="#64748B" aria-hidden="true" />
            </button>
          </div>

          {/* Result selector — di ATAS, langsung di bawah header. */}
          <div style={{ flexShrink: 0, padding: "0 24px 18px 24px" }}>
            <div
              role="radiogroup"
              aria-label="Hasil eksekusi"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 4,
                padding: 4,
                background: "#EEF1F5",
                borderRadius: 12,
              }}
            >
              {RESULT_OPTIONS.map((o) => {
                const active = status === o.value;
                const Icon = o.icon;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={!editable}
                    title={active ? "Klik lagi untuk membatalkan (Untested)" : `Tandai ${o.label}`}
                    onClick={() => setStatus(active ? "NOT_RUN" : o.value)}
                    className="btn-radius-9"
                    style={{
                      height: 40,
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      fontWeight: active ? 600 : 500,
                      color: active ? o.color : "#475569",
                      background: active ? "#FFFFFF" : "transparent",
                      border: active ? `1px solid ${o.tint}` : "none",
                      boxShadow: active ? "0 1px 2px rgba(15, 23, 42, 0.06)" : "none",
                      cursor: editable ? "pointer" : "not-allowed",
                      opacity: editable ? 1 : 0.6,
                    }}
                  >
                    <Icon size={15} strokeWidth={2.2} aria-hidden="true" style={{ color: o.color }} />
                    {o.label}
                  </button>
                );
              })}
            </div>

            {/* Field kondisional: SKIPPED wajib menyertakan alasan. */}
            {status === "SKIPPED" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                <label htmlFor="skip-reason" style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>
                  Alasan Skipped <span style={{ color: "#B91C1C" }}>*</span>
                </label>
                <Select
                  id="skip-reason"
                  value={skippedReason}
                  onChange={(e) => setSkippedReason(e.target.value)}
                  disabled={!editable}
                  ariaLabel="Alasan Skipped"
                  style={{ height: 40, fontSize: 14, fontWeight: 500 }}
                >
                  <option value="">Pilih alasan…</option>
                  {SKIP_REASON_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>

                {/* Keterangan wajib hanya saat alasannya "Lainnya". */}
                {skippedReason === SKIP_REASON_OTHER && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                    <label
                      htmlFor="skip-reason-note"
                      style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}
                    >
                      Keterangan Alasan <span style={{ color: "#B91C1C" }}>*</span>
                    </label>
                    <ListTextarea
                      value={skippedReasonNote}
                      onChange={setSkippedReasonNote}
                      disabled={!editable}
                      rows={2}
                      ariaLabel="Keterangan Alasan"
                      placeholder="Masukkan alasan test case di-skip..."
                      style={{
                        padding: "10px 12px",
                        lineHeight: 1.5,
                        resize: "vertical",
                        border: "1px solid #DDE2E9",
                        borderRadius: 10,
                        fontSize: 14,
                        color: "#0F172A",
                        background: "#fff",
                        outline: "none",
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Catatan subtle: bug lama di-Closed otomatis saat bug baru disimpan. */}
            {isFail && activeBug && bugMode === "new" && (
              <div style={{ fontSize: 12, fontWeight: 400, color: "#64748B", marginTop: 8 }}>
                Bug lama akan otomatis ditandai Closed saat bug baru disimpan.
              </div>
            )}
          </div>

          {/* Inset divider (bukan full width). */}
          <div aria-hidden="true" style={{ flexShrink: 0, height: 1, background: "#EEF1F5", margin: "0 24px" }} />

          {/* Isi eksekusi — HANYA bagian ini yang scroll. */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              overflowY: "auto",
              padding: "20px 24px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 22,
            }}
          >
            {showBugForm ? (
              /* ===== State B — Fail terpilih, laporkan bug baru ===== */
              <>
                {activeBug && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={useCurrentBug}
                      disabled={!editable}
                      style={{
                        padding: 0,
                        border: "none",
                        background: "transparent",
                        fontSize: 13,
                        fontWeight: bugMode === "edit" ? 600 : 500,
                        color: bugMode === "edit" ? "#0F172A" : "#64748B",
                        textDecoration: bugMode === "edit" ? "underline" : "none",
                        cursor: "pointer",
                      }}
                    >
                      Edit Bug Aktif
                    </button>
                    <button
                      type="button"
                      onClick={startNewBug}
                      disabled={!editable}
                      style={{
                        padding: 0,
                        border: "none",
                        background: "transparent",
                        fontSize: 13,
                        fontWeight: bugMode === "new" ? 600 : 500,
                        color: bugMode === "new" ? "#0F172A" : "#64748B",
                        textDecoration: bugMode === "new" ? "underline" : "none",
                        cursor: "pointer",
                      }}
                    >
                      Laporkan Bug Baru
                    </button>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label htmlFor="bug-title" style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>
                    Bug Title <span style={{ color: "#B91C1C" }}>*</span>
                  </label>
                  <input
                    id="bug-title"
                    type="text"
                    value={bugTitle}
                    onChange={(e) => setBugTitle(e.target.value)}
                    disabled={!editable}
                    placeholder="Ringkasan singkat isu/bug yang ditemukan…"
                    className="exec-field"
                    style={{
                      height: 40,
                      boxSizing: "border-box",
                      padding: "0 12px",
                      border: "1px solid #DDE2E9",
                      borderRadius: 10,
                      fontSize: 14,
                      color: "#0F172A",
                      background: "#fff",
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label htmlFor="bug-severity" style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>
                      Severity
                    </label>
                    <div style={{ position: "relative" }}>
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          left: 12,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: sevColor(bugSeverity),
                        }}
                      />
                      <select
                        id="bug-severity"
                        value={bugSeverity}
                        onChange={(e) => setBugSeverity(e.target.value)}
                        disabled={!editable}
                        className="exec-field"
                        style={{
                          width: "100%",
                          height: 40,
                          boxSizing: "border-box",
                          appearance: "none",
                          padding: "0 32px 0 28px",
                          border: "1px solid #DDE2E9",
                          borderRadius: 10,
                          fontSize: 14,
                          fontWeight: 500,
                          color: "#0F172A",
                          background: "#fff",
                          outline: "none",
                        }}
                      >
                        {SEVERITIES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={14}
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          right: 12,
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "#64748B",
                          pointerEvents: "none",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label htmlFor="bug-env" style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>
                      Environment{" "}
                      <span style={{ fontWeight: 400, color: "#64748B" }}>(dari Test Run)</span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        id="bug-env"
                        type="text"
                        value={environment ?? "—"}
                        readOnly
                        disabled
                        title="Environment mengikuti Test Run terkait."
                        style={{
                          width: "100%",
                          height: 40,
                          boxSizing: "border-box",
                          padding: "0 32px 0 12px",
                          border: "1px solid #E3E7EE",
                          borderRadius: 10,
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#475569",
                          background: "#F8FAFC",
                          outline: "none",
                        }}
                      />
                      <Lock
                        size={14}
                        aria-label="Tidak bisa diubah"
                        style={{
                          position: "absolute",
                          right: 12,
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "#94A3B8",
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>
                    Bug Detail <span style={{ color: "#B91C1C" }}>*</span>
                  </label>
                  <ListTextarea
                    value={actualResult}
                    onChange={setActualResult}
                    disabled={!editable}
                    rows={5}
                    ariaLabel="Bug Detail"
                    placeholder="Jelaskan hasil aktual dan langkah reproduksi ditemukannya bug…"
                    style={{
                      height: 112,
                      padding: "10px 12px",
                      lineHeight: 1.5,
                      resize: "vertical",
                      border: "1px solid #DDE2E9",
                      borderRadius: 10,
                      fontSize: 14,
                      color: "#0F172A",
                      background: "#fff",
                      outline: "none",
                    }}
                  />
                </div>
              </>
            ) : (
              /* ===== State A — hasil sudah tercatat ===== */
              <>
                {/* Section Actual Result hanya relevan untuk hasil Fail/Blocked. */}
                {showActualResultBlock && (
                  <div
                    style={{
                      background: "#FFFBFB",
                      border: "1px solid #FBE1E1",
                      borderRadius: 12,
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#991B1B" }}>
                      Actual Result
                    </span>
                    <BulletText text={actualResult} />
                  </div>
                )}

                {/* Notes — hanya muncul saat status PASS (opsional). */}
                {status === "PASS" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>
                      Notes
                      {editable && (
                        <span style={{ fontWeight: 400, color: "#64748B" }}> (opsional)</span>
                      )}
                    </span>
                    {editable ? (
                      <ListTextarea
                        value={notes}
                        onChange={setNotes}
                        rows={3}
                        ariaLabel="Notes"
                        placeholder="Tambahkan catatan eksekusi jika ada (opsional)…"
                        style={{
                          padding: "10px 12px",
                          lineHeight: 1.5,
                          resize: "vertical",
                          border: "1px solid #DDE2E9",
                          borderRadius: 10,
                          fontSize: 14,
                          color: "#0F172A",
                          background: "#fff",
                          outline: "none",
                        }}
                      />
                    ) : (notes ?? "").trim() ? (
                      <p style={{ margin: 0, fontSize: 14, color: "#1E293B", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        {notes}
                      </p>
                    ) : (
                      <p style={{ margin: 0, fontSize: 14, color: "#94A3B8" }}>Tidak ada catatan.</p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Evidence — tampil untuk Pass/Fail/Blocked, tersembunyi saat
                Skipped (dan saat belum ada status yang dipilih). Semua file baru
                ditahan di klien dulu (`deferred`) dan baru diunggah ke R2 saat
                Simpan; Batal membuangnya. Di Pass, evidence opsional. */}
            {showsEvidence && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>
                    Evidence{" "}
                    <span style={{ fontWeight: 400, color: "#64748B" }}>
                      · {(item.attachments ?? []).length + pendingEvidence}
                    </span>
                  </span>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => evidenceRef.current?.pick()}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: 0,
                        border: "none",
                        background: "transparent",
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#0F172A",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Plus size={14} aria-hidden="true" /> Tambah File
                    </button>
                  )}
                </div>
                <AttachmentsPanel
                  owner={{ testRunResultId: item.id }}
                  attachments={item.attachments ?? []}
                  canEdit={editable}
                  onChange={onAttachmentsChange}
                  onPendingChange={setPendingEvidence}
                  handleRef={evidenceRef}
                  deferred
                  compact
                  plain
                  hideTrigger
                />
              </div>
            )}

            {renderBugHistory()}
          </div>

          {/* Footer — selalu di dasar panel (bukan ikut scroll). */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 8,
              padding: "14px 24px",
              borderTop: "1px solid #EEF1F5",
              background: "#FFFFFF",
              flexWrap: "wrap",
            }}
          >
            {editable && msg && (
              <span style={{ marginRight: "auto", fontSize: 13, color: "#B91C1C" }}>{msg}</span>
            )}

            {canEdit &&
              (!editable ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="btn-radius-10"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    height: 40,
                    padding: "0 16px",
                    border: "1px solid #FFC348",
                    background: "#FFC348",
                    color: "#0F172A",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F0B53D")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
                >
                  <Pencil size={16} aria-hidden="true" /> Edit
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving}
                    className="btn-radius-10"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      height: 40,
                      padding: "0 14px",
                      border: "1px solid #DDE2E9",
                      background: "#fff",
                      color: "#0F172A",
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: saving ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving || saveBlocked}
                    className="btn-radius-10"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      height: 40,
                      padding: "0 16px",
                      border: `1px solid ${saveBlocked ? "#FDE68A" : "#FFC348"}`,
                      background: saveBlocked ? "#FDE68A" : "#FFC348",
                      color: saveBlocked ? "rgba(217, 119, 6, 0.7)" : "#0F172A",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: saving ? "wait" : saveBlocked ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                      opacity: saveBlocked ? 0.6 : 1,
                      pointerEvents: saveBlocked ? "none" : undefined,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F0B53D")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
                  >
                    {saving ? "Menyimpan..." : isFail && bugMode === "new" ? "Simpan Bug Baru" : "Simpan Eksekusi"}
                  </button>
                </>
              ))}
          </div>
        </div>
      </div>
      {/* Toast modal ini — dipakai untuk umpan balik ubah status bug. */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>,
    document.body
  );
}
