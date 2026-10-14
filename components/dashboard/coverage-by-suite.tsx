"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, PanelHeader } from "@/components/ui";
import { EmptyState } from "@/components/dashboard/empty-state";
import { firstUrlOf } from "@/lib/format";
import { executionProgress, formatPct, pct } from "@/lib/qa-metrics";
import type { DashboardSuiteCoverageItem } from "@/types/api";
import { ArrowDown, ArrowUp, ExternalLink, FolderTree } from "lucide-react";

type SortKey =
  | "name"
  | "total"
  | "executed"
  | "passed"
  | "failed"
  | "passRate"
  | "coverage"
  | "lastExecutedAt";
type SortDir = "asc" | "desc";

/** Nilai yang dipakai untuk sorting tiap kolom; null = tidak ada data (selalu di bawah). */
function sortValue(s: DashboardSuiteCoverageItem, key: SortKey): string | number | null {
  switch (key) {
    case "name":
      return s.name.toLowerCase();
    case "total":
      return s.total;
    case "executed":
      return s.counts.executed;
    case "passed":
      return s.counts.passed;
    case "failed":
      return s.counts.failed;
    case "passRate":
      return pct(s.counts.passed, s.counts.executed);
    case "coverage":
      return executionProgress(s.counts);
    case "lastExecutedAt":
      return s.lastExecutedAt ? new Date(s.lastExecutedAt).getTime() : null;
  }
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

/** Header kolom yang bisa diklik untuk sort ASC/DESC. */
function SortHeader({
  label,
  sortKey,
  align = "left",
  width,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  align?: "left" | "right";
  width?: number;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "#F8FAFC",
        padding: "0.55rem 0.5rem",
        fontWeight: 600,
        width,
        textAlign: align,
        whiteSpace: "nowrap",
        cursor: "pointer",
        userSelect: "none",
      }}
      onClick={() => onSort(sortKey)}
      title={`Sort by ${label}`}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          justifyContent: align === "right" ? "flex-end" : "flex-start",
          color: active ? "#1E293B" : undefined,
        }}
      >
        {label}
        {active &&
          (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  );
}

/**
 * Coverage per suite. Default urutan: aktivitas eksekusi terakhir (terbaru dulu)
 * supaya suite yang sedang diuji muncul di atas. Tiap header kolom bisa diklik
 * untuk sort ASC/DESC.
 */
export function CoverageBySuite({ suites }: { suites: DashboardSuiteCoverageItem[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "lastExecutedAt",
    dir: "desc",
  });

  const rows = useMemo(() => {
    return [...suites].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      // Tanpa data selalu di bawah, apa pun arah sortirnya.
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      let cmp: number;
      if (typeof va === "string" && typeof vb === "string") cmp = va.localeCompare(vb);
      else cmp = (va as number) - (vb as number);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [suites, sort]);

  const handleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" }
    );

  return (
    <Card
      style={{
        display: "flex",
        flexDirection: "column",
        flex: "1 1 auto",
        minHeight: 0,
        justifyContent: "space-between",
      }}
    >
      <PanelHeader title="Coverage by Suite" />
      {rows.length === 0 ? (
        <EmptyState
          icon={<FolderTree size={22} />}
          title="No Suites Yet"
          subtext="No suite matches the current filters."
        />
      ) : (
        <div
          className="coverage-scroll"
          style={{
            overflowX: "auto",
            overflowY: "auto",
            flex: "1 1 auto",
            minHeight: 180,
            paddingBottom: "0.35rem",
          }}
        >
          <table
            style={{
              width: "100%",
              minWidth: 800,
              borderCollapse: "collapse",
              fontSize: "0.82rem",
              tableLayout: "fixed",
            }}
          >
            <thead>
              <tr
                style={{
                  color: "var(--text-muted)",
                  textAlign: "left",
                  borderBottom: "1px solid var(--border)",
                  background: "#F8FAFC",
                }}
              >
                <SortHeader label="Suite" sortKey="name" sort={sort} onSort={handleSort} />
                <SortHeader label="TC" sortKey="total" align="right" width={56} sort={sort} onSort={handleSort} />
                <SortHeader label="Tested" sortKey="executed" align="right" width={68} sort={sort} onSort={handleSort} />
                <SortHeader label="Pass" sortKey="passed" align="right" width={58} sort={sort} onSort={handleSort} />
                <SortHeader label="Failed" sortKey="failed" align="right" width={62} sort={sort} onSort={handleSort} />
                <SortHeader label="Pass Rate" sortKey="passRate" align="right" width={80} sort={sort} onSort={handleSort} />
                <SortHeader label="Coverage" sortKey="coverage" align="right" width={90} sort={sort} onSort={handleSort} />
                <SortHeader label="Last Activity" sortKey="lastExecutedAt" align="right" width={124} sort={sort} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const cov = executionProgress(s.counts);
                const rate = pct(s.counts.passed, s.counts.executed);
                const docHref = firstUrlOf(s.docUrl);
                return (
                  <tr
                    key={s.id}
                    style={{ borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-muted)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td
                      style={{
                        padding: "0.55rem 1.25rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Link
                        href={`/suites/${s.id}`}
                        title={`Open suite ${s.name}`}
                        style={{
                          fontWeight: 500,
                          fontSize: 12,
                          color: "#1E293B",
                          textDecoration: "none",
                          transition: "color 0.15s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#D97706")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "#1E293B")}
                      >
                        {s.name}
                      </Link>
                      {docHref && (
                        <a
                          href={docHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open suite documentation"
                          style={{
                            marginLeft: "0.35rem",
                            color: "#2563EB",
                            display: "inline-flex",
                            verticalAlign: "middle",
                          }}
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </td>
                    <td style={{ padding: "0.55rem 0.5rem", textAlign: "right", color: "var(--text-secondary)" }}>
                      {s.total}
                    </td>
                    <td style={{ padding: "0.55rem 0.5rem", textAlign: "right", color: "var(--text-secondary)" }}>
                      {s.counts.executed}
                    </td>
                    <td
                      style={{
                        padding: "0.55rem 0.5rem",
                        textAlign: "right",
                        color: s.counts.passed > 0 ? "#047857" : "var(--text-secondary)",
                        fontWeight: s.counts.passed > 0 ? 600 : 400,
                      }}
                    >
                      {s.counts.passed}
                    </td>
                    <td
                      style={{
                        padding: "0.55rem 0.5rem",
                        textAlign: "right",
                        color: s.counts.failed > 0 ? "var(--danger)" : "var(--text-secondary)",
                        fontWeight: s.counts.failed > 0 ? 700 : 400,
                      }}
                    >
                      {s.counts.failed}
                    </td>
                    <td
                      style={{
                        padding: "0.55rem 0.5rem",
                        textAlign: "right",
                        fontWeight: 700,
                        color:
                          rate === null
                            ? "#475569"
                            : rate >= 80
                              ? "#047857"
                              : rate >= 50
                                ? "#B45309"
                                : "#BE123C",
                      }}
                    >
                      {formatPct(rate)}
                    </td>
                    <td
                      style={{
                        padding: "0.55rem 1.25rem",
                        textAlign: "right",
                        fontWeight: 600,
                        color: "#334155",
                      }}
                    >
                      {formatPct(cov)}
                    </td>
                    <td style={{ padding: "0.55rem 1.25rem", textAlign: "right", color: "var(--text-muted)" }}>
                      {s.lastExecutedAt ? shortDate(s.lastExecutedAt) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
