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
 * - Parent (level-1): default = dark neutral text, transparent background,
 *   optional right-aligned chevron; active = yellow text/icon + straight
 *   4px yellow left indicator bar (left corners kept square so the bar is
 *   flush and never curves with the radius).
 * - Child: default = dark neutral text, transparent background, indented;
 *   active = solid yellow background with dark high-contrast text.
 * - Hover (inactive): text/icon turns brand yellow (#FFC348) only — no
 *   background, border, or shadow changes (.sidebar-item:hover).
 *   Active items keep their styling (inline styles win over the class).
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
    display: "flex",
    alignItems: "center",
    gap: isChild ? "0.5rem" : "0.6rem",
    width: "100%",
    padding: collapsed
      ? "0.5rem 0"
      : isChild
        ? "0.4rem 0.6rem"
        : "0.45rem 0.75rem",
    justifyContent: collapsed ? "center" : "flex-start",
    borderRadius: isChild ? 6 : "0 8px 8px 0",
    fontSize: isChild ? 14 : 14,
    fontWeight: active ? (isChild ? 500 : 600) : isChild ? 400 : 600,
    color: active ? (isChild ? "#D97706" : "#D97706") : isChild ? "#4B5563" : "#374151",
    background: active && isChild ? "transparent" : "transparent",
    border: "none",
    borderLeft: isChild || collapsed ? undefined : active
      ? "4px solid #FFC348"
      : "4px solid transparent",
    transition: "color 0.2s ease, background-color 0.2s ease",
    ...style,
  };

  const classes = ["sidebar-item", isChild ? "sidebar-item-child" : "", className]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {children}
      {chevron && !collapsed && (
        <ChevronDown
          size={14}
          style={{
            marginLeft: "auto",
            opacity: 0.6,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 300ms ease-in-out",
          }}
        />
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} title={title} className={classes} style={baseStyle}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} title={title} className={classes} style={baseStyle}>
      {content}
    </button>
  );
}
