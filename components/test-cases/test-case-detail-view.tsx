"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  FileText,
  FolderOpen,
  History,
  Info,
  UserRound,
} from "lucide-react";
import { AutomationTab } from "@/components/test-cases/automation-tab";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { TestCasePageHeader } from "@/components/test-cases/detail-header";
import { BugsTab } from "@/components/test-cases/bugs-tab";
import { Tabs } from "@/components/test-cases/tabs";
import { TestDataCodeblock } from "@/components/test-cases/test-data-codeblock";
import { ErrorBlock, NotFoundBlock, SuiteSkeleton } from "@/components/ui/data-states";
import { RefreshContext } from "@/lib/client/refresh-context";
import { useApi } from "@/lib/client/use-api";
import type { TestCaseDetailPayload } from "@/types/api";

// Warna badge hasil eksekusi — konsisten dengan visual run-executor / halaman lain
const RESULT_BADGE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  PASS: { label: "Pass", color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" },
  FAIL: { label: "Fail", color: "#E11D48", bg: "#FFF1F2", border: "#FECDD3" },
  BLOCKED: { label: "Blocked", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  SKIPPED: { label: "Skipped", color: "#374151", bg: "#F9FAFB", border: "#E5E7EB" },
};
const RESULT_FALLBACK = { label: "Not Run", color: "#475569", bg: "#F1F5F9", border: "#E2E8F0" };

const resultBadge = (s: string): React.CSSProperties => {
  const c = RESULT_BADGE[s] ?? RESULT_FALLBACK;
  return {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 999,
    fontSize: "0.72rem",
    fontWeight: 600,
    color: c.color,
    background: c.bg,
    border: `1px solid ${c.border}`,
    whiteSpace: "nowrap",
  };
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "#6B7280",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  margin: 0,
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const runStatusLabel = (s: string) =>
  s === "COMPLETED"
    ? "Completed"
    : s === "IN_PROGRESS"
      ? "In Progress"
      : s === "DRAFT"
        ? "Draft"
        : s === "ABORTED"
          ? "Aborted"
          : s;

const actionLabel: Record<string, string> = {
  CREATED: "Dibuat",
  UPDATED: "Diperbarui",
  DELETED: "Dihapus",
  STATUS_CHANGED: "Status berubah",
  EXECUTED: "Dieksekusi",
  COMMENTED: "Komentar",
};

const actionTone = (a: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "0.15rem 0.5rem",
  borderRadius: 999,
  fontSize: "0.72rem",
  fontWeight: 600,
  background:
    a === "CREATED"
      ? "var(--success-bg)"
      : a === "DELETED"
        ? "var(--danger-bg)"
        : a === "STATUS_CHANGED"
          ? "var(--warning-bg)"
          : "var(--surface-muted)",
  color:
    a === "CREATED"
      ? "var(--success)"
      : a === "DELETED"
        ? "var(--danger)"
        : a === "STATUS_CHANGED"
          ? "#B45309"
          : "var(--text-secondary)",
});

function MetaItem({
  icon,
  label,
  value,
  linkHref,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  linkHref?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.7rem",
        padding: "0.7rem 1.25rem",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "#F3F4F6",
          color: "#6B7280",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.72rem",
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {label}
        </div>
        {linkHref ? (
          <Link
            href={linkHref}
            style={{
              fontSize: "0.9rem",
              fontWeight: 600,
              color: "#1D4ED8",
              textDecoration: "none",
              wordBreak: "break-word",
            }}
          >
            {value}
          </Link>
        ) : (
          <div
            style={{
              fontSize: "0.9rem",
              fontWeight: 500,
              color: "#374151",
              wordBreak: "break-word",
            }}
          >
            {value}
          </div>
        )}
      </div>
    </div>
  );
}

export function TestCaseDetailView({
  testCaseId,
  initialTab,
}: {
  testCaseId: string;
  initialTab?: string;
}) {
  const { data, error, loading, reload } = useApi<TestCaseDetailPayload>(
    `/api/test-cases/${testCaseId}`
  );

  if (error?.status === 404) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <NotFoundBlock title="Test case tidak ditemukan" />
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <ErrorBlock message={error.message} onRetry={reload} />
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <SuiteSkeleton />
      </main>
    );
  }

  const tc = data;
  if (!tc.suite) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <NotFoundBlock title="Test case tidak ditemukan" message="Test case tidak terhubung ke suite mana pun." />
      </main>
    );
  }

  const stepsList = (tc.steps ?? "")
    .split("\n")
    .map((st) => st.trim())
    .filter(Boolean);
  const stepExpectedResults = (tc.expectedResult ?? "")
    .split("\n")
    .map((st) => st.trim())
    .filter(Boolean);

  const tabDetail = (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 8fr) minmax(0, 4fr)",
        gap: "1rem",
        alignItems: "start",
      }}
    >
      {/* ===== Main Content Card (8 cols) ===== */}
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.9rem 1.25rem",
            borderBottom: "1px solid var(--border)",
            background: "rgba(249, 250, 251, 0.6)",
          }}
        >
          <FileText size={15} color="#6B7280" />
          <h2 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "#111827" }}>
            Detail Skenario
          </h2>
        </div>

        <div
          style={{
            padding: "1.1rem 1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.1rem",
          }}
        >
          {/* Deskripsi / Skenario */}
          <section>
            <h4 style={{ ...sectionLabelStyle, marginBottom: "0.5rem" }}>Deskripsi / Skenario</h4>
            {tc.scenario?.trim() ? (
              <p
                style={{
                  margin: 0,
                  fontSize: "0.88rem",
                  color: "#374151",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.65,
                }}
              >
                {tc.scenario}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#9CA3AF", fontStyle: "italic" }}>
                Tidak ada deskripsi skenario.
              </p>
            )}
          </section>

          {/* Preconditions */}
          <section>
            <h4 style={{ ...sectionLabelStyle, marginBottom: "0.5rem" }}>Preconditions</h4>
            {tc.precondition?.trim() ? (
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "1.4rem",
                  background: "rgba(254, 243, 199, 0.4)",
                  border: "1px solid rgba(252, 211, 77, 0.5)",
                  borderRadius: 8,
                  paddingTop: "0.7rem",
                  paddingRight: "1rem",
                  paddingBottom: "0.7rem",
                  fontSize: "0.85rem",
                  color: "#374151",
                  lineHeight: 1.65,
                }}
              >
                {tc.precondition
                  .split("\n")
                  .map((line, i) => (line.trim() ? <li key={i}>{line.trim()}</li> : null))}
              </ul>
            ) : (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#9CA3AF", fontStyle: "italic" }}>
                Tidak ada pre-condition.
              </p>
            )}
          </section>

          {/* Steps: tabel terstruktur per langkah */}
          <section>
            <h4 style={{ ...sectionLabelStyle, marginBottom: "0.5rem" }}>Test Steps</h4>
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead
                  style={{
                    background: "#F9FAFB",
                    borderBottom: "1px solid var(--border)",
                    color: "#6B7280",
                    textAlign: "left",
                  }}
                >
                  <tr>
                    <th
                      style={{
                        width: 48,
                        padding: "0.55rem 0.6rem",
                        textAlign: "center",
                        fontWeight: 600,
                        borderRight: "1px solid var(--border)",
                      }}
                    >
                      #
                    </th>
                    <th
                      style={{
                        padding: "0.55rem 0.75rem",
                        fontWeight: 600,
                        borderRight: "1px solid var(--border)",
                      }}
                    >
                      Step Action
                    </th>
                    <th style={{ padding: "0.55rem 0.75rem", fontWeight: 600 }}>Expected Result</th>
                  </tr>
                </thead>
                <tbody>
                  {stepsList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        style={{
                          padding: "1.1rem",
                          color: "#9CA3AF",
                          fontStyle: "italic",
                          textAlign: "center",
                        }}
                      >
                        Belum ada langkah yang diisi.
                      </td>
                    </tr>
                  ) : (
                    stepsList.map((step, i) => (
                      <tr
                        key={i}
                        style={{
                          borderTop: "1px solid var(--border)",
                          background: i % 2 === 1 ? "#FAFAFA" : "#fff",
                        }}
                      >
                        <td
                          style={{
                            padding: "0.55rem 0.6rem",
                            textAlign: "center",
                            fontWeight: 600,
                            color: "#9CA3AF",
                            borderRight: "1px solid var(--border)",
                          }}
                        >
                          {i + 1}
                        </td>
                        <td
                          style={{
                            padding: "0.55rem 0.75rem",
                            color: "#374151",
                            lineHeight: 1.55,
                            borderRight: "1px solid var(--border)",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {step}
                        </td>
                        <td
                          style={{
                            padding: "0.55rem 0.75rem",
                            color: "#374151",
                            lineHeight: 1.55,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {stepExpectedResults.length === stepsList.length &&
                          stepExpectedResults[i] ? (
                            stepExpectedResults[i]
                          ) : (
                            <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Test Data: codeblock + copy */}
          <section>
            <h4 style={{ ...sectionLabelStyle, marginBottom: "0.5rem" }}>Test Data</h4>
            {tc.testData?.trim() ? (
              <TestDataCodeblock data={tc.testData} />
            ) : (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#9CA3AF", fontStyle: "italic" }}>
                Tidak ada test data.
              </p>
            )}
          </section>

          {/* Expected Result (global, bila tidak terpetakan per langkah) */}
          {!(stepsList.length > 0 && stepExpectedResults.length === stepsList.length) && (
            <section>
              <h4 style={{ ...sectionLabelStyle, marginBottom: "0.5rem" }}>Expected Result</h4>
              {tc.expectedResult?.trim() ? (
                <div
                  style={{
                    background: "rgba(209, 250, 229, 0.5)",
                    border: "1px solid rgba(110, 231, 183, 0.6)",
                    borderRadius: 8,
                    padding: "0.7rem 1rem",
                    fontSize: "0.88rem",
                    color: "#065F46",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {tc.expectedResult}
                </div>
              ) : (
                <p
                  style={{ margin: 0, fontSize: "0.85rem", color: "#9CA3AF", fontStyle: "italic" }}
                >
                  Tidak ada expected result.
                </p>
              )}
            </section>
          )}
        </div>
      </div>

      {/* ===== Sidebar Metadata Card (4 cols) ===== */}
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.9rem 1.25rem",
            borderBottom: "1px solid var(--border)",
            background: "rgba(249, 250, 251, 0.6)",
          }}
        >
          <Info size={15} color="#6B7280" />
          <h2 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "#111827" }}>
            Informasi
          </h2>
        </div>

        <div style={{ padding: "0.4rem 0" }}>
          <MetaItem
            icon={<FolderOpen size={15} />}
            label="Suite"
            value={tc.suite.name}
            linkHref={`/suites/${tc.suite.id}`}
          />
          <MetaItem icon={<UserRound size={15} />} label="Author" value={tc.createdBy?.name ?? "—"} />
          <MetaItem icon={<CalendarDays size={15} />} label="Dibuat" value={formatDate(tc.createdAt)} />
          <MetaItem icon={<Clock3 size={15} />} label="Terakhir Diubah" value={formatDateTime(tc.updatedAt)} />
        </div>
      </div>
    </div>
  );

  const tabRunHistory = (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-md)",
        overflow: "hidden",
      }}
    >
      {/* Toolbar konteks: total run */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.7rem 1.25rem",
          borderBottom: "1px solid var(--border)",
          background: "#F9FAFB",
        }}
      >
        <History size={14} style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)" }}>
          Total: {tc.runResults.length} Run{tc.runResults.length === 1 ? "" : "s"}
        </span>
        {tc.runResults.length > 0 && (
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            · Terakhir dieksekusi {formatDateTime(tc.runResults[0].updatedAt)}
          </span>
        )}
      </div>
      {tc.runResults.length === 0 ? (
        <p style={{ padding: "1.25rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Belum pernah dieksekusi.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr
                style={{
                  color: "var(--text-muted)",
                  textAlign: "left",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <th style={{ padding: "0.5rem 1.25rem", fontWeight: 600 }}>Run</th>
                <th style={{ padding: "0.5rem 0.5rem", fontWeight: 600 }}>Hasil</th>
                <th style={{ padding: "0.5rem 0.5rem", fontWeight: 600 }}>Actual Result</th>
                <th style={{ padding: "0.5rem 1.25rem", fontWeight: 600 }}>Waktu Eksekusi</th>
              </tr>
            </thead>
            <tbody>
              {tc.runResults.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem 1.25rem" }}>
                    <Link
                      href={`/test-runs/${r.run.id}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        color: "var(--brand-600)",
                        textDecoration: "none",
                        fontWeight: 600,
                      }}
                    >
                      {r.run.name}
                      <ArrowUpRight size={13} style={{ opacity: 0.7 }} />
                    </Link>
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--text-muted)",
                        marginTop: "0.15rem",
                      }}
                    >
                      {runStatusLabel(r.run.status)}
                    </div>
                  </td>
                  <td style={{ padding: "0.5rem 0.5rem" }}>
                    <span style={resultBadge(r.status)}>{RESULT_BADGE[r.status]?.label ?? r.status}</span>
                  </td>
                  <td
                    style={{
                      padding: "0.5rem 0.5rem",
                      color: "var(--text-secondary)",
                      maxWidth: 200,
                    }}
                  >
                    <span
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {r.actualResult || "—"}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "0.5rem 1.25rem",
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDateTime(r.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const tabActivity = (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-md)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "1rem 1.25rem",
          borderBottom: "1px solid var(--border)",
          fontWeight: 700,
          fontSize: "1rem",
        }}
      >
        Activity Log
      </div>
      {tc.activities.length === 0 ? (
        <p style={{ padding: "1.25rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
          Belum ada aktivitas tercatat.
        </p>
      ) : (
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          {tc.activities.map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                padding: "0.7rem 1.25rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span style={actionTone(a.action)}>{actionLabel[a.action] ?? a.action}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.85rem" }}>{a.detail || "—"}</div>
                <div
                  style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}
                >
                  {a.user?.name ?? "Unknown"} · {formatDateTime(a.createdAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const tabAttachments = (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-md)",
        padding: "1.5rem",
      }}
    >
      <AttachmentsPanel
        owner={{ testCaseId: tc.id }}
        attachments={tc.attachments ?? []}
        canEdit={tc.canEdit}
        onChanged={reload}
      />
    </div>
  );

  return (
    <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
      <RefreshContext.Provider value={reload}>
        {/* Header block */}
        <div
          style={{
            background: "#fff",
            borderBottom: "1px solid var(--border)",
            padding: "1rem 1.5rem",
            marginBottom: "1.5rem",
          }}
        >
          {/* Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              fontSize: 14,
              fontWeight: 400,
              color: "#6B7280",
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            <Link href="/" style={{ color: "var(--text-muted)" }}>
              Projects
            </Link>
            <ChevronRight size={13} style={{ color: "var(--text-muted)", opacity: 0.6 }} />
            <Link href={`/projects/${tc.suite.project.id}`} style={{ color: "var(--text-muted)" }}>
              {tc.suite.project.name}
            </Link>
            <ChevronRight size={13} style={{ color: "var(--text-muted)", opacity: 0.6 }} />
            <Link href={`/suites/${tc.suite.id}`} style={{ color: "var(--text-muted)" }}>
              {tc.suite.name}
            </Link>
            <ChevronRight size={13} style={{ color: "var(--text-muted)", opacity: 0.6 }} />
            <span style={{ color: "var(--text)", fontWeight: 600 }}>{tc.tcId}</span>
          </nav>

          {/* Title + badges + actions */}
          <TestCasePageHeader
            id={tc.id}
            code={tc.tcId}
            title={tc.title}
            status={tc.status}
            priority={tc.priority}
            suiteId={tc.suite.id}
            canEdit={tc.canEdit}
          />
        </div>

        <Tabs
          initialKey={initialTab}
          tabs={[
            { key: "detail", label: "Detail", content: tabDetail },
            {
              key: "automation",
              label: "Automation",
              content: (
                <AutomationTab
                  testCaseId={tc.id}
                  automation={
                    tc.automation
                      ? {
                          id: tc.automation.id,
                          externalTestId: tc.automation.externalTestId,
                          scriptPath: tc.automation.scriptPath,
                          status: tc.automation.status,
                          lastRunAt: tc.automation.lastRunAt,
                          lastResult: tc.automation.lastResult,
                        }
                      : null
                  }
                />
              ),
            },
            { key: "runs", label: "Run History", content: tabRunHistory },
            {
              key: "bugs",
              label: "Bugs",
              content: <BugsTab testCaseId={tc.id} bugs={tc.bugs} />,
            },
            { key: "activity", label: "Activity", content: tabActivity },
            { key: "attachments", label: "Attachments", content: tabAttachments },
          ]}
        />
      </RefreshContext.Provider>
    </main>
  );
}
