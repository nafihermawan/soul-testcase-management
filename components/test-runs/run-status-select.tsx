"use client";

import { OPEN_RUN_STATUSES, RUN_STATUS_LABEL } from "@/lib/run-status";
import { Select } from "@/components/ui/select";

/** Warna teks status run (teks polos, tanpa box/pill). */
const STATUS_TEXT_COLOR: Record<string, string> = {
  PENDING: "#64748B", // slate
  IN_PROGRESS: "#D97706", // amber-600
  RE_OPEN: "#2563EB", // blue-600
  COMPLETED: "#059669", // emerald-600
};

/**
 * Dropdown untuk mengubah status sebuah TestRun dari baris tabel.
 *
 * Sengaja TIDAK menyertakan COMPLETED: menyelesaikan run wajib lewat halaman
 * detail Test Run karena butuh catatan penyelesaian (overallNotes). Opsi di
 * sini terbatas pada status "belum selesai" (OPEN_RUN_STATUSES).
 *
 * Tampil sebagai TEKS POLOS berwarna (tanpa border/kotak); chevron kecil
 * bawaan Select menempel di kanan.
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
        style={{
          background: "transparent",
          border: "none",
          borderRadius: 0,
          padding: 0,
          boxShadow: "none",
          width: "auto",
          fontSize: 12,
          fontWeight: 600,
          color: STATUS_TEXT_COLOR[status] ?? "#64748B",
        }}
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
