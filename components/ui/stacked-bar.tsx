import type { CSSProperties } from "react";

export type StackedSegment = {
  key: string;
  /** Label untuk tooltip native per segmen. */
  label: string;
  value: number;
  color: string;
};

/**
 * Bar proporsional multi-warna: tiap segmen lebarnya = value / total.
 * Dipakai panel "Test Execution" (Health & Action) dan kolom Coverage pada
 * tabel Coverage by Suite, supaya keduanya memakai komposisi warna yang sama.
 */
export function StackedBar({
  segments,
  height = 6,
  track = "#F1F5F9",
  radius = 999,
  style,
}: {
  segments: StackedSegment[];
  height?: number;
  track?: string;
  radius?: number;
  style?: CSSProperties;
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0);
  return (
    <div
      style={{
        display: "flex",
        height,
        borderRadius: radius,
        overflow: "hidden",
        background: track,
        ...style,
      }}
    >
      {total > 0 &&
        segments.map((s) =>
          s.value > 0 ? (
            <div
              key={s.key}
              title={`${s.label}: ${s.value}`}
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            />
          ) : null
        )}
    </div>
  );
}
