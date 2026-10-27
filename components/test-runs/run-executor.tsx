"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRefresh } from "@/lib/client/refresh-context";
import { Check, ChevronDown, Cpu, ExternalLink, FileDown, FolderOpen, Monitor, Pencil, Server, Smartphone } from "lucide-react";
import { completeRun, completeRunWithSkip, deleteRun, updateRunResult } from "@/lib/actions/test-runs";
import { createBug, updateBug, updateBugStatus } from "@/lib/actions/automation-bugs";
import { Spinner, Toast, useToast } from "@/components/ui/feedback";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { runCodeOf } from "@/lib/format";
import { isActiveBugStatus, SKIP_REASON_OTHER } from "@/lib/qa-metrics";
import { BugDetailModal } from "@/components/bugs/bug-detail-modal";
import { EditRunModal } from "@/components/test-runs/edit-run-modal";
import { useReportPdfDownload } from "@/components/test-runs/use-report-pdf-download";
import type { ExpressRunInitial } from "@/components/test-runs/express-run";
import type { BugEditableFields } from "@/types/api";

import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  FONT_SANS,
  MNum,
  Sq,
  VSep,
  groupItemsBySection,
  type ActiveRunBug,
  type RunResultItem,
} from "./run-executor-shared";

import { BugModal } from "./bug-modal";
import { CompleteRunModal } from "./complete-run-modal";
import { ExecutionModal } from "./execution-modal";
import { RunItemCard } from "./run-item-card";

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
  const [editOpen, setEditOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  /**
   * Export Report = tombol aksi TUNGGAL: sekali klik langsung generate &
   * unduh PDF laporan run ini, tanpa dropdown/modal pilihan format.
   */
  const { toast, showToast, dismissToast } = useToast();
  const pdfError = useCallback(
    () => showToast("Gagal membuat PDF. Coba lagi.", "error"),
    [showToast]
  );
  const { downloading: pdfDownloading, startPdfDownload } = useReportPdfDownload(pdfError);

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
   * Bug yang masih AKTIF (belum CLOSED/RESOLVED) dan tertaut ke hasil eksekusi
   * run ini (unik per bug). Quality gate: selama daftar ini tidak kosong, run
   * tidak boleh diselesaikan — aturan yang sama ditegakkan di server
   * (`completeRun` / `completeRunWithSkip`), jadi UI ini hanya cermin.
   */
  const activeBugs = useMemo(() => {
    const map = new Map<string, ActiveRunBug>();
    for (const item of items) {
      for (const b of item.bugs ?? []) {
        if (isActiveBugStatus(b.status) && !map.has(b.id)) {
          map.set(b.id, {
            id: b.id,
            title: b.title,
            status: b.status,
            tcId: item.testCase?.tcId ?? null,
            suiteName: item.testCase?.suite?.name ?? null,
          });
        }
      }
    }
    return Array.from(map.values());
  }, [items]);

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
        {/* Row 1: judul | aksi. Tata letaknya di `.run-header-row` (menumpuk di
            layar sempit, satu baris dari 640px). Judul memakai `flex: 1` +
            `minWidth: 0` supaya judul panjang MEMBUNGKUS di sisinya sendiri dan
            tidak pernah mendorong tombol aksi turun; wadah tombol `flexShrink: 0`
            sehingga lebarnya tetap di kanan. */}
        <div className="run-header-row">
          <h1
            style={{
              flex: "1 1 0",
              minWidth: 0,
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "#0F172A",
              margin: 0,
              lineHeight: 1.2,
              // Kata panjang tanpa spasi pun tetap dipatahkan, tidak melebar.
              overflowWrap: "break-word",
            }}
          >
            {runName}
          </h1>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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
                {/* Tombol aksi tunggal: sekali klik langsung generate & unduh
                    PDF laporan (tanpa dropdown / modal pilihan format). */}
                <button
                  type="button"
                  onClick={() => startPdfDownload(runId)}
                  disabled={pdfDownloading}
                  aria-label="Export Report (unduh PDF)"
                  style={{ ...BTN_SECONDARY, cursor: pdfDownloading ? "wait" : "pointer" }}
                  onMouseEnter={(e) => {
                    if (!pdfDownloading) e.currentTarget.style.background = "#F8FAFC";
                  }}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  {pdfDownloading ? (
                    <>
                      <Spinner size={14} /> Menyiapkan PDF…
                    </>
                  ) : (
                    <>
                      <FileDown size={14} aria-hidden="true" /> Export Report
                    </>
                  )}
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
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: "#0F172A",
                    // Nama suite boleh menyusut (ellipsis) agar metadata di
                    // kanan tidak pernah terdorong.
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.name}
                </span>
              </button>

              {/* Kanan: metadata project → badge platform → jumlah TC.
                  `gap: 12` = `gap-3`; VSep memisahkan tiap kelompok supaya
                  teks project dan badge platform tidak menempel. */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  paddingRight: 6,
                  fontSize: 13,
                  color: "#475569",
                  flexShrink: 0,
                }}
              >
                {/* Nama project — dipindah dari sisi judul suite. */}
                <span
                  title={s.projectName}
                  style={{
                    maxWidth: 200,
                    fontSize: 13,
                    color: "#64748B",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {s.projectName}
                </span>
                <VSep />
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
      <ConfirmDeleteDialog
        open={confirmDelete}
        itemType="Test Run"
        itemName={runName}
        impact="Seluruh hasil eksekusinya juga akan terhapus."
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

      {/* Modal: Completion Summary — review catatan per TC + overall notes.
          Kalau masih ada Bug aktif, modal ini sekaligus jadi gate (tombol
          selesaikan dimatikan + daftar bug-nya ditampilkan). */}
      {completeOpen && (
        <CompleteRunModal
          items={items}
          untested={untested}
          activeBugs={activeBugs}
          overallNotes={overallNotes}
          onOverallNotesChange={setOverallNotes}
          onCancel={() => setCompleteOpen(false)}
          onConfirm={() => void finalizeComplete()}
          completing={completing}
        />
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





