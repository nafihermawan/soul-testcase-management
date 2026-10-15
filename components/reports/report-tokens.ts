import type { CSSProperties } from "react";

/** Token bersama halaman Reports & Analytics (tab Coverage & Repository). */

export const SANS = '"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO = '"Geist Mono", ui-monospace, monospace';

export const CARD_BORDER = "#E3E7EE";
export const LINE = "#EEF1F5";
export const ROW_DIVIDER = "#F1F4F8";
export const HEAD_BG = "#F8FAFC";
export const TAB_BASELINE = "#DDE2E9";
export const YELLOW = "#FFC348";
export const YELLOW_TINT = "#FFF8E8";
export const LINK = "#1D4ED8";
export const LINK_HOVER = "#1E3A8A";
export const DANGER = "#B91C1C";
export const TRACK = "#E5E9EF";

/** Gaya angka pada list & tabel: Geist Mono 600. */
export const numMono: CSSProperties = { fontFamily: MONO, fontWeight: 600 };

/** Format angka gaya Indonesia: 1482 → "1.482". */
export const fmt = (n: number) => n.toLocaleString("id-ID");

/** Komposisi priority (repository-wide). */
export const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "#B91C1C",
  HIGH: "#EA580C",
  MEDIUM: "#CA8A04",
  LOW: "#94A3B8",
};

/** Komposisi status (repository-wide). */
export const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#15803D",
  DRAFT: "#1D4ED8",
  DEPRECATED: "#CBD5E1",
};

/** Kartu dasar halaman (radius 18). */
export const cardStyle: CSSProperties = {
  background: "#ffffff",
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 18,
};
