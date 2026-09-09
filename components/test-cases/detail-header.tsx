"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { deleteTestCase } from "@/lib/actions/test-cases";
import { ConfirmDialog, Toast, useToast } from "@/components/ui/feedback";

const badge = (label: string, bg: string, color: string) => (
  <span
    style={{
      display: "inline-block",
      padding: "0.18rem 0.6rem",
      borderRadius: 999,
      fontSize: "0.72rem",
      fontWeight: 700,
      letterSpacing: "0.03em",
      background: bg,
      color,
    }}
  >
    {label}
  </span>
);

export function TestCasePageHeader({
  id,
  code,
  title,
  status,
  priority,
  suiteId,
  canEdit,
}: {
  id: string;
  code: string;
  title: string;
  status: "DRAFT" | "ACTIVE" | "DEPRECATED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  suiteId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast, showToast, dismissToast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const statusBadge =
    status === "ACTIVE"
      ? badge(status, "#D1FAE5", "#047857")
      : status === "DRAFT"
        ? badge(status, "#FEF3C7", "#B45309")
        : badge(status, "#F3F4F6", "#6B7280");

  const priorityBadge =
    priority === "CRITICAL"
      ? badge(priority, "#FEE2E2", "#B91C1C")
      : priority === "HIGH"
        ? badge(priority, "#FFEDD5", "#C2410C")
        : priority === "MEDIUM"
          ? badge(priority, "#DBEAFE", "#1D4ED8")
          : badge(priority, "#F3F4F6", "#374151");

  const doDelete = async () => {
    setDeleting(true);
    const fd = new FormData();
    fd.set("id", id);
    await deleteTestCase(fd);
    setDeleting(false);
    showToast("Test case dihapus.", "success");
    router.push(`/suites/${suiteId}`);
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1
            style={{
              fontSize: "1.4rem",
              fontWeight: 800,
              margin: 0,
              color: "#111827",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              flexWrap: "wrap",
              lineHeight: 1.3,
            }}
          >
            <span style={{ minWidth: 0 }}>{title}</span>
            {priorityBadge}
            {statusBadge}
          </h1>
          <p
            style={{
              margin: "0.35rem 0 0",
              fontSize: "0.85rem",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontWeight: 600,
                color: "#4B5563",
              }}
            >
              {code}
            </span>
          </p>
        </div>

        {canEdit && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
            <Link
              href={`/suites/${suiteId}?edit=${encodeURIComponent(id)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.45rem 1rem",
                borderRadius: 6,
                border: "1px solid var(--border-strong)",
                background: "#fff",
                color: "#1F2937",
                fontSize: "0.8rem",
                fontWeight: 600,
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              <Pencil size={14} /> Edit
            </Link>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.45rem 1rem",
                borderRadius: 6,
                border: "1px solid #FECACA",
                background: "#fff",
                color: "#DC2626",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Hapus Test Case?"
        message={
          <>
            Test case <strong>{code}</strong> akan dihapus permanen beserta riwayat run &amp; bug
            terkaitnya.
          </>
        }
        pending={deleting}
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirmDelete(false)}
      />

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
