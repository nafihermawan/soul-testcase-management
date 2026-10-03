"use client";

import { OPEN_RUN_STATUSES, RUN_STATUS_LABEL } from "@/lib/run-status";
import { Select } from "@/components/ui/select";

/**
 * Dropdown untuk mengubah status sebuah TestRun dari baris tabel.
 *
 * Sengaja TIDAK menyertakan COMPLETED: menyelesaikan run wajib lewat halaman
 * detail Test Run karena butuh catatan penyelesaian (overallNotes). Opsi di
 * sini terbatas pada status "belum selesai" (OPEN_RUN_STATUSES).
 *
 * `stopPropagation` wajib: baris tabel menavigasi ke detail run saat diklik,
 * sehingga tanpa ini memilih status akan ikut memindahkan halaman.
 */
export function RunStatusSelect({
  runCode,
  status,
  pending,
  onChange,
}: {
  runCode: string;
  status: string;
  pending?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <span
      style={{ display: "inline-flex", maxWidth: 130 }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Select
        value={status}
        disabled={pending}
        size="sm"
        ariaLabel={`Ubah status run ${runCode}`}
        onChange={(e) => onChange(e.target.value)}
      >
        {OPEN_RUN_STATUSES.map((s) => (
          <option key={s} value={s}>
            {RUN_STATUS_LABEL[s]}
          </option>
        ))}
      </Select>
    </span>
  );
}
