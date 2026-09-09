"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRefresh } from "@/lib/client/refresh-context";
import { Bug, CheckCircle2, CircleSlash, ExternalLink, MinusCircle, X, XCircle } from "lucide-react";
import { completeRun, completeRunWithSkip, deleteRun, updateRunResult } from "@/lib/actions/test-runs";
import { createBug, unlinkBugFromRunResult } from "@/lib/actions/automation-bugs";
import { ConfirmDialog, Spinner, Toast, useToast } from "@/components/ui/feedback";
import { entityCode, runCodeOf, shortTcId } from "@/lib/format";

export type RunResultItem = {
  id: string;
  status: "PASS" | "FAIL" | "BLOCKED" | "SKIPPED" | "NOT_RUN";
  titleSnapshot: string;
  actualResult: string | null;
  notes: string | null;
  testCaseId: string;
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
  // Accordion per project: default semua expanded
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(projects.map((p) => [p.projectId, true]))
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [modalItem, setModalItem] = useState<RunResultItem | null>(null);
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
  // Modal konfirmasi complete dgn untested
  const [completeWarnOpen, setCompleteWarnOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  // Modal report
  const [reportOpen, setReportOpen] = useState(false);
  const { toast, showToast, dismissToast } = useToast();

  const setStatus = async (item: RunResultItem, status: RunResultItem["status"]) => {
    if (isCompleted) return;
    if (pendingId === item.id) return; // hindari double-trigger saat masih proses
    setPendingId(item.id);
    try {
      const res = await updateRunResult(item.id, { status });
      if (res?.error) {
        showToast(res.error, "error");
        return;
      }
      if (res?.success) {
        setItems((prev) => prev.map((r) => (r.id === item.id ? { ...r, status } : r)));
        setGroups((prev) =>
          prev.map((g) =>
            g.items.some((it) => it.id === item.id)
              ? { ...g, items: g.items.map((it) => (it.id === item.id ? { ...it, status } : it)) }
              : g
          )
        );
      }
    } catch (err) {
      console.error("Gagal update status run result:", err);
      showToast("Gagal mengubah status. Coba lagi.", "error");
    } finally {
      setPendingId(null);
    }
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

  // Mark all passed dalam satu project
  const markProjectPassed = async (projectId: string) => {
    const stats = projectStats.find((p) => p.projectId === projectId);
    if (!stats) return;
    for (const item of stats.items) {
      if (item.status === "PASS") continue;
      await updateRunResult(item.id, { status: "PASS" });
      setItems((prev) => prev.map((r) => (r.id === item.id ? { ...r, status: "PASS" } : r)));
      setGroups((prev) =>
        prev.map((g) =>
          g.items.some((x) => x.id === item.id)
            ? { ...g, items: g.items.map((x) => (x.id === item.id ? { ...x, status: "PASS" } : x)) }
            : g
        )
      );
    }
    showToast(`Semua test case di "${stats.projectName}" ditandai Pass.`, "success");
  };

  // --- Complete Run flow ---
  const handleCompleteClick = () => {
    if (untested > 0) {
      setCompleteWarnOpen(true);
    } else {
      void finalizeComplete(false);
    }
  };

  const finalizeComplete = async (skipUntested: boolean) => {
    setCompleting(true);
    const res = skipUntested
      ? await completeRunWithSkip(runId)
      : await completeRun(runId);
    setCompleting(false);
    setCompleteWarnOpen(false);
    if (res.error) {
      showToast(res.error, "error");
      return;
    }
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
          {!isCompleted && canEdit ? (
            <button
              type="button"
              onClick={handleCompleteClick}
              disabled={completing}
              style={{
                padding: "0.55rem 1.25rem",
                borderRadius: 8,
                border: "none",
                background: "#2563EB",
                color: "#fff",
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: completing ? "wait" : "pointer",
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
                Export Report ▼
              </button>
            </div>
          )}
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
              <span
                style={{
                  display: "inline-block",
                  fontSize: 10,
                  lineHeight: 1,
                  transform: metaOpen ? "rotate(0deg)" : "rotate(180deg)",
                  transition: "transform 0.3s ease-in-out",
                }}
              >
                ▲
              </span>
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
                {canEdit && !isCompleted && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void markProjectPassed(p.projectId);
                    }}
                    style={{
                      padding: "0.3rem 0.7rem",
                      borderRadius: 6,
                      border: "1px solid #A7F3D0",
                      background: "#ECFDF5",
                      color: "#047857",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Mark All as Passed
                  </button>
                )}
                <span style={{ fontSize: 14, color: "#6B7280", display: "inline-flex", transition: "transform 0.2s ease", transform: open ? "rotate(180deg)" : "none" }}>
                  ▼
                </span>
              </div>
            </div>

            {/* Accordion body: baris test case langsung (tanpa sub-header/pembungkus suite) */}
            {open && (
              <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {p.items.map((item) => (
                  <RunItemCard
                    key={item.id}
                    item={item}
                    isCompleted={isCompleted}
                    canEdit={canEdit}
                    pendingId={pendingId}
                    unlinkPending={unlinkPending}
                    onSetStatus={(status) => void setStatus(item, status)}
                    onOpenDetail={() => setModalItem(item)}
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

      {/* Modal: Detail & Execution */}
      {modalItem && (
        <ExecutionModal
          item={modalItem}
          canEdit={canEdit}
          onClose={() => setModalItem(null)}
          onSave={async (data) => {
            const res = await updateRunResult(modalItem.id, {
              status: data.status,
              actualResult: data.actualResult,
              notes: data.notes,
            });
            if (res.success) {
              setItems((prev) =>
                prev.map((r) =>
                  r.id === modalItem.id ? { ...r, ...data } : r
                )
              );
            }
            return res;
          }}
        />
      )}

      {isCompleted && canEdit && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>

        </div>
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

      {/* Modal: peringatan untested sebelum Complete */}
      {completeWarnOpen &&
        createPortal(
          <div
            role="alertdialog"
            aria-modal="true"
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
            onClick={() => setCompleteWarnOpen(false)}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 420,
                background: "#fff",
                borderRadius: 12,
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
                padding: "1.5rem",
                textAlign: "center",
                animation: "modalIn 0.18s ease-out",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  margin: "0 auto 0.75rem",
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: "#FFFBEB",
                  color: "#B45309",
                  border: "1px solid #FDE68A",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                }}
              >
                ⚠️
              </div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 0.5rem", color: "#111827" }}>
                Masih Terdapat Test Case Belum Dieksekusi
              </h3>
              <p style={{ fontSize: "0.85rem", color: "#374151", margin: "0 0 1.25rem", lineHeight: 1.55 }}>
                Masih terdapat <strong>{untested} Test Case</strong> yang belum dieksekusi. Test Case
                tersebut akan otomatis ditandai sebagai <strong>Skipped</strong>.
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setCompleteWarnOpen(false)}
                  style={{
                    flex: 1,
                    padding: "0.5rem 0",
                    borderRadius: "3px !important",
                    border: "1px solid #D1D5DB",
                    background: "#fff",
                    color: "#374151",
                    fontWeight: 500,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => void finalizeComplete(true)}
                  disabled={completing}
                  style={{
                    flex: 1,
                    padding: "0.5rem 0",
                    borderRadius: "3px !important",
                    border: "none",
                    background: "#F59E0B",
                    color: "#0F172A",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    cursor: completing ? "wait" : "pointer",
                  }}
                >
                  {completing ? "Memproses..." : "Selesaikan Run"}
                </button>
              </div>
            </div>
          </div>,
          document.body
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
  pendingId,
  unlinkPending,
  onSetStatus,
  onOpenDetail,
  onUnlinkBug,
  onOpenBug,
}: {
  item: RunResultItem;
  isCompleted: boolean;
  canEdit: boolean;
  pendingId: string | null;
  unlinkPending: string | null;
  onSetStatus: (status: RunResultItem["status"]) => void;
  onOpenDetail: () => void;
  onUnlinkBug: (bugId: string) => void;
  onOpenBug: () => void;
}) {
  const attachedBugs = item.bugs ?? [];
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "0px 1px 2px rgba(16, 24, 40, 0.04)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "0.9rem 1.25rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{item.titleSnapshot}</div>
            {/* Trigger: Actual result & notes -> modal */}
            <button
              type="button"
              onClick={onOpenDetail}
              style={{
                border: "none",
                background: "none",
                color: "var(--brand-600)",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
                marginTop: "0.3rem",
              }}
            >
              Actual result & notes
            </button>
            {item.actualResult && (
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                Actual: {item.actualResult}
              </div>
            )}
          </div>
          {/* Grup tombol aksi: layer teratas agar tidak tertutup elemen lain */}
          <div
            style={{
              display: "flex",
              gap: "0.4rem",
              flexWrap: "wrap",
              position: "relative",
              zIndex: 5,
              pointerEvents: "auto",
            }}
          >
            {STATUSES.map((s) => {
              const Icon = s.icon;
              const active = item.status === s.value;
              const disabled = isCompleted || !canEdit || pendingId === item.id;
              return (
                <button
                  key={s.value}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetStatus(s.value);
                  }}
                  style={{
                    position: "relative",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    padding: "0.35rem 0.8rem",
                    borderRadius: 8,
                    border: active ? `1.5px solid ${s.color}` : "1px solid var(--border-strong)",
                    background: active ? s.activeBg : "#fff",
                    color: active ? "#fff" : "var(--text-secondary)",
                    fontWeight: 700,
                    fontSize: "0.82rem",
                    cursor: disabled ? "not-allowed" : "pointer",
                    transition: "background 0.15s ease, color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (disabled || active) return;
                    e.currentTarget.style.background = s.activeBg;
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    if (disabled || active) return;
                    e.currentTarget.style.background = "#fff";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                >
                  <Icon size={14} /> {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {item.status === "FAIL" && canEdit && (
          <div style={{ marginTop: "0.6rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            {attachedBugs.length > 0 ? (
              attachedBugs.map((b) => {
                const bugCode = entityCode("BUG", b.id);
                const badge = (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.3rem 0.7rem",
                      borderRadius: 999,
                      background: "#FEF2F2",
                      border: "1px solid #FCA5A5",
                      color: "#B91C1C",
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <Bug size={12} /> {bugCode}
                    <ExternalLink size={11} style={{ opacity: 0.7 }} />
                  </span>
                );
                return (
                  <span key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                    {b.externalLink ? (
                      <a href={b.externalLink} target="_blank" rel="noreferrer" title="Buka detail bug" style={{ textDecoration: "none" }}>
                        {badge}
                      </a>
                    ) : (
                      <Link href="/bugs" title="Buka daftar bug" style={{ textDecoration: "none" }}>
                        {badge}
                      </Link>
                    )}
                    {!isCompleted && (
                      <button
                        type="button"
                        title="Lepas bug dari hasil run ini"
                        disabled={unlinkPending === b.id}
                        onClick={() => onUnlinkBug(b.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 20,
                          height: 20,
                          border: "none",
                          borderRadius: 999,
                          background: "transparent",
                          color: "#9CA3AF",
                          fontSize: 12,
                          cursor: unlinkPending === b.id ? "progress" : "pointer",
                          padding: 0,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#FEF2F2";
                          e.currentTarget.style.color = "#B91C1C";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "#9CA3AF";
                        }}
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
                onClick={onOpenBug}
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
    </div>
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
                  TC: {shortTcId(tcCode)}
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
  onSave,
}: {
  item: RunResultItem;
  canEdit: boolean;
  onClose: () => void;
  onSave: (data: { status: RunResultItem["status"]; actualResult?: string; notes?: string }) => Promise<{ success?: boolean; error?: string }>;
}) {
  const [status, setStatus] = useState<RunResultItem["status"]>(item.status);
  const [actualResult, setActualResult] = useState(item.actualResult ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
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

  const sectionLabel: React.CSSProperties = {
    fontSize: "0.72rem",
    fontWeight: 600,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    margin: "0 0 0.4rem",
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const res = await onSave({ status, actualResult, notes });
    setSaving(false);
    if (res.error) {
      setMsg(res.error);
    } else {
      setMsg("Detail disimpan.");
    }
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
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.75rem",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--border)",
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

        {/* Body */}
        <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
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

          {/* Execution form */}
          <div
            style={{
              background: "rgba(248, 250, 252, 0.8)",
              border: "1px solid rgba(229, 231, 235, 0.8)",
              borderRadius: 8,
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.9rem",
            }}
          >
            <h4 style={sectionLabel}>Eksekusi</h4>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {STATUSES.map((s) => {
                const Icon = s.icon;
                const isActive = status === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setStatus(s.value)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.35rem 0.9rem",
                      borderRadius: 6,
                      border: `1px solid ${isActive ? s.color : "#D1D5DB"}`,
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

            <div>
              <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#4B5563", marginBottom: "0.3rem" }}>
                Actual Result
              </label>
              <textarea
                value={actualResult}
                onChange={(e) => setActualResult(e.target.value)}
                disabled={!canEdit}
                rows={2}
                placeholder="Tulis hasil aktual eksekusi..."
                style={{
                  width: "100%",
                  border: "1px solid #D1D5DB",
                  borderRadius: 6,
                  padding: "0.5rem 0.6rem",
                  fontSize: "0.78rem",
                  color: "#1F2937",
                  outline: "none",
                  resize: "vertical",
                  background: "#fff",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "#4B5563", marginBottom: "0.3rem" }}>
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!canEdit}
                rows={2}
                placeholder="Catatan tambahan..."
                style={{
                  width: "100%",
                  border: "1px solid #D1D5DB",
                  borderRadius: 6,
                  padding: "0.5rem 0.6rem",
                  fontSize: "0.78rem",
                  color: "#1F2937",
                  outline: "none",
                  resize: "vertical",
                  background: "#fff",
                }}
              />
            </div>

            {msg && (
              <div style={{ fontSize: "0.75rem", color: msg === "Detail disimpan." ? "#047857" : "#B91C1C" }}>{msg}</div>
            )}

            {canEdit && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  style={{
                    padding: "0.45rem 1.1rem",
                    border: "none",
                    borderRadius: 3,
                    background: "#F59E0B",
                    color: "#000000",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: saving ? "wait" : "pointer",
                    transition: "background-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
                >
                  {saving ? "Menyimpan..." : "Simpan Detail"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
