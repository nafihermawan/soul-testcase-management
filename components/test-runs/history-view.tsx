"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { HistoryRunRow } from "@/components/test-runs/history-run-row";
import {
  STICKY_ID_WIDTH,
  STICKY_RUN_NAME_WIDTH,
} from "@/components/test-runs/run-list-columns";
import { HistoryControls } from "@/components/test-runs/history-controls";
import { HistoryPagination } from "@/components/test-runs/history-pagination";
import { RunRowActions } from "@/components/test-runs/run-row-actions";
import { ErrorBlock, TableCardSkeleton } from "@/components/ui/data-states";
import { Toast, useToast } from "@/components/ui/feedback";
import { useApi } from "@/lib/client/use-api";
import { setRunStatus } from "@/lib/actions/test-runs";
import type { HistoryPayload } from "@/types/api";

/**
 * Definisi kolom tabel Run History — sumber tunggal untuk <colgroup> dan
 * <thead>. Dua kolom pertama berlebar TETAP (px) supaya offset `left` kolom
 * beku presisi; kolom sisanya memakai lebar tetap juga agar tabel bisa
 * discroll mendatar alih-alih saling menimpa di layar sempit.
 */
const HISTORY_COLUMNS: {
  label: string;
  width: string;
  align?: "left" | "right";
  /** Kolom BEKU: menempel di kiri saat tabel digeser mendatar. */
  sticky?: "id" | "name";
}[] = [
  { label: "ID", width: `${STICKY_ID_WIDTH}px`, sticky: "id" },
  { label: "Run Name", width: `${STICKY_RUN_NAME_WIDTH}px`, sticky: "name" },
  { label: "Projects Covered", width: "180px" },
  { label: "Suites Included", width: "140px" },
  { label: "Platform", width: "100px" },
  { label: "Status", width: "130px" },
  { label: "Sprint", width: "80px" },
  { label: "QA", width: "120px" },
  { label: "Execution Date", width: "130px" },
  { label: "Aksi", width: "140px", align: "right" },
];

/** Batas lebar kolom Run Name saat resizer-nya ditarik (px). */
const RUN_NAME_MIN_W = 120;
const RUN_NAME_MAX_W = 420;

/** Gaya dasar <th> — teks kecil uppercase, senada dengan tabel Active Runs. */
const HEADER_TH: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#64748B",
  padding: "14px 16px",
  textAlign: "left",
  // Judul kolom tidak boleh tertekuk ke baris baru — dengan table-layout fixed
  // dan lebar kolom yang paten, wrap bikin header bertumpuk.
  whiteSpace: "nowrap",
};

/** Gaya <th> untuk kolom beku — background WAJIB opaque agar isi tabel yang
 *  digeser lewat di belakangnya tidak tembus pandang. */
const stickyHeaderStyle = (which?: "id" | "name"): CSSProperties =>
  which === "id"
    ? { position: "sticky", left: 0, zIndex: 20, background: "#F8FAFC" }
    : which === "name"
      ? {
          position: "sticky",
          left: STICKY_ID_WIDTH,
          zIndex: 20,
          background: "#F8FAFC",
          boxShadow: "2px 0 5px -2px rgba(0, 0, 0, 0.1)",
        }
      : {};

export type HistorySearchParams = {
  project?: string;
  q?: string;
  platforms?: string;
  projects?: string;
  /** Rentang bulan "YYYY-MM". */
  from?: string;
  to?: string;
  /** Urutan tabel. Default: completed_at desc. */
  sort_by?: string;
  order?: string;
  page?: string;
};

export function HistoryView({ searchParams }: { searchParams: HistorySearchParams }) {
  // Bangun URL API 1:1 dari query string halaman saat ini.
  const apiPath = useMemo(() => {
    const sp = new URLSearchParams();
    if (searchParams.q) sp.set("q", searchParams.q);
    if (searchParams.platforms) sp.set("platforms", searchParams.platforms);
    if (searchParams.projects) sp.set("projects", searchParams.projects);
    if (searchParams.project) sp.set("project", searchParams.project);
    if (searchParams.from) sp.set("from", searchParams.from);
    if (searchParams.to) sp.set("to", searchParams.to);
    if (searchParams.page) sp.set("page", searchParams.page);
    // `perPage` sengaja tidak diteruskan: ukuran halaman dikunci 25 di server,
    // jadi URL lama (?perPage=…) tidak bisa lagi mengubahnya.
    // Urutan default: run terbaru selesai di atas.
    sp.set("sort_by", searchParams.sort_by ?? "completed_at");
    sp.set("order", searchParams.order ?? "desc");
    const qs = sp.toString();
    return `/api/test-runs/history${qs ? `?${qs}` : ""}`;
  }, [searchParams]);

  const { data, error, loading, reload } = useApi<HistoryPayload>(apiPath);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);
  const { toast, showToast, dismissToast } = useToast();

  /**
   * Lebar kolom Run Name (px) — bisa ditarik lewat resizer di border kanannya.
   * Kolom-kolom setelahnya otomatis bergeser karena lebarnya diambil dari
   * <colgroup>.
   */
  const [runNameWidth, setRunNameWidth] = useState(STICKY_RUN_NAME_WIDTH);
  const [resizingName, setResizingName] = useState(false);
  const [hoverResizer, setHoverResizer] = useState(false);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);

  // Pantau geseran mouse selama drag; lepas saat mouseup (dan kunci kursor).
  useEffect(() => {
    if (!resizingName) return;
    const onMove = (e: MouseEvent) => {
      const s = resizeStart.current;
      if (!s) return;
      setRunNameWidth(
        Math.min(RUN_NAME_MAX_W, Math.max(RUN_NAME_MIN_W, s.width + (e.clientX - s.x)))
      );
    };
    const onUp = () => setResizingName(false);
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [resizingName]);

  /**
   * Salinan lokal daftar run + total, supaya mutasi baris (ubah status, hapus)
   * tampil seketika TANPA refetch. Perhatikan: halaman History selalu hanya
   * berisi run COMPLETED, sehingga membuka kembali sebuah run (IN_PROGRESS /
   * RE_OPEN / PENDING) berarti barisnya keluar dari daftar ini.
   *
   * `source` menyimpan payload server terakhir yang sudah disalin. Selama belum
   * ada payload baru, hasil patch lokal dipertahankan; begitu server mengirim
   * payload baru (ganti filter, retry, dll) salinan ini ditimpa. Sinkronisasi
   * sengaja dilakukan SAAT RENDER, bukan di useEffect, agar tidak ada satu
   * frame pun yang sempat menampilkan daftar kosong sebelum data tersalin.
   */
  const [list, setList] = useState<{
    source: HistoryPayload | null;
    runs: HistoryPayload["runs"];
    total: number;
  }>({ source: null, runs: [], total: 0 });

  if (list.source !== data) {
    setList(
      data
        ? { source: data, runs: data.runs, total: data.total }
        : { source: null, runs: [], total: 0 }
    );
  }

  /**
   * Ubah status run dari baris History — terutama untuk membuka lagi (RE_OPEN)
   * run yang sudah selesai.
   *
   * Sengaja TIDAK memanggil reload(): reload menyalakan `loading`, sehingga
   * seluruh halaman sempat tertukar ke skeleton (terasa seperti refresh total).
   * Cukup barisnya dipindah/dibuang di daftar lokal — server tetap menulis
   * statusnya. Bila gagal, daftar dikembalikan ke kondisi semula.
   */
  const changeStatus = async (runId: string, status: string) => {
    const snapshot = list;
    const nextRuns =
      status === "COMPLETED"
        ? list.runs.map((r) => (r.id === runId ? { ...r, status } : r))
        : list.runs.filter((r) => r.id !== runId);
    const removed = list.runs.length - nextRuns.length;

    setPendingStatusId(runId);
    setList({ ...list, runs: nextRuns, total: Math.max(0, list.total - removed) });

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
    setList((prev) => ({
      ...prev,
      runs: prev.runs.filter((r) => r.id !== runId),
      total: Math.max(0, prev.total - 1),
    }));

  if (error) {
    return (
      <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
        <ErrorBlock message={error.message} onRetry={reload} />
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
        <TableCardSkeleton />
      </main>
    );
  }

  const { page, perPage, activeCount, allProjects, canDelete } = data;
  // `runs`/`total` diambil dari salinan lokal (lihat komentar state `list`).
  const { runs, total } = list;
  const initial = {
    q: searchParams.q ?? "",
    platforms: (searchParams.platforms ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    projectIds: ((searchParams.projects ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
    from: searchParams.from ?? null,
    to: searchParams.to ?? null,
  };
  // Parameter lama `project` tunggal juga dianggap filter project aktif.
  if (searchParams.project) {
    initial.projectIds = [searchParams.project, ...initial.projectIds.filter((p) => p !== searchParams.project)];
  }

  return (
    <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
      {/* Header Card Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          background: "#FFFFFF",
          borderRadius: 12,
          border: "1px solid #E5E7EB",
          boxShadow: "0px 1px 2px rgba(16, 24, 40, 0.04), 0px 4px 12px rgba(16, 24, 40, 0.06)",
          padding: "20px 24px",
          marginBottom: 20,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#0F172A",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Run History
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "#64748B",
              margin: "4px 0 0",
            }}
          >
          </p>
        </div>

        <HistoryControls
          projects={allProjects}
          initial={initial}
          activeCount={activeCount}
        />
      </div>

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: 12,
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
          overflow: "hidden",
        }}
      >
        {runs.length === 0 ? (
          <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Tidak ada run yang cocok dengan filter / pencarian.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                // Lebar minimum = jumlah lebar kolom (px), dengan lantai 1250px
                // supaya seluruh kolom terbentang penuh dan memicu scroll bar
                // mendatar saat layar menyempit. Dengan table-layout: fixed,
                // kolom tidak bisa menyusut di bawah nilainya.
                minWidth: Math.max(
                  1250,
                  HISTORY_COLUMNS.reduce(
                    (sum, c) =>
                      sum + (c.sticky === "name" ? runNameWidth : parseInt(c.width, 10)),
                    0
                  )
                ),
                borderCollapse: "collapse",
                fontSize: "0.85rem",
                tableLayout: "fixed",
              }}
            >
              <colgroup>
                {HISTORY_COLUMNS.map((c) => (
                  <col
                    key={c.label}
                    // Run Name memakai lebar dari state (bisa di-resize).
                    style={{ width: c.sticky === "name" ? `${runNameWidth}px` : c.width }}
                  />
                ))}
              </colgroup>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {HISTORY_COLUMNS.map((c) => (
                    <th
                      key={c.label}
                      scope="col"
                      style={{
                        ...HEADER_TH,
                        textAlign: c.align ?? "left",
                        background: "#F8FAFC",
                        borderBottom: "1px solid #E2E8F0",
                        ...stickyHeaderStyle(c.sticky),
                      }}
                    >
                      {c.label}
                      {/* Resizer: garis tipis di border kanan kolom Run Name;
                          menyala indigo saat hover/drag. `position: absolute`
                          relatif ke th (sticky = positioned). */}
                      {c.sticky === "name" && (
                        <span
                          role="separator"
                          aria-orientation="vertical"
                          aria-label="Ubah lebar kolom Run Name"
                          title="Tarik untuk mengubah lebar kolom"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            resizeStart.current = {
                              x: e.clientX,
                              width: runNameWidth,
                            };
                            setResizingName(true);
                          }}
                          onMouseEnter={() => setHoverResizer(true)}
                          onMouseLeave={() => setHoverResizer(false)}
                          style={{
                            position: "absolute",
                            top: 0,
                            right: -4,
                            width: 9,
                            height: "100%",
                            zIndex: 30,
                            display: "flex",
                            justifyContent: "center",
                            cursor: "col-resize",
                            userSelect: "none",
                            touchAction: "none",
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width: 2,
                              height: "100%",
                              background:
                                resizingName || hoverResizer ? "#4F46E5" : "#E2E8F0",
                              transition: "background-color 0.15s ease",
                            }}
                          />
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <HistoryRunRow
                    key={run.id}
                    {...run}
                    onStatusChange={
                      canDelete ? (next) => void changeStatus(run.id, next) : undefined
                    }
                    statusPending={pendingStatusId === run.id}
                    extraAction={
                      canDelete ? (
                        <RunRowActions
                          runId={run.id}
                          runName={run.name}
                          onDeleted={() => removeRunLocally(run.id)}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer — ukuran halaman dikunci 25, tanpa pemilih rows */}
        <HistoryPagination
          total={total}
          page={page}
          perPage={perPage}
          baseUrl="/test-runs/history"
          lockPerPage
        />
      </div>

      <Toast toast={toast} onDismiss={dismissToast} />
    </main>
  );
}
