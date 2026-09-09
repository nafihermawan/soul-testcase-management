"use client";

import { useState } from "react";
import Link from "next/link";
import { TestCasesManager } from "@/components/hierarchy/test-cases-manager";
import { ErrorBlock, LoadingBlock, NotFoundBlock } from "@/components/ui/data-states";
import { RefreshContext } from "@/lib/client/refresh-context";
import { useApi } from "@/lib/client/use-api";
import { parseReferenceLines } from "@/lib/format";
import type { SuiteDetailPayload } from "@/types/api";

export function SuiteDetailView({
  suiteId,
  initialEditTcId,
}: {
  suiteId: string;
  initialEditTcId: string | null;
}) {
  const { data, error, loading, reload } = useApi<SuiteDetailPayload>(`/api/suites/${suiteId}`);
  const [isExpanded, setIsExpanded] = useState(false);

  if (error?.status === 404) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <NotFoundBlock title="Suite tidak ditemukan" />
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
        <LoadingBlock label="Memuat suite…" />
      </main>
    );
  }

  const suite = data.suite;
  const docRefs = parseReferenceLines(suite.docUrl);
  const hasDoc = !!(suite.description?.trim() || docRefs.length > 0);

  const sectionLabel: React.CSSProperties = {
    display: "block",
    fontSize: "0.6875rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#94A3B8",
    marginBottom: "0.4rem",
  };
  const infoLabel: React.CSSProperties = {
    color: "#64748B",
    width: 96,
    flexShrink: 0,
    fontSize: "0.75rem",
  };

  return (
    <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
      {/* Kartu header utama */}
      <div
        style={{
          width: "100%",
          background: "#fff",
          border: "1px solid rgba(226, 232, 240, 0.8)",
          borderRadius: 16,
          padding: "1.5rem",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
          marginBottom: "1.5rem",
        }}
      >
        {/* 1. Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "0.75rem",
            color: "#94A3B8",
            fontWeight: 500,
            flexWrap: "wrap",
          }}
        >
          <Link href="/" style={{ color: "inherit", textDecoration: "none", transition: "color 0.15s ease" }}>
            Projects
          </Link>
          <span aria-hidden>›</span>
          <Link
            href={`/projects/${suite.project.id}`}
            style={{ color: "inherit", textDecoration: "none", transition: "color 0.15s ease" }}
          >
            {suite.project.name}
          </Link>
          {suite.parent && (
            <>
              <span aria-hidden>›</span>
              <Link
                href={`/suites/${suite.parent.id}`}
                style={{ color: "inherit", textDecoration: "none", transition: "color 0.15s ease" }}
              >
                {suite.parent.name}
              </Link>
            </>
          )}
          <span aria-hidden>›</span>
          <span style={{ color: "#334155", fontWeight: 600 }}>{suite.name}</span>
        </nav>

        {/* 2. Baris atas: judul & aksi */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            marginTop: "0.8rem",
          }}
        >
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              margin: 0,
              color: "#0F172A",
              letterSpacing: "-0.02em",
            }}
          >
            {suite.name}
          </h1>

          {/* Toolbar aksi: Template / Import / CSV / + Tambah Section (dari TestCasesManager) */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <div id="suite-header-actions" />
          </div>
        </div>

        {/* 3. Toggle Detail dengan chevron berputar */}
        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "0.4rem" }}>
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            aria-expanded={isExpanded}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.25rem 0",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: isExpanded ? "#1E293B" : "#64748B",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#1E293B")}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = isExpanded ? "#1E293B" : "#64748B";
            }}
          >
            <span>Detail</span>
            <span
              style={{
                fontSize: 10,
                lineHeight: 1,
                transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.3s ease-in-out",
                display: "inline-block",
              }}
            >
              ▼
            </span>
          </button>
        </div>

        {/* 4. Container collapse halus */}
        <div
          style={{
            display: "grid",
            overflow: "hidden",
            transition: "grid-template-rows 0.3s ease-in-out, opacity 0.3s ease-in-out, padding 0.3s ease-in-out, border 0.3s ease-in-out",
            gridTemplateRows: isExpanded ? "1fr" : "0fr",
            opacity: isExpanded ? 1 : 0,
            paddingTop: isExpanded ? "0.75rem" : 0,
            borderTop: isExpanded ? "1px solid #F1F5F9" : "1px solid transparent",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            {/* INFORMASI SUITE */}
            <div style={{ marginBottom: "1.25rem" }}>
              <span style={sectionLabel}>Informasi Suite</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem" }}>
                  <span style={infoLabel}>ID Suites</span>
                  <span style={{ color: "#94A3B8" }}>:</span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "#1E293B",
                    }}
                  >
                    {suite.code}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem" }}>
                  <span style={infoLabel}>Project</span>
                  <span style={{ color: "#94A3B8" }}>:</span>
                  <span style={{ fontWeight: 600, color: "#1E293B" }}>{suite.project.name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem" }}>
                  <span style={infoLabel}>Total Test</span>
                  <span style={{ color: "#94A3B8" }}>:</span>
                  <span style={{ fontWeight: 600, color: "#1E293B" }}>
                    {suite.testCaseCount} Test Case{suite.testCaseCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </div>

            {suite.description?.trim() && (
              <div style={{ marginBottom: "1.25rem" }}>
                <span style={sectionLabel}>Deskripsi</span>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.8rem",
                    color: "#475569",
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {suite.description}
                </p>
              </div>
            )}

            {/* REFERENSI */}
            {docRefs.length > 0 ? (
              <div>
                <span style={sectionLabel}>Referensi</span>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  {docRefs.map((ref, i) => (
                    <li key={i}>
                      {ref.url ? (
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.4rem",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            color: "#2563EB",
                            textDecoration: "none",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#2563EB",
                              display: "inline-block",
                            }}
                          />
                          {ref.label}
                        </a>
                      ) : (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.4rem",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            color: "#475569",
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#CBD5E1",
                              display: "inline-block",
                            }}
                          />
                          {ref.label}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              !hasDoc && (
                <p style={{ margin: 0, fontSize: "0.75rem", color: "#94A3B8", fontStyle: "italic" }}>
                  Suite ini belum punya deskripsi atau referensi — isi lewat edit suite.
                </p>
              )
            )}
          </div>
        </div>
      </div>

      <RefreshContext.Provider value={reload}>
        <TestCasesManager
          suiteId={suite.id}
          suiteName={suite.name}
          testCases={data.testCases}
          sections={data.sections}
          canEdit={data.canEdit}
          initialEditTcId={initialEditTcId}
        />
      </RefreshContext.Provider>
    </main>
  );
}
