import { SANS, CARD_BORDER, DANGER, TRACK, fmt } from "@/components/reports/report-tokens";
import type { ReportsPayload } from "@/types/api";

/** Kartu KPI: 3 baris seragam (label · nilai · bawah) supaya sejajar antar kartu. */
const CARD = {
  background: "#ffffff",
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 16,
  padding: "18px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
} as const;

const ROW_LABEL = { height: 24, display: "flex", alignItems: "center" } as const;
const ROW_VALUE = { display: "flex", alignItems: "baseline", gap: 10 } as const;
const ROW_BOTTOM = { height: 18, display: "flex", alignItems: "center" } as const;

const LABEL = { fontSize: 13, fontWeight: 500, color: "#475569" } as const;
const CAPTION = { fontSize: 13, color: "#64748B" } as const;
const VALUE = {
  fontFamily: SANS,
  fontSize: 32,
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: "-0.02em",
  fontVariantNumeric: "tabular-nums",
  color: "#0F172A",
} as const;

/** Bar progres 6px yang mengisi lebar kartu. */
function Bar({ pct, fill }: { pct: number; fill: string }) {
  return (
    <div style={{ flex: 1, height: 6, borderRadius: 999, background: TRACK, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: fill }} />
    </div>
  );
}

/** Ringkasan inventaris test case. Semua angka dari tabel TestCase,
 *  bukan dari baris hasil run. */
export function InventorySummary({ inventory }: { inventory: ReportsPayload["inventory"] }) {
  const orphanCount = Math.max(inventory.totalTC - inventory.inSuite, 0);
  const untestedPct = inventory.untestedPct;
  const untestedColor = inventory.untested > 0 ? DANGER : "#0F172A";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
      {/* Total Test Cases */}
      <div style={CARD}>
        <div style={ROW_LABEL}>
          <span style={LABEL}>Total Test Cases</span>
        </div>
        <div style={ROW_VALUE}>
          <span style={VALUE}>{fmt(inventory.totalTC)}</span>
        </div>
        <div style={ROW_BOTTOM}>
          <span style={CAPTION}>
            {orphanCount > 0
              ? `${fmt(inventory.inSuite)} di suite · ${fmt(orphanCount)} tanpa suite`
              : "Semua terhubung ke suite"}
          </span>
        </div>
      </div>

      {/* Suite */}
      <div style={CARD}>
        <div style={ROW_LABEL}>
          <span style={LABEL}>Suite</span>
        </div>
        <div style={ROW_VALUE}>
          <span style={VALUE}>{fmt(inventory.suites)}</span>
        </div>
        <div style={ROW_BOTTOM}>
          <span style={CAPTION}>{fmt(inventory.projects)} project</span>
        </div>
      </div>

      {/* Belum Pernah Di-test */}
      <div style={CARD}>
        <div style={ROW_LABEL}>
          <span style={LABEL}>Belum Pernah Di-test</span>
        </div>
        <div style={ROW_VALUE}>
          <span style={{ ...VALUE, color: untestedColor }}>{fmt(inventory.untested)}</span>
          <span style={CAPTION}>
            {untestedPct === null ? "Belum ada test case" : `${untestedPct}% dari TC di suite`}
          </span>
        </div>
        <div style={ROW_BOTTOM}>{untestedPct !== null && <Bar pct={untestedPct} fill={DANGER} />}</div>
      </div>
    </div>
  );
}
