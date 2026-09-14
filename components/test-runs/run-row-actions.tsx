"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { deleteRun } from "@/lib/actions/test-runs";
import { RowActionsMenu } from "@/components/settings/row-actions-menu";
import { ConfirmDialog, Toast, useToast } from "@/components/ui/feedback";

/**
 * Menu aksi (kebab ⋮) untuk baris run: Edit Run + Hapus.
 *
 * Dibungkus span yang menghentikan propagasi klik, karena baris tabel punya
 * onClick sendiri (membuka detail run) — klik kebab tidak boleh ikut memicunya.
 */
export function RunRowActions({
  runId,
  runName,
  onDeleted,
}: {
  runId: string;
  runName: string;
  onDeleted?: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const { toast, showToast, dismissToast } = useToast();

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
      <RowActionsMenu
        actions={[
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
        ]}
      />

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
