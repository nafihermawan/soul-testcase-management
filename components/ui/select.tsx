"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type SelectSize = "sm" | "md";

type ParsedOption = { value: string; label: string; disabled: boolean };

/** Rangkai teks dari children opsi (string/number, termasuk di dalam array). */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return "";
}

/**
 * Ambil daftar opsi dari elemen `<option>` di children.
 *
 * Sengaja tetap memakai bentuk `<Select><option/></Select>` supaya seluruh
 * pemakaian di aplikasi tidak perlu diubah — komponen ini hanya mengganti
 * RENDER-nya, bukan kontrak pemakaiannya.
 */
function parseOptions(children: ReactNode): ParsedOption[] {
  const out: ParsedOption[] = [];
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    const el = child as ReactElement<{ value?: unknown; disabled?: boolean; children?: ReactNode }>;
    if (el.type !== "option") continue;
    const value = String(el.props.value ?? "");
    out.push({
      value,
      label: textOf(el.props.children) || value,
      disabled: !!el.props.disabled,
    });
  }
  return out;
}

const MENU_MAX_HEIGHT = 240;
const ITEM_HEIGHT = 32;

/**
 * Dropdown sistem (pengganti `<select>` natif).
 *
 * Kenapa bukan `<select>` lagi: popup opsinya dirender OS sehingga tidak bisa
 * di-style (gelap/kaku di beberapa platform). Di sini menu dirender lewat
 * PORTAL dengan posisi `fixed` — itu wajib, sebab menu yang dirender inline di
 * dalam sel tabel akan terpotong `overflow: hidden` milik kartu tabel.
 *
 * `onChange` masih menerima objek menyerupai event (`e.target.value`) agar
 * ±26 pemakaian lama tidak perlu diubah; lihat catatan di `emit`.
 */
export function Select({
  value,
  onChange,
  children,
  disabled,
  ariaLabel,
  title,
  id,
  size = "md",
  style,
}: {
  value: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  /** Untuk dikaitkan dengan `<label htmlFor>`. */
  id?: string;
  /** "sm" untuk kontrol rapat di dalam tabel. */
  size?: SelectSize;
  style?: CSSProperties;
}) {
  const options = useMemo(() => parseOptions(children), [children]);
  const current = value;

  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedIndex = options.findIndex((o) => o.value === current);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const menuHeight = Math.min(MENU_MAX_HEIGHT, options.length * ITEM_HEIGHT + 12);

  /** Hitung posisi menu: di bawah trigger, dibalik ke atas bila ruang kurang. */
  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const up = r.bottom + menuHeight > window.innerHeight - 8 && r.top > menuHeight;
    setPos({
      top: up ? r.top - menuHeight - 4 : r.bottom + 4,
      left: r.left,
      width: r.width,
    });
  };

  useEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    /**
     * Tutup saat HALAMAN bergeser, tapi JANGAN saat yang di-scroll adalah
     * daftar opsi di dalam menu itu sendiri — kalau tidak, menggulir opsi yang
     * panjang akan menutup dropdown sebelum sempat memilih.
     */
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const emit = (next: string) => {
    // Pemanggil lama memakai signature select natif. Objek ini sengaja hanya
    // menyediakan `target.value` + `stopPropagation()` yang memang dipakai,
    // supaya ~26 pemakaian tidak perlu diubah saat migrasi ke dropdown kustom.
    onChange?.({
      target: { value: next },
      stopPropagation: () => {},
    } as unknown as ChangeEvent<HTMLSelectElement>);
  };

  const choose = (opt: ParsedOption) => {
    if (opt.disabled) return;
    emit(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const move = (dir: 1 | -1) => {
    if (options.length === 0) return;
    let i = cursor;
    for (let step = 0; step < options.length; step++) {
      i = (i + dir + options.length) % options.length;
      if (!options[i].disabled) break;
    }
    setCursor(i);
  };

  const borderColor = disabled
    ? "#E2E8F0"
    : open || hovered
      ? "#CBD5E1"
      : "#E2E8F0";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          setCursor(selectedIndex >= 0 ? selectedIndex : 0);
          setOpen((v) => !v);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) {
              setOpen(true);
              return;
            }
            move(e.key === "ArrowDown" ? 1 : -1);
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (open && options[cursor]) choose(options[cursor]);
            else setOpen(true);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          height: size === "sm" ? 30 : 36,
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          padding: "0 0.45rem 0 0.6rem",
          borderRadius: 8,
          border: `1px solid ${borderColor}`,
          background: "#fff",
          color: "#1E293B",
          fontSize: size === "sm" ? "0.72rem" : "0.8rem",
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.55 : 1,
          boxSizing: "border-box",
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
          boxShadow: open ? "0 0 0 3px rgba(255, 195, 72, 0.25)" : "none",
          textAlign: "left",
          ...style,
        }}
      >
        <span
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
        >
          {selected?.label ?? "—"}
        </span>
        <ChevronDown
          size={14}
          style={{
            color: "#94A3B8",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        />
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: Math.max(pos.width, 140),
              zIndex: 400,
              maxHeight: MENU_MAX_HEIGHT,
              overflowY: "auto",
              // Scroll di dalam daftar opsi tidak merembet ke halaman utama.
              overscrollBehavior: "contain",
              background: "#fff",
              borderRadius: 10,
              border: "1px solid #E2E8F0",
              boxShadow: "0 12px 24px -6px rgba(15, 23, 42, 0.18)",
              padding: 4,
              animation: "dropdownIn 0.12s ease-out",
            }}
          >
            {options.map((o, i) => {
              const isSelected = o.value === current;
              const isCursor = i === cursor;
              return (
                <button
                  key={`${o.value}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={o.disabled}
                  onClick={() => choose(o)}
                  onMouseEnter={() => setCursor(i)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "7px 9px",
                    border: "none",
                    borderRadius: 6,
                    background: isCursor ? "#F8FAFC" : "transparent",
                    color: o.disabled ? "#CBD5E1" : isSelected ? "#0F172A" : "#334155",
                    fontSize: size === "sm" ? "0.75rem" : "0.8rem",
                    fontWeight: isSelected ? 700 : 500,
                    textAlign: "left",
                    cursor: o.disabled ? "not-allowed" : "pointer",
                    transition: "background-color 0.12s ease",
                  }}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    {o.label}
                  </span>
                  {isSelected && <Check size={13} style={{ color: "#B45309", flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
