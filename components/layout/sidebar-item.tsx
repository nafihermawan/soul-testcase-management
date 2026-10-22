"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type SidebarItemProps = {
  href?: string;
  onClick?: () => void;
  active?: boolean;
  collapsed?: boolean;
  variant?: "parent" | "child";
  chevron?: boolean;
  open?: boolean;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  children: ReactNode;
};

/**
 * Unified sidebar menu item.
 * - Parent (level-1): baris flex 40px — ikon + label 14px/600 + chevron kanan.
 *   AKTIF = teks/ikon/chevron kuning-orange (#E8A317) + bar 3px #FFC348 di
 *   tepi kiri sidebar. TANPA latar di state mana pun.
 * - Child: baris blok 34px, teks 13px/400. AKTIF = latar kuning penuh selebar
 *   sidebar + teks gelap 500 (sudut persegi).
 * - Hover: hanya warna teks (#0F172A) — tidak ada latar abu.
 * - Warna & latar state diatur CSS (.sidebar-item / .sidebar-item-child /
 *   [aria-current]) supaya :hover dan :focus-visible bisa bekerja; inline hanya
 *   untuk ukuran, spacing, dan tipografi.
 */
export function SidebarItem({
  href,
  onClick,
  active = false,
  collapsed = false,
  variant = "parent",
  chevron = false,
  open = false,
  className = "",
  style,
  title,
  children,
}: SidebarItemProps) {
  const isChild = variant === "child";

  const baseStyle: React.CSSProperties = {
    position: "relative",
    // Parent: baris flex 40px (ikon + label + chevron). Child: baris blok 34px.
    display: isChild ? "block" : "flex",
    alignItems: isChild ? undefined : "center",
    gap: isChild ? undefined : 12,
    width: "100%",
    minHeight: isChild ? 34 : 40,
    lineHeight: isChild ? "34px" : undefined,
    padding: collapsed ? "0" : isChild ? "0 16px 0 44px" : "0 16px 0 20px",
    justifyContent: collapsed ? "center" : undefined,
    // Sudut persegi: latar child aktif & bar kiri parent aktif menempel tepi.
    borderRadius: 0,
    fontSize: isChild ? 13 : 14,
    fontWeight: isChild ? undefined : 600,
    border: "none",
    textAlign: "left",
    cursor: "pointer",
    whiteSpace: isChild ? "nowrap" : undefined,
    overflow: isChild ? "hidden" : undefined,
    textOverflow: isChild ? "ellipsis" : undefined,
    // Warna & latar state TIDAK di-set inline: nilai inline akan selalu
    // mengalahkan stylesheet sehingga hover/fokus tidak pernah terlihat.
    transition: "color 0.2s ease, background-color 0.2s ease",
    ...style,
  };

  const classes = ["sidebar-item", isChild ? "sidebar-item-child" : "", className]
    .filter(Boolean)
    .join(" ");

  /** Bar 3px di tepi kiri sidebar untuk item top-level yang aktif. */
  const activeBar =
    active && !isChild ? (
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          borderRadius: "0 3px 3px 0",
          background: "#FFC348",
        }}
      />
    ) : null;

  const content = (
    <>
      {activeBar}
      {children}
      {chevron && !collapsed && (
        <ChevronDown
          size={14}
          aria-hidden="true"
          style={{
            marginLeft: "auto",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 300ms ease-in-out",
          }}
        />
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        title={title}
        className={classes}
        style={baseStyle}
        aria-current={active ? "page" : undefined}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={classes}
      style={baseStyle}
      aria-current={active ? "page" : undefined}
    >
      {content}
    </button>
  );
}
