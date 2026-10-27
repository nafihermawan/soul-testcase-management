"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { HistoryRunRow } from "@/components/test-runs/history-run-row";
import { FONT_SANS } from "@/components/test-runs/run-executor-shared";
import { HistoryControls } from "@/components/test-runs/history-controls";
import { HistoryPagination } from "@/components/test-runs/history-pagination";
import { RunRowActions } from "@/components/test-runs/run-row-actions";
import { ErrorBlock, TableCardSkeleton } from "@/components/ui/data-states";
import { useApi } from "@/lib/client/use-api";
import type { HistoryPayload } from "@/types/api";

/**
 * Kolom tabel Run History — sumber tunggal untuk <colgroup> dan <thead>.
 *
 * Run name memakai lebar `auto` supaya SELURUH sisa lebar tabel jatuh ke kolom
 * itu (tidak ada kolom spacer); kolom lain berlebar tetap (px) dan alignment
 * header selalu sama dengan alignment selnya.
 */
const HISTORY_COLUMNS: {
  label: string;
  width?: string;
  align: "left" | "right";
  /** Kolom BEKU: `name` menempel kiri, `aksi` menempel kanan. */
  sticky?: "name" | "aksi";
}[] = [
  { label: "Run name", align: "left", sticky: "name" },
  { label: "Projects covered", width: "150px", align: "left" },
  { label: "Suites included", width: "180px", align: "left" },
  { label: "Platform", width: "110px", align: "left" },
  { label: "Status", width: "120px", align: "left" },
  { label: "Sprint", width: "60px", align: "right" },
  { label: "QA", width: "140px", align: "left" },
  { label: "Execution date", width: "110px", align: "left" },
  { label: "Aksi", width: "56px", align: "right", sticky: "aksi" },
];

/**
 * Lebar minimum tabel: cukup untuk laptop biasa TANPA scroll mendatar. Di
 * bawah ini (layar sempit) kontainer tabel yang menggeser, bukan kartunya.
 * Sisa lebar di atas minimum ini seluruhnya jatuh ke kolom Run name (auto).
 */
const TABLE_MIN_W = 1080;

/** Gaya dasar <th>: 12px/500 slate-500, sentence case, padding 0 12px. */
const HEADER_TH: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "#64748B",
  padding: "0 12px",
  textAlign: "left",
  whiteSpace: "nowrap",
};

/** <th> kolom beku kiri — background opaque agar sel yang lewat tidak tembus. */
const STICKY_HEADER: CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 20,
  background: "#F8FAFC",
};

/** Bayangan tepi kolom beku — hanya tampil saat ada konten yang lewat. */
const SHADOW_LEFT = "2px 0 6px -2px rgba(15, 23, 42, 0.12)";
const SHADOW_RIGHT = "-8px 0 8px -8px rgba(15, 23, 42, 0.12)";

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

  const scrollRef = useRef<HTMLDivElement>(null);
  /**
   * Status geser tabel: `left` = kolom Run name (beku kiri) menampilkan
   * bayangannya; `right` = kolom Aksi (beku kanan) menampilkan bayangannya —
   * artinya masih ada konten yang lewat di bawah kolom itu.
   */
  const [scrollState, setScrollState] = useState({ left: false, right: false });

  /** Ukur ulang status geser dari elemen scroller. */
  const measureScroll = (el: HTMLDivElement) => {
    const left = el.scrollLeft > 0;
    // Toleransi 1px untuk pembulatan sub-pixel.
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setScrollState((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right }
    );
  };

  /**
   * `onScroll` saja tidak cukup: tabel bisa sudah overflow sejak render pertama
   * (tanpa pernah digeser). Jadi ukur setelah data berubah dan saat jendela
   * berubah ukuran.
   */
  useEffect(() => {
    if (scrollRef.current) measureScroll(scrollRef.current);
    const onResize = () => {
      if (scrollRef.current) measureScroll(scrollRef.current);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [data]);

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
    // Flex column yang mengisi tinggi area konten; kartu di bawahnya `flex: 1`
    // sehingga pagination selalu menempel di dasar walau barisnya sedikit.
    // `margin: -1rem` + `padding: 16` membatalkan lalu mengembalikan inset
    // AppShell (tetap 16px) — pola yang sama dipakai halaman Active Runs.
    <main
      style={{
        fontFamily: "var(--font-sans)",
        margin: "-1rem",
        padding: 16,
        minHeight: "calc(100% + 2rem)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* SATU kartu gabungan: header row → divider inset → tabel → pagination.
          Chrome kartu (background/border/radius/shadow) tetap milik kartu. */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: 12,
          boxShadow: "0px 1px 2px rgba(16, 24, 40, 0.04), 0px 4px 12px rgba(16, 24, 40, 0.06)",
          overflow: "hidden",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header row — sama persis seperti sebelumnya (title kiri; search +
            Filter kanan; padding & alignment tidak berubah). */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            padding: "20px 24px",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#1E293B",
                letterSpacing: "-0.025em",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Run History
            </h1>
            <p
              style={{
                fontSize: 12,
                fontWeight: 400,
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

        {/* Satu divider tipis INSET — sejajar dengan konten header (judul di
            kiri, tombol Filter di kanan). */}
        <div style={{ margin: "0 24px", height: 1, background: "#EEF1F5", flexShrink: 0 }} />

        {/* Area tabel: `flex: 1` supaya pagination menempel di dasar kartu.
            Inset 24px kiri/kanan berada DI LUAR area scroll (sejajar judul
            "Run History"), jadi tabel beserta scrollbar-nya tidak pernah
            melewati tepi kartu. */}
        {runs.length === 0 ? (
          <div style={{ flex: 1, padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Tidak ada run yang cocok dengan filter / pencarian.
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, padding: "0 24px" }}>
            <div
              ref={scrollRef}
              style={{ width: "100%", overflowX: "auto" }}
              onScroll={(e) => measureScroll(e.currentTarget)}
            >
              <table
                style={{
                  width: "100%",
                  // Cukup untuk laptop biasa TANPA scroll mendatar; layar lebih
                  // sempit membuat kontainer ini yang menggeser.
                  minWidth: TABLE_MIN_W,
                  borderCollapse: "collapse",
                  tableLayout: "fixed",
                  fontFamily: FONT_SANS,
                  fontSize: 13,
                }}
              >
                <colgroup>
                  {HISTORY_COLUMNS.map((c) => (
                    // Run name `auto` (menyerap sisa lebar); kolom lain tetap.
                    <col key={c.label} style={{ width: c.sticky === "name" ? "auto" : c.width }} />
                  ))}
                </colgroup>
                <thead>
                  <tr
                    style={{
                      height: 40,
                      background: "#F8FAFC",
                      // SATU garis bawah untuk seluruh header (bukan per-sel).
                      borderBottom: "1px solid #EEF1F5",
                    }}
                  >
                    {HISTORY_COLUMNS.map((c, i) => (
                      <th
                        key={c.label}
                        scope="col"
                        style={{
                          ...HEADER_TH,
                          textAlign: c.align,
                          // Sel tepi: padding 16px (tengah tetap 12px).
                          ...(i === 0 ? { paddingLeft: 16 } : null),
                          ...(i === HISTORY_COLUMNS.length - 1 ? { paddingRight: 16 } : null),
                          // Kolom beku KIRI (Run name): bayangan hanya saat konten
                          // sudah tergeser ke bawahnya.
                          ...(c.sticky === "name"
                            ? {
                                ...STICKY_HEADER,
                                boxShadow: scrollState.left ? SHADOW_LEFT : "none",
                              }
                            : null),
                          // Kolom beku KANAN (Aksi): selalu menempel di kanan;
                          // bayangan hanya saat masih ada konten di bawahnya.
                          ...(c.sticky === "aksi"
                            ? {
                                position: "sticky" as const,
                                right: 0,
                                zIndex: 20,
                                background: "#F8FAFC",
                                boxShadow: scrollState.right ? SHADOW_RIGHT : "none",
                              }
                            : null),
                        }}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run, index) => (
                    <HistoryRunRow
                      key={run.id}
                      {...run}
                      last={index === runs.length - 1}
                      stickyShadow={scrollState.left}
                      rightShadow={scrollState.right}
                      extraAction={
                        canDelete ? (
                          <RunRowActions
                            runId={run.id}
                            runName={run.name}
                            // Run History isinya run COMPLETED — di sini "Re-run"
                            // relevan (mengembalikannya ke Active Runs).
                            allowReRun
                            // Preview visual + unduhan PDF sama-sama tersedia
                            // di menu kebab ("Lihat Report" = item pertama).
                            allowViewReport
                            allowReport
                            kebabVariant="box"
                            onReRun={() => removeRunLocally(run.id)}
                            onDeleted={() => removeRunLocally(run.id)}
                          />
                        ) : undefined
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination footer — menempel di dasar kartu; ukuran halaman dikunci
            25, tanpa pemilih rows */}
        <HistoryPagination
          total={total}
          page={page}
          perPage={perPage}
          baseUrl="/test-runs/history"
          lockPerPage
        />
      </div>

    </main>
  );
}
