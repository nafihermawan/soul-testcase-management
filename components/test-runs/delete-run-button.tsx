"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteRun } from "@/lib/actions/test-runs";
import { ConfirmDialog, Toast, useToast } from "@/components/ui/feedback";

/** Tombol hapus run (Active Runs / History) untuk role superuser (QA). */
export function DeleteRunButton({
  runId,
  runName,
  onDeleted,
}: {
  runId: string;
  runName: string;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const { toast, showToast, dismissToast } = useToast();

  const doDelete = async () => {
    setPending(true);
    const res = await deleteRun(runId);
    setPending(false);
    if (res?.error) {
      setOpen(false);
      showToast(res.error, "error");
      return;
    }
    setOpen(false);
    showToast("Run dihapus.", "success");
    onDeleted?.();
  };

  return (
    <>
      <button
        type="button"
        title="Hapus run"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 30,
          height: 30,
          borderRadius: 6,
          border: "1px solid #FECACA",
          background: "#FEF2F2",
          color: "#B91C1C",
          cursor: "pointer",
        }}
      >
        <Trash2 size={13} />
      </button>

      <ConfirmDialog
        open={open}
        title="Hapus Run?"
        message={
          <>
            Run <strong>{runName}</strong> beserta seluruh hasil eksekusinya akan dihapus permanen.
          </>
        }
        pending={pending}
        onConfirm={doDelete}
        onCancel={() => setOpen(false)}
      />

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
