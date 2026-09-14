"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  bulkUnlinkAutomationByTestCaseIds,
  createAutomationLink,
  updateAutomationLink,
  updateAutomationStatus,
} from "@/lib/actions/automation";
import { getJSON, useApi } from "@/lib/client/use-api";
import { HistoryPagination } from "@/components/test-runs/history-pagination";
import { useToast, Toast, ConfirmDialog } from "@/components/ui/feedback";
import { ErrorBlock, StatsCardsSkeleton, TableCardSkeleton } from "@/components/ui/data-states";
import type {
  AutomationPayload,
  AutomationProjectStat,
  AutomationRow,
  AutomationRowStatus,
  AutomationSuiteGroup,
} from "@/types/api";

/* ---------- Konstanta tampilan ---------- */

const STATUS_LABEL: Record<AutomationRowStatus, string> = {
  NOT_AUTOMATED: "Belum Automated",
  AUTOMATED: "Automated",
  FAILING: "Failing",
  STALE: "Stale",
  UNSTABLE: "Unstable",
};

const STATUS_COLOR: Record<AutomationRowStatus, { color: string; bg: string; border: string }> = {
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

const DEFAULT_PER_PAGE = 25;

const inputBase: CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  background: "#fff",
  padding: "8px 10px",
  fontSize: "0.85rem",
  color: "var(--text)",
  outline: "none",
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

type RowsState = {
  rows: AutomationRow[];
  total: number;
  loading: boolean;
  error: string | null;
};

/** Path request baris: menyertakan suiteId (opsional) + pagination. */
function buildRowsPath(
  filterQuery: string,
  suiteId: string | null,
  page: number,
  perPage: number
): string {
  const p = new URLSearchParams(filterQuery);
  if (suiteId) p.set("suiteId", suiteId);
  p.set("page", String(page));
  p.set("perPage", String(perPage));
  return `/api/automation?${p.toString()}`;
}

/* ---------- Main Component ---------- */

export function AutomationPageClient({
  canManage,
  canUpdateStatus,
}: {
  canManage: boolean;
  canUpdateStatus: boolean;
}) {
  const { toast, showToast, dismissToast } = useToast();

  // Filter state
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selProjects, setSelProjects] = useState<Set<string>>(new Set());
  const [selSuites, setSelSuites] = useState<Set<string>>(new Set());
  // Default view: collapsed-by-suite. Toggle off -> mode flat lintas suite.
  const [groupBySuite, setGroupBySuite] = useState(true);
  const [flatPage, setFlatPage] = useState(1);
  const [flatPerPage, setFlatPerPage] = useState(DEFAULT_PER_PAGE);

  // Bulk state
  const [selected, setSelected] = useState<Set<string>>(new Set()); // id TestCase, lintas halaman/grup
  const [bulkMode, setBulkMode] = useState<"link" | "unlink" | null>(null);
  const [bulkPattern, setBulkPattern] = useState("");
  const [bulkScript, setBulkScript] = useState("");
  const [pending, setPending] = useState(false);

  // Row actions
  const [editing, setEditing] = useState<{ mode: "create" | "edit"; row: AutomationRow } | null>(null);
  const [editExtId, setEditExtId] = useState("");
  const [editScript, setEditScript] = useState("");
  const [confirmUnlink, setConfirmUnlink] = useState<AutomationRow | null>(null);
  const [ciOpen, setCiOpen] = useState(false);

  // Debounce pencarian sebelum dikirim ke server.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput.trim());
      setFlatPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const filterQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (statusFilter !== "ALL") p.set("status", statusFilter);
    if (selProjects.size) p.set("projects", Array.from(selProjects).join(","));
    if (selSuites.size) p.set("suites", Array.from(selSuites).join(","));
    return p.toString();
  }, [q, statusFilter, selProjects, selSuites]);

  // View collapsed tidak mengirim page/perPage supaya payload tetap ringan;
  // mode flat mengirimkannya agar server mengembalikan baris lintas suite.
  const mainPath = useMemo(() => {
    const p = new URLSearchParams(filterQuery);
    if (!groupBySuite) {
      p.set("page", String(flatPage));
      p.set("perPage", String(flatPerPage));
    }
    const qs = p.toString();
    return `/api/automation${qs ? `?${qs}` : ""}`;
  }, [filterQuery, groupBySuite, flatPage, flatPerPage]);

  const { data, error, loading, reload } = useApi<AutomationPayload>(mainPath);

  // reload() menyegarkan payload utama; reloadToken memicu grup yang terbuka
  // ikut memuat ulang supaya UI tidak stale setelah mutasi.
  const [reloadToken, setReloadToken] = useState(0);
  const reloadAll = () => {
    reload();
    setReloadToken((t) => t + 1);
  };

  // Akumulasi daftar suite yang pernah terlihat (untuk filter dependent).
  const [knownSuites, setKnownSuites] = useState<Map<string, { id: string; name: string; projectId: string }>>(
    new Map()
  );
  useEffect(() => {
    if (!data) return;
    setKnownSuites((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const g of data.suiteGroups) {
        if (!next.has(g.suiteId)) {
          next.set(g.suiteId, { id: g.suiteId, name: g.suiteName, projectId: g.projectId });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [data]);

  const toggleProject = (pid: string) => {
    setFlatPage(1);
    setSelProjects((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const toggleSuite = (sid: string) => {
    setFlatPage(1);
    setSelSuites((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  };

  // Suite yang bisa dipilih: mengikuti project terpilih (dependent).
  const availableSuites = useMemo(() => {
    const all = Array.from(knownSuites.values());
    return selProjects.size > 0 ? all.filter((s) => selProjects.has(s.projectId)) : all;
  }, [knownSuites, selProjects]);

  const validSuiteIds = useMemo(() => new Set(availableSuites.map((s) => s.id)), [availableSuites]);
  useEffect(() => {
    setSelSuites((prev) => {
      const next = new Set(prev);
      for (const id of Array.from(prev)) if (!validSuiteIds.has(id)) next.delete(id);
      return next.size === prev.size ? prev : next;
    });
  }, [validSuiteIds]);

  const isRowSelectable = (r: AutomationRow) => r.status === "NOT_AUTOMATED" || !r.linkId;

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* ---------- Mutations ---------- */

  const doBulkLink = async () => {
    setPending(true);
    // Seleksi lintas halaman: cukup kirim seluruh selected; action melewati
    // test case yang sudah punya link.
    const res = await bulkLinkAutomation(Array.from(selected), {
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
    reloadAll();
  };

  const doBulkUnlink = async () => {
    setPending(true);
    // Bulk unlink tidak bergantung pada linkId baris yang sedang tampil.
    const res = await bulkUnlinkAutomationByTestCaseIds(Array.from(selected));
    setPending(false);
    if (res.error) {
      showToast(res.error, "error");
      return;
    }
    showToast("Automation di-unlink.", "success");
    setBulkMode(null);
    setSelected(new Set());
    reloadAll();
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
    reloadAll();
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
    reloadAll();
  };

  const doQuickStatus = async (r: AutomationRow, next: AutomationRowStatus) => {
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
    reloadAll();
  };

  const openEdit = (r: AutomationRow) => {
    setEditing({ mode: "edit", row: r });
    setEditExtId(r.externalTestId ?? "");
    setEditScript(r.scriptPath ?? "");
  };
  const openLink = (r: AutomationRow) => {
    setEditing({ mode: "create", row: r });
    setEditExtId("");
    setEditScript("");
  };

  /* ---------- Render helpers ---------- */

  const badge = (s: AutomationRowStatus) => {
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

  // Skeleton saat payload pertama belum ada; error hanya menutup layar bila
  // memang belum ada data sama sekali.
  if (error && !data) {
    return <ErrorBlock message={error.message} onRetry={reload} />;
  }
  if (!data) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
        <StatsCardsSkeleton count={4} />
        <TableCardSkeleton />
      </div>
    );
  }

  const summary = data.summary;
  const projectStats: AutomationProjectStat[] = data.projectStats.filter(
    (p) => selProjects.size === 0 || selProjects.has(p.projectId)
  );

  const headerSelectAll = (rows: AutomationRow[]) => {
    const selectable = rows.filter(isRowSelectable);
    const allOn = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
    return (
      <input
        type="checkbox"
        checked={allOn}
        onChange={() =>
          setSelected((prev) => {
            const next = new Set(prev);
            if (allOn) selectable.forEach((r) => next.delete(r.id));
            else selectable.forEach((r) => next.add(r.id));
            return next;
          })
        }
        title="Pilih semua baris pada halaman ini"
        style={{ accentColor: "#F59E0B", cursor: "pointer" }}
      />
    );
  };

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

      {/* Summary cards — memakai agregat total (bukan halaman) */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {summaryCard("auto", "Automated", summary.automated, "#047857", "#ECFDF5", <FlaskConical size={17} />)}
        {summaryCard("fail", "Failing", summary.failing, "#BE123C", "#FFF1F2", <CircleAlert size={17} />)}
        {summaryCard("stale", "Stale", summary.stale, "#B45309", "#FFFBEB", <Clock4 size={17} />)}
        {summaryCard("unauto", "Belum Automated", summary.notAutomated, "#64748B", "#F1F5F9", <Link2Off size={17} />)}
      </div>

      {/* Coverage bar per project */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Coverage per Project</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{summary.coveragePct}%</div>
        </div>
        {/* Grid 2 kolom (auto-fit agar tetap 1 kolom di layar sempit). Nama
            project, persentase, dan bar-nya dibuat berdekatan dalam satu kartu. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: 12,
          }}
        >
          {projectStats.map((p) => (
            <div
              key={p.projectId}
              style={{
                border: "1px solid #E5E7EB",
                borderRadius: 10,
                padding: "10px 12px",
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <div
                  title={p.name}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#334155",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.name}
                </div>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0F172A" }}>
                  {p.coveragePct}%
                </div>
              </div>
              <div style={{ fontSize: "0.7rem", color: "#94A3B8", marginTop: 2 }}>
                {p.platform ? `${PLATFORM_LABEL[p.platform]} · ` : ""}
                {p.total} TC
              </div>
              {/* h-2 (8px) + rounded-full: tetap terlihat walau angkanya rendah. */}
              <div
                style={{
                  display: "flex",
                  height: 8,
                  borderRadius: 999,
                  overflow: "hidden",
                  background: "#E2E8F0",
                  marginTop: 6,
                }}
              >
                {p.automated > 0 && <div style={{ width: `${(p.automated / p.total) * 100}%`, background: "#10B981" }} title={`Automated ${p.automated}`} />}
                {p.stale > 0 && <div style={{ width: `${(p.stale / p.total) * 100}%`, background: "#F59E0B" }} title={`Stale ${p.stale}`} />}
                {p.failing > 0 && <div style={{ width: `${(p.failing / p.total) * 100}%`, background: "#F43F5E" }} title={`Failing ${p.failing}`} />}
                {p.unstable > 0 && <div style={{ width: `${(p.unstable / p.total) * 100}%`, background: "#8B5CF6" }} title={`Unstable ${p.unstable}`} />}
              </div>
            </div>
          ))}
          {projectStats.length === 0 && (
            <div style={{ fontSize: "0.85rem", color: "#9CA3AF", textAlign: "center", padding: "0.5rem" }}>Tidak ada project.</div>
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
          // mb-4: beri jarak napas antara kontrol filter dan tabel.
          marginBottom: 16,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 300 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Cari TC ID / judul / external id…"
            style={{ ...inputBase, paddingLeft: 30, width: "100%" }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setFlatPage(1);
          }}
          style={{ ...inputBase }}
        >
          <option value="ALL">Semua Status</option>
          <option value="FAILING">Failing</option>
          <option value="STALE">Stale</option>
          <option value="UNSTABLE">Unstable</option>
          <option value="NOT_AUTOMATED">Belum Automated</option>
          <option value="AUTOMATED">Automated</option>
        </select>

        <MultiChipFilter
          label={
            selProjects.size === 0
              ? "Semua Project"
              : selProjects.size === 1
                ? data.projects.find((p) => selProjects.has(p.id))?.name ?? "Project"
                : `${selProjects.size} Project`
          }
          icon={<Link2 size={13} />}
          selectedCount={selProjects.size}
          onClear={() => setSelProjects(new Set())}
        >
          {data.projects.map((p) => (
            <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", cursor: "pointer", fontSize: "0.85rem" }}>
              <input type="checkbox" checked={selProjects.has(p.id)} onChange={() => toggleProject(p.id)} style={{ accentColor: "#F59E0B" }} />
              {p.name}
              {p.platform ? (
                <span style={{ fontSize: "0.7rem", color: "#94A3B8", background: "#F1F5F9", borderRadius: 4, padding: "1px 5px" }}>{PLATFORM_LABEL[p.platform]}</span>
              ) : null}
            </label>
          ))}
        </MultiChipFilter>

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
            <div style={{ padding: "6px 4px", fontSize: "0.8rem", color: "#9CA3AF" }}>Tidak ada suite.</div>
          )}
        </MultiChipFilter>

        <button
          type="button"
          onClick={() =>
            setGroupBySuite((v) => {
              setFlatPage(1);
              return !v;
            })
          }
          title="Kelompokkan baris per Suite"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            borderRadius: 8,
            border: groupBySuite ? "1px solid #FFC348" : "1px solid #D1D5DB",
            background: groupBySuite ? "rgba(255, 195, 72, 0.20)" : "#fff",
            color: groupBySuite ? "#1E293B" : "#374151",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <FlaskConical size={13} />
          Group by Suite
        </button>

        {selected.size > 0 && canManage && (
          <>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#0F172A", marginLeft: 4 }}>{selected.size} dipilih</span>
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
            {/* Header kolom global hanya untuk mode flat. Di mode grouped,
                header dirender sebagai sub-header di dalam tiap grup yang
                di-expand supaya tampilan collapsed tetap bersih. */}
            {!groupBySuite && (
              <thead>
                <tr style={{ textAlign: "left", color: "#64748B", borderBottom: "1px solid #E2E8F0" }}>
                  <th style={{ padding: "12px 10px", width: 30 }}></th>
                  <th style={{ padding: "12px 10px", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }}>TC</th>
                  <th style={{ padding: "12px 10px", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }}>Project / Suite</th>
                  <th style={{ padding: "12px 10px", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }}>External Test ID</th>
                  <th style={{ padding: "12px 10px", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }}>Script Path</th>
                  <th style={{ padding: "12px 10px", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }}>Status</th>
                  <th style={{ padding: "12px 10px", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }}>Last Run</th>
                  <th style={{ padding: "12px 10px", fontWeight: 700, fontSize: "0.72rem", textTransform: "uppercase" }}>Aksi</th>
                </tr>
              </thead>
            )}
            <tbody>
              {groupBySuite ? (
                data.suiteGroups.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "3rem 1rem", textAlign: "center", color: "#9CA3AF", fontSize: "0.9rem" }}>
                      Tidak ada test case sesuai filter.
                    </td>
                  </tr>
                ) : (
                  data.suiteGroups.map((g) => (
                    <SuiteGroup
                      key={g.suiteId}
                      group={g}
                      filterQuery={filterQuery}
                      reloadToken={reloadToken}
                      canManage={canManage}
                      canUpdateStatus={canUpdateStatus}
                      selected={selected}
                      isRowSelectable={isRowSelectable}
                      onToggleSelect={toggleSelect}
                      renderSelectAll={headerSelectAll}
                      badge={badge}
                      formatDate={formatDate}
                      onQuickStatus={doQuickStatus}
                      onEdit={openEdit}
                      onLink={openLink}
                      onUnlink={setConfirmUnlink}
                      pending={pending}
                    />
                  ))
                )
              ) : (
                <FlatRows
                  rows={data.rows}
                  loading={loading}
                  canManage={canManage}
                  canUpdateStatus={canUpdateStatus}
                  selected={selected}
                  isRowSelectable={isRowSelectable}
                  onToggleSelect={toggleSelect}
                  renderSelectAll={headerSelectAll}
                  badge={badge}
                  formatDate={formatDate}
                  onQuickStatus={doQuickStatus}
                  onEdit={openEdit}
                  onLink={openLink}
                  onUnlink={setConfirmUnlink}
                  pending={pending}
                />
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination hanya untuk mode flat; grup punya kontrolnya sendiri. */}
        {!groupBySuite && data.rowsTotal > 0 && (
          <HistoryPagination
            total={data.rowsTotal}
            page={data.page}
            perPage={data.perPage}
            baseUrl="/automation"
            label="Test Case"
            onPageChange={(p) => setFlatPage(p)}
            onPerPageChange={(n) => {
              setFlatPerPage(n);
              setFlatPage(1);
            }}
          />
        )}
      </div>

      {/* Modals */}
      {bulkMode === "link" && canManage && (
        <Modal onClose={() => setBulkMode(null)} title="Bulk Link Automation">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#6B7280" }}>
              {selected.size} test case dipilih. Gunakan pola{" "}
              <code style={{ background: "#F1F5F9", padding: "1px 5px", borderRadius: 4 }}>{"{TC_ID}"}</code> untuk menyisipkan kode TC unik tiap baris.
            </p>
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Pola External Test ID (wajib)</label>
              <input value={bulkPattern} onChange={(e) => setBulkPattern(e.target.value)} placeholder="mis. LOGIN-{TC_ID}" style={{ ...inputBase, width: "100%" }} />
            </div>
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Prefix Script Path (opsional)</label>
              <input value={bulkScript} onChange={(e) => setBulkScript(e.target.value)} placeholder="mis. e2e/tests/" style={{ ...inputBase, width: "100%" }} />
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
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "none", background: "#F59E0B", color: "#fff", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}
              >
                {pending && <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />}
                Link Automation
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editing && canManage && (
        <Modal
          onClose={() => setEditing(null)}
          title={editing.mode === "edit" ? `Edit Automation — ${editing.row.tcId}` : `Link Automation — ${editing.row.tcId}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {editing.mode === "create" && (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#6B7280" }}>
                Test case ini belum punya AutomationLink. Isi External Test ID untuk menghubungkannya.
              </p>
            )}
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>External Test ID</label>
              <input value={editExtId} onChange={(e) => setEditExtId(e.target.value)} placeholder={editing.mode === "create" ? "mis. LOGIN-001" : ""} style={{ ...inputBase, width: "100%" }} />
            </div>
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Script Path</label>
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

      {ciOpen && <CiGuideModal onClose={() => setCiOpen(false)} />}

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

/**
 * Kartu metrik ringkas. Keempat kartu wajib berstruktur identik:
 * [Icon] -> [Value (bold besar)] -> [Label (slate-500 kecil)].
 *
 * Saat nilainya 0, ikon & angkanya dibuat netral supaya kartu "kosong" tidak
 * terbaca seperti status aktif — label tetap tampil di bawah angka.
 */
function summaryCard(key: string, label: string, value: number, color: string, bg: string, icon: ReactNode) {
  const isZero = value === 0;
  return (
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
          background: isZero ? "#F1F5F9" : bg,
          color: isZero ? "#94A3B8" : color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            lineHeight: 1.2,
            color: isZero ? "#94A3B8" : "#0F172A",
          }}
        >
          {value}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>{label}</div>
      </div>
    </div>
  );
}

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

type RowActions = {
  badge: (s: AutomationRowStatus) => ReactNode;
  formatDate: (iso: string | null) => string;
  onQuickStatus: (r: AutomationRow, s: AutomationRowStatus) => void;
  onEdit: (r: AutomationRow) => void;
  onLink: (r: AutomationRow) => void;
  onUnlink: (r: AutomationRow) => void;
};

function RowTr({
  r,
  canManage,
  canUpdateStatus,
  selected,
  selectable,
  onToggle,
  actions,
  pending,
}: {
  r: AutomationRow;
  canManage: boolean;
  canUpdateStatus: boolean;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
  actions: RowActions;
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
          <span style={{ color: "#CBD5E1", fontSize: "0.78rem" }}>-</span>
        )}
      </td>
      <td style={{ padding: "10px 10px", maxWidth: 220 }}>
        {r.scriptPath ? (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }} title={r.scriptPath}>
            {r.scriptPath}
          </div>
        ) : (
          <span style={{ color: "#CBD5E1", fontSize: "0.78rem" }}>-</span>
        )}
      </td>
      <td style={{ padding: "10px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {actions.badge(r.status)}
          {canUpdateStatus && r.linkId && (
            <select
              value={r.status === "STALE" ? "AUTOMATED" : r.status}
              onChange={(e) => actions.onQuickStatus(r, e.target.value as AutomationRowStatus)}
              disabled={pending}
              title="Ubah status"
              style={{ border: "1px solid #E2E8F0", borderRadius: 6, background: "#fff", fontSize: "0.72rem", color: "#64748B", padding: "2px 4px", cursor: "pointer" }}
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
            {actions.formatDate(r.lastRunAt)}
            {r.lastResult && (
              <div style={{ fontSize: "0.7rem", color: r.lastResult === "PASS" ? "#059669" : r.lastResult === "FAIL" ? "#BE123C" : "#94A3B8" }}>{r.lastResult}</div>
            )}
          </div>
        ) : (
          <span style={{ color: "#CBD5E1" }}>-</span>
        )}
      </td>
      <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {canManage && r.linkId && (
            <IconBtn title="Edit" onClick={() => actions.onEdit(r)}>
              <Pencil size={14} />
            </IconBtn>
          )}
          {canManage && r.linkId && (
            <IconBtn title="Unlink" onClick={() => actions.onUnlink(r)} danger>
              <Link2Off size={14} />
            </IconBtn>
          )}
          {canManage && !r.linkId && (
            <IconBtn title="Link automation" onClick={() => actions.onLink(r)}>
              <Link2 size={14} />
            </IconBtn>
          )}
        </div>
      </td>
    </tr>
  );
}

/** Mode flat: baris lintas suite, paginated dari server. */
function FlatRows({
  rows,
  loading,
  canManage,
  canUpdateStatus,
  selected,
  isRowSelectable,
  onToggleSelect,
  renderSelectAll,
  badge,
  formatDate,
  onQuickStatus,
  onEdit,
  onLink,
  onUnlink,
  pending,
}: {
  rows: AutomationRow[];
  loading: boolean;
  canManage: boolean;
  canUpdateStatus: boolean;
  selected: Set<string>;
  isRowSelectable: (r: AutomationRow) => boolean;
  onToggleSelect: (id: string) => void;
  renderSelectAll: (rows: AutomationRow[]) => ReactNode;
  badge: (s: AutomationRowStatus) => ReactNode;
  formatDate: (iso: string | null) => string;
  onQuickStatus: (r: AutomationRow, s: AutomationRowStatus) => void;
  onEdit: (r: AutomationRow) => void;
  onLink: (r: AutomationRow) => void;
  onUnlink: (r: AutomationRow) => void;
  pending: boolean;
}) {
  const actions: RowActions = { badge, formatDate, onQuickStatus, onEdit, onLink, onUnlink };
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={8} style={{ padding: "3rem 1rem", textAlign: "center", color: "#9CA3AF", fontSize: "0.9rem" }}>
          {loading ? "Memuat…" : "Tidak ada test case sesuai filter."}
        </td>
      </tr>
    );
  }
  return (
    <>
      <tr style={{ background: "#F8FAFC" }}>
        <td style={{ padding: "8px 10px" }}>{canManage && renderSelectAll(rows)}</td>
        <td colSpan={7} style={{ padding: "8px 10px", fontSize: "0.75rem", color: "#64748B" }}>
          {loading ? "Memuat…" : "Semua suite"}
        </td>
      </tr>
      {rows.map((r) => (
        <RowTr
          key={r.id}
          r={r}
          canManage={canManage}
          canUpdateStatus={canUpdateStatus}
          selected={selected.has(r.id)}
          selectable={isRowSelectable(r)}
          onToggle={() => onToggleSelect(r.id)}
          actions={actions}
          pending={pending}
        />
      ))}
    </>
  );
}

/**
 * Header grup suite + baris TC-nya. Komponen ini SELALU ter-mount (agar data
 * yang sudah dimuat tetap tersimpan saat di-collapse) tetapi baru fetch saat
 * pertama kali di-expand dan saat filter/reload/mutasi berubah.
 */
function SuiteGroup({
  group,
  filterQuery,
  reloadToken,
  canManage,
  canUpdateStatus,
  selected,
  isRowSelectable,
  onToggleSelect,
  renderSelectAll,
  badge,
  formatDate,
  onQuickStatus,
  onEdit,
  onLink,
  onUnlink,
  pending,
}: {
  group: AutomationSuiteGroup;
  filterQuery: string;
  reloadToken: number;
  canManage: boolean;
  canUpdateStatus: boolean;
  selected: Set<string>;
  isRowSelectable: (r: AutomationRow) => boolean;
  onToggleSelect: (id: string) => void;
  renderSelectAll: (rows: AutomationRow[]) => ReactNode;
  badge: (s: AutomationRowStatus) => ReactNode;
  formatDate: (iso: string | null) => string;
  onQuickStatus: (r: AutomationRow, s: AutomationRowStatus) => void;
  onEdit: (r: AutomationRow) => void;
  onLink: (r: AutomationRow) => void;
  onUnlink: (r: AutomationRow) => void;
  pending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [state, setState] = useState<RowsState>({ rows: [], total: 0, loading: false, error: null });

  const requestKey = `${filterQuery}|${page}|${perPage}|${reloadToken}`;
  const lastKey = useRef<string | null>(null);

  // Ganti filter -> kembali ke halaman 1.
  useEffect(() => {
    setPage(1);
  }, [filterQuery]);

  useEffect(() => {
    if (!expanded) return;
    if (lastKey.current === requestKey) return;
    lastKey.current = requestKey;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    getJSON<AutomationPayload>(buildRowsPath(filterQuery, group.suiteId, page, perPage))
      .then((p) => {
        if (!cancelled) setState({ rows: p.rows, total: p.rowsTotal, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Gagal memuat baris." }));
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, requestKey, filterQuery, group.suiteId, page, perPage]);

  const actions: RowActions = { badge, formatDate, onQuickStatus, onEdit, onLink, onUnlink };

  return (
    <>
      <tr
        style={{
          background: "rgba(248, 250, 252, 0.7)",
          borderTop: "1px solid #E2E8F0",
          borderBottom: "1px solid #E2E8F0",
        }}
      >
        <td colSpan={8} style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                // Dua sisi: identitas suite di kiri, badge di kanan.
                justifyContent: "space-between",
                gap: 12,
                flex: 1,
                // py-3: beri ruang vertikal agar teks & badge tidak bertumpuk.
                padding: "12px 12px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {/* Kiri: chevron + nama suite + breadcrumb project */}
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <ChevronRight
                  size={15}
                  style={{
                    color: "#64748B",
                    flexShrink: 0,
                    transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.18s ease",
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>
                  {group.suiteName}
                </span>
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    fontWeight: 400,
                    color: "#94A3B8",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {group.projectName}
                  {group.platform ? ` · ${PLATFORM_LABEL[group.platform]}` : ""}
                </span>
              </span>

              {/* Kanan: badge total TC & status, punya container sendiri */}
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                <GroupBadge label={`${group.total} TC`} />
                {group.notAutomated > 0 && <GroupBadge label={`${group.notAutomated} Belum`} />}
                {group.failing > 0 && <MiniBadge color="#BE123C" bg="#FFF1F2" border="#FECDD3" label={`${group.failing} Failing`} />}
                {group.stale > 0 && <MiniBadge color="#B45309" bg="#FFFBEB" border="#FDE68A" label={`${group.stale} Stale`} />}
                {group.unstable > 0 && <MiniBadge color="#6D28D9" bg="#F5F3FF" border="#DDD6FE" label={`${group.unstable} Unstable`} />}
              </span>
            </button>
            {/* Ditaruh di luar tombol expand agar klik checkbox tidak ikut toggle grup. */}
            {expanded && canManage && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", fontSize: "0.72rem", color: "#94A3B8", whiteSpace: "nowrap", cursor: "pointer" }}>
                {renderSelectAll(state.rows)}
                pilih halaman
              </label>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <>
          {/* Sub-header kolom khusus grup ini — pengganti header global yang
              disembunyikan di mode grouped. */}
          {!state.loading && !state.error && state.rows.length > 0 && (
            <tr
              style={{
                textAlign: "left",
                color: "#64748B",
                borderBottom: "1px solid #E2E8F0",
                background: "#FCFDFE",
              }}
            >
              <th style={{ ...SUB_HEAD, width: 30 }} />
              <th style={SUB_HEAD}>TC</th>
              <th style={SUB_HEAD}>Project / Suite</th>
              <th style={SUB_HEAD}>External ID</th>
              <th style={SUB_HEAD}>Script Path</th>
              <th style={SUB_HEAD}>Status</th>
              <th style={SUB_HEAD}>Last Run</th>
              <th style={{ ...SUB_HEAD, width: 30 }}>Aksi</th>
            </tr>
          )}
          {state.loading && state.rows.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ padding: "1.5rem", textAlign: "center", color: "#94A3B8", fontSize: "0.85rem" }}>
                <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite", verticalAlign: "middle" }} /> Memuat…
              </td>
            </tr>
          ) : state.error ? (
            <tr>
              <td colSpan={8} style={{ padding: "1.5rem", textAlign: "center", color: "#BE123C", fontSize: "0.85rem" }}>
                {state.error}
              </td>
            </tr>
          ) : state.rows.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ padding: "1.5rem", textAlign: "center", color: "#9CA3AF", fontSize: "0.85rem" }}>
                Tidak ada test case di suite ini.
              </td>
            </tr>
          ) : (
            state.rows.map((r) => (
              <RowTr
                key={r.id}
                r={r}
                canManage={canManage}
                canUpdateStatus={canUpdateStatus}
                selected={selected.has(r.id)}
                selectable={isRowSelectable(r)}
                onToggle={() => onToggleSelect(r.id)}
                actions={actions}
                pending={pending}
              />
            ))
          )}
          {state.total > 0 && (
            <tr>
              <td colSpan={8} style={{ padding: 0 }}>
                <HistoryPagination
                  total={state.total}
                  page={page}
                  perPage={perPage}
                  baseUrl="/automation"
                  label="Test Case"
                  onPageChange={setPage}
                  onPerPageChange={(n) => {
                    setPerPage(n);
                    setPage(1);
                  }}
                />
              </td>
            </tr>
          )}
        </>
      )}
    </>
  );
}

/** Gaya bersama untuk sub-header kolom di dalam grup (mode grouped). */
const SUB_HEAD: React.CSSProperties = {
  padding: "10px 10px",
  fontWeight: 700,
  fontSize: "0.72rem",
  textTransform: "uppercase",
};

/**
 * Badge netral untuk header grup (total TC & jumlah Belum). Badge status yang
 * bermasalah (Failing/Stale/Unstable) sengaja tetap berwarna lewat MiniBadge
 * supaya sinyal problem-first tidak hilang.
 */
function GroupBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 500,
        color: "#475569",
        background: "rgba(226, 232, 240, 0.6)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function MiniBadge({ label, color, bg, border }: { label: string; color: string; bg: string; border: string }) {
  return (
    <span
      style={{
        padding: "1px 8px",
        borderRadius: 999,
        fontSize: "0.68rem",
        fontWeight: 700,
        color,
        background: bg,
        border: `1px solid ${border}`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function IconBtn({ children, onClick, title, danger }: { children: ReactNode; onClick: () => void; title: string; danger?: boolean }) {
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
          <pre style={{ margin: 0, color: "#E2E8F0", fontSize: "0.74rem", fontFamily: "var(--font-mono)", lineHeight: 1.6, whiteSpace: "pre" }}>
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
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", color: "#374151", fontWeight: 600, fontSize: "0.78rem", cursor: "pointer" }}
          >
            {copied ? "Tersalin ✓" : "Salin contoh"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
