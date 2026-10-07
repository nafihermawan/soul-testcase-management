"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { AvatarStack, InitialsAvatar } from "@/components/ui/avatar";

const MENU_MAX_HEIGHT = 280;
const ITEM_HEIGHT = 34;

/**
 * Dropdown assignee MULTI-ORANG di kolom Assignee Active Runs.
 *
 * Trigger = tumpukan avatar inisial (bertumpuk, ring putih) + chevron kecil di
 * kanannya — TANPA teks nama. Klik chevron membuka daftar QA ber-checkbox;
 * setiap centang mengirim DAFTAR ID PENUH (set final), bukan tambah/kurang,
 * sehingga server bisa mengganti seluruh penugasan dalam satu transaksi.
 *
 * Menu dirender lewat PORTAL `fixed`: menu inline di dalam sel tabel akan
 * terpotong `overflow: hidden` milik card.
 */
export function AssigneeSelect({
  assignees,
  executorNames,
  options,
  pending,
  onChange,
}: {
  /** Assignee tersimpan (multi). */
  assignees: { id: string; name: string | null }[];
  /** Eksekutor hasil eksekusi — dipakai sebagai informasi saat belum ditugaskan. */
  executorNames: string[];
  /** Kandidat assignee untuk dropdown. */
  options: { id: string; name: string | null }[];
  pending?: boolean;
  onChange: (userIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedIds = assignees.map((a) => a.id);
  // Belum ditugaskan → tampilkan eksekutor (informasi), bukan penugasan.
  const isFallback = selectedIds.length === 0 && executorNames.length > 0;
  const names =
    selectedIds.length > 0
      ? assignees.map((a) => a.name ?? "(tanpa nama)")
      : executorNames;

  // Assignee lama bisa saja sudah tidak ber-role QA — tetap disertakan supaya
  // penugasan yang ada tidak hilang dari daftar.
  const list =
    assignees.length > 0
      ? [
          ...assignees.filter((a) => !options.some((o) => o.id === a.id)),
          ...options,
        ]
      : options;

  const menuHeight = Math.min(MENU_MAX_HEIGHT, list.length * ITEM_HEIGHT + 46);

  /** Posisi menu: di bawah trigger, dibalik ke atas bila ruang kurang. */
  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const up = r.bottom + menuHeight > window.innerHeight - 8 && r.top > menuHeight;
    setPos({
      top: up ? r.top - menuHeight - 4 : r.bottom + 4,
      left: Math.min(r.left, Math.max(8, window.innerWidth - Math.max(r.width, 240) - 8)),
      width: Math.max(r.width, 240),
    });
  }, [menuHeight]);

  useEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Tutup saat halaman bergeser, tapi jangan saat yang di-scroll daftar opsi.
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

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );
  };

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 2, minWidth: 0 }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <AvatarStack names={names} max={3} size={22} />
      <button
        ref={triggerRef}
        type="button"
        title={
          isFallback
            ? `Belum di-assign — dari hasil eksekusi: ${executorNames.join(", ")}`
            : selectedIds.length > 0
              ? `Assignees: ${names.join(", ")}`
              : "Tugaskan QA"
        }
        aria-label="Atur assignee"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          padding: 0,
          border: "none",
          borderRadius: 5,
          background: hovered || open ? "#F1F5F9" : "transparent",
          color: isFallback ? "#B45309" : "#94A3B8",
          cursor: "pointer",
          flexShrink: 0,
          opacity: pending ? 0.55 : 1,
          transition: "background-color 0.12s ease, color 0.12s ease",
        }}
      >
        <ChevronDown
          size={12}
          style={{
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
            aria-label="Atur assignee"
            aria-multiselectable="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 400,
              maxHeight: MENU_MAX_HEIGHT,
              overflowY: "auto",
              overscrollBehavior: "contain",
              background: "#fff",
              borderRadius: 10,
              border: "1px solid #E2E8F0",
              boxShadow: "0 12px 24px -6px rgba(15, 23, 42, 0.18)",
              padding: 4,
              animation: "dropdownIn 0.12s ease-out",
            }}
          >
            <div
              style={{
                padding: "6px 8px 4px",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "#94A3B8",
              }}
            >
              Assignee
            </div>

            {list.length === 0 ? (
              <div style={{ padding: "8px", fontSize: "0.75rem", color: "#94A3B8" }}>
                Belum ada user dengan role QA.
              </div>
            ) : (
              list.map((o) => {
                const checked = selectedIds.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(o.id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 8px",
                      border: "none",
                      borderRadius: 6,
                      background: checked ? "#F8FAFC" : "transparent",
                      color: "#334155",
                      fontSize: "0.78rem",
                      fontWeight: checked ? 600 : 500,
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "background-color 0.12s ease",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 15,
                        height: 15,
                        borderRadius: 4,
                        border: checked ? "1px solid #D97706" : "1px solid #CBD5E1",
                        background: checked ? "#F59E0B" : "#fff",
                        flexShrink: 0,
                      }}
                    >
                      {checked && <Check size={11} strokeWidth={3} style={{ color: "#fff" }} />}
                    </span>
                    <InitialsAvatar name={o.name ?? "(tanpa nama)"} size={18} />
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {o.name ?? "(tanpa nama)"}
                    </span>
                  </button>
                );
              })
            )}

            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: "7px 8px",
                  border: "none",
                  borderTop: "1px solid #F1F5F9",
                  borderRadius: 6,
                  background: "transparent",
                  color: "#E11D48",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                Lepas semua assignee
              </button>
            )}
          </div>,
          document.body
        )}
    </span>
  );
}
