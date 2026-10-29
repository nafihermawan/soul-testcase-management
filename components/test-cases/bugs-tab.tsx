"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bug, Trash2 } from "lucide-react";
import { deleteBug } from "@/lib/actions/automation-bugs";
import { entityCode, formatCase } from "@/lib/format";
import { useRefresh } from "@/lib/client/refresh-context";
import { Toast, useToast } from "@/components/ui/feedback";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

export type BugItem = {
  id: string;
  title: string;
  description: string | null;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  severity: string | null;
  externalLink: string | null;
  createdAt: string;
  createdBy: { name: string | null } | null;
};

/** Warna "dot + teks" untuk status bug — sama dengan baris ringkasan. */
const STATUS_TONE: Record<BugItem["status"], { dot: string; text: string }> = {
  OPEN: { dot: "#DC2626", text: "#B91C1C" },
  IN_PROGRESS: { dot: "#3B82F6", text: "#1D4ED8" },
  RESOLVED: { dot: "#16A34A", text: "#15803D" },
  CLOSED: { dot: "#94A3B8", text: "#475569" },
};

const STATUS_LABEL: Record<BugItem["status"], string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

/** Grid kolom tabel Bugs (dipakai header & setiap baris). */
const BUG_COLS = "minmax(320px, 2.4fr) 130px 180px 130px 48px";

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/** Satu item ringkasan status (Open / In Progress / Resolved / Closed). */
function SummaryItem({
  dot,
  textColor,
  label,
  count,
}: {
  dot: string;
  textColor: string;
  label: string;
  count: number;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }}
      />
      <span style={{ fontSize: 14, color: "#475569" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: textColor }}>{count}</span>
    </span>
  );
}

export function BugsTab({ bugs }: { bugs: BugItem[] }) {
  const refresh = useRefresh();
  const [deleteTarget, setDeleteTarget] = useState<BugItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const { toast, showToast, dismissToast } = useToast();

  const removeBug = async (bug: BugItem) => {
    setDeletePending(true);
    await deleteBug(bug.id);
    setDeletePending(false);
    setDeleteTarget(null);
    showToast("Bug dihapus.", "success");
    refresh();
  };

  const counts: Record<BugItem["status"], number> = {
    OPEN: bugs.filter((b) => b.status === "OPEN").length,
    IN_PROGRESS: bugs.filter((b) => b.status === "IN_PROGRESS").length,
    RESOLVED: bugs.filter((b) => b.status === "RESOLVED").length,
    CLOSED: bugs.filter((b) => b.status === "CLOSED").length,
  };

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {/* Baris ringkasan status — hanya bila sudah ada bug. */}
      {bugs.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "16px 24px",
            borderBottom: "1px solid #EEF0F3",
            flexWrap: "wrap",
          }}
        >
          <SummaryItem dot="#DC2626" textColor="#B91C1C" label="Open" count={counts.OPEN} />
          <SummaryItem dot="#3B82F6" textColor="#1D4ED8" label="In Progress" count={counts.IN_PROGRESS} />
          <SummaryItem dot="#16A34A" textColor="#15803D" label="Resolved" count={counts.RESOLVED} />
          <SummaryItem dot="#94A3B8" textColor="#475569" label="Closed" count={counts.CLOSED} />
        </div>
      )}

      {bugs.length === 0 ? (
        /* Empty state: belum ada bug. */
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: "#0F172A" }}>Belum ada bug</div>
          <div style={{ fontSize: 14, color: "#64748B" }}>
            Bug yang ditemukan dari test case ini akan muncul di sini.
          </div>
        </div>
      ) : (
        /* Tabel dibungkus area scroll mendatar; min-width 880px. */
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 880 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: BUG_COLS,
                gap: 20,
                height: 44,
                alignItems: "center",
                padding: "0 24px",
                background: "#F8FAFC",
                borderBottom: "1px solid #EEF0F3",
                fontSize: 12,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#64748B",
              }}
            >
              <span>Bug</span>
              <span>Severity</span>
              <span>Status</span>
              <span>Dibuat</span>
              {/* Kolom aksi tanpa label terlihat. */}
              <span>
                <span className="sr-only">Aksi</span>
              </span>
            </div>

            {bugs.map((bug, i) => {
              const tone = STATUS_TONE[bug.status];
              const code = entityCode("BUG", bug.id);
              return (
                <div
                  key={bug.id}
                  className="tc-bug-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: BUG_COLS,
                    gap: 20,
                    padding: "16px 24px",
                    alignItems: "center",
                    borderTop: i === 0 ? "none" : "1px solid #EEF0F3",
                  }}
                >
                  {/* Bug: baris 1 = ID + link eksternal, baris 2 = judul */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <Link
                        href={`/bugs/${bug.id}`}
                        className="tc-bug-link"
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                      >
                        <Bug size={14} aria-hidden="true" />
                        <span
                          style={{
                            fontFamily: "var(--font-mono, monospace)",
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {code}
                        </span>
                      </Link>
                      {bug.externalLink && (
                        <a
                          href={bug.externalLink}
                          target="_blank"
                          rel="noreferrer"
                          className="tc-link-blue"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: 13,
                            fontWeight: 500,
                            flexShrink: 0,
                          }}
                        >
                          Buka link <ArrowUpRight size={12} aria-hidden="true" />
                        </a>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        lineHeight: "22px",
                        fontWeight: 600,
                        color: "#0F172A",
                        minWidth: 0,
                      }}
                    >
                      {bug.title}
                    </div>
                  </div>

                  {/* Severity — teks biasa, title case, tanpa ikon */}
                  <div style={{ fontSize: 14, lineHeight: "22px", fontWeight: 500, color: "#334155" }}>
                    {bug.severity ? formatCase(bug.severity) : "—"}
                  </div>

                  {/* Status — HANYA tampilan (read-only), tanpa dropdown */}
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span
                      aria-hidden="true"
                      style={{ width: 7, height: 7, borderRadius: "50%", background: tone.dot, flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 600, color: tone.text }}>
                      {STATUS_LABEL[bug.status]}
                    </span>
                  </div>

                  {/* Dibuat */}
                  <div style={{ fontSize: 14, lineHeight: "22px", color: "#334155" }}>
                    {formatDate(bug.createdAt)}
                  </div>

                  {/* Aksi — hapus */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="tc-trash-btn btn-radius-8"
                      onClick={() => setDeleteTarget(bug)}
                      aria-label={`Hapus ${code} dari test case`}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirm hapus bug */}
      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        itemType="Bug"
        itemName={deleteTarget?.title}
        pending={deletePending}
        onConfirm={() => deleteTarget && void removeBug(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Toast */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
