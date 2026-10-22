"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { FilterModal } from "@/components/ui/filter-modal";
import { FilterField, FilterMonthRange, FilterMultiSelect } from "@/components/ui/filter-fields";
import type { ProjectFilterOption } from "@/types/api";

export type HistoryFilterState = {
  q: string;
  platforms: string[];
  projectIds: string[];
  /** Rentang bulan "YYYY-MM". `from` saja (tanpa `to`) = satu bulan penuh. */
  from?: string | null;
  to?: string | null;
};

export function buildHistoryHref(
  base: string,
  f: Partial<HistoryFilterState> & { page?: number; perPage?: number }
): string {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.platforms?.length) params.set("platforms", f.platforms.join(","));
  if (f.projectIds?.length) params.set("projects", f.projectIds.join(","));
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  if (f.page && f.page > 1) params.set("page", String(f.page));
  // Ukuran halaman standar 25 -> hanya ditulis ke URL kalau memang berbeda.
  if (f.perPage && f.perPage !== 25) params.set("perPage", String(f.perPage));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

const PLATFORM_OPTIONS = ["Web", "Mobile", "Hardware", "API"];

/**
 * Toolbar pencarian + filter untuk daftar Test Run.
 *
 * Filter memakai modal bersama (`FilterModal` + field di `filter-fields`),
 * sehingga presentasinya seragam dengan halaman lain. Yang tersisa di sini hanya
 * logika halaman: debounce pencarian, dua mode `onSearch` (client-side vs URL),
 * dan cascading Platform → Project.
 */
export function HistoryControls({
  projects,
  initial,
  activeCount,
  baseUrl = "/test-runs/history",
  dialogTitle = "Filter Run History",
  showFilterButton = true,
  onSearch,
}: {
  projects: ProjectFilterOption[];
  initial: HistoryFilterState;
  activeCount: number;
  baseUrl?: string;
  dialogTitle?: string;
  /** Halaman Active Runs memakai pencarian saja, tanpa tombol & modal filter. */
  showFilterButton?: boolean;
  /**
   * Bila diisi, pencarian TIDAK mengubah URL — nilainya (sudah di-debounce)
   * dikirim ke pemanggil untuk difilter di sisi klien.
   */
  onSearch?: (q: string) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const [platSel, setPlatSel] = useState<string[]>(initial.platforms);
  const [projSel, setProjSel] = useState<string[]>(initial.projectIds);
  const [fromMonth, setFromMonth] = useState<string | null>(initial.from ?? null);
  const [toMonth, setToMonth] = useState<string | null>(initial.to ?? null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Cascading: daftar project menyempit mengikuti Platform yang dipilih.
   * Tanpa platform aktif, seluruh project ditampilkan. Nama platform di UI
   * ("Web") dicocokkan case-insensitive dengan enum di DB ("WEB").
   */
  const visibleProjects = useMemo(
    () =>
      projects.filter((p) => {
        if (platSel.length === 0) return true;
        const code = p.platform;
        return !!code && platSel.some((x) => x.toUpperCase() === code.toUpperCase());
      }),
    [projects, platSel]
  );

  /** Ganti platform: buang pilihan project yang tidak lagi relevan. */
  const changePlatforms = (next: string[]) => {
    setPlatSel(next);
    const allowed = new Set(
      projects
        .filter((p) => {
          if (next.length === 0) return true;
          const code = p.platform;
          return !!code && next.some((x) => x.toUpperCase() === code.toUpperCase());
        })
        .map((p) => p.id)
    );
    setProjSel((prev) => prev.filter((id) => allowed.has(id)));
  };

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  // Search: debounce 350ms, lalu salah satu dari dua mode:
  // - `onSearch` diisi  -> filtering CLIENT-SIDE, tanpa menyentuh URL sama
  //   sekali (dipakai Active Runs; mengetik tidak boleh memicu reload).
  // - `onSearch` kosong -> push q ke URL supaya server memfilter (Run History,
  //   yang memang dipaginasi di server).
  // Mempertahankan filter yang SUDAH diterapkan (dari URL), bukan pilihan yang
  // masih tertunda di modal, supaya tidak bocor ke URL.
  const onSearchChange = (val: string) => {
    setQ(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (onSearch) {
        onSearch(val.trim());
        return;
      }
      router.replace(
        buildHistoryHref(baseUrl, {
          q: val.trim(),
          platforms: initial.platforms,
          projectIds: initial.projectIds,
          from: initial.from,
          to: initial.to,
        })
      );
    }, 350);
  };

  // Sinkronkan saat URL berubah dari browser back/forward
  useEffect(() => {
    setQ(initial.q);
  }, [initial.q]);

  const applyFilter = () => {
    router.push(
      buildHistoryHref(baseUrl, {
        q,
        platforms: platSel,
        projectIds: projSel,
        from: fromMonth,
        to: toMonth,
      })
    );
  };

  /**
   * Reset HANYA mengembalikan nilai filter di form ke default.
   * Tidak menutup modal dan tidak mengubah URL — filter yang sudah diterapkan
   * tetap aktif sampai "Terapkan Filter" diklik.
   */
  const resetFilter = () => {
    setPlatSel([]);
    setProjSel([]);
    setFromMonth(null);
    setToMonth(null);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
      {/* Search input — tinggi & radius disamakan dengan tombol Filter sebelahnya. */}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <Search
          size={15}
          style={{
            position: "absolute",
            left: 11,
            color: "#94A3B8",
            pointerEvents: "none",
          }}
        />
        <input
          type="text"
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari Run ID, Nama Run..."
          className="filter-field"
          style={{
            width: 220,
            height: 40,
            boxSizing: "border-box",
            padding: "0 12px 0 32px",
            borderRadius: 10,
            border: "1px solid #DDE2E9",
            background: "#fff",
            fontSize: 13,
            color: "#0F172A",
            outline: "none",
          }}
        />
      </div>

      {/* Filter — modal bersama; disembunyikan di halaman yang hanya memakai pencarian. */}
      {showFilterButton && (
        <FilterModal
          title={dialogTitle}
          activeCount={activeCount}
          onReset={resetFilter}
          onApply={applyFilter}
        >
          <FilterField label="Period" htmlFor="filter-history-period">
            <FilterMonthRange
              id="filter-history-period"
              ariaLabel="Pilih periode bulan"
              from={fromMonth}
              to={toMonth}
              onChange={(f, t) => {
                setFromMonth(f);
                setToMonth(t);
              }}
            />
          </FilterField>

          <FilterField label="Platform" htmlFor="filter-history-platform">
            <FilterMultiSelect
              id="filter-history-platform"
              icon="platform"
              ariaLabel="Pilih platform"
              placeholder="Semua Platform"
              values={platSel}
              onChange={changePlatforms}
              options={PLATFORM_OPTIONS.map((p) => ({ value: p, label: p }))}
            />
          </FilterField>

          <FilterField
            label="Projects Covered"
            htmlFor="filter-history-projects"
            hint={platSel.length > 0 ? "mengikuti Platform" : undefined}
          >
            <FilterMultiSelect
              id="filter-history-projects"
              icon="project"
              searchable
              ariaLabel="Pilih project"
              placeholder="Semua Project"
              values={projSel}
              onChange={setProjSel}
              options={visibleProjects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </FilterField>
        </FilterModal>
      )}
    </div>
  );
}
