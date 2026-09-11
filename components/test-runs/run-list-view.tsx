"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { TestRunRow } from "@/components/test-runs/test-run-row";
import { CreateRunButton } from "@/components/test-runs/create-run-button";
import { DeleteRunButton } from "@/components/test-runs/delete-run-button";
import { HistoryControls } from "@/components/test-runs/history-controls";
import { ErrorBlock, TableCardSkeleton } from "@/components/ui/data-states";
import { Toast, useToast } from "@/components/ui/feedback";
import { useApi } from "@/lib/client/use-api";
import { RUN_STATUS_LABEL, type RunStatusValue } from "@/lib/run-status";
import { setRunStatus } from "@/lib/actions/test-runs";
import type { ActiveRunsPayload } from "@/types/api";

/**
 * Urutan grup status di halaman Active Runs: yang paling butuh perhatian di atas
 * (sedang dikerjakan & retest), yang belum mulai di bawah.
 */
const GROUP_ORDER = ["IN_PROGRESS", "RE_OPEN", "PENDING"] as const;

/** Status yang membuat sebuah run masih muncul di halaman Active Runs. */
const ACTIVE_STATUSES = new Set<string>(GROUP_ORDER);

/**
 * Terapkan perpindahan status langsung di daftar lokal.
 *
 * Status yang masih termasuk Active Runs cukup di-patch di tempat (barisnya
 * berpindah grup). Status lain — mis. COMPLETED — berarti run keluar dari
 * halaman ini, sehingga barisnya dibuang.
 */
function applyStatusLocally(
  runs: ActiveRunsPayload["runs"],
  runId: string,
  status: string
): ActiveRunsPayload["runs"] {
  if (ACTIVE_STATUSES.has(status)) return runs.map((r) => (r.id === runId ? { ...r, status } : r));
  return runs.filter((r) => r.id !== runId);
}

/**
 * Definisi kolom tabel Active Runs — sumber tunggal untuk <colgroup> dan
 * sub-header kolom per grup. Seluruh grup berbagi satu tabel dengan lebar
 * kolom dipatok (persen + tableLayout: fixed), sedangkan baris nama kolom
 * dirender ulang di dalam tiap grup agar ikut tersembunyi saat di-collapse.
 * Urutan & label sama persis dengan struktur kolom bawaan sistem.
 * Kolom "Aksi" paling akhir, dan hanya dipakai bila user boleh mengedit.
 */
const TABLE_COLUMNS: {
  label: string;
  width: string;
  pad: string;
  align?: "left" | "right";
  nowrap?: boolean;
}[] = [
  { label: "Run ID", width: "13%", pad: "0.65rem 1rem", nowrap: true },
  { label: "Nama Run", width: "14%", pad: "0.65rem 1rem" },
  { label: "Projects Covered", width: "11%", pad: "0.65rem 0.5rem" },
  { label: "Suites Included", width: "11%", pad: "0.65rem 0.5rem" },
  { label: "Sprint", width: "6%", pad: "0.65rem 0.5rem" },
  { label: "Status", width: "12%", pad: "0.65rem 0.5rem" },
  { label: "Pass Rate", width: "6%", pad: "0.65rem 0.5rem" },
  { label: "Dibuat Oleh", width: "9%", pad: "0.65rem 0.5rem" },
  { label: "Tanggal", width: "10%", pad: "0.65rem 1rem" },
  { label: "Aksi", width: "8%", pad: "0.65rem 1rem", align: "right" },
];

export type ActiveRunsSearchParams = {
  q?: string;
  platforms?: string;
  projects?: string;
  project?: string;
  /** Rentang bulan "YYYY-MM". */
  from?: string;
  to?: string;
};

export function RunListView({ searchParams }: { searchParams: ActiveRunsSearchParams }) {
  const apiPath = useMemo(() => {
    const sp = new URLSearchParams();
    if (searchParams.q) sp.set("q", searchParams.q);
    if (searchParams.platforms) sp.set("platforms", searchParams.platforms);
    if (searchParams.projects) sp.set("projects", searchParams.projects);
    if (searchParams.project) sp.set("project", searchParams.project);
    if (searchParams.from) sp.set("from", searchParams.from);
    if (searchParams.to) sp.set("to", searchParams.to);
    const qs = sp.toString();
    return `/api/test-runs${qs ? `?${qs}` : ""}`;
  }, [searchParams]);

  const { data, error, loading, reload } = useApi<ActiveRunsPayload>(apiPath);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);
  // Accordion per status: default terbuka. Yang disimpan hanya yang ditutup.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const { toast, showToast, dismissToast } = useToast();

  /**
   * Salinan lokal daftar run, supaya mutasi baris (ubah status, hapus) tampil
   * seketika TANPA refetch.
   *
   * `source` menyimpan payload server terakhir yang sudah disalin. Selama belum
   * ada payload baru, hasil patch lokal dipertahankan; begitu server mengirim
   * payload baru (ganti filter, retry, dll) salinan ini ditimpa. Sinkronisasi
   * sengaja dilakukan SAAT RENDER, bukan di useEffect, agar tidak ada satu
   * frame pun yang sempat menampilkan daftar kosong sebelum data tersalin.
   */
  const [list, setList] = useState<{
    source: ActiveRunsPayload | null;
    runs: ActiveRunsPayload["runs"];
  }>({ source: null, runs: [] });

  if (list.source !== data) {
    setList(data ? { source: data, runs: data.runs } : { source: null, runs: [] });
  }

  /**
   * Ubah status run dari baris tabel, murni di state lokal.
   *
   * Sengaja TIDAK memanggil reload(): reload menyalakan `loading`, sehingga
   * seluruh halaman sempat tertukar ke skeleton (terasa seperti refresh total).
   * Cukup barisnya dipindah/dibuang di daftar lokal — server tetap menulis
   * statusnya. Bila gagal, daftar dikembalikan ke kondisi semula.
   */
  const changeStatus = async (runId: string, status: string) => {
    const snapshot = list;
    const nextRuns = applyStatusLocally(list.runs, runId, status);

    setPendingStatusId(runId);
    setList({ ...list, runs: nextRuns });

    const res = await setRunStatus(runId, status as Parameters<typeof setRunStatus>[1]);
    setPendingStatusId(null);
    if (res.error) {
      setList(snapshot);
      showToast(res.error, "error");
      return;
    }
    showToast("Status run diperbarui.", "success");
  };

  /**
   * Buang baris dari daftar lokal setelah run benar-benar terhapus di server.
   * Dipakai sebagai pengganti reload() agar tabel tidak berkedip skeleton.
   */
  const removeRunLocally = (runId: string) =>
    setList((prev) => ({ ...prev, runs: prev.runs.filter((r) => r.id !== runId) }));

  const toggleGroup = (status: string) =>
    setCollapsedGroups((prev) => ({ ...prev, [status]: !prev[status] }));

  /** Kelompokkan run per status, urut sesuai GROUP_ORDER; grup kosong dibuang. */
  const groups = useMemo(() => {
    const map = new Map<string, ActiveRunsPayload["runs"]>();
    for (const run of list.runs) {
      const bucket = map.get(run.status);
      if (bucket) bucket.push(run);
      else map.set(run.status, [run]);
    }
    const order: string[] = [...GROUP_ORDER];
    // Status tak terduga tetap tampil, diletakkan paling bawah.
    for (const key of Array.from(map.keys())) if (!order.includes(key)) order.push(key);
    return order
      .filter((status) => (map.get(status)?.length ?? 0) > 0)
      .map((status) => ({ status, runs: map.get(status)! }));
  }, [list.runs]);

  if (error) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <ErrorBlock message={error.message} onRetry={reload} />
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <TableCardSkeleton />
      </main>
    );
  }

  const { allProjects } = data;
  // `runs` diambil dari salinan lokal (lihat komentar state `list`).
  const { runs } = list;
  // Kolom "Aksi" hanya disertakan bila user boleh mengedit.
  const columns = data.canEdit ? TABLE_COLUMNS : TABLE_COLUMNS.slice(0, -1);

  const hasFilter = !!(
    searchParams.q ||
    searchParams.platforms ||
    searchParams.projects ||
    searchParams.project ||
    searchParams.from ||
    searchParams.to
  );
  const projectIds = (searchParams.projects ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (searchParams.project && !projectIds.includes(searchParams.project)) {
    projectIds.unshift(searchParams.project);
  }

  return (
    <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
      {/* Satu card utama: header halaman + tabel */}
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(226, 232, 240, 0.8)",
          borderRadius: 16,
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
          overflow: "hidden",
        }}
      >
        {/* Area header (Active Runs + kontrol) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            padding: "1.25rem 1.5rem",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#0F172A",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Active Runs
            </h1>
            <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <HistoryControls
              projects={allProjects}
              baseUrl="/test-runs"
              dialogTitle="Filter Active Runs"
              showFilterButton={false}
              initial={{
                q: searchParams.q ?? "",
                platforms: (searchParams.platforms ?? "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                projectIds,
                from: searchParams.from ?? null,
                to: searchParams.to ?? null,
              }}
              activeCount={
                (searchParams.platforms ? 1 : 0) +
                (projectIds.length > 0 ? 1 : 0) +
                (searchParams.from || searchParams.to ? 1 : 0)
              }
            />
            {data.canEdit && <CreateRunButton />}
          </div>
        </div>

        {/* Konten tabel / empty state */}
        {runs.length === 0 ? (
          hasFilter ? (
            <div
              style={{
                borderTop: "1px solid #E2E8F0",
                padding: "3rem 1.5rem",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.9rem",
              }}
            >
              Tidak ada run berjalan yang cocok dengan filter / pencarian.
            </div>
          ) : (
            <div
              style={{
                borderTop: "1px solid #E2E8F0",
                padding: "3rem 1.5rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: "0.5rem",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "var(--surface-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-muted)",
                  marginBottom: "0.25rem",
                }}
              >
                <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 700 }}>Belum Ada Run Berjalan</div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", maxWidth: 380, margin: 0 }}>
                Klik &ldquo;+ Express Run&rdquo; untuk membuat run baru. Run yang sudah selesai otomatis
                pindah ke History.
              </p>
            </div>
          )
        ) : (
          <div style={{ overflowX: "auto", borderTop: "1px solid #E2E8F0" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.85rem",
                tableLayout: "fixed",
              }}
            >
              <colgroup>
                {columns.map((c) => (
                  <col key={c.label} style={{ width: c.width }} />
                ))}
              </colgroup>
              <tbody>
                {groups.map((group) => {
                  const open = !collapsedGroups[group.status];
                  const label =
                    RUN_STATUS_LABEL[group.status as RunStatusValue] ?? group.status;
                  return (
                    <Fragment key={group.status}>
                      {/* Header grup: satu baris membentang penuh (colSpan).
                          Chevron jadi kontrol expand/collapse; label status
                          tampil sebagai teks polos tanpa badge. */}
                      <tr style={{ background: "#F1F5F9" }}>
                        <td
                          colSpan={columns.length}
                          style={{
                            padding: "0.5rem 1rem",
                            borderTop: "1px solid rgba(226, 232, 240, 0.8)",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => toggleGroup(group.status)}
                            aria-expanded={open}
                            aria-label={`${label} — ${group.runs.length} run`}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              width: "100%",
                              padding: 0,
                              border: "none",
                              background: "transparent",
                              textAlign: "left",
                            }}
                          >
                            <ChevronDown
                              size={15}
                              style={{
                                color: "#94A3B8",
                                flexShrink: 0,
                                transform: open ? "rotate(0deg)" : "rotate(-90deg)",
                                transition: "transform 0.15s ease",
                              }}
                            />
                            <span
                              style={{ color: "#1E293B", fontWeight: 700, fontSize: "0.75rem" }}
                            >
                              {label}
                            </span>
                            <span
                              style={{ color: "#94A3B8", fontWeight: 500, fontSize: "0.75rem" }}
                            >
                              {group.runs.length}
                            </span>
                          </button>
                        </td>
                      </tr>

                      {/* Sub-header kolom + baris data grup ini.
                          Header kolom & baris data hanya dirender saat grup
                          expanded, jadi keduanya ikut tersembunyi saat collapse. */}
                      {open && (
                        <>
                          <tr style={{ background: "rgba(248, 250, 252, 0.4)" }}>
                            {columns.map((c) => (
                              <th
                                key={c.label}
                                scope="col"
                                style={{
                                  padding: c.pad,
                                  fontWeight: 700,
                                  fontSize: "0.78rem",
                                  color: "#334155",
                                  textAlign: c.align ?? "left",
                                  whiteSpace: c.nowrap ? "nowrap" : undefined,
                                  borderBottom: "1px solid rgba(226, 232, 240, 0.8)",
                                }}
                              >
                                {c.label}
                              </th>
                            ))}
                          </tr>
                          {group.runs.map((run) => (
                            <TestRunRow
                              key={run.id}
                              {...run}
                              onStatusChange={
                                data.canEdit ? (next) => void changeStatus(run.id, next) : undefined
                              }
                              statusPending={pendingStatusId === run.id}
                              extraAction={
                                data.canEdit ? (
                                  <DeleteRunButton
                                    runId={run.id}
                                    runName={run.name}
                                    onDeleted={() => removeRunLocally(run.id)}
                                  />
                                ) : undefined
                              }
                            />
                          ))}
                        </>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Toast toast={toast} onDismiss={dismissToast} />
    </main>
  );
}
