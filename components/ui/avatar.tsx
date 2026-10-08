"use client";

/**
 * Avatar inisial + tumpukan avatar (avatar stack) untuk kolom Assignee.
 *
 * Tidak ada foto pengguna di sistem ini, jadi avatar dirender dari inisial nama
 * dengan warna deterministik (hash nama) supaya orang yang sama selalu dapat
 * warna yang sama di seluruh aplikasi.
 */

/** Palet muted — cukup kontras untuk teks putih, senada dengan design system. */
const AVATAR_COLORS = [
  "#4F46E5",
  "#0EA5E9",
  "#059669",
  "#D97706",
  "#DB2777",
  "#7C3AED",
  "#0891B2",
  "#B45309",
];

/** Hash sederhana (djb2-like) — stabil, tanpa dependensi. */
function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Inisial: maksimal 2 huruf dari kata pertama & terakhir. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function InitialsAvatar({
  name,
  size = 24,
  title,
  fontSize,
}: {
  name: string;
  size?: number;
  title?: string;
  /** Ukuran huruf inisial; default proporsional terhadap `size`. */
  fontSize?: number;
}) {
  const color = AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
  return (
    <span
      title={title ?? name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        fontSize: fontSize ?? Math.round(size * 0.42),
        fontWeight: 600,
        lineHeight: 1,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * Tumpukan avatar yang saling menumpuk. Kelebihan anggota diringkas menjadi
 * chip "+N" di ujung kanan.
 */
export function AvatarStack({
  names,
  max = 3,
  size = 22,
}: {
  names: string[];
  max?: number;
  size?: number;
}) {
  // Buang nama kosong + duplikat, pertahankan urutan.
  const unique = Array.from(new Set(names.filter((n) => n && n.trim())));
  if (unique.length === 0) {
    return <span style={{ color: "#94A3B8", fontSize: 12 }}>—</span>;
  }
  const shown = unique.slice(0, max);
  const overflow = unique.length - shown.length;

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center" }}
      title={unique.join(", ")}
    >
      {shown.map((name, i) => (
        <span
          key={name}
          style={{
            marginLeft: i === 0 ? 0 : -8,
            borderRadius: "50%",
            // Cincin putih supaya batas antar avatar tetap terbaca saat menumpuk.
            boxShadow: "0 0 0 2px #fff",
            display: "inline-flex",
          }}
        >
          <InitialsAvatar name={name} size={size} />
        </span>
      ))}
      {overflow > 0 && (
        <span
          style={{
            marginLeft: -8,
            width: size,
            height: size,
            borderRadius: "50%",
            background: "#E2E8F0",
            color: "#475569",
            fontSize: Math.round(size * 0.42),
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 0 2px #fff",
            flexShrink: 0,
          }}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}
