"use client";

import { useState } from "react";
import { FileText, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { deleteRun, setRunStatus } from "@/lib/actions/test-runs";
import {
  RowActionsMenu,
  type RowAction,
} from "@/components/settings/row-actions-menu";
import { ConfirmDialog, Toast, useToast } from "@/components/ui/feedback";

/**
 * Menu aksi (kebab ⋮) untuk baris run: (opsional) Re-run + Edit Run + Hapus.
 *
 * Dibungkus span yang menghentikan propagasi klik, karena baris tabel punya
 * onClick sendiri (membuka detail run) — klik kebab tidak boleh ikut memicunya.
 */
export function RunRowActions({
  runId,
  runName,
  allowReRun = false,
  allowViewReport = false,
  onReRun,
  onDeleted,
}: {
  runId: string;
  runName: string;
  /** Tampilkan "Re-run" — hanya relevan di Run History (run sudah COMPLETED). */
  allowReRun?: boolean;
  /** Tampilkan "Lihat Detail Report" (preview visual, bukan unduhan). */
  allowViewReport?: boolean;
  /** Dipanggil setelah Re-run sukses: parent membuang baris ini dari daftar. */
  onReRun?: () => void;
  onDeleted?: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [reRunPending, setReRunPending] = useState(false);
  const { toast, showToast, dismissToast } = useToast();

  /**
   * Re-run: run COMPLETED dikembalikan ke daftar Active Runs. Statusnya diset
   * `RE_OPEN` — status yang memang disediakan app untuk "pernah selesai, dibuka
   * lagi untuk retest" (`lib/run-status.ts`), dan server mengosongkan
   * `completedAt` di jalur ini.
   */
  const doReRun = async () => {
    if (reRunPending) return;
    setReRunPending(true);
    const res = await setRunStatus(runId, "RE_OPEN");
    setReRunPending(false);
    if (res?.error) {
      showToast(res.error, "error");
      return;
    }
    showToast("Test Run berhasil dikembalikan ke Active Runs.", "success");
    onReRun?.();
  };

  const actions: RowAction[] = [
    // Re-run di atas Edit Run (aksi yang paling sering dipakai setelah selesai).
    ...(allowReRun
      ? [
          {
            label: "Re-run",
            icon: <RotateCcw size={15} />,
            iconColor: "#D97706",
            onClick: () => void doReRun(),
          },
        ]
      : []),
    ...(allowViewReport
      ? [
          {
            label: "Lihat Detail Report",
            icon: <FileText size={15} />,
            href: `/test-runs/${runId}/report`,
          },
        ]
      : []),
    {
      label: "Edit Run",
      icon: <Pencil size={15} />,
      href: `/test-runs/${runId}/edit`,
    },
    {
      label: "Hapus",
      icon: <Trash2 size={15} />,
      destructive: true,
      onClick: () => setConfirmOpen(true),
    },
  ];

  const doDelete = async () => {
    setPending(true);
    const res = await deleteRun(runId);
    setPending(false);
    setConfirmOpen(false);
    if (res?.error) {
      showToast(res.error, "error");
      return;
    }
    showToast("Run dihapus.", "success");
    onDeleted?.();
  };

  return (
    <span
      onClick={(e) => e.stopPropagation()}
      style={{ display: "inline-flex", verticalAlign: "middle" }}
    >
      <RowActionsMenu actions={actions} />

      <ConfirmDialog
        open={confirmOpen}
        title="Hapus Run?"
        message={
          <>
            Run <strong>{runName}</strong> beserta seluruh hasil eksekusinya akan dihapus permanen.
          </>
        }
        pending={pending}
        onConfirm={doDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      <Toast toast={toast} onDismiss={dismissToast} />
    </span>
  );
}
