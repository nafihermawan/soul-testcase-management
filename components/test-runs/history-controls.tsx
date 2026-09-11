"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { monthLabel, parseMonthKey } from "@/lib/format";
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
  if (f.perPage && f.perPage !== 10) params.set("perPage", String(f.perPage));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

const PLATFORM_OPTIONS = ["Web", "Mobile", "Hardware", "API"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/* ---------------- gaya bersama ---------------- */

const fieldLabel: CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 700,
  color: "#0F172A",
  marginBottom: "0.5rem",
};

const triggerStyle = (open: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  width: "100%",
  minHeight: 40,
  padding: "0.4rem 0.6rem",
  borderRadius: 8,
  // Warna border saat terbuka memakai aksen kuning agar selaras dengan
  // focus ring (.filter-field) — field yang terbuka selalu sedang fokus.
  border: `1px solid ${open ? "#FFC348" : "#CBD5E1"}`,
  background: "#fff",
  cursor: "pointer",
  textAlign: "left",
});

const panelStyle: CSSProperties = {
  marginTop: 4,
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  background: "#fff",
  boxShadow: "0 6px 16px -8px rgba(15, 23, 42, 0.25)",
  overflow: "hidden",
};

/** Penanda dropdown mana yang sedang terbuka (single-open accordion). */
type DropdownKey = "PERIOD" | "PLATFORM" | "PROJECTS";

const optionRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.55rem",
  width: "100%",
  padding: "0.45rem 0.65rem",
  border: "none",
  background: "transparent",
  fontSize: "0.85rem",
  color: "#1F2937",
  cursor: "pointer",
  textAlign: "left",
};

const checkBox = (on: boolean): CSSProperties => ({
  width: 16,
  height: 16,
  borderRadius: 4,
  border: `1px solid ${on ? "#2563EB" : "#CBD5E1"}`,
  background: on ? "#2563EB" : "#fff",
  color: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
});

/* Warna badge/pill (kuning lembut berbasis #FFC348).
   Teks sengaja netral gelap, bukan kuning/cokelat, agar mudah dibaca. */
const PILL_BG = "rgba(255, 195, 72, 0.20)";
const PILL_BG_HOVER = "rgba(255, 195, 72, 0.40)";
const PILL_BORDER = "rgba(255, 195, 72, 0.40)";
const PILL_TEXT = "#1E293B"; // slate-800
const PILL_ICON = "#64748B"; // slate-500
const PILL_ICON_HOVER = "#1E293B"; // slate-800

/**
 * Tutup dropdown aktif saat klik di luar area field.
 *
 * Sengaja memakai `click`, BUKAN `mousedown`. Dengan `mousedown`, menutup
 * dropdown membuat tinggi panel menyusut sehingga tombol di bawahnya bergeser
 * SEBELUM `mouseup` — browser lalu tidak mengirim event `click` ke tombol itu,
 * sehingga klik pertama pada "Terapkan Filter" tidak bereaksi (harus klik dua
 * kali). Dengan `click`, mousedown & mouseup terjadi lebih dulu di posisi yang
 * sama, jadi aksi tombol tetap jalan, baru setelah itu panel ditutup.
 *
 * Dipasang sekali di wrapper ketiga field (bukan per-dropdown) supaya
 * klik pada trigger dropdown lain tidak dianggap "klik di luar".
 */
function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [onClose]);
  return ref;
}

function Pill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "0.125rem 0.625rem",
        borderRadius: 999,
        background: PILL_BG,
        color: PILL_TEXT,
        border: `1px solid ${PILL_BORDER}`,
        fontSize: "0.75rem",
        fontWeight: 500,
        maxWidth: 170,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <button
        type="button"
        aria-label={`Hapus ${label}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: PILL_ICON,
          display: "flex",
          padding: 2,
          transition: "background-color 0.15s ease, color 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = PILL_BG_HOVER;
          e.currentTarget.style.color = PILL_ICON_HOVER;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = PILL_ICON;
        }}
      >
        <X size={11} />
      </button>
    </span>
  );
}

/* ---------------- 1. Month & Year Range Picker ---------------- */

function MonthRangePicker({
  from,
  to,
  onChange,
  open,
  onToggle,
}: {
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
  /** Status buka/tutup dikendalikan parent (single-open accordion). */
  open: boolean;
  onToggle: () => void;
}) {
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());

  // Selalu buka pada tahun yang relevan dengan pilihan saat ini.
  useEffect(() => {
    if (!open) return;
    const y = parseMonthKey(from)?.year ?? new Date().getFullYear();
    setViewYear(y);
  }, [open, from]);

  // Urutkan agar rentang selalu valid walau dipilih terbalik.
  const [startKey, endKey] = useMemo(() => {
    if (!from) return [null, null] as const;
    const a = from;
    const b = to || from;
    return a <= b ? ([a, b] as const) : ([b, a] as const);
  }, [from, to]);

  const label = !from
    ? "Semua Periode"
    : !to || to === from
      ? monthLabel(from)
      : `${monthLabel(startKey!)} - ${monthLabel(endKey!)}`;

  const pick = (key: string) => {
    if (!from || (to && to !== from)) {
      // Belum ada pilihan, atau rentang sudah lengkap → mulai rentang baru.
      onChange(key, null);
      return;
    }
    // Sudah ada `from` tanpa `to`.
    if (key < from) {
      onChange(key, null); // pilih mundur → jadikan titik awal baru
    } else if (key === from) {
      onChange(from, null); // bulan tunggal
    } else {
      onChange(from, key);
    }
  };

  const cellStyle = (key: string): CSSProperties => {
    const isStart = key === startKey;
    const isEnd = key === endKey;
    const inRange = startKey && endKey && key > startKey && key < endKey;
    const selected = isStart || isEnd;
    return {
      padding: "0.5rem 0",
      borderRadius: 6,
      border: "none",
      background: selected ? "#2563EB" : inRange ? "#EFF6FF" : "transparent",
      color: selected ? "#fff" : inRange ? "#1D4ED8" : "#374151",
      fontWeight: selected ? 700 : 500,
      fontSize: "0.82rem",
      cursor: "pointer",
      transition: "background-color 0.12s ease",
    };
  };

  return (
    <div>
      <div style={fieldLabel}>Period</div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label="Pilih periode bulan"
        className="filter-field"
        style={triggerStyle(open)}
      >
        <Calendar size={15} style={{ color: "#64748B", flexShrink: 0 }} />
        <span
          style={{
            fontSize: "0.85rem",
            fontWeight: from ? 600 : 400,
            color: from ? "#0F172A" : "#94A3B8",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <ChevronDown
          size={15}
          style={{
            marginLeft: "auto",
            color: "#6B7280",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        />
      </button>

      {open && (
        <div
          className="dropdown-panel"
          style={panelStyle}
          role="dialog"
          aria-label="Pilih bulan dan tahun"
        >
          {/* Navigasi tahun */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.5rem 0.6rem",
              borderBottom: "1px solid #E2E8F0",
            }}
          >
            <button
              type="button"
              aria-label="Tahun sebelumnya"
              onClick={() => setViewYear((y) => y - 1)}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "#6B7280",
                display: "flex",
                padding: 4,
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#0F172A" }}>
              {viewYear}
            </span>
            <button
              type="button"
              aria-label="Tahun berikutnya"
              onClick={() => setViewYear((y) => y + 1)}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "#6B7280",
                display: "flex",
                padding: 4,
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Grid 12 bulan */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 4,
              padding: "0.6rem",
            }}
          >
            {MONTHS.map((name, i) => {
              const key = `${viewYear}-${String(i + 1).padStart(2, "0")}`;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pick(key)}
                  aria-pressed={key === startKey || key === endKey}
                  style={cellStyle(key)}
                >
                  {name}
                </button>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.5rem 0.6rem",
              borderTop: "1px solid #E2E8F0",
              background: "#F8FAFC",
            }}
          >
            <span style={{ fontSize: "0.72rem", color: "#64748B" }}>
              {from ? "Klik bulan lain untuk mengubah rentang" : "Pilih bulan awal, lalu bulan akhir"}
            </span>
            {from && (
              <button
                type="button"
                onClick={() => onChange(null, null)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#2563EB",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Hapus
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 2. Multi-select Platform ---------------- */

function PlatformSelect({
  selected,
  onChange,
  open,
  onToggle,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  /** Status buka/tutup dikendalikan parent (single-open accordion). */
  open: boolean;
  onToggle: () => void;
}) {
  const toggle = (p: string) =>
    onChange(selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p]);

  return (
    <div>
      <div style={fieldLabel}>Platform</div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label="Pilih platform"
        className="filter-field"
        style={triggerStyle(open)}
      >
        {selected.length === 0 ? (
          <span style={{ fontSize: "0.85rem", color: "#94A3B8" }}>Semua Platform</span>
        ) : (
          <span style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1, minWidth: 0 }}>
            {selected.map((p) => (
              <Pill key={p} label={p} onRemove={() => toggle(p)} />
            ))}
          </span>
        )}
        <ChevronDown
          size={15}
          style={{
            marginLeft: "auto",
            color: "#6B7280",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        />
      </button>

      {open && (
        <div
          className="dropdown-panel"
          style={panelStyle}
          role="listbox"
          aria-label="Opsi platform"
          aria-multiselectable
        >
          {PLATFORM_OPTIONS.map((p) => {
            const on = selected.includes(p);
            return (
              <button
                key={p}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(p)}
                style={optionRow}
              >
                <span style={checkBox(on)}>{on && <Check size={12} strokeWidth={3} />}</span>
                {p}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------- 3. Searchable multi-select Projects ---------------- */

function ProjectsSelect({
  projects,
  selected,
  onChange,
  /** Platform aktif — dipakai untuk keterangan cascading. */
  activePlatforms,
  open,
  onToggle,
}: {
  projects: { id: string; name: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  activePlatforms: string[];
  /** Status buka/tutup dikendalikan parent (single-open accordion). */
  open: boolean;
  onToggle: () => void;
}) {
  const [query, setQuery] = useState("");

  // Bersihkan kata kunci tiap panel ditutup, supaya saat dibuka lagi
  // daftar tampil utuh (perilaku lama yang dipertahankan).
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const q = query.trim().toLowerCase();
  const visible = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
  const nameOf = (id: string) => projects.find((p) => p.id === id)?.name ?? id;

  return (
    <div>
      <div
        style={{
          ...fieldLabel,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>Projects Covered</span>
        {activePlatforms.length > 0 && (
          <span style={{ fontSize: "0.68rem", fontWeight: 500, color: "#94A3B8" }}>
            mengikuti Platform
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label="Pilih project"
        className="filter-field"
        style={triggerStyle(open)}
      >
        {selected.length === 0 ? (
          <span style={{ fontSize: "0.85rem", color: "#94A3B8" }}>
            {activePlatforms.length > 0
              ? `Semua Project (${activePlatforms.join(", ")})`
              : "Semua Project"}
          </span>
        ) : (
          <span style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1, minWidth: 0 }}>
            {selected.map((id) => (
              <Pill key={id} label={nameOf(id)} onRemove={() => toggle(id)} />
            ))}
          </span>
        )}
        <ChevronDown
          size={15}
          style={{
            marginLeft: "auto",
            color: "#6B7280",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        />
      </button>

      {open && (
        <div className="dropdown-panel" style={panelStyle}>
          {/* Search bar di paling atas daftar opsi */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.45rem 0.6rem",
              borderBottom: "1px solid #E2E8F0",
            }}
          >
            <Search size={14} style={{ color: "#94A3B8", flexShrink: 0 }} />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari project…"
              aria-label="Cari project"
              className="filter-field"
              style={{
                flex: 1,
                border: "1px solid transparent",
                outline: "none",
                background: "transparent",
                fontSize: "0.82rem",
                color: "#0F172A",
              }}
            />
          </div>

          <div style={{ maxHeight: 200, overflowY: "auto" }} role="listbox" aria-multiselectable>
            {visible.length === 0 ? (
              <div style={{ padding: "0.7rem 0.65rem", fontSize: "0.8rem", color: "#94A3B8" }}>
                {projects.length === 0
                  ? "Tidak ada project untuk platform ini."
                  : "Tidak ada project yang cocok."}
              </div>
            ) : (
              visible.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => toggle(p.id)}
                    style={optionRow}
                  >
                    <span style={checkBox(on)}>{on && <Check size={12} strokeWidth={3} />}</span>
                    {p.name}
                  </button>
                );
              })
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.4rem 0.6rem",
              borderTop: "1px solid #E2E8F0",
              background: "#F8FAFC",
              fontSize: "0.72rem",
              color: "#64748B",
            }}
          >
            <span>{selected.length} dipilih</span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#2563EB",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Kosongkan
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Kontrol utama ---------------- */

export function HistoryControls({
  projects,
  initial,
  activeCount,
  baseUrl = "/test-runs/history",
  dialogTitle = "Filter Run History",
}: {
  projects: ProjectFilterOption[];
  initial: HistoryFilterState;
  activeCount: number;
  baseUrl?: string;
  dialogTitle?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const [modalOpen, setModalOpen] = useState(false);
  const [platSel, setPlatSel] = useState<string[]>(initial.platforms);
  const [projSel, setProjSel] = useState<string[]>(initial.projectIds);
  const [fromMonth, setFromMonth] = useState<string | null>(initial.from ?? null);
  const [toMonth, setToMonth] = useState<string | null>(initial.to ?? null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  /**
   * Single-open accordion: hanya SATU dropdown yang boleh terbuka.
   * Membuka Platform otomatis menutup Projects Covered, dst.
   */
  const [activeDropdown, setActiveDropdown] = useState<DropdownKey | null>(null);
  const closeDropdowns = useCallback(() => setActiveDropdown(null), []);
  /** Ref area ketiga field — klik di luar sini menutup dropdown aktif. */
  const fieldsRef = useOutsideClose(closeDropdowns);
  const toggleDropdown = (key: DropdownKey) =>
    setActiveDropdown((prev) => (prev === key ? null : key));

  /** Buka/tutup modal selalu mereset dropdown aktif. */
  const openModal = () => {
    setActiveDropdown(null);
    setModalOpen(true);
  };
  const closeModal = () => {
    setActiveDropdown(null);
    setModalOpen(false);
  };

  /** Cocokkan nama platform di UI ("Web") dengan enum di DB ("WEB"). */
  const platformMatches = (projectPlatform: string | null, selected: string[]) =>
    selected.length === 0 ||
    (!!projectPlatform && selected.some((p) => p.toUpperCase() === projectPlatform.toUpperCase()));

  /**
   * Cascading: daftar project menyempit mengikuti Platform yang dipilih.
   * Tanpa platform aktif, seluruh project ditampilkan.
   */
  const visibleProjects = useMemo(
    () => projects.filter((p) => platformMatches(p.platform, platSel)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projects, platSel]
  );

  /** Ganti platform: buang pilihan project yang tidak lagi relevan. */
  const changePlatforms = (next: string[]) => {
    setPlatSel(next);
    const allowed = new Set(
      projects.filter((p) => platformMatches(p.platform, next)).map((p) => p.id)
    );
    setProjSel((prev) => prev.filter((id) => allowed.has(id)));
  };

  useEffect(() => {
    setPortalRoot(document.body);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Search: debounce + push ke URL, reset ke page 1.
  // Mempertahankan filter yang SUDAH diterapkan (dari URL), bukan pilihan
  // yang masih tertunda di modal, supaya tidak bocor ke URL.
  const onSearchChange = (val: string) => {
    setQ(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
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
    closeModal();
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
   * Sengaja TIDAK menutup modal (dulu `setModalOpen(false)` membuat reset
   * terasa seperti "batal"), dan tidak mengubah URL — filter yang sudah
   * diterapkan tetap aktif sampai "Terapkan Filter" diklik.
   */
  const resetFilter = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Cegah event meluap ke overlay modal yang bisa menutup dialog.
    e.preventDefault();
    e.stopPropagation();
    setPlatSel([]);
    setProjSel([]);
    setFromMonth(null);
    setToMonth(null);
    setActiveDropdown(null);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
      {/* Search input */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
        }}
      >
        <Search
          size={15}
          style={{
            position: "absolute",
            left: 10,
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
            padding: "0.5rem 0.75rem 0.5rem 2rem",
            borderRadius: 8,
            border: "1px solid #CBD5E1",
            background: "#fff",
            fontSize: "0.83rem",
            color: "#0F172A",
            outline: "none",
          }}
        />
      </div>

      {/* Filter button */}
      <button
        type="button"
        onClick={openModal}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.5rem 0.9rem",
          borderRadius: 8,
          border: "1px solid #D1D5DB",
          background: "#fff",
          color: "#374151",
          fontWeight: 600,
          fontSize: "0.83rem",
          cursor: "pointer",
        }}
      >
        <SlidersHorizontal size={14} />
        {activeCount > 0 ? `Filter (${activeCount})` : "Filter"}
      </button>

      {modalOpen &&
        portalRoot &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={dialogTitle}
            className="overlay-in"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
            }}
            onClick={closeModal}
          >
            <div
              className="modal-pop-in"
              style={{
                width: "100%",
                maxWidth: 480,
                background: "#fff",
                borderRadius: 12,
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
                overflow: "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header (tanpa garis pembatas agar terlihat menyatu) */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem 1.25rem",
                }}
              >
                <h3 style={{ fontSize: "1.02rem", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                  {dialogTitle}
                </h3>
                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="Tutup"
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "#6B7280",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 4,
                    borderRadius: 6,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body — wrapper ketiga field, sekaligus batas "klik di luar" */}
              <div
                ref={fieldsRef}
                style={{
                  padding: "1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                  maxHeight: "60vh",
                  overflowY: "auto",
                }}
              >
                <MonthRangePicker
                  from={fromMonth}
                  to={toMonth}
                  onChange={(f, t) => {
                    setFromMonth(f);
                    setToMonth(t);
                  }}
                  open={activeDropdown === "PERIOD"}
                  onToggle={() => toggleDropdown("PERIOD")}
                />
                <PlatformSelect
                  selected={platSel}
                  onChange={changePlatforms}
                  open={activeDropdown === "PLATFORM"}
                  onToggle={() => toggleDropdown("PLATFORM")}
                />
                <ProjectsSelect
                  projects={visibleProjects.map((p) => ({ id: p.id, name: p.name }))}
                  selected={projSel}
                  onChange={setProjSel}
                  activePlatforms={platSel}
                  open={activeDropdown === "PROJECTS"}
                  onToggle={() => toggleDropdown("PROJECTS")}
                />
              </div>

              {/* Footer: kedua tombol rata kanan, menyatu dengan body modal */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  gap: "0.625rem",
                  padding: "0.5rem 1.5rem 1.5rem",
                }}
              >
                <button
                  type="button"
                  onClick={resetFilter}
                  className="btn-rounded-md"
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: 6,
                    border: "1px solid #E2E8F0",
                    background: "#fff",
                    color: "#334155",
                    fontWeight: 500,
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    transition: "background-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  Reset Filter
                </button>
                <button
                  type="button"
                  onClick={applyFilter}
                  className="btn-rounded-md"
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: 6,
                    border: "none",
                    background: "#FFC348",
                    color: "#0F172A",
                    fontWeight: 700,
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
                    transition: "background-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#E0A800")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
                >
                  Terapkan Filter
                </button>
              </div>
            </div>
          </div>,
          portalRoot
        )}
    </div>
  );
}
