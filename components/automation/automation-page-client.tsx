"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock4,
  Copy,
  FileJson,
  FlaskConical,
  Info,
  Link2,
  Link2Off,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { AutomationOverview } from "@/components/automation/automation-overview";
import {
  applyAutomationReport,
  bulkLinkAutomation,
  bulkUnlinkAutomation,
  bulkUnlinkAutomationByTestCaseIds,
  createAutomationLink,
  updateAutomationLink,
  updateAutomationStatus,
  type ApplyAutomationReportResult,
} from "@/lib/actions/automation";
import { parsePlaywrightReport, type ParsedReport } from "@/lib/playwright-report";
import { getJSON, useApi } from "@/lib/client/use-api";
import { HistoryPagination } from "@/components/test-runs/history-pagination";
import { Spinner, useToast, Toast, ConfirmDialog } from "@/components/ui/feedback";
import { Select } from "@/components/ui/select";
import { ErrorBlock, StatsCardsSkeleton, TableCardSkeleton } from "@/components/ui/data-states";
import type {
  AutomationOverviewPayload,
  AutomationPayload,
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

/** Urutan grup Platform di dropdown filter Suite. Platform di luar daftar ditaruh paling akhir. */
const PLATFORM_GROUP_ORDER: string[] = ["WEB", "HARDWARE", "MOBILE", "API"];

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

/**
 * Urutkan opsi project: Platform dulu (A→Z), baru nama project. Project tanpa
 * platform ditaruh paling akhir supaya item berplatform sama selalu berkumpul.
 */
function byPlatformThenName(
  a: { name: string; platform: string | null },
  b: { name: string; platform: string | null }
): number {
  if (a.platform !== b.platform) {
    if (!a.platform) return 1;
    if (!b.platform) return -1;
    return a.platform.localeCompare(b.platform);
  }
  return a.name.localeCompare(b.name);
}

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

/** Tanggal hari ini (WIB) "YYYY-MM-DD" — default hari terpilih di overview. */
function todayWibKey(): string {
  const w = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
}

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
  // Daftar selalu dikelompokkan per suite (toggle "Group by Suite" dihapus).
  const groupBySuite: boolean = true;
  const [flatPage, setFlatPage] = useState(1);
  const [flatPerPage, setFlatPerPage] = useState(DEFAULT_PER_PAGE);

  // Overview health (KPI/grafik/matriks): rentang hari + hari terpilih.
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [selectedDate, setSelectedDate] = useState<string>(todayWibKey);
  const [matrixLimit, setMatrixLimit] = useState(20);

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
  const [reportOpen, setReportOpen] = useState(false);

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

  // Overview health (bagian KPI s.d. Coverage) — path berubah saat hari/limit
  // berubah sehingga useApi otomatis refetch.
  const overviewPath = `/api/automation/overview?days=${days}&date=${selectedDate}&limit=${matrixLimit}`;
  const overview = useApi<AutomationOverviewPayload>(overviewPath, { alwaysFresh: true });

  // reload() menyegarkan payload utama; reloadToken memicu grup yang terbuka
  // ikut memuat ulang supaya UI tidak stale setelah mutasi.
  const [reloadToken, setReloadToken] = useState(0);
  const reloadAll = () => {
    reload();
    overview.reload();
    setReloadToken((t) => t + 1);
  };

  // Akumulasi daftar suite yang pernah terlihat (untuk filter dependent).
  const [knownSuites, setKnownSuites] = useState<
    Map<string, { id: string; name: string; projectId: string; platform: string | null }>
  >(new Map());
  useEffect(() => {
    if (!data) return;
    setKnownSuites((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const g of data.suiteGroups) {
        if (!next.has(g.suiteId)) {
          next.set(g.suiteId, {
            id: g.suiteId,
            name: g.suiteName,
            projectId: g.projectId,
            platform: g.platform,
          });
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

  /**
   * Kelompokkan Suite per Platform untuk daftar filter: grup diurutkan sesuai
   * PLATFORM_GROUP_ORDER (platform tak dikenal / kosong di akhir), dan di dalam
   * tiap grup item diurutkan berdasarkan nama suite.
   */
  const suiteFilterGroups = useMemo(() => {
    const groups = new Map<string, { platform: string | null; items: typeof availableSuites }>();
    for (const s of availableSuites) {
      const key = s.platform ?? "__none__";
      const group = groups.get(key);
      if (group) group.items.push(s);
      else groups.set(key, { platform: s.platform, items: [s] });
    }
    const ordered = Array.from(groups.values()).sort((a, b) => {
      const ia = a.platform ? PLATFORM_GROUP_ORDER.indexOf(a.platform) : -1;
      const ib = b.platform ? PLATFORM_GROUP_ORDER.indexOf(b.platform) : -1;
      const ra = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
      const rb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
      return ra - rb;
    });
    for (const group of ordered) group.items.sort((a, b) => a.name.localeCompare(b.name));
    return ordered;
  }, [availableSuites]);

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

  // Opsi project untuk filter: platform dulu (A→Z), lalu nama (lihat byPlatformThenName).
  const sortedProjects = [...data.projects].sort(byPlatformThenName);

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
        style={{ cursor: "pointer" }}
      />
    );
  };

  return (
    <main
      className="auto-page"
      style={{
        fontFamily: "var(--font-sans)",
        margin: "-1rem",
        padding: 24,
        minHeight: "calc(100% + 2rem)",
        background: "#F4F5F7",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* Bagian 1–6: Header, KPI, Run per Hari, Perlu Perhatian, matriks,
          detail hari terpilih, dan Coverage per Project. */}
      <AutomationOverview
        data={overview.data}
        days={days}
        today={todayWibKey()}
        selectedDate={selectedDate}
        onDaysChange={(d) => setDays(d)}
        onSelectDate={(d) => setSelectedDate(d)}
        onUpload={() => setReportOpen(true)}
        onCiGuide={() => setCiOpen(true)}
        onShowAllMatrix={() => setMatrixLimit(500)}
      />

      {/* Bagian 7: Test Case per Suite — filter di dalam card. */}
      <section
        style={{
          background: "#fff",
          border: "1px solid #E5E7EB",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #EEF0F3",
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0, marginRight: "auto", fontSize: 17, fontWeight: 600, color: "#0F172A" }}>
            Test Case per Suite
          </h2>
          <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 300 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Cari TC ID, judul, external ID…"
              style={{ ...inputBase, paddingLeft: 30, width: "100%", height: 40, borderRadius: 10 }}
            />
          </div>

        <Select
          value={statusFilter}
          ariaLabel="Filter status automation"
          style={{ width: 180 }}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setFlatPage(1);
          }}
        >
          <option value="ALL">Semua Status</option>
          <option value="FAILING">Failing</option>
          <option value="STALE">Stale</option>
          <option value="UNSTABLE">Unstable</option>
          <option value="NOT_AUTOMATED">Belum Automated</option>
          <option value="AUTOMATED">Automated</option>
        </Select>

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
          {sortedProjects.map((p) => (
            <label key={p.id} style={filterOptionRow} {...filterOptionHover}>
              <span style={filterOptionLeft}>
                <input type="checkbox" checked={selProjects.has(p.id)} onChange={() => toggleProject(p.id)} />
                <span style={filterOptionName}>{p.name}</span>
              </span>
              {p.platform ? (
                <span style={filterOptionBadge}>{PLATFORM_LABEL[p.platform]}</span>
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
          {suiteFilterGroups.map((group) => (
            <div key={group.platform ?? "__none__"}>
              <div style={filterGroupHeader}>
                {group.platform ? PLATFORM_LABEL[group.platform] ?? group.platform : "Lainnya"}
              </div>
              {group.items.map((s) => (
                <label key={s.id} style={filterOptionRow} {...filterOptionHover}>
                  <span style={filterOptionLeft}>
                    <input type="checkbox" checked={selSuites.has(s.id)} onChange={() => toggleSuite(s.id)} />
                    <span style={filterOptionName}>{s.name}</span>
                  </span>
                  {s.platform ? (
                    <span style={filterOptionBadge}>{PLATFORM_LABEL[s.platform]}</span>
                  ) : null}
                </label>
              ))}
            </div>
          ))}
          {availableSuites.length === 0 && (
            <div style={{ padding: "6px 4px", fontSize: "0.8rem", color: "#9CA3AF" }}>Tidak ada suite.</div>
          )}
        </MultiChipFilter>

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
      </section>

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
      {reportOpen && (
        <UploadReportModal
          onClose={() => setReportOpen(false)}
          onApplied={(applied) => {
            showToast(`${applied} Hasil test berhasil diterapkan.`, "success");
            setReportOpen(false);
            reloadAll();
          }}
        />
      )}

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
    </main>
  );
}

/* ---------- Sub-components ---------- */

/* Item opsi di dalam popover filter: nama di kiri, badge platform di kanan. */
const filterOptionRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  width: "100%",
  padding: "6px 8px",
  borderRadius: 8,
  cursor: "pointer",
};

const filterOptionLeft: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
};

const filterOptionName: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "#1E293B",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const filterOptionBadge: CSSProperties = {
  flexShrink: 0,
  fontSize: 10,
  fontWeight: 600,
  color: "#64748B",
  background: "#F1F5F9",
  padding: "2px 8px",
  borderRadius: 9999,
  border: "1px solid rgba(226, 232, 240, 0.6)",
  lineHeight: "16px",
};

/* Sub-header kategori platform di dalam daftar opsi Suite. */
const filterGroupHeader: CSSProperties = {
  padding: "8px 8px 2px",
  fontSize: 10,
  fontWeight: 700,
  color: "#94A3B8",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const filterOptionHover = {
  onMouseEnter: (e: ReactMouseEvent<HTMLLabelElement>) => {
    e.currentTarget.style.background = "#F8FAFC";
  },
  onMouseLeave: (e: ReactMouseEvent<HTMLLabelElement>) => {
    e.currentTarget.style.background = "transparent";
  },
};

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
              minWidth: 300,
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
          <input type="checkbox" checked={selected} onChange={onToggle} style={{ cursor: "pointer" }} />
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
            <Select
              size="sm"
              value={r.status === "STALE" ? "AUTOMATED" : r.status}
              disabled={pending}
              ariaLabel="Ubah status automation"
              title="Ubah status"
              style={{ width: 130, color: "#64748B" }}
              onChange={(e) => actions.onQuickStatus(r, e.target.value as AutomationRowStatus)}
            >
              <option value="AUTOMATED">Automated</option>
              <option value="FAILING">Failing</option>
              <option value="UNSTABLE">Unstable</option>
              <option value="NOT_AUTOMATED">Belum Automated</option>
            </Select>
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
      <tr style={{ borderTop: "1px solid #EEF0F3" }}>
        <td colSpan={8} style={{ padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="auto-hover-row"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(260px,1fr) 260px 170px",
                gap: 16,
                alignItems: "center",
                flex: 1,
                minWidth: 0,
                padding: "12px 24px",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <ChevronRight
                  size={15}
                  aria-hidden="true"
                  style={{
                    color: "#64748B",
                    flexShrink: 0,
                    transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.18s ease",
                  }}
                />
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#0F172A",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {group.suiteName}
                </span>
              </span>

              <span
                title={`${group.projectName}${group.platform ? ` · ${PLATFORM_LABEL[group.platform] ?? group.platform}` : ""}`}
                style={{
                  fontSize: 13,
                  color: "#64748B",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {group.projectName}
                {group.platform ? ` · ${PLATFORM_LABEL[group.platform] ?? group.platform}` : ""}
              </span>

              <span style={{ fontSize: 13, color: "#64748B", textAlign: "right", whiteSpace: "nowrap" }}>
                <span style={{ fontWeight: 600, color: "#0F172A" }}>{group.automated}</span> /{" "}
                {group.total} automated
              </span>
            </button>
            {/* Ditaruh di luar tombol expand agar klik checkbox tidak ikut toggle grup. */}
            {expanded && canManage && (
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 24px", fontSize: "0.72rem", color: "#94A3B8", whiteSpace: "nowrap", cursor: "pointer" }}>
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

/** Batas ukuran file hasil (10 MB). */
const MAX_REPORT_BYTES = 10 * 1024 * 1024;

const COMMAND = "npx playwright test --reporter=json > hasil.json";

const fmtBytes = (n: number): string =>
  n >= 1024 * 1024
    ? `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

/** Item ringkasan hasil (dot + label + angka). */
function ResultCount({
  dot,
  color,
  label,
  n,
}: {
  dot: string;
  color: string;
  label: string;
  n: number;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
      <span>{label}</span>
      <span style={{ fontWeight: 600, color }}>{n}</span>
    </span>
  );
}

/** Satu langkah bernomor di body modal. */
function ReportStep({
  n,
  title,
  first,
  children,
}: {
  n: number;
  title: string;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "24px 1fr",
        columnGap: 14,
        padding: "16px 0",
        borderTop: first ? "none" : "1px solid #EEF0F3",
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "#F1F5F9",
          color: "#334155",
          fontSize: 12,
          fontWeight: 600,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {n}
      </span>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 15, lineHeight: "24px", fontWeight: 600, color: "#0F172A" }}>
          {title}
        </div>
        {children}
      </div>
    </li>
  );
}

/**
 * Modal "Upload hasil test": 3 langkah (jalankan test → upload file → periksa
 * hasil). Parsing & penerapan memakai logika yang sudah ada
 * (parsePlaywrightReport + applyAutomationReport).
 */
function UploadReportModal({
  onClose,
  onApplied,
}: {
  onClose: () => void;
  /** Dipanggil setelah sukses: parent menampilkan toast, menutup modal, refetch. */
  onApplied: (applied: number) => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [parsed, setParsed] = useState<ParsedReport | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ApplyAutomationReportResult | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(COMMAND);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 1500);
    } catch {
      // clipboard tidak tersedia — abaikan
    }
  };

  const resetFile = () => {
    setFileName(null);
    setFileSize(null);
    setParsed(null);
    setInvalid(null);
    setResult(null);
  };

  const readText = (text: string, name: string | null, size: number | null) => {
    setResult(null);
    if (name) {
      setFileName(name);
      setFileSize(size);
    }
    const trimmed = text.trim();
    if (!trimmed) {
      setParsed(null);
      setInvalid(null);
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      setParsed(null);
      setInvalid("Bukan format JSON Playwright yang valid. Pastikan memakai --reporter=json.");
      return;
    }
    const p = parsePlaywrightReport(json);
    if (p.entries.length === 0 && p.errors.length > 0) {
      setParsed(null);
      setInvalid(p.errors[0]);
      return;
    }
    setParsed(p);
    setInvalid(null);
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_REPORT_BYTES) {
      setFileName(file.name);
      setFileSize(file.size);
      setParsed(null);
      setInvalid("Ukuran file melebihi 10 MB.");
      return;
    }
    readText(await file.text(), file.name, file.size);
  };

  const counts = useMemo(() => {
    const c = { pass: 0, fail: 0, skipped: 0 };
    for (const e of parsed?.entries ?? []) {
      if (e.status === "PASS") c.pass += 1;
      else if (e.status === "FAIL") c.fail += 1;
      else c.skipped += 1;
    }
    return c;
  }, [parsed]);

  const total = parsed?.entries.length ?? 0;
  const applyable = total > 0;

  const apply = async () => {
    if (!parsed || total === 0 || pending) return;
    setPending(true);
    setResult(null);
    try {
      const res = await applyAutomationReport(parsed.entries);
      if (res.error) {
        setResult(res);
        return;
      }
      // Sukses → parent: toast, tutup modal, refetch dashboard.
      onApplied((res.updated ?? 0) + (res.created ?? 0));
    } catch {
      setResult({ error: "Terjadi kesalahan. Coba lagi." });
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.45)" }}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-report-title"
        style={{
          position: "relative",
          width: 600,
          maxWidth: "100%",
          maxHeight: "calc(100vh - 80px)",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 24px 48px rgba(15,23,42,0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header (tetap) */}
        <div
          style={{
            padding: "20px 24px 18px 28px",
            borderBottom: "1px solid #EEF0F3",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <h3 id="upload-report-title" style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0F172A" }}>
            Upload hasil test
          </h3>
          <button
            type="button"
            className="auto-close-btn"
            onClick={onClose}
            aria-label="Tutup"
            style={{
              width: 40,
              height: 40,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              cursor: "pointer",
            }}
          >
            <X size={20} style={{ color: "#475569" }} />
          </button>
        </div>

        {/* Body (satu-satunya area scroll) */}
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "8px 28px 24px" }}>
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {/* Langkah 1 */}
            <ReportStep n={1} title="Jalankan test dan simpan hasilnya" first>
              <p style={{ margin: 0, fontSize: 14, lineHeight: "21px", color: "#475569" }}>
                Tulis External Test ID di judul test, mis.{" "}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#0F172A" }}>
                  [LG-001]
                </span>
                , agar hasilnya otomatis tercatat ke test case yang sesuai.
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 8px 8px 14px",
                  background: "#F8FAFC",
                  border: "1px solid #E5E7EB",
                  borderRadius: 10,
                }}
              >
                <code
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    color: "#0F172A",
                    whiteSpace: "nowrap",
                    overflowX: "auto",
                  }}
                >
                  {COMMAND}
                </code>
                <button
                  type="button"
                  className="auto-copy-btn"
                  onClick={() => void copyCommand()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 32,
                    padding: "0 10px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {copiedCmd ? <Check size={14} /> : <Copy size={14} />}
                  {copiedCmd ? "Tersalin" : "Salin"}
                </button>
              </div>
            </ReportStep>

            {/* Langkah 2 */}
            <ReportStep n={2} title="Upload file hasil">
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                style={{ display: "none" }}
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />

              {fileName ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 8px 12px 14px",
                    border: `1px solid ${invalid ? "#FCA5A5" : "#E5E7EB"}`,
                    background: invalid ? "#FEF2F2" : "#fff",
                    borderRadius: 12,
                  }}
                >
                  <FileJson
                    size={20}
                    aria-hidden="true"
                    style={{ color: invalid ? "#DC2626" : "#64748B", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      title={fileName}
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#0F172A",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fileName}
                    </div>
                    <div style={{ fontSize: 13, color: invalid ? "#B91C1C" : "#15803D" }}>
                      {invalid ?? `${fmtBytes(fileSize ?? 0)} · berhasil dibaca`}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="auto-file-clear"
                    onClick={resetFile}
                    aria-label="Hapus file"
                    style={{
                      width: 32,
                      height: 32,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "none",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <X size={16} style={{ color: "#64748B" }} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="auto-dropzone"
                    data-drag={dragOver ? "true" : "false"}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) void onFile(f);
                    }}
                    style={{
                      width: "100%",
                      padding: "22px 16px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      cursor: "pointer",
                    }}
                  >
                    <Upload size={24} aria-hidden="true" style={{ color: "#64748B" }} />
                    <span style={{ fontSize: 14, color: "#334155" }}>
                      <span style={{ fontWeight: 600, color: "#B45309" }}>Pilih file</span> atau tarik ke
                      sini
                    </span>
                    <span style={{ fontSize: 13, color: "#64748B" }}>
                      File JSON dari Playwright, maks. 10 MB
                    </span>
                  </button>

                  <button
                    type="button"
                    className="auto-text-link"
                    onClick={() => setPasteOpen((v) => !v)}
                  >
                    {pasteOpen ? "Sembunyikan kolom JSON" : "Atau tempel isi JSON"}
                  </button>

                  {pasteOpen && (
                    <div>
                      <label htmlFor="automation-json-input" className="sr-only">
                        Isi JSON hasil test
                      </label>
                      <textarea
                        id="automation-json-input"
                        rows={4}
                        placeholder='{"suites": [ … ] }'
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v.trim()) {
                            setParsed(null);
                            setInvalid(null);
                            setResult(null);
                            return;
                          }
                          if (v.trim().startsWith("{")) readText(v, null, null);
                        }}
                        className="auto-json-textarea"
                        style={{
                          width: "100%",
                          padding: "12px 14px",
                          fontFamily: "var(--font-mono)",
                          fontSize: 13,
                          lineHeight: "20px",
                          border: "1px solid #E2E8F0",
                          borderRadius: 10,
                          resize: "vertical",
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </ReportStep>

            {/* Langkah 3 — hanya setelah berhasil dibaca */}
            {parsed && (
              <ReportStep n={3} title="Periksa hasil">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 14, color: "#475569" }}>
                  <span>
                    <span style={{ fontWeight: 600, color: "#0F172A" }}>{total}</span> test terbaca
                  </span>
                  <ResultCount dot="#16A34A" color="#15803D" label="Passed" n={counts.pass} />
                  <ResultCount dot="#DC2626" color="#B91C1C" label="Failed" n={counts.fail} />
                  <ResultCount dot="#A855F7" color="#7E22CE" label="Skipped" n={counts.skipped} />
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    fontSize: 14,
                    lineHeight: "21px",
                    color: "#334155",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <Check
                      size={16}
                      aria-hidden="true"
                      style={{ color: "#16A34A", marginTop: 2, flexShrink: 0 }}
                    />
                    <span>
                      <span style={{ fontWeight: 600 }}>{total}</span> test cocok dengan test case dan
                      akan diperbarui.
                    </span>
                  </div>
                  {parsed.withoutId > 0 && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <AlertTriangle
                        size={16}
                        aria-hidden="true"
                        style={{ color: "#D97706", marginTop: 2, flexShrink: 0 }}
                      />
                      <span>
                        <span style={{ fontWeight: 600 }}>{parsed.withoutId}</span> test tanpa External
                        Test ID dan akan dilewati:{" "}
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                          {parsed.withoutIdTitles.join(", ")}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </ReportStep>
            )}
          </ol>

          {result?.error && (
            <div style={{ marginTop: 16, fontSize: "0.8rem", color: "#BE123C" }}>{result.error}</div>
          )}
        </div>

        {/* Footer (tetap) */}
        <div
          style={{
            padding: "16px 24px 16px 28px",
            borderTop: "1px solid #EEF0F3",
            background: "#fff",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          {!applyable && (
            <span style={{ fontSize: 14, color: "#64748B" }}>Upload file hasil untuk melanjutkan.</span>
          )}
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button
              type="button"
              className="auto-ghost-btn"
              onClick={onClose}
              style={{
                height: 44,
                padding: "0 18px",
                border: "none",
                fontSize: 15,
                fontWeight: 600,
                color: "#334155",
                cursor: "pointer",
              }}
            >
              Batal
            </button>
            <button
              type="button"
              className="auto-primary-btn"
              onClick={() => void apply()}
              disabled={pending || !applyable}
              aria-busy={pending}
              style={{
                height: 44,
                padding: "0 20px",
                border: "none",
                fontSize: 15,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                background: applyable ? "#F59E0B" : "#F1F5F9",
                color: applyable ? "#111827" : "#94A3B8",
                cursor: pending || !applyable ? "not-allowed" : "pointer",
              }}
            >
              {pending ? (
                <>
                  <Spinner size={15} /> Menerapkan...
                </>
              ) : applyable ? (
                `Terapkan ${total} hasil`
              ) : (
                "Terapkan"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
