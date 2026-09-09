"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock4,
  FlaskConical,
  GitBranch,
  Info,
  Link2,
  Link2Off,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  bulkLinkAutomation,
  bulkUnlinkAutomation,
  createAutomationLink,
  updateAutomationLink,
  updateAutomationStatus,
} from "@/lib/actions/automation";
import { useToast, Toast, ConfirmDialog } from "@/components/ui/feedback";

/* ---------- Types ---------- */

type Platform = "WEB" | "MOBILE" | "HARDWARE" | "API" | null;
type RowStatus =
  | "NOT_AUTOMATED"
  | "AUTOMATED"
  | "FAILING"
  | "UNSTABLE"
  | "STALE";

type AutomationRow = {
  id: string;
  tcId: string;
  title: string;
  projectId: string | null;
  projectName: string;
  platform: Platform;
  suiteId: string | null;
  suiteName: string;
  linkId: string | null;
  externalTestId: string | null;
  scriptPath: string | null;
  status: RowStatus;
  lastRunAt: string | null;
  lastResult: string | null;
};

type ProjectStat = {
  projectId: string;
  name: string;
  platform: Platform;
  total: number;
  automated: number;
  failing: number;
  stale: number;
  unstable: number;
  notAutomated: number;
  coveragePct: number;
};

const STATUS_LABEL: Record<RowStatus, string> = {
  NOT_AUTOMATED: "Belum Automated",
  AUTOMATED: "Automated",
  FAILING: "Failing",
  STALE: "Stale",
  UNSTABLE: "Unstable",
};

const STATUS_COLOR: Record<RowStatus, { color: string; bg: string; border: string }> = {
  NOT_AUTOMATED: { color: "#64748B", bg: "#F1F5F9", border: "#E2E8F0" },
  AUTOMATED: { color: "#047857", bg: "#ECFDF5", border: "#A7F3D0" },
  FAILING: { color: "#BE123C", bg: "#FFF1F2", border: "#FECDD3" },
  STALE: { color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
  UNSTABLE: { color: "#6D28D9", bg: "#F5F3FF", border: "#DDD6FE" },
};

const PLATFORM_LABEL: Record<string, string> = {
  WEB: "Web",
  MOBILE: "Mobile",
  HARDWARE: "Hardware",
  API: "API",
};

const STATUS_ORDER: Record<RowStatus, number> = {
  FAILING: 0,
  STALE: 1,
  UNSTABLE: 2,
  NOT_AUTOMATED: 3,
  AUTOMATED: 4,
};

/* ---------- Helpers ---------- */

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const inputBase: CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#fff",
  padding: "8px 10px",
  fontSize: "0.85rem",
  color: "var(--text)",
  outline: "none",
};

/* ---------- Main Component ---------- */

export function AutomationPageClient({
  canManage,
  canUpdateStatus,
  projects,
  suitesByProject,
  rows,
  projectStats,
  reload,
}: {
  canManage: boolean;
  canUpdateStatus: boolean;
  projects: { id: string; name: string; platform: Platform }[];
  suitesByProject: { projectId: string; suites: { id: string; name: string }[] }[];
  rows: AutomationRow[];
  projectStats: ProjectStat[];
  reload?: () => void;
}) {
  const { toast, showToast, dismissToast } = useToast();

  // Filter state
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selProjects, setSelProjects] = useState<Set<string>>(new Set());
  const [selSuites, setSelSuites] = useState<Set<string>>(new Set());
  const [groupBySuite, setGroupBySuite] = useState(false);

  // Bulk state
  const [selected, setSelected] = useState<Set<string>>(new Set()); // row.id (TC id)
  const [bulkMode, setBulkMode] = useState<"link" | "unlink" | null>(null);
  const [bulkPattern, setBulkPattern] = useState("");
  const [bulkScript, setBulkScript] = useState("");
  const [pending, setPending] = useState(false);

  // Row actions
  const [editing, setEditing] = useState<{
    mode: "create" | "edit";
    row: AutomationRow;
  } | null>(null);
  const [editExtId, setEditExtId] = useState("");
  const [editScript, setEditScript] = useState("");
  const [confirmUnlink, setConfirmUnlink] = useState<AutomationRow | null>(null);
  const [ciOpen, setCiOpen] = useState(false);

  const toggleProject = (pid: string) =>
    setSelProjects((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });

  const toggleSuite = (sid: string) =>
    setSelSuites((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });

  // Available suites for the suite filter (dependent on selProjects)
  const availableSuites = useMemo(() => {
    const source =
      selProjects.size > 0
        ? suitesByProject.filter((s) => selProjects.has(s.projectId))
        : suitesByProject;
    return source.flatMap((s) => s.suites);
  }, [selProjects, suitesByProject]);

  // Prune seleksi suite yang tidak valid saat project berubah
  const validSuiteIds = useMemo(() => new Set(availableSuites.map((s) => s.id)), [availableSuites]);
  useEffect(() => {
    setSelSuites((prev) => {
      const next = new Set(prev);
      for (const id of Array.from(prev)) if (!validSuiteIds.has(id)) next.delete(id);
      return next.size === prev.size ? prev : next;
    });
  }, [validSuiteIds]);

  // Filter rows
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (selProjects.size > 0 && !(r.projectId && selProjects.has(r.projectId))) return false;
      if (selSuites.size > 0 && !(r.suiteId && selSuites.has(r.suiteId))) return false;
      if (term) {
        const hay =
          `${r.tcId} ${r.title} ${r.externalTestId ?? ""} ${r.scriptPath ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, q, statusFilter, selProjects, selSuites]);

  // Default sort: FAILING → STALE → UNSTABLE → NOT_AUTOMATED → AUTOMATED, lalu nama
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const d =
        (STATUS_ORDER[a.status as RowStatus] ?? 9) -
        (STATUS_ORDER[b.status as RowStatus] ?? 9);
      if (d !== 0) return d;
      return a.title.localeCompare(b.title);
    });
  }, [filtered]);

  // Aggregate stats based on current project filter (for summary cards + coverage)
  const statsSummary = useMemo(() => {
    const projStats = projectStats.filter(
      (p) => selProjects.size === 0 || selProjects.has(p.projectId)
    );
    const sum = (k: "total" | "automated" | "failing" | "stale" | "unstable" | "notAutomated") =>
      projStats.reduce((s, p) => s + (p[k] as number), 0);
    const total = sum("total");
    const automated = sum("automated");
    const failing = sum("failing");
    const stale = sum("stale");
    const unstable = sum("unstable");
    const notAutomated = sum("notAutomated");
    const covered = automated + failing + stale + unstable;
    return {
      automated,
      failing,
      stale,
      unstable,
      notAutomated,
      total,
      coveragePct: total > 0 ? Math.round((covered / total) * 100) : 0,
    };
  }, [projectStats, selProjects]);

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };

  const isRowSelectable = (r: AutomationRow) => r.status === "NOT_AUTOMATED" || !r.linkId;

  const doBulkLink = async () => {
    setPending(true);
    const ids = rows
      .filter((r) => selected.has(r.id))
      .filter((r) => !r.linkId)
      .map((r) => r.id);
    const res = await bulkLinkAutomation(ids, {
      externalTestPattern: bulkPattern.trim() || undefined,
      scriptPathPrefix: bulkScript.trim() || undefined,
    });
    setPending(false);
    if (res.error) {
      showToast(res.error, "error");
      return;
    }
    showToast(
      (res as { created?: number }).created
        ? `${(res as { created?: number }).created} test case di-link.`
        : "Semua sudah ter-link sebelumnya.",
      "success"
    );
    setBulkMode(null);
    setSelected(new Set());
    reload?.();
  };

  const doBulkUnlink = async () => {
    setPending(true);
    const ids = rows
      .filter((r) => selected.has(r.id))
      .filter((r) => r.linkId)
      .map((r) => r.linkId) as string[];
    const res = await bulkUnlinkAutomation(ids);
    setPending(false);
    if (res.error) {
      showToast(res.error, "error");
      return;
    }
    showToast("Automation di-unlink.", "success");
    setBulkMode(null);
    setSelected(new Set());
    reload?.();
  };

  const doSaveEdit = async () => {
    if (!editing) return;
    setPending(true);
    if (editing.mode === "create") {
      const res = await createAutomationLink(editing.row.id, {
        externalTestId: editExtId,
        scriptPath: editScript,
      });
      setPending(false);
      if (res.error) {
        showToast(res.error, "error");
        return;
      }
      showToast("Automation di-link.", "success");
    } else {
      const res = await updateAutomationLink(editing.row.linkId as string, {
        externalTestId: editExtId,
        scriptPath: editScript,
      });
      setPending(false);
      if (res.error) {
        showToast(res.error, "error");
        return;
      }
      showToast("Automation diperbarui.", "success");
    }
    setEditing(null);
    reload?.();
  };

  const doConfirmUnlink = async () => {
    if (!confirmUnlink?.linkId) return;
    setPending(true);
    const res = await bulkUnlinkAutomation([confirmUnlink.linkId]);
    setPending(false);
    if (res.error) {
      showToast(res.error, "error");
      return;
    }
    showToast("Automation di-unlink.", "success");
    setConfirmUnlink(null);
    reload?.();
  };

  const doQuickStatus = async (r: AutomationRow, next: RowStatus) => {
    if (!r.linkId) return;
    setPending(true);
    const res = await updateAutomationStatus(
      r.linkId,
      next === "STALE" ? "AUTOMATED" : (next as "AUTOMATED" | "FAILING" | "UNSTABLE" | "NOT_AUTOMATED")
    );
    setPending(false);
    if (res.error) {
      showToast(res.error, "error");
      return;
    }
    showToast("Status diperbarui.", "success");
    reload?.();
  };

  /* ---------- Render ---------- */

  const badge = (s: RowStatus) => {
    const c = STATUS_COLOR[s] ?? STATUS_COLOR.NOT_AUTOMATED;
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 10px",
          borderRadius: 999,
          fontSize: "0.72rem",
          fontWeight: 600,
          color: c.color,
          background: c.bg,
          border: `1px solid ${c.border}`,
          whiteSpace: "nowrap",
        }}
      >
        {s === "FAILING" && <CircleAlert size={11} />}
        {s === "STALE" && <Clock4 size={11} />}
        {s === "AUTOMATED" && <RefreshCw size={11} />}
        {STATUS_LABEL[s]}
      </span>
    );
  };

  const summaryCard = (
    key: string,
    label: string,
    value: number,
    color: string,
    bg: string,
    icon: ReactNode
  ) => (
    <div
      key={key}
      style={{
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        padding: "16px 18px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        minWidth: 180,
        flex: 1,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: bg,
          color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", lineHeight: 1.2 }}>
          {value}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>{label}</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "var(--font-sans)", width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header banner */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E5E7EB",
          borderRadius: 12,
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", margin: 0 }}>
            Automation Coverage &amp; Health
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "#6B7280" }}>
            Pantau otomatisasi test case, status hasil CI, dan cakupan per project.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {canManage && (
            <button
              type="button"
              onClick={() => setCiOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 16px",
                borderRadius: 8,
                border: "none",
                background: "#F59E0B",
                color: "#fff",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <GitBranch size={15} /> Cara Integrasi CI
            </button>
          )}
          {!canManage && canUpdateStatus && (
            <span style={{ fontSize: "0.75rem", color: "#6B7280", background: "#F1F5F9", borderRadius: 999, padding: "4px 10px" }}>
              Developer — hanya update status
            </span>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {summaryCard("auto", "Automated", statsSummary.automated, "#047857", "#ECFDF5", <FlaskConical size={17} />)}
        {summaryCard("fail", "Failing", statsSummary.failing, "#BE123C", "#FFF1F2", <CircleAlert size={17} />)}
        {summaryCard("stale", "Stale", statsSummary.stale, "#B45309", "#FFFBEB", <Clock4 size={17} />)}
        {summaryCard("unauto", "Belum Automated", statsSummary.notAutomated, "#64748B", "#F1F5F9", <Link2Off size={17} />)}
      </div>

      {/* Coverage bar per project */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E5E7EB",
          borderRadius: 12,
          padding: "16px 20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
            Coverage per Project
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
            {statsSummary.coveragePct}%
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {projectStats
            .filter((p) => selProjects.size === 0 || selProjects.has(p.projectId))
            .map((p) => (
              <div key={p.projectId} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 190, flexShrink: 0 }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#94A3B8" }}>
                    {p.platform ? PLATFORM_LABEL[p.platform] : ""} · {p.total} TC
                  </div>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {/* Stacked segmented coverage bar */}
                    <div style={{ flex: 1, display: "flex", height: 10, borderRadius: 999, overflow: "hidden", background: "#E2E8F0" }}>
                      {p.automated > 0 && (
                        <div style={{ width: `${(p.automated / p.total) * 100}%`, background: "#10B981" }} title={`Automated ${p.automated}`} />
                      )}
                      {p.stale > 0 && (
                        <div style={{ width: `${(p.stale / p.total) * 100}%`, background: "#F59E0B" }} title={`Stale ${p.stale}`} />
                      )}
                      {p.failing > 0 && (
                        <div style={{ width: `${(p.failing / p.total) * 100}%`, background: "#F43F5E" }} title={`Failing ${p.failing}`} />
                      )}
                      {p.unstable > 0 && (
                        <div style={{ width: `${(p.unstable / p.total) * 100}%`, background: "#8B5CF6" }} title={`Unstable ${p.unstable}`} />
                      )}
                    </div>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0F172A", width: 36, textAlign: "right" }}>
                      {p.coveragePct}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          {projectStats.filter((p) => selProjects.size === 0 || selProjects.has(p.projectId)).length ===
            0 && (
            <div style={{ fontSize: "0.85rem", color: "#9CA3AF", textAlign: "center", padding: "0.5rem" }}>
              Tidak ada project.
            </div>
          )}
        </div>
      </div>

      {/* Filter bar + actions */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E5E7EB",
          borderRadius: 12,
          padding: "14px 16px",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 300 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari TC ID / judul / external id…"
            style={{ ...inputBase, paddingLeft: 30, width: "100%" }}
          />
        </div>

        {/* Status filter */}
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputBase }}>
          <option value="ALL">Semua Status</option>
          <option value="FAILING">Failing</option>
          <option value="STALE">Stale</option>
          <option value="UNSTABLE">Unstable</option>
          <option value="NOT_AUTOMATED">Belum Automated</option>
          <option value="AUTOMATED">Automated</option>
        </select>

        {/* Project multi-select */}
        <MultiChipFilter
          label={
            selProjects.size === 0
              ? "Semua Project"
              : selProjects.size === 1
                ? projects.find((p) => selProjects.has(p.id))?.name ?? "Project"
                : `${selProjects.size} Project`
          }
          icon={<Link2 size={13} />}
          selectedCount={selProjects.size}
          onClear={() => setSelProjects(new Set())}
        >
          {projects.map((p) => (
            <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", cursor: "pointer", fontSize: "0.85rem" }}>
              <input
                type="checkbox"
                checked={selProjects.has(p.id)}
                onChange={() => toggleProject(p.id)}
                style={{ accentColor: "#F59E0B" }}
              />
              {p.name}
              {p.platform ? (
                <span style={{ fontSize: "0.7rem", color: "#94A3B8", background: "#F1F5F9", borderRadius: 4, padding: "1px 5px" }}>
                  {PLATFORM_LABEL[p.platform]}
                </span>
              ) : null}
            </label>
          ))}
        </MultiChipFilter>

        {/* Suite filter (dependent on project selection) */}
        <MultiChipFilter
          label={
            selSuites.size === 0
              ? "Semua Suite"
              : selSuites.size === 1
                ? availableSuites.find((s) => selSuites.has(s.id))?.name ?? "Suite"
                : `${selSuites.size} Suite`
          }
          icon={<FlaskConical size={13} />}
          selectedCount={selSuites.size}
          onClear={() => setSelSuites(new Set())}
        >
          {availableSuites.map((s) => (
            <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", cursor: "pointer", fontSize: "0.85rem" }}>
              <input type="checkbox" checked={selSuites.has(s.id)} onChange={() => toggleSuite(s.id)} style={{ accentColor: "#F59E0B" }} />
              {s.name}
            </label>
          ))}
          {availableSuites.length === 0 && (
            <div style={{ padding: "6px 4px", fontSize: "0.8rem", color: "#9CA3AF" }}>
              Tidak ada suite.
            </div>
          )}
        </MultiChipFilter>

        {/* Group by suite toggle */}
        <button
          type="button"
          onClick={() => setGroupBySuite((v) => !v)}
          title="Kelompokkan baris per Suite"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            borderRadius: 8,
            border: groupBySuite ? "1px solid #F59E0B" : "1px solid #D1D5DB",
            background: groupBySuite ? "#FFFBEB" : "#fff",
            color: groupBySuite ? "#B45309" : "#374151",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <FlaskConical size={13} />
          Group by Suite
        </button>

        {/* Selection actions */}
        {selected.size > 0 && canManage && (
          <>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#0F172A", marginLeft: 4 }}>
              {selected.size} dipilih
            </span>
            <button
              type="button"
              onClick={() => {
                setBulkMode("link");
                setBulkPattern("");
                setBulkScript("");
              }}
              disabled={pending}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: 8,
                border: "none",
                background: "#F59E0B",
                color: "#fff",
                fontSize: "0.8rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Link2 size={13} /> Bulk Link
            </button>
            <button
              type="button"
              onClick={() => setBulkMode("unlink")}
              disabled={pending}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #FCA5A5",
                background: "#fff",
                color: "#BE123C",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Link2Off size={13} /> Bulk Unlink
            </button>
          </>
        )}
      </div>

      {/* Table card */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748B", borderBottom: "1px solid #E2E8F0" }}>
                <th style={{ padding: "12px 10px", width: 30 }}>
                  {canManage && (
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      style={{ accentColor: "#F59E0B", cursor: "pointer" }}
                    />
                  )}
                </th>
                <th style={{ padding: "12px 10px", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }}>TC</th>
                <th style={{ padding: "12px 10px", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }}>Project / Suite</th>
                <th style={{ padding: "12px 10px", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }}>External Test ID</th>
                <th style={{ padding: "12px 10px", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }}>Script Path</th>
                <th style={{ padding: "12px 10px", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }}>Status</th>
                <th style={{ padding: "12px 10px", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }}>Last Run</th>
                <th style={{ padding: "12px 10px", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "3rem 1rem", textAlign: "center", color: "#9CA3AF", fontSize: "0.9rem" }}>
                    Tidak ada test case sesuai filter.
                  </td>
                </tr>
              ) : groupBySuite ? (
                <GroupedRows
                  rows={sorted}
                  canManage={canManage}
                  canUpdateStatus={canUpdateStatus}
                  selected={selected}
                  onToggle={(id) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                  onSelectable={isRowSelectable}
                  badge={badge}
                  formatDate={formatDate}
                  onQuickStatus={doQuickStatus}
                  onEdit={(r) => {
                    setEditing({ mode: "edit", row: r });
                    setEditExtId(r.externalTestId ?? "");
                    setEditScript(r.scriptPath ?? "");
                  }}
                  onLink={(r) => {
                    setEditing({ mode: "create", row: r });
                    setEditExtId("");
                    setEditScript("");
                  }}
                  onUnlink={setConfirmUnlink}
                  pending={pending}
                />
              ) : (
                sorted.map((r) => (
                  <RowTr
                    key={r.id}
                    r={r}
                    canManage={canManage}
                    canUpdateStatus={canUpdateStatus}
                    selected={selected.has(r.id)}
                    selectable={isRowSelectable(r)}
                    onToggle={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        return next;
                      })
                    }
                    badge={badge}
                    formatDate={formatDate}
                    onQuickStatus={doQuickStatus}
                    onEdit={(r) => {
                      setEditing({ mode: "edit", row: r });
                      setEditExtId(r.externalTestId ?? "");
                      setEditScript(r.scriptPath ?? "");
                    }}
                    onLink={(r) => {
                      setEditing({ mode: "create", row: r });
                      setEditExtId("");
                      setEditScript("");
                    }}
                    onUnlink={() => setConfirmUnlink(r)}
                    pending={pending}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}

      {/* Modal Bulk Link */}
      {bulkMode === "link" && canManage && (
        <Modal onClose={() => setBulkMode(null)} title="Bulk Link Automation">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#6B7280" }}>
              {selected.size} test case dipilih. Gunakan pola <code style={{ background: "#F1F5F9", padding: "1px 5px", borderRadius: 4 }}>{"{TC_ID}"}</code> untuk menyisipkan kode TC unik tiap baris.
            </p>
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                Pola External Test ID (wajib)
              </label>
              <input
                value={bulkPattern}
                onChange={(e) => setBulkPattern(e.target.value)}
                placeholder="mis. LOGIN-{TC_ID}"
                style={{ ...inputBase, width: "100%" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                Prefix Script Path (opsional)
              </label>
              <input
                value={bulkScript}
                onChange={(e) => setBulkScript(e.target.value)}
                placeholder="mis. e2e/tests/"
                style={{ ...inputBase, width: "100%" }}
              />
              <div style={{ fontSize: "0.72rem", color: "#9CA3AF", marginTop: 4 }}>
                Jika diisi tanpa {"{TC_ID}"}, otomatis ditambahkan <code>/&lt;TC_ID&gt;.spec.ts</code>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setBulkMode(null)}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={doBulkLink}
                disabled={pending || !bulkPattern.trim()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "#F59E0B",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                }}
              >
                {pending && <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />}
                Link Automation
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Edit / Create */}
      {editing && canManage && (
        <Modal
          onClose={() => setEditing(null)}
          title={
            editing.mode === "edit"
              ? `Edit Automation — ${editing.row.tcId}`
              : `Link Automation — ${editing.row.tcId}`
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {editing.mode === "create" && (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#6B7280" }}>
                Test case ini belum punya AutomationLink. Isi External Test ID untuk menghubungkannya.
              </p>
            )}
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                External Test ID
              </label>
              <input value={editExtId} onChange={(e) => setEditExtId(e.target.value)} placeholder={editing.mode === "create" ? "mis. LOGIN-001" : ""} style={{ ...inputBase, width: "100%" }} />
            </div>
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                Script Path
              </label>
              <input value={editScript} onChange={(e) => setEditScript(e.target.value)} placeholder="mis. e2e/tests/login.spec.ts" style={{ ...inputBase, width: "100%" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setEditing(null)}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer" }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={doSaveEdit}
                disabled={pending || !editExtId.trim()}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "none", background: "#F59E0B", color: "#fff", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}
              >
                {pending && <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />}
                {editing.mode === "edit" ? "Simpan" : "Link Automation"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Cara Integrasi CI */}
      {ciOpen && <CiGuideModal onClose={() => setCiOpen(false)} />}

      {/* Bulk unlink confirm */}
      <ConfirmDialog
        open={bulkMode === "unlink"}
        title="Unlink automation terpilih?"
        message={`${selected.size} automation akan di-unlink dari test case-nya. Test case tidak dihapus.`}
        confirmLabel="Ya, unlink"
        pending={pending}
        onConfirm={doBulkUnlink}
        onCancel={() => {
          setBulkMode(null);
          setSelected(new Set());
        }}
      />

      {/* Row unlink confirm */}
      <ConfirmDialog
        open={!!confirmUnlink}
        title={confirmUnlink ? `Unlink ${confirmUnlink.tcId}?` : ""}
        message="Test case akan kembali menjadi Belum Automated. Link automation dihapus."
        confirmLabel="Ya, unlink"
        pending={pending}
        onConfirm={doConfirmUnlink}
        onCancel={() => setConfirmUnlink(null)}
      />

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}

/* ---------- Sub-components ---------- */

function MultiChipFilter({
  label,
  icon,
  selectedCount,
  onClear,
  children,
}: {
  label: string;
  icon: ReactNode;
  selectedCount: number;
  onClear: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #D1D5DB",
          background: selectedCount > 0 ? "#FFFBEB" : "#fff",
          color: selectedCount > 0 ? "#B45309" : "#374151",
          fontSize: "0.8rem",
          fontWeight: 600,
          cursor: "pointer",
          maxWidth: 200,
        }}
      >
        {icon}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              zIndex: 41,
              background: "#fff",
              border: "1px solid #E2E8F0",
              borderRadius: 10,
              boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
              padding: "8px",
              minWidth: 230,
              maxHeight: 320,
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 4px 6px", borderBottom: "1px solid #F1F5F9", marginBottom: 4 }}>
              <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#94A3B8" }}>Filter</span>
              {selectedCount > 0 && (
                <button type="button" onClick={onClear} style={{ border: "none", background: "none", color: "#F59E0B", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}>
                  Reset
                </button>
              )}
            </div>
            <div style={{ maxHeight: 260, overflowY: "auto" }}>{children}</div>
          </div>
        </>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.45)" }} onClick={onClose} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 14, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", width: "100%", maxWidth: 520, padding: "20px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#0F172A" }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ border: "none", background: "none", color: "#9CA3AF", cursor: "pointer", display: "flex", padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RowTr({
  r,
  canManage,
  canUpdateStatus,
  selected,
  selectable,
  onToggle,
  badge,
  formatDate,
  onQuickStatus,
  onEdit,
  onLink,
  onUnlink,
  pending,
}: {
  r: AutomationRow;
  canManage: boolean;
  canUpdateStatus: boolean;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
  badge: (s: RowStatus) => ReactNode;
  formatDate: (iso: string | null) => string;
  onQuickStatus: (r: AutomationRow, s: RowStatus) => void;
  onEdit: (r: AutomationRow) => void;
  onLink: (r: AutomationRow) => void;
  onUnlink: (r: AutomationRow) => void;
  pending: boolean;
}) {
  const canSel = selectable && canManage;
  return (
    <tr style={{ borderTop: "1px solid #F1F5F9", background: selected ? "#FFFBEB" : undefined }}>
      <td style={{ padding: "10px 10px" }}>
        {canSel ? (
          <input type="checkbox" checked={selected} onChange={onToggle} style={{ accentColor: "#F59E0B", cursor: "pointer" }} />
        ) : canManage ? (
          <span title="Hanya baris Belum Automated yang bisa dipilih untuk bulk link" style={{ color: "#CBD5E1" }}>
            <CheckSquare size={15} />
          </span>
        ) : null}
      </td>
      <td style={{ padding: "10px 10px", minWidth: 170 }}>
        <div style={{ fontWeight: 700, color: "#0F172A", fontSize: "0.83rem" }}>{r.title}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "#94A3B8", marginTop: 2 }}>{r.tcId}</div>
      </td>
      <td style={{ padding: "10px 10px", color: "#475569", minWidth: 150 }}>
        <div>{r.projectName}</div>
        <div style={{ fontSize: "0.74rem", color: "#94A3B8" }}>{r.suiteName}</div>
      </td>
      <td style={{ padding: "10px 10px" }}>
        {r.externalTestId ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem", color: "#475569" }}>{r.externalTestId}</span>
        ) : (
          <span style={{ color: "#CBD5E1", fontSize: "0.78rem" }}>—</span>
        )}
      </td>
      <td style={{ padding: "10px 10px", maxWidth: 220 }}>
        {r.scriptPath ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }} title={r.scriptPath}>
            {r.scriptPath}
          </div>
        ) : (
          <span style={{ color: "#CBD5E1", fontSize: "0.78rem" }}>—</span>
        )}
      </td>
      <td style={{ padding: "10px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {badge(r.status)}
          {canUpdateStatus && r.linkId && (
            <select
              value={r.status === "STALE" ? "AUTOMATED" : r.status}
              onChange={(e) => onQuickStatus(r, e.target.value as RowStatus)}
              disabled={pending}
              title="Ubah status"
              style={{
                border: "1px solid #E2E8F0",
                borderRadius: 6,
                background: "#fff",
                fontSize: "0.72rem",
                color: "#64748B",
                padding: "2px 4px",
                cursor: "pointer",
              }}
            >
              <option value="AUTOMATED">Automated</option>
              <option value="FAILING">Failing</option>
              <option value="UNSTABLE">Unstable</option>
              <option value="NOT_AUTOMATED">Belum Automated</option>
            </select>
          )}
        </div>
      </td>
      <td style={{ padding: "10px 10px", color: "#64748B", fontSize: "0.78rem", whiteSpace: "nowrap" }}>
        {r.lastRunAt ? (
          <div>
            {formatDate(r.lastRunAt)}
            {r.lastResult && (
              <div style={{ fontSize: "0.7rem", color: r.lastResult === "PASS" ? "#059669" : r.lastResult === "FAIL" ? "#BE123C" : "#94A3B8" }}>
                {r.lastResult}
              </div>
            )}
          </div>
        ) : (
          <span style={{ color: "#CBD5E1" }}>—</span>
        )}
      </td>
      <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {canManage && r.linkId && (
            <IconBtn title="Edit" onClick={() => onEdit(r)}>
              <Pencil size={14} />
            </IconBtn>
          )}
          {canManage && r.linkId && (
            <IconBtn title="Unlink" onClick={() => onUnlink(r)} danger>
              <Link2Off size={14} />
            </IconBtn>
          )}
          {canManage && !r.linkId && (
            <IconBtn title="Link automation" onClick={() => onLink(r)}>
              <Link2 size={14} />
            </IconBtn>
          )}
        </div>
      </td>
    </tr>
  );
}

function GroupedRows({
  rows,
  canManage,
  canUpdateStatus,
  selected,
  onToggle,
  onSelectable,
  badge,
  formatDate,
  onQuickStatus,
  onEdit,
  onLink,
  onUnlink,
  pending,
}: {
  rows: AutomationRow[];
  canManage: boolean;
  canUpdateStatus: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectable: (r: AutomationRow) => boolean;
  badge: (s: RowStatus) => ReactNode;
  formatDate: (iso: string | null) => string;
  onQuickStatus: (r: AutomationRow, s: RowStatus) => void;
  onEdit: (r: AutomationRow) => void;
  onLink: (r: AutomationRow) => void;
  onUnlink: (r: AutomationRow) => void;
  pending: boolean;
}) {
  const groups = new Map<string, AutomationRow[]>();
  for (const r of rows) {
    const k = r.suiteName;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  return (
    <>
      {Array.from(groups.entries()).map(([suite, items]) => (
        <>
          <tr key={`g-${suite}`} style={{ background: "#F8FAFC" }}>
            <td colSpan={8} style={{ padding: "8px 12px", fontWeight: 700, fontSize: "0.8rem", color: "#334155" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <ChevronRight size={13} style={{ color: "#94A3B8" }} />
                {suite}
              </span>
              <span style={{ marginLeft: 8, fontSize: "0.7rem", color: "#94A3B8", fontWeight: 600 }}>
                {items.length} TC
              </span>
            </td>
          </tr>
          {items.map((r) => (
            <RowTr
              key={r.id}
              r={r}
              canManage={canManage}
              canUpdateStatus={canUpdateStatus}
              selected={selected.has(r.id)}
              selectable={onSelectable(r)}
              onToggle={() => onToggle(r.id)}
              badge={badge}
              formatDate={formatDate}
              onQuickStatus={onQuickStatus}
              onEdit={onEdit}
              onLink={onLink}
              onUnlink={onUnlink}
              pending={pending}
            />
          ))}
        </>
      ))}
    </>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 6,
        border: "1px solid #E2E8F0",
        background: "#fff",
        color: danger ? "#BE123C" : "#475569",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function CiGuideModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const example = `// Di CI (mis. GitHub Actions / Jenkins), panggil endpoint ini
// setelah test selesai. Status menentukan health Automation di halaman ini.

POST ${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.example.com"}/api/automation-results
Content-Type: application/json

{
  "externalTestId": "LOGIN-001",
  "status": "PASS",           // PASS | FAIL
  "scriptPath": "e2e/tests/login.spec.ts",
  "title": "Login berhasil",   // opsional: dipakai saat auto-create TC
  "suiteId": "ckxxxxxxx",     // opsional: suite tujuan saat auto-create
  "timestamp": "2026-09-02T09:00:00.000Z"
}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(example);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* noop */
    }
  };
  return (
    <Modal onClose={onClose} title="Cara Integrasi CI">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "#475569", lineHeight: 1.6 }}>
          Setelah test otomatis (Playwright/Jest) selesai di pipeline CI, kirim hasilnya ke endpoint
          <code style={{ background: "#F1F5F9", padding: "1px 5px", borderRadius: 4, margin: "0 4px" }}>/api/automation-results</code>.
          Sistem akan meng-<em>upsert</em> status &amp; waktu eksekusi — jika{" "}
          <code style={{ background: "#F1F5F9", padding: "1px 5px", borderRadius: 4 }}>externalTestId</code> belum
          terdaftar, TestCase baru dibuat otomatis.
        </p>
        <div style={{ background: "#0F172A", borderRadius: 10, padding: "14px 16px", overflowX: "auto" }}>
          <pre
            style={{
              margin: 0,
              color: "#E2E8F0",
              fontSize: "0.74rem",
              fontFamily: "var(--font-mono)",
              lineHeight: 1.6,
              whiteSpace: "pre",
            }}
          >
            {example}
          </pre>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", color: "#6B7280" }}>
            <Info size={13} /> Status CI <b>FAIL</b> → status Automation jadi <b>Failing</b>.
          </div>
          <button
            type="button"
            onClick={copy}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              borderRadius: 8,
              border: "1px solid #D1D5DB",
              background: "#fff",
              color: "#374151",
              fontWeight: 600,
              fontSize: "0.78rem",
              cursor: "pointer",
            }}
          >
            {copied ? "Tersalin ✓" : "Salin contoh"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
