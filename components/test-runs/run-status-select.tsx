"use client";

import { RUN_STATUS_LABEL, RUN_STATUS_ORDER } from "@/lib/run-status";

/**
 * Dropdown untuk mengubah status sebuah TestRun dari baris tabel.
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
    <select
      value={status}
      disabled={pending}
      aria-label={`Ubah status run ${runCode}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        onChange(e.target.value);
      }}
      style={{
        padding: "0.2rem 0.45rem",
        borderRadius: 6,
        border: "1px solid var(--border-strong)",
        fontSize: "0.76rem",
        fontWeight: 600,
        background: "#fff",
        color: "#374151",
        cursor: pending ? "wait" : "pointer",
        maxWidth: 130,
      }}
    >
      {RUN_STATUS_ORDER.map((s) => (
        <option key={s} value={s}>
          {RUN_STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
