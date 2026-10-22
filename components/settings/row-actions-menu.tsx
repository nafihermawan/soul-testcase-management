"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

export type RowAction = {
  label: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
  /** Warna khusus untuk ikon item ini (mis. amber untuk aksi "Test"). */
  iconColor?: string;
};

const menuItemStyle = (destructive?: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  width: "100%",
  padding: "0.45rem 0.75rem",
  fontSize: "0.84rem",
  fontWeight: 500,
  color: destructive ? "#DC2626" : "var(--text-secondary)",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  textDecoration: "none",
  borderRadius: 6,
  whiteSpace: "nowrap",
});

/** Lebar minimum menu (juga dipakai untuk deteksi tabrakan tepi kiri). */
const MENU_MIN_W = 180;
/** Tinggi maksimum menu sebelum isinya digulir. */
const MENU_MAX_H = 320;
/** Perkiraan tinggi satu item, untuk memperkirakan tinggi menu sebelum render. */
const MENU_ITEM_H = 34;
/** Jarak menu ke tombol pemicu & ke tepi viewport. */
const MENU_GAP = 4;
const MENU_EDGE = 8;

/**
 * Posisi menu: `top` ATAU `bottom` (diisi salah satu, sesuai arah bukaan), dan
 * `left` ATAU `right`. `maxHeight` menjaga menu tetap muat di dalam viewport.
 */
type MenuPos = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  maxHeight: number;
};

export function RowActionsMenu({
  actions,
  ariaLabel = "Aksi lainnya",
  iconSize = 17,
  iconColor,
  triggerStyle,
  triggerClassName,
}: {
  actions: RowAction[];
  /** aria-label + tooltip tombol pemicu (mis. "Aksi untuk bug-2026-938"). */
  ariaLabel?: string;
  iconSize?: number;
  iconColor?: string;
  triggerStyle?: React.CSSProperties;
  /** Kelas tambahan pada tombol pemicu (mis. override radius). */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * Menu di-portal ke `document.body` dengan posisi `fixed`, jadi TIDAK mungkin
   * terpotong `overflow: hidden` / `auto` milik container tabel. Yang perlu
   * dihitung adalah ruang VIEWPORT: kalau di bawah tombol tidak cukup (kasus
   * paling terasa di baris terbawah tabel), menu dibuka KE ATAS.
   */
  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) {
      setOpen(true);
      return;
    }
    // Perkiraan tinggi menu sebelum dirender (cukup untuk menentukan arah).
    const estHeight = Math.min(MENU_MAX_H, actions.length * MENU_ITEM_H + 12);
    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - MENU_EDGE;
    const spaceAbove = rect.top - MENU_GAP - MENU_EDGE;
    // Buka ke atas HANYA bila bawah memang tidak cukup DAN atas lebih lega.
    const up = spaceBelow < estHeight && spaceAbove > spaceBelow;

    // Horizontal: rata kanan ke tombol; kalau tombol terlalu dekat tepi kiri,
    // tahan ke tepi kiri viewport supaya menunya tidak keluar layar.
    const horizontal: Pick<MenuPos, "left" | "right"> =
      rect.right - MENU_MIN_W < MENU_EDGE
        ? { left: MENU_EDGE }
        : { right: Math.max(MENU_EDGE, window.innerWidth - rect.right) };

    setPos({
      ...(up
        ? { bottom: window.innerHeight - rect.top + MENU_GAP }
        : { top: rect.bottom + MENU_GAP }),
      ...horizontal,
      maxHeight: Math.max(140, up ? spaceAbove : spaceBelow),
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      // Dropdown dirender via portal, jadi cek manual via data attribute
      if ((e.target as HTMLElement).closest?.("[data-row-actions-menu]")) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    /**
     * Tutup saat HALAMAN bergeser — tapi BUKAN saat yang digulir adalah daftar
     * di dalam menu itu sendiri (menu panjang harus bisa digulir sampai bawah).
     */
    const onScrollOrResize = (e: Event) => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={triggerClassName ? `kebab-btn ${triggerClassName}` : "kebab-btn"}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "6px",
          borderRadius: 999,
          border: "none",
          background: "transparent",
          color: iconColor ?? "var(--text-secondary)",
          flexShrink: 0,
          cursor: "pointer",
          ...triggerStyle,
        }}
      >
        <MoreVertical size={iconSize} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            data-row-actions-menu
            style={{
              position: "fixed",
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left,
              right: pos.right,
              minWidth: MENU_MIN_W,
              maxWidth: `calc(100vw - ${MENU_EDGE * 2}px)`,
              maxHeight: pos.maxHeight,
              // Menu panjang digulir di dalam, bukan meluber keluar viewport.
              overflowY: "auto",
              overscrollBehavior: "contain",
              background: "#ffffff",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-md)",
              padding: "0.35rem",
              // Di atas SELURUH lapisan UI: modal 200–320, menu melayang lain 400.
              zIndex: 400,
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            {actions.map((action) => {
              const content = (
                <>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      // Kotak ikon seragam (w-4 h-4) agar semua label sejajar presisi.
                      width: 16,
                      height: 16,
                      flexShrink: 0,
                      color:
                        action.iconColor ??
                        (action.destructive ? "#DC2626" : "var(--text-secondary)"),
                    }}
                  >
                    {action.icon}
                  </span>
                  {action.label}
                </>
              );

              if (action.href) {
                return (
                  <Link
                    key={action.label}
                    href={action.href}
                    role="menuitem"
                    className="row-action-item"
                    style={menuItemStyle(action.destructive)}
                    onClick={() => setOpen(false)}
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <button
                  key={action.label}
                  type="button"
                  role="menuitem"
                  className="row-action-item"
                  style={menuItemStyle(action.destructive)}
                  onClick={() => {
                    setOpen(false);
                    action.onClick?.();
                  }}
                >
                  {content}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
