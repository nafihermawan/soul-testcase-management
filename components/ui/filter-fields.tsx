"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CircleDot,
  Flag,
  FolderOpen,
  Layers,
  Monitor,
  Server,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";

/* ============================ Token ============================ */
/* Satu bahasa desain untuk SELURUH field filter (lihat spec). Nilai sengaja
   dikumpulkan di atas supaya tidak ada warna yang ditulis ulang di komponen. */
const TEXT = "#0F172A";
const LABEL_TEXT = "#334155";
const MUTED_TEXT = "#475569";
const ICON_TEXT = "#64748B";
const PLACEHOLDER_TEXT = "#94A3B8";
const INPUT_BORDER = "#DDE2E9";
const DIVIDER = "#EEF1F5";
const YELLOW = "#FFC348";
const YELLOW_TINT = "#FFF8E8";
const FOCUS_RING = "#FFF1D1";
/** z-index menu field — di atas overlay + dialog modal (300). */
const MENU_Z = 400;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTHS_FULL = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const MIN_YEAR = 2000;
/** Batas atas navigasi tahun untuk pemilih RENTANG (praktis tak terbatas). */
const MAX_YEAR = 2100;

/* ============================ Ikon ============================ */

export type FilterIconKind =
  | "date"
  | "platform"
  | "project"
  | "suite"
  | "status"
  | "severity"
  | "user"
  | "environment"
  | "generic";

/** Ikon leading per jenis field — supaya semua nilai mulai di x yang sama. */
export function filterIcon(kind: FilterIconKind = "generic", size = 15): ReactNode {
  switch (kind) {
    case "date":
      return <Calendar size={size} color={ICON_TEXT} aria-hidden="true" />;
    case "platform":
      return <Monitor size={size} color={ICON_TEXT} aria-hidden="true" />;
    case "project":
      return <FolderOpen size={size} color={ICON_TEXT} aria-hidden="true" />;
    case "suite":
      return <Layers size={size} color={ICON_TEXT} aria-hidden="true" />;
    case "status":
      return <CircleDot size={size} color={ICON_TEXT} aria-hidden="true" />;
    case "severity":
      return <Flag size={size} color={ICON_TEXT} aria-hidden="true" />;
    case "user":
      return <UserRound size={size} color={ICON_TEXT} aria-hidden="true" />;
    case "environment":
      return <Server size={size} color={ICON_TEXT} aria-hidden="true" />;
    default:
      return <SlidersHorizontal size={size} color={ICON_TEXT} aria-hidden="true" />;
  }
}

/* ======================== Kerangka field ======================== */

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: LABEL_TEXT,
  lineHeight: 1.4,
};

/** Label + kontrol, jarak 6px. `hint` tampil rata kanan (mis. "mengikuti Platform"). */
export function FilterField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  /** id kontrol — dipakai agar <label for> benar-benar terhubung. */
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        {htmlFor ? (
          <label htmlFor={htmlFor} style={labelStyle}>
            {label}
          </label>
        ) : (
          <span style={labelStyle}>{label}</span>
        )}
        {hint && <span style={{ fontSize: 11, fontWeight: 400, color: PLACEHOLDER_TEXT }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * Dua field pendek boleh berdampingan HANYA bila modal ≥480px. Karena modal
 * berukuran `min(480px, 100vw - 32px)`, itu setara dengan viewport ≥512px —
 * jadi cukup satu media query di kelas CSS ini (tanpa ResizeObserver).
 */
export function FilterFieldsPair({ children }: { children: ReactNode }) {
  return <div className="filter-fields-pair">{children}</div>;
}

/* ====================== Kontrol dasar (trigger) ====================== */

function controlStyle(active: boolean): CSSProperties {
  return {
    position: "relative",
    display: "flex",
    alignItems: "center",
    width: "100%",
    height: 40,
    boxSizing: "border-box",
    // 36px kiri (ikon) & 34px kanan (chevron) → semua nilai mulai di x sama.
    padding: "0 34px 0 36px",
    border: `1px solid ${active ? YELLOW : INPUT_BORDER}`,
    borderRadius: 10,
    background: "#FFFFFF",
    boxShadow: active ? `0 0 0 3px ${FOCUS_RING}` : "none",
    color: TEXT,
    fontSize: 14,
    fontFamily: "inherit",
    appearance: "none",
    cursor: "pointer",
    outline: "none",
    textAlign: "left",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  };
}

const leadingIconStyle: CSSProperties = {
  position: "absolute",
  left: 12,
  top: "50%",
  transform: "translateY(-50%)",
  display: "flex",
  pointerEvents: "none",
};

const chevronStyle = (open: boolean): CSSProperties => ({
  position: "absolute",
  right: 12,
  top: "50%",
  transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
  transition: "transform 0.15s ease",
  pointerEvents: "none",
});

/** Nilai trigger: default "Semua …" abu, nilai terpilih gelap. */
const valueStyle = (isDefault: boolean): CSSProperties => ({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: isDefault ? PLACEHOLDER_TEXT : TEXT,
});

/* ====================== Menu melayang (portal) ====================== */

type MenuPos = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };

const PANEL_WIDTH_MIN = 240;
const PANEL_MAX_H = 300;

/** Posisi + tutup-otomatis menu field (pola sama dengan CustomSelect). */
function useFloatingMenu(open: boolean, onClose: () => void) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(PANEL_WIDTH_MIN, r.width);
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    // Ruang bawah kurang & atas lebih lega → buka ke atas (pakai `bottom`).
    const up = below < 180 && above > below;
    setPos({
      left: Math.min(r.left, Math.max(8, window.innerWidth - width - 8)),
      width,
      maxHeight: Math.max(140, Math.min(PANEL_MAX_H, up ? above : below)),
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // Menu di portal (di luar trigger), jadi harus dicek terpisah.
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = (e: Event) => {
      // Scroll di dalam menu sendiri tidak menutup (daftar panjang harus bisa digulir).
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onResize = () => onClose();
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, onClose]);

  return { triggerRef, menuRef, pos };
}

function MenuPanel({
  pos,
  menuRef,
  ariaLabel,
  children,
  multiselectable = false,
}: {
  pos: MenuPos;
  menuRef: React.RefObject<HTMLDivElement>;
  ariaLabel?: string;
  children: ReactNode;
  multiselectable?: boolean;
}) {
  return createPortal(
    <div
      ref={menuRef}
      // Kontrak dengan focus trap di FilterModal: elemen di dalam menu ini ikut
      // dihitung "di dalam modal" walau portal-nya ada di body.
      data-filter-menu=""
      role="listbox"
      aria-label={ariaLabel}
      aria-multiselectable={multiselectable || undefined}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        bottom: pos.bottom,
        width: pos.width,
        maxHeight: pos.maxHeight,
        overflowY: "auto",
        overscrollBehavior: "contain",
        zIndex: MENU_Z,
        background: "#FFFFFF",
        border: `1px solid ${INPUT_BORDER}`,
        borderRadius: 10,
        boxShadow: "0 12px 24px -6px rgba(15, 23, 42, 0.18)",
        padding: 4,
        animation: "dropdownIn 0.12s ease-out",
      }}
    >
      {children}
    </div>,
    document.body
  );
}

const optionRowStyle = (selected: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  width: "100%",
  padding: "8px 12px",
  border: "none",
  borderRadius: 6,
  background: selected ? YELLOW_TINT : "transparent",
  color: selected ? TEXT : LABEL_TEXT,
  fontSize: 13,
  fontWeight: selected ? 600 : 400,
  cursor: "pointer",
  textAlign: "left",
  transition: "background-color 0.15s ease",
});

/** Kotak centang kecil untuk multi-select (bukan native checkbox). */
const checkBoxStyle = (on: boolean): CSSProperties => ({
  width: 15,
  height: 15,
  borderRadius: 4,
  border: `1px solid ${on ? YELLOW : INPUT_BORDER}`,
  background: on ? YELLOW : "#FFFFFF",
  color: TEXT,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
});

/** Chip nilai terpilih di dalam menu (menggantikan pill di trigger). */
function MenuChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        maxWidth: "100%",
        padding: "2px 4px 2px 8px",
        borderRadius: 999,
        background: YELLOW_TINT,
        border: `1px solid ${YELLOW}`,
        color: TEXT,
        fontSize: 11,
        fontWeight: 500,
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
          display: "flex",
          alignItems: "center",
          border: "none",
          background: "transparent",
          color: MUTED_TEXT,
          cursor: "pointer",
          padding: 0,
        }}
      >
        <X size={11} />
      </button>
    </span>
  );
}

/* ============================ FilterSelect ============================ */

export type FilterOption = { value: string; label: string };

/** Dropdown pilihan tunggal (nilai default = opsi pertama / placeholder). */
export function FilterSelect({
  icon = "generic",
  value,
  options,
  onChange,
  placeholder = "Semua",
  ariaLabel,
  searchable = false,
  allValue,
  id,
}: {
  icon?: FilterIconKind;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  /** Teks saat belum ada nilai terpilih (mis. "Semua Platform"). */
  placeholder?: string;
  ariaLabel?: string;
  /** Tambahkan input pencarian bila opsinya banyak (mis. daftar Module). */
  searchable?: boolean;
  /**
   * Nilai "semua" (mis. "ALL" atau ""). Saat nilai ini aktif, teks trigger
   * dirender abu seperti placeholder — spec: nilai default = `#94A3B8`.
   */
  allValue?: string;
  id?: string;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState("");

  const close = () => setOpen(false);
  const { triggerRef, menuRef, pos } = useFloatingMenu(open, close);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const selected = options.find((o) => o.value === value);
  // Nilai "semua" (default) tampil abu; nilai terpilih tampil gelap.
  const isDefault = allValue !== undefined ? value === allValue : selected === undefined;
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? options.filter((o) => o.label.toLowerCase().includes(needle))
    : options;

  return (
    <>
      <button
        ref={triggerRef}
        id={fieldId}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={controlStyle(open || focused)}
      >
        <span style={leadingIconStyle}>{filterIcon(icon)}</span>
        <span style={valueStyle(isDefault)}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={14} color={ICON_TEXT} aria-hidden="true" style={chevronStyle(open)} />
      </button>

      {open && pos && (
        <MenuPanel pos={pos} menuRef={menuRef} ariaLabel={ariaLabel}>
          {searchable && (
            <div style={{ padding: "4px 8px 6px", position: "sticky", top: 0, background: "#FFFFFF" }}>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari…"
                aria-label="Cari opsi"
                style={{
                  width: "100%",
                  height: 30,
                  padding: "0 8px",
                  boxSizing: "border-box",
                  border: `1px solid ${INPUT_BORDER}`,
                  borderRadius: 6,
                  fontSize: 13,
                  color: TEXT,
                  outline: "none",
                }}
              />
            </div>
          )}
          {visible.length === 0 && (
            <div style={{ padding: "8px 12px", fontSize: 13, color: PLACEHOLDER_TEXT }}>
              Tidak ada hasil.
            </div>
          )}
          {visible.map((o) => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={optionRowStyle(isSelected)}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = "#F8FAFC";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = "transparent";
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.label}
                </span>
                {isSelected && <Check size={14} color={TEXT} style={{ flexShrink: 0 }} />}
              </button>
            );
          })}
        </MenuPanel>
      )}
    </>
  );
}

/* ========================= FilterMultiSelect ========================= */

/**
 * Pilihan jamak. Trigger hanya menampilkan RINGKASAN (placeholder abu / satu
 * nama / "N dipilih" gelap); chip nilai terpilih hidup DI DALAM menu.
 */
export function FilterMultiSelect({
  icon = "generic",
  values,
  options,
  onChange,
  placeholder = "Semua",
  ariaLabel,
  searchable = false,
  id,
}: {
  icon?: FilterIconKind;
  values: string[];
  options: FilterOption[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  searchable?: boolean;
  id?: string;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState("");

  const close = () => setOpen(false);
  const { triggerRef, menuRef, pos } = useFloatingMenu(open, close);

  // Daftar pencarian dibersihkan saat menu ditutup (perilaku lama dipertahankan).
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const summary =
    values.length === 0 ? placeholder : values.length === 1 ? labelOf(values[0]) : `${values.length} dipilih`;

  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);

  const needle = query.trim().toLowerCase();
  const visible = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;

  return (
    <>
      <button
        ref={triggerRef}
        id={fieldId}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={controlStyle(open || focused)}
      >
        <span style={leadingIconStyle}>{filterIcon(icon)}</span>
        <span style={valueStyle(values.length === 0)}>{summary}</span>
        <ChevronDown size={14} color={ICON_TEXT} aria-hidden="true" style={chevronStyle(open)} />
      </button>

      {open && pos && (
        <MenuPanel pos={pos} menuRef={menuRef} ariaLabel={ariaLabel} multiselectable>
          {values.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                padding: "6px 8px",
                borderBottom: `1px solid ${DIVIDER}`,
              }}
            >
              {values.map((v) => (
                <MenuChip key={v} label={labelOf(v)} onRemove={() => toggle(v)} />
              ))}
            </div>
          )}

          {searchable && (
            <div style={{ padding: "4px 8px 6px", position: "sticky", top: 0, background: "#FFFFFF" }}>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari…"
                aria-label="Cari opsi"
                style={{
                  width: "100%",
                  height: 30,
                  padding: "0 8px",
                  boxSizing: "border-box",
                  border: `1px solid ${INPUT_BORDER}`,
                  borderRadius: 6,
                  fontSize: 13,
                  color: TEXT,
                  outline: "none",
                }}
              />
            </div>
          )}

          {visible.length === 0 && (
            <div style={{ padding: "8px 12px", fontSize: 13, color: PLACEHOLDER_TEXT }}>
              Tidak ada hasil.
            </div>
          )}

          {visible.map((o) => {
            const on = values.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => toggle(o.value)}
                style={optionRowStyle(on)}
                onMouseEnter={(e) => {
                  if (!on) e.currentTarget.style.background = "#F8FAFC";
                }}
                onMouseLeave={(e) => {
                  if (!on) e.currentTarget.style.background = "transparent";
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={checkBoxStyle(on)}>{on && <Check size={11} strokeWidth={3} />}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.label}
                  </span>
                </span>
              </button>
            );
          })}
        </MenuPanel>
      )}
    </>
  );
}

/* ========================== Panel kalender ========================== */

const navBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  border: "none",
  borderRadius: 6,
  background: "transparent",
  color: PLACEHOLDER_TEXT,
  cursor: "pointer",
};

function YearNav({
  year,
  maxYear,
  onChange,
}: {
  year: number;
  maxYear: number;
  onChange: (year: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <button
        type="button"
        aria-label="Tahun sebelumnya"
        disabled={year <= MIN_YEAR}
        onClick={() => onChange(Math.max(MIN_YEAR, year - 1))}
        style={{ ...navBtnStyle, opacity: year <= MIN_YEAR ? 0.35 : 1 }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <ChevronsLeft size={16} />
      </button>
      <span style={{ fontSize: 13, fontWeight: 700, color: MUTED_TEXT }}>{year}</span>
      <button
        type="button"
        aria-label="Tahun berikutnya"
        disabled={year >= maxYear}
        onClick={() => onChange(Math.min(maxYear, year + 1))}
        style={{ ...navBtnStyle, opacity: year >= maxYear ? 0.35 : 1 }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <ChevronsRight size={16} />
      </button>
    </div>
  );
}

/* ============================ FilterMonth ============================ */

const monthCellStyle = (active: boolean, disabled: boolean): CSSProperties => ({
  height: 32,
  border: "none",
  borderRadius: active ? 6 : 4,
  background: active ? YELLOW : disabled ? "rgba(248, 250, 252, 0.8)" : "transparent",
  color: active ? TEXT : disabled ? "#CBD5E1" : LABEL_TEXT,
  fontSize: 12,
  fontWeight: active ? 700 : 600,
  cursor: disabled ? "default" : "pointer",
  pointerEvents: disabled ? "none" : "auto",
  transition: "background-color 0.12s ease, color 0.12s ease",
});

/** Pemilih satu bulan (format "YYYY-MM"; kosong = tanpa filter). */
export function FilterMonth({
  value,
  onChange,
  placeholder = "Semua Periode",
  ariaLabel,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [year, setYear] = useState(() => Number(/^(\d{4})/.exec(value)?.[1] ?? NaN) || new Date().getFullYear());

  const close = () => setOpen(false);
  const { triggerRef, menuRef, pos } = useFloatingMenu(open, close);

  useEffect(() => {
    if (!open) return;
    setYear(Number(/^(\d{4})/.exec(value)?.[1] ?? NaN) || new Date().getFullYear());
  }, [open, value]);

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const selectedMonth = /^(\d{4})-(\d{2})$/.exec(value)?.[2] ?? "";
  const selectedYear = Number(/^(\d{4})/.exec(value)?.[1] ?? NaN);
  const label = value ? `${MONTHS_SHORT[Number(selectedMonth) - 1] ?? selectedMonth}-${selectedYear}` : placeholder;

  return (
    <>
      <button
        ref={triggerRef}
        id={fieldId}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={controlStyle(open || focused)}
      >
        <span style={leadingIconStyle}>{filterIcon("date")}</span>
        <span style={valueStyle(!value)}>{label}</span>
        <ChevronDown size={14} color={ICON_TEXT} aria-hidden="true" style={chevronStyle(open)} />
      </button>

      {open && pos && (
        <MenuPanel pos={pos} menuRef={menuRef} ariaLabel={ariaLabel ?? "Pilih bulan"}>
          <div style={{ padding: 6 }}>
            <YearNav year={year} maxYear={curYear} onChange={setYear} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4 }}>
              {MONTHS_SHORT.map((name, i) => {
                const mm = String(i + 1).padStart(2, "0");
                const active = selectedYear === year && selectedMonth === mm;
                const future = year > curYear || (year === curYear && i > curMonth);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={active}
                    disabled={future}
                    onClick={() => {
                      onChange(`${year}-${mm}`);
                      setOpen(false);
                    }}
                    style={monthCellStyle(active, future)}
                    onMouseEnter={(e) => {
                      if (!active && !future) e.currentTarget.style.background = "#F1F5F9";
                    }}
                    onMouseLeave={(e) => {
                      if (!active && !future) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  marginTop: 8,
                  padding: "6px 0",
                  border: `1px solid ${INPUT_BORDER}`,
                  borderRadius: 6,
                  background: "#FFFFFF",
                  color: MUTED_TEXT,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
              >
                Bersihkan periode
              </button>
            )}
          </div>
        </MenuPanel>
      )}
    </>
  );
}

/* ========================= FilterMonthRange ========================= */

/**
 * Rentang bulan (dari → sampai). Pilih bulan awal lalu bulan akhir; kalau
 * dipilih terbalik, urutannya dinormalkan. Kosong = tanpa filter periode.
 */
export function FilterMonthRange({
  from,
  to,
  onChange,
  placeholder = "Semua Periode",
  ariaLabel,
  id,
}: {
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [viewYear, setViewYear] = useState(() => Number(/^(\d{4})/.exec(from ?? "")?.[1] ?? NaN) || new Date().getFullYear());

  const close = () => setOpen(false);
  const { triggerRef, menuRef, pos } = useFloatingMenu(open, close);

  useEffect(() => {
    if (!open) return;
    setViewYear(Number(/^(\d{4})/.exec(from ?? "")?.[1] ?? NaN) || new Date().getFullYear());
  }, [open, from]);

  // Rentang selalu valid walau dipilih terbalik.
  const [startKey, endKey] = useMemo(() => {
    if (!from) return [null, null] as const;
    const a = from;
    const b = to || from;
    return a <= b ? ([a, b] as const) : ([b, a] as const);
  }, [from, to]);

  const label = !from
    ? placeholder
    : !to || to === from
      ? formatMonthKey(from)
      : `${formatMonthKey(startKey!)} - ${formatMonthKey(endKey!)}`;

  const pick = (key: string) => {
    if (!from || (to && to !== from)) {
      onChange(key, null);
      return;
    }
    if (key < from) onChange(key, null);
    else if (key === from) onChange(from, null);
    else onChange(from, key);
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={fieldId}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={controlStyle(open || focused)}
      >
        <span style={leadingIconStyle}>{filterIcon("date")}</span>
        <span style={valueStyle(!from)}>{label}</span>
        <ChevronDown size={14} color={ICON_TEXT} aria-hidden="true" style={chevronStyle(open)} />
      </button>

      {open && pos && (
        <MenuPanel pos={pos} menuRef={menuRef} ariaLabel={ariaLabel ?? "Pilih rentang bulan"}>
          <div style={{ padding: 6 }}>
            <YearNav year={viewYear} maxYear={MAX_YEAR} onChange={setViewYear} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4 }}>
              {MONTHS_SHORT.map((name, i) => {
                const key = `${viewYear}-${String(i + 1).padStart(2, "0")}`;
                const isStart = key === startKey;
                const isEnd = key === endKey;
                const inRange = !!startKey && !!endKey && key > startKey && key < endKey;
                const selected = isStart || isEnd;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => pick(key)}
                    style={{
                      height: 32,
                      border: "none",
                      borderRadius: selected ? 6 : 4,
                      // Aksen brand (dulu biru #2563EB) — kuning tidak pernah jadi warna teks.
                      background: selected ? YELLOW : inRange ? YELLOW_TINT : "transparent",
                      color: selected ? TEXT : inRange ? TEXT : LABEL_TEXT,
                      fontSize: 12,
                      fontWeight: selected ? 700 : 600,
                      cursor: "pointer",
                      transition: "background-color 0.12s ease",
                    }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                marginTop: 8,
                padding: "6px 2px 0",
                borderTop: `1px solid ${DIVIDER}`,
              }}
            >
              <span style={{ fontSize: 11, color: PLACEHOLDER_TEXT }}>
                {from ? "Klik bulan lain untuk mengubah rentang" : "Pilih bulan awal, lalu bulan akhir"}
              </span>
              {from && (
                <button
                  type="button"
                  onClick={() => onChange(null, null)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: MUTED_TEXT,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Hapus
                </button>
              )}
            </div>
          </div>
        </MenuPanel>
      )}
    </>
  );
}

/** "2026-09" -> "Sep-2026". */
function formatMonthKey(value: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return value;
  return `${MONTHS_SHORT[Number(m[2]) - 1] ?? m[2]}-${m[1]}`;
}

/* ============================ FilterPeriod ============================ */

export type FilterPeriodMode = "month" | "quarter" | "year";
export type FilterPeriodValue = {
  mode: FilterPeriodMode;
  year: number;
  quarter: number;
  month: number;
};

const MODE_LABEL: Record<FilterPeriodMode, string> = {
  month: "Bulan",
  quarter: "Quarter",
  year: "Tahun",
};

/**
 * Periode gabungan (mode + bulan/quarter + tahun) sebagai SATU kontrol dengan
 * ikon kalender. Label trigger dihitung pemanggil (`label`) supaya formatnya
 * tetap satu sumber dengan sisa halaman.
 */
export function FilterPeriod({
  value,
  label,
  availableYears,
  onChange,
  ariaLabel,
  id,
}: {
  value: FilterPeriodValue;
  label: string;
  availableYears: number[];
  onChange: (value: FilterPeriodValue) => void;
  ariaLabel?: string;
  id?: string;
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  const close = () => setOpen(false);
  const { triggerRef, menuRef, pos } = useFloatingMenu(open, close);

  const set = <K extends keyof FilterPeriodValue>(key: K, v: FilterPeriodValue[K]) =>
    onChange({ ...value, [key]: v });

  const selectStyle: CSSProperties = {
    width: "100%",
    height: 36,
    boxSizing: "border-box",
    padding: "0 10px",
    border: `1px solid ${INPUT_BORDER}`,
    borderRadius: 8,
    background: "#FFFFFF",
    color: TEXT,
    fontSize: 13,
    outline: "none",
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={fieldId}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={controlStyle(open || focused)}
      >
        <span style={leadingIconStyle}>{filterIcon("date")}</span>
        <span style={valueStyle(false)}>{label}</span>
        <ChevronDown size={14} color={ICON_TEXT} aria-hidden="true" style={chevronStyle(open)} />
      </button>

      {open && pos && (
        <MenuPanel pos={pos} menuRef={menuRef} ariaLabel={ariaLabel ?? "Pilih periode"}>
          <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Segment mode — urutan dipertahankan dari kontrol lama. */}
            <div style={{ display: "flex", gap: 4, background: "#F1F5F9", padding: 3, borderRadius: 8 }}>
              {(["month", "quarter", "year"] as const).map((m) => {
                const active = value.mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set("mode", m)}
                    style={{
                      flex: 1,
                      padding: "5px 4px",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      background: active ? "#FFFFFF" : "transparent",
                      color: active ? TEXT : ICON_TEXT,
                      boxShadow: active ? "0 1px 2px rgba(15, 23, 42, 0.08)" : "none",
                    }}
                  >
                    {MODE_LABEL[m]}
                  </button>
                );
              })}
            </div>

            {value.mode !== "year" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={labelStyle}>{value.mode === "month" ? "Bulan" : "Quarter"}</span>
                {value.mode === "month" ? (
                  <select
                    aria-label="Bulan"
                    value={String(value.month)}
                    onChange={(e) => set("month", Number(e.target.value))}
                    style={selectStyle}
                  >
                    {MONTHS_FULL.map((name, i) => (
                      <option key={name} value={i + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    aria-label="Quarter"
                    value={String(value.quarter)}
                    onChange={(e) => set("quarter", Number(e.target.value))}
                    style={selectStyle}
                  >
                    {[1, 2, 3, 4].map((q) => (
                      <option key={q} value={q}>
                        Q{q}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            )}

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={labelStyle}>Tahun</span>
              <select
                aria-label="Tahun"
                value={String(value.year)}
                onChange={(e) => set("year", Number(e.target.value))}
                style={selectStyle}
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </MenuPanel>
      )}
    </>
  );
}
