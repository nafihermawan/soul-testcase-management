import { Check } from "lucide-react";

/**
 * Daftar langkah pengujian bergaya "bernomor" — SATU komponen bersama supaya
 * tab Detail halaman detail test case dan modal preview test case selalu
 * konsisten.
 *
 * Expected per langkah ditampilkan HANYA bila jumlah barisnya sepadan dengan
 * jumlah langkah; kalau tidak, expected ditampilkan di section "Expected Result"
 * milik masing-masing pemanggil (bukan sebagai tanda "—").
 */
export function TestStepsList({
  steps,
  expectedResults = [],
}: {
  steps: string[];
  expectedResults?: string[];
}) {
  const showPerStep = steps.length > 0 && expectedResults.length === steps.length;

  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {steps.map((step, i) => {
        const expected = showPerStep ? expectedResults[i] : "";
        return (
          <li
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "24px 1fr",
              columnGap: 14,
              alignItems: "start",
              padding: "12px 0",
              borderTop: i === 0 ? "none" : "1px solid #EEF0F3",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "#F1F5F9",
                color: "#334155",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {i + 1}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <div
                style={{
                  width: "100%",
                  fontSize: 15,
                  lineHeight: "24px",
                  color: "#0F172A",
                  whiteSpace: "pre-wrap",
                }}
              >
                {step}
              </div>
              {expected ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    fontSize: 14,
                    lineHeight: "21px",
                    color: "#334155",
                  }}
                >
                  <Check
                    size={16}
                    color="#16A34A"
                    aria-hidden="true"
                    style={{ marginTop: 2, flexShrink: 0 }}
                  />
                  <span>
                    <span style={{ fontWeight: 600, color: "#15803D" }}>Expected:</span> {expected}
                  </span>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
