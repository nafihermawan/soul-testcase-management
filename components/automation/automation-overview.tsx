"use client";

import Link from "next/link";
import { Upload } from "lucide-react";
import type { CSSProperties } from "react";
import type {
  AutomationAlertItem,
  AutomationDailyItem,
  AutomationMatrixCellState,
  AutomationMatrixItem,
  AutomationOverviewPayload,
} from "@/types/api";

/* ---------- konstanta & helper tampilan ---------- */

const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const card: CSSProperties = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16 };
const h2: CSSProperties = { margin: 0, fontSize: 17, fontWeight: 600, color: "#0F172A" };

const dayParts = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
};
/** "29 Okt" */
const shortDay = (key: string) => {
  const p = dayParts(key);
  return `${p.d} ${MONTHS_ID[p.m - 1]}`;
};
/** "29 Okt 2026" */
const longDay = (key: string) => {
  const p = dayParts(key);
  return `${p.d} ${MONTHS_ID[p.m - 1]} ${p.y}`;
};
const weekdayId = (key: string) => {
  const p = dayParts(key);
  return new Date(p.y, p.m - 1, p.d).toLocaleDateString("id-ID", { weekday: "long" });
};
/** Persen bulat untuk pass rate. */
const pctInt = (v: number | null): string => (v === null ? "—" : `${Math.round(v)}%`);
/** Persen coverage: <1% pakai 1 desimal (mis. "0,4%"). */
const pctCoverage = (v: number | null): string => {
  if (v === null) return "—";
  if (v > 0 && v < 1) return `${v.toFixed(1).replace(".", ",")}%`;
  return `${Math.round(v)}%`;
};
const pctColor = (v: number | null): string =>
  v === null ? "#64748B" : v >= 90 ? "#15803D" : v >= 70 ? "#B45309" : "#B91C1C";
const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
const signed = (v: number): string => `${v > 0 ? "+" : ""}${v}`;

const CELL_BG: Record<AutomationMatrixCellState, string> = {
  "all-pass": "#22C55E",
  "some-fail": "#FCA5A5",
  "all-fail": "#EF4444",
  none: "#F1F5F9",
};

/* ---------- kartu KPI ---------- */

function KpiCard({
  label,
  value,
  hint,
  valueColor,
  hintColor,
}: {
  label: string;
  value: string;
  hint: string;
  valueColor?: string;
  hintColor?: string;
}) {
  return (
    <div style={{ ...card, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 14, color: "#475569" }}>{label}</div>
      <div
        style={{
          fontSize: 28,
          lineHeight: "34px",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: valueColor ?? "#0F172A",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 13, color: hintColor ?? "#64748B" }}>{hint}</div>
    </div>
  );
}

/* ---------- Run per Hari ---------- */

function Legend() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13, color: "#475569" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: "#22C55E" }} />
        Passed
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: "#EF4444" }} />
        Failed
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden="true" style={{ width: 14, height: 2, background: "#1D4ED8" }} />
        Pass rate
      </span>
    </div>
  );
}

function RunPerDayCard({
  daily,
  days,
  selectedDate,
  onSelect,
}: {
  daily: AutomationDailyItem[];
  days: number;
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const gap = days === 30 ? 4 : 8;
  const maxTotal = Math.max(0, ...daily.map((d) => d.total));
  const points = daily
    .map((d, i) => (d.passRate === null ? null : `${i + 0.5},${100 - d.passRate}`))
    .filter((p): p is string => p !== null)
    .join(" ");

  return (
    <section style={card}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          padding: "18px 24px 0",
        }}
      >
        <h2 style={h2}>Run per Hari</h2>
        <Legend />
      </div>

      <div style={{ padding: "16px 24px 12px" }}>
        <div style={{ position: "relative", height: 200, borderBottom: "1px solid #E2E8F0" }}>
          {/* garis bantu dashed (atas & tengah) */}
          <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, borderTop: "1px dashed #EEF0F3" }} />
          <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: "50%", borderTop: "1px dashed #EEF0F3" }} />
          <div style={{ position: "absolute", top: -2, left: 0, fontSize: 11, color: "#94A3B8" }}>
            {maxTotal} run
          </div>
          <div style={{ position: "absolute", top: -2, right: 0, fontSize: 11, color: "#94A3B8" }}>100%</div>

          <div style={{ display: "flex", gap, alignItems: "flex-end", height: "100%", paddingTop: 18 }}>
            {daily.map((d) => {
              const selected = d.date === selectedDate;
              const barPct = maxTotal > 0 ? d.total / maxTotal : 0;
              const failShare = d.total > 0 ? d.failed / d.total : 0;
              const failedH = barPct * failShare * 100;
              const passedH = barPct * (1 - failShare) * 100;
              const label =
                d.total === 0
                  ? `${shortDay(d.date)}: tidak ada run`
                  : `${shortDay(d.date)}: ${d.total} run, ${d.passed} passed, ${d.failed} failed, pass rate ${Math.round(d.passRate ?? 0)}%`;
              return (
                <button
                  key={d.date}
                  type="button"
                  className="auto-bar-col"
                  onClick={() => onSelect(d.date)}
                  title={label}
                  aria-label={label}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: "100%",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "center",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    position: "relative",
                    borderRadius: 6,
                    background: selected ? "rgba(245,158,11,0.12)" : undefined,
                  }}
                >
                  <span
                    style={{
                      width: "70%",
                      maxWidth: 36,
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                    }}
                  >
                    <span style={{ width: "100%", height: `${failedH}%`, background: "#EF4444", borderRadius: "4px 4px 0 0" }} />
                    <span style={{ width: "100%", height: `${passedH}%`, background: "#22C55E" }} />
                  </span>
                  {selected && (
                    <span
                      aria-hidden="true"
                      style={{ position: "absolute", inset: 0, border: "2px solid #F59E0B", borderRadius: 6, pointerEvents: "none" }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* garis pass rate harian */}
          {points && (
            <svg
              viewBox={`0 0 ${daily.length} 100`}
              preserveAspectRatio="none"
              aria-hidden="true"
              style={{ position: "absolute", left: 0, right: 0, top: 18, bottom: 0, width: "100%", height: "calc(100% - 18px)", pointerEvents: "none" }}
            >
              <polyline points={points} fill="none" stroke="#1D4ED8" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </div>

        {/* label tanggal */}
        <div style={{ display: "flex", gap, marginTop: 6 }}>
          {daily.map((d, i) => {
            const selected = d.date === selectedDate;
            return (
              <div
                key={d.date}
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: "center",
                  fontSize: 12,
                  color: selected ? "#B45309" : "#64748B",
                  fontWeight: selected ? 600 : 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                }}
              >
                {days === 30 ? (i % 3 === 0 ? String(dayParts(d.date).d) : "") : shortDay(d.date)}
              </div>
            );
          })}
        </div>

        <p style={{ margin: "12px 0 0", fontSize: 13, color: "#64748B" }}>
          Klik batang untuk melihat detail run di hari itu.
        </p>
      </div>
    </section>
  );
}

/* ---------- Perlu Perhatian ---------- */

function AlertGroup({
  dot,
  title,
  hint,
  items,
  noteColor,
}: {
  dot: string;
  title: string;
  hint: string;
  items: AutomationAlertItem[];
  noteColor: string;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            textTransform: "uppercase",
            color: "#475569",
            letterSpacing: "0.03em",
          }}
        >
          {title}{" "}
          <span style={{ color: "#94A3B8", fontWeight: 600 }}>· {items.length}</span>
        </span>
      </div>
      <p style={{ margin: "0 0 8px", fontSize: 13, color: "#64748B" }}>{hint}</p>

      {items.length === 0 ? (
        <p style={{ margin: "0 0 4px", fontSize: 14, color: "#15803D" }}>Tidak ada. 👍</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {items.map((it) => (
            <Link
              key={it.testCaseId}
              href={`/test-cases/${it.testCaseId}?tab=automation`}
              className="auto-alert-link"
              style={{ padding: "6px 8px", borderRadius: 8, textDecoration: "none", display: "block" }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{it.title}</div>
              <div style={{ fontSize: 13, color: noteColor }}>{it.note}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertsCard({ alerts }: { alerts: AutomationOverviewPayload["alerts"] }) {
  return (
    <section style={card}>
      <div style={{ padding: "18px 24px" }}>
        <h2 style={{ ...h2, marginBottom: 14 }}>Perlu Perhatian</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <AlertGroup
            dot="#DC2626"
            title="Failing"
            hint="Test case yang gagal pada run terakhir."
            items={alerts.failing}
            noteColor="#B91C1C"
          />
          <AlertGroup
            dot="#F59E0B"
            title="Flaky"
            hint="Hasil berganti-ganti passed ↔ failed ≥ 3 kali."
            items={alerts.flaky}
            noteColor="#B45309"
          />
          <AlertGroup
            dot="#94A3B8"
            title="Stale"
            hint="Tidak dijalankan lebih dari 7 hari."
            items={alerts.stale}
            noteColor="#64748B"
          />
        </div>
      </div>
    </section>
  );
}

/* ---------- Riwayat per Test Case (matriks) ---------- */

function MatrixCellLegend() {
  const items: { label: string; state: AutomationMatrixCellState }[] = [
    { label: "Semua passed", state: "all-pass" },
    { label: "Sebagian failed", state: "some-fail" },
    { label: "Semua failed", state: "all-fail" },
    { label: "Tidak ada run", state: "none" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 13, color: "#475569" }}>
      {items.map((it) => (
        <span key={it.state} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            aria-hidden="true"
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: CELL_BG[it.state],
              border: it.state === "none" ? "1px solid #E2E8F0" : "none",
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function MatrixCard({
  items,
  hiddenCount,
  days,
  selectedDate,
  onSelect,
  onShowAll,
}: {
  items: AutomationMatrixItem[];
  hiddenCount: number;
  days: number;
  selectedDate: string;
  onSelect: (date: string) => void;
  onShowAll: () => void;
}) {
  const gap = days === 30 ? 3 : 6;
  return (
    <section style={card}>
      <div style={{ padding: "18px 24px 0" }}>
        <h2 style={h2}>Riwayat per Test Case</h2>
        <p style={{ margin: "6px 0 12px", fontSize: 13, color: "#64748B" }}>
          Satu kotak = hasil test case pada satu hari. Pola merah berulang = gagal terus; selang-seling = flaky.
        </p>
        <MatrixCellLegend />
      </div>

      <div style={{ padding: "14px 24px 18px" }}>
        {items.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: "#64748B" }}>Belum ada test case ter-automasi.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 760, display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((it) => (
                <div
                  key={it.testCaseId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "280px 1fr 80px",
                    gap: 16,
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <Link
                      href={`/test-cases/${it.testCaseId}?tab=automation`}
                      title={it.title}
                      style={{
                        display: "block",
                        color: "#1D4ED8",
                        fontSize: 14,
                        fontWeight: 600,
                        textDecoration: "none",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {it.title}
                    </Link>
                    <div
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: 12,
                        color: "#64748B",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {it.tcId}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap }}>
                    {it.cells.map((c) => {
                      const selected = c.date === selectedDate;
                      const label =
                        c.state === "none"
                          ? `${it.title}, ${shortDay(c.date)}: tidak ada run`
                          : `${it.title}, ${shortDay(c.date)}: ${c.passed} passed, ${c.failed} failed`;
                      return (
                        <button
                          key={c.date}
                          type="button"
                          className="auto-matrix-cell"
                          onClick={() => onSelect(c.date)}
                          title={label}
                          aria-label={label}
                          style={{
                            flex: 1,
                            minWidth: 10,
                            height: 28,
                            borderRadius: 4,
                            border: c.state === "none" ? "1px solid #E2E8F0" : "none",
                            background: CELL_BG[c.state],
                            cursor: "pointer",
                            padding: 0,
                            outline: selected ? "2px solid #F59E0B" : undefined,
                            outlineOffset: selected ? 1 : undefined,
                          }}
                        />
                      );
                    })}
                  </div>

                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      color: pctColor(it.passRate),
                    }}
                  >
                    {pctInt(it.passRate)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {hiddenCount > 0 && (
          <div style={{ marginTop: 12 }}>
            <button type="button" className="auto-secondary-btn" onClick={onShowAll} style={{ height: 36, padding: "0 14px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Tampilkan semua ({hiddenCount} lagi)
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- Detail run hari terpilih ---------- */

function DayDetailCard({
  date,
  runs,
  today,
}: {
  date: string;
  runs: AutomationOverviewPayload["day"]["runs"];
  today: string;
}) {
  const passed = runs.filter((r) => r.status === "PASS").length;
  const failed = runs.filter((r) => r.status === "FAIL").length;
  const title = `Run ${weekdayId(date)}, ${longDay(date)}${date === today ? " (hari ini)" : ""}`;

  return (
    <section style={card}>
      <div style={{ padding: "18px 24px 12px" }}>
        <h2 style={h2}>{title}</h2>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "#475569" }}>
          {runs.length} run · <span style={{ color: "#15803D" }}>● Passed {passed}</span> ·{" "}
          <span style={{ color: "#B91C1C" }}>● Failed {failed}</span>
        </p>
      </div>

      <div style={{ padding: "0 24px 18px" }}>
        {runs.length === 0 ? (
          <div
            style={{
              border: "1px dashed #CBD5E1",
              borderRadius: 12,
              padding: "28px 16px",
              textAlign: "center",
              fontSize: 14,
              color: "#64748B",
            }}
          >
            Tidak ada run automation pada hari ini.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 820 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 230px minmax(0,1fr) 220px 110px",
                  gap: 16,
                  alignItems: "center",
                  height: 40,
                  padding: "0 24px",
                  background: "#F8FAFC",
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#64748B",
                }}
              >
                <span>Jam</span>
                <span>TC ID</span>
                <span>Test Case</span>
                <span>Project / Suite</span>
                <span>Hasil</span>
              </div>
              {runs.map((r, i) => {
                const isPass = r.status === "PASS";
                return (
                  <div
                    key={r.id}
                    className="auto-hover-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "90px 230px minmax(0,1fr) 220px 110px",
                      gap: 16,
                      alignItems: "center",
                      padding: "10px 24px",
                      borderTop: i === 0 ? "none" : "1px solid #EEF0F3",
                      fontSize: 14,
                    }}
                  >
                    <span style={{ fontVariantNumeric: "tabular-nums", color: "#334155" }}>
                      {fmtTime(r.ranAt)}
                    </span>
                    <span
                      title={r.tcId}
                      style={{
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: 13,
                        color: "#64748B",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.tcId}
                    </span>
                    <Link
                      href={`/test-cases/${r.testCaseId}?tab=automation`}
                      title={r.title}
                      style={{
                        color: "#1D4ED8",
                        textDecoration: "none",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.title}
                    </Link>
                    <span
                      title={`${r.project} · ${r.suite}`}
                      style={{
                        fontSize: 13,
                        color: "#64748B",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.project} · {r.suite}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: isPass ? "#16A34A" : r.status === "FAIL" ? "#DC2626" : "#94A3B8",
                        }}
                      />
                      <span style={{ fontWeight: 600, color: isPass ? "#15803D" : r.status === "FAIL" ? "#B91C1C" : "#64748B" }}>
                        {isPass ? "Passed" : r.status === "FAIL" ? "Failed" : r.status === "SKIPPED" ? "Skipped" : r.status}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- Coverage per Project ---------- */

function CoverageCard({
  rows,
  hiddenProjects,
}: {
  rows: AutomationOverviewPayload["coverageByProject"];
  hiddenProjects: number;
}) {
  const automated = rows.reduce((s, r) => s + r.automated, 0);
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <section style={card}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          padding: "18px 24px 12px",
        }}
      >
        <h2 style={h2}>Coverage per Project</h2>
        <span style={{ fontSize: 14, color: "#475569" }}>
          Total {automated} dari {total} test case ter-automasi
        </span>
      </div>

      <div style={{ overflowX: "auto", padding: "0 24px 18px" }}>
        <div style={{ minWidth: 720 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) 120px 110px 130px 220px",
              gap: 16,
              alignItems: "center",
              height: 40,
              padding: "0 8px",
              background: "#F8FAFC",
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#64748B",
            }}
          >
            <span>Project</span>
            <span>Platform</span>
            <span style={{ textAlign: "right" }}>Test Case</span>
            <span style={{ textAlign: "right" }}>Automated</span>
            <span>Coverage</span>
          </div>

          {rows.length === 0 ? (
            <p style={{ margin: "14px 0 0", fontSize: 14, color: "#64748B" }}>Belum ada project dengan test case.</p>
          ) : (
            rows.map((p, i) => (
              <div
                key={p.projectId}
                className="auto-hover-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) 120px 110px 130px 220px",
                  gap: 16,
                  alignItems: "center",
                  padding: "12px 8px",
                  borderTop: i === 0 ? "none" : "1px solid #EEF0F3",
                  fontSize: 14,
                }}
              >
                <span style={{ fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </span>
                <span style={{ color: "#64748B" }}>{p.platform ?? "—"}</span>
                <span style={{ textAlign: "right", color: "#334155", fontVariantNumeric: "tabular-nums" }}>{p.total}</span>
                <span style={{ textAlign: "right", color: "#334155", fontVariantNumeric: "tabular-nums" }}>{p.automated}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1, height: 6, borderRadius: 999, background: "#EEF0F3", overflow: "hidden" }}>
                    <span
                      style={{
                        display: "block",
                        height: "100%",
                        // Minimal 1.5% agar bar tetap terlihat saat > 0.
                        width: p.pct === null ? 0 : p.pct > 0 ? `max(1.5%, ${p.pct}%)` : "0%",
                        background: "#22C55E",
                      }}
                    />
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", minWidth: 56, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {pctCoverage(p.pct)}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>

        {hiddenProjects > 0 && (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "#64748B" }}>
            Project tanpa test case ({hiddenProjects}) disembunyikan.
          </p>
        )}
      </div>
    </section>
  );
}

/* ---------- Header + komposisi bagian ---------- */

const RANGE_OPTIONS: { days: 7 | 14 | 30; label: string }[] = [
  { days: 7, label: "7 hari" },
  { days: 14, label: "14 hari" },
  { days: 30, label: "30 hari" },
];

export function AutomationOverview({
  data,
  days,
  today,
  selectedDate,
  onDaysChange,
  onSelectDate,
  onUpload,
  onCiGuide,
  onShowAllMatrix,
}: {
  data: AutomationOverviewPayload | null;
  days: 7 | 14 | 30;
  today: string;
  selectedDate: string;
  onDaysChange: (d: 7 | 14 | 30) => void;
  onSelectDate: (d: string) => void;
  onUpload: () => void;
  onCiGuide: () => void;
  onShowAllMatrix: () => void;
}) {
  const header = (
    <div
      style={{
        ...card,
        padding: "22px 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 16,
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#0F172A" }}>
          Automation Coverage &amp; Health
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 15, color: "#475569" }}>
          Pantau otomatisasi test case, hasil run CI, dan cakupan per project.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div
          role="radiogroup"
          aria-label="Rentang waktu"
          style={{ display: "inline-flex", gap: 4, background: "#F1F5F9", padding: 4, borderRadius: 10 }}
        >
          {RANGE_OPTIONS.map((opt) => {
            const active = days === opt.days;
            return (
              <button
                key={opt.days}
                type="button"
                role="radio"
                aria-checked={active}
                className="auto-seg-option"
                onClick={() => onDaysChange(opt.days)}
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 8,
                  border: "none",
                  fontSize: 14,
                  cursor: "pointer",
                  background: active ? "#fff" : undefined,
                  color: active ? "#0F172A" : "#475569",
                  fontWeight: active ? 600 : 500,
                  boxShadow: active ? "0 1px 2px rgba(15,23,42,0.08)" : "none",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="auto-secondary-btn"
          onClick={onUpload}
          style={{
            height: 40,
            padding: "0 14px",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Upload size={16} /> Upload hasil test
        </button>

        <button
          type="button"
          onClick={onCiGuide}
          style={{
            height: 40,
            padding: "0 16px",
            borderRadius: 10,
            border: "none",
            background: "#F59E0B",
            color: "#111827",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Cara Integrasi CI
        </button>
      </div>
    </div>
  );

  if (!data) {
    return (
      <>
        {header}
        <div style={{ ...card, padding: "24px" }}>
          <div className="skeleton-block" style={{ height: 120, borderRadius: 12 }} />
        </div>
      </>
    );
  }

  const k = data.kpi;
  const passDelta =
    k.passRate !== null && k.passRatePrev !== null ? Math.round(k.passRate - k.passRatePrev) : null;
  const failedDelta = k.failed - k.failedPrev;

  return (
    <>
      {header}

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <KpiCard
          label="Pass rate"
          value={pctInt(k.passRate)}
          hint={
            passDelta === null
              ? `Belum ada data pembanding (${days} hari sebelumnya)`
              : `${passDelta >= 0 ? "▲" : "▼"} ${Math.abs(passDelta)} poin vs ${days} hari sebelumnya`
          }
          hintColor={passDelta === null ? "#64748B" : passDelta >= 0 ? "#15803D" : "#B91C1C"}
        />
        <KpiCard
          label="Total run"
          value={String(k.totalRuns)}
          hint={`${k.failed} failed (${signed(failedDelta)} vs sebelumnya)`}
          hintColor={failedDelta > 0 ? "#B91C1C" : "#15803D"}
        />
        <KpiCard
          label="Failing sekarang"
          value={String(k.failingNow)}
          hint="gagal di run terakhir"
          valueColor={k.failingNow > 0 ? "#B91C1C" : undefined}
        />
        <KpiCard
          label="Flaky"
          value={String(k.flaky)}
          hint="hasil berganti-ganti"
          valueColor={k.flaky > 0 ? "#B45309" : undefined}
        />
        <KpiCard
          label="Coverage"
          value={pctCoverage(k.coverage.pct)}
          hint={`${k.coverage.automated} dari ${k.coverage.total} test case`}
        />
      </div>

      {/* Run per Hari | Perlu Perhatian */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(300px, 1fr)", gap: 20, alignItems: "start" }}>
        <RunPerDayCard daily={data.daily} days={days} selectedDate={selectedDate} onSelect={onSelectDate} />
        <AlertsCard alerts={data.alerts} />
      </div>

      <MatrixCard
        items={data.matrix.items}
        hiddenCount={data.matrix.hiddenCount}
        days={days}
        selectedDate={selectedDate}
        onSelect={onSelectDate}
        onShowAll={onShowAllMatrix}
      />

      <DayDetailCard date={data.day.date} runs={data.day.runs} today={today} />

      <CoverageCard rows={data.coverageByProject} hiddenProjects={data.hiddenProjects} />
    </>
  );
}
