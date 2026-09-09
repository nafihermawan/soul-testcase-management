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

export function RowActionsMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
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
    const onScrollOrResize = () => setOpen(false);
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="Aksi lainnya"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Aksi lainnya"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="kebab-btn"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "6px",
          borderRadius: 999,
          border: "none",
          background: "transparent",
          color: "var(--text-secondary)",
          flexShrink: 0,
          cursor: "pointer",
        }}
      >
        <MoreVertical size={17} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            role="menu"
            data-row-actions-menu
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              minWidth: 180,
              background: "#ffffff",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-md)",
              padding: "0.35rem",
              zIndex: 100,
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
                      color: action.destructive ? "#DC2626" : "var(--text-secondary)",
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
