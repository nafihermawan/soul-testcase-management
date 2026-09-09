"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildHistoryHref } from "@/components/test-runs/history-controls";
import { useRouter } from "next/navigation";

export function HistoryPagination({
  total,
  page,
  perPage,
  baseUrl,
}: {
  total: number;
  page: number;
  perPage: number;
  baseUrl: string;
}) {
  const router = useRouter();
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);

  const goto = (p: number) => {
    if (p < 1 || p > totalPages || p === page) return;
    router.push(buildHistoryHref(baseUrl, { page: p, perPage }));
  };

  // Halaman window: tampilkan max 7 tombol angka
  const pages: (number | "…")[] = [];
  const pushRange = (a: number, b: number) => {
    for (let i = a; i <= b; i++) pages.push(i);
  };
  if (totalPages <= 7) {
    pushRange(1, totalPages);
  } else {
    const lo = Math.max(1, page - 1);
    const hi = Math.min(totalPages, page + 1);
    if (lo > 2) pages.push(1, "…");
    else if (lo === 2) pages.push(1);
    pushRange(lo, hi);
    if (hi < totalPages - 1) pages.push("…", totalPages);
    else if (hi === totalPages - 1) pages.push(totalPages);
  }

  const selStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color: "#475569",
    fontSize: "0.83rem",
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        flexWrap: "wrap",
        padding: "0.75rem 1.25rem",
        borderTop: "1px solid #E5E7EB",
        background: "#fff",
        fontSize: "0.83rem",
        color: "#475569",
      }}
    >
      <div>
        Showing {from}-{to} of {total} Test Runs
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
        <select
          value={perPage}
          onChange={(e) => {
            router.push(buildHistoryHref(baseUrl, { page: 1, perPage: Number(e.target.value) }));
          }}
          style={{
            padding: "0.3rem 0.5rem",
            borderRadius: 6,
            border: "1px solid #D1D5DB",
            background: "#fff",
            fontSize: "0.82rem",
            color: "#0F172A",
            outline: "none",
          }}
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span style={{ color: "#94A3B8" }}>Rows per page</span>

        <button type="button" disabled={page <= 1} onClick={() => goto(page - 1)} style={{ ...selStyle, opacity: page <= 1 ? 0.4 : 1 }}>
          <ChevronLeft size={15} />
        </button>
        {pages.map((p, i) =>
          typeof p === "number" ? (
            <button
              key={i}
              type="button"
              onClick={() => goto(p)}
              style={{
                ...selStyle,
                background: p === page ? "#2563EB" : "transparent",
                color: p === page ? "#fff" : "#475569",
              }}
            >
              {p}
            </button>
          ) : (
            <span key={i} style={{ color: "#94A3B8", fontSize: "0.8rem" }}>
              …
            </span>
          )
        )}
        <button type="button" disabled={page >= totalPages} onClick={() => goto(page + 1)} style={{ ...selStyle, opacity: page >= totalPages ? 0.4 : 1 }}>
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
