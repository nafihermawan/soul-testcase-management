"use client";

import { Select } from "@/components/ui/select";

/**
 * Dropdown assignee inline di kolom Assignee.
 *
 * Kalau run belum punya assignee tersimpan, nilainya diambil dari eksekutor
 * hasil eksekusi — hanya bila eksekutornya satu orang dan orang itu ada di
 * daftar QA. Jadi kolom tetap informatif untuk data lama, dan begitu QA memilih
 * sendiri, nilai tersimpan yang dipakai.
 */
export function AssigneeSelect({
  assigneeId,
  assigneeName,
  executorNames,
  options,
  pending,
  onChange,
  maxWidth = 140,
}: {
  assigneeId: string;
  assigneeName: string | null;
  executorNames: string[];
  options: { id: string; name: string | null }[];
  pending?: boolean;
  onChange: (assigneeId: string | null) => void;
  /** Batas lebar trigger (kolom list lebih sempit dari kolom tabel). */
  maxWidth?: number;
}) {
  const derivedId =
    !assigneeId && executorNames.length === 1
      ? options.find((o) => o.name === executorNames[0])?.id ?? ""
      : "";
  const value = assigneeId || derivedId;
  const isFallback = !assigneeId && derivedId !== "";

  // Assignee lama bisa saja sudah tidak ber-role QA, jadi tetap disertakan
  // supaya dropdown tidak kehilangan nilainya.
  const list =
    assigneeId && !options.some((o) => o.id === assigneeId)
      ? [{ id: assigneeId, name: assigneeName }, ...options]
      : options;

  return (
    <span
      style={{
        display: "inline-flex",
        width: "100%",
        minWidth: 0,
        // Batas lebar pasti supaya dropdown tidak menabrak kolom sebelahnya.
        maxWidth,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Select
        size="sm"
        value={value}
        disabled={pending}
        title={
          isFallback
            ? `Belum di-assign — dari hasil eksekusi: ${executorNames.join(", ")}`
            : "Ubah assignee"
        }
        ariaLabel="Ubah assignee"
        // Menyatu dengan baris list: tanpa border, hanya teks + chevron.
        style={{
          border: "none",
          background: isFallback ? "#FFFBEB" : "transparent",
          color: isFallback ? "#B45309" : "#334155",
          paddingLeft: 4,
        }}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">— Belum ditugaskan —</option>
        {list.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name ?? "(tanpa nama)"}
          </option>
        ))}
      </Select>
    </span>
  );
}
