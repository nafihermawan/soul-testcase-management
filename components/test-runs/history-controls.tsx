"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Search, SlidersHorizontal, X } from "lucide-react";

export type HistoryFilterState = {
  q: string;
  platforms: string[];
  projectIds: string[];
};

export function buildHistoryHref(
  base: string,
  f: Partial<HistoryFilterState> & { page?: number; perPage?: number }
): string {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.platforms?.length) params.set("platforms", f.platforms.join(","));
  if (f.projectIds?.length) params.set("projects", f.projectIds.join(","));
  if (f.page && f.page > 1) params.set("page", String(f.page));
  if (f.perPage && f.perPage !== 10) params.set("perPage", String(f.perPage));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

const PLATFORM_OPTIONS = ["Web", "Mobile", "Hardware", "API"];

export function HistoryControls({
  projects,
  initial,
  activeCount,
  baseUrl = "/test-runs/history",
  dialogTitle = "Filter Run History",
}: {
  projects: { id: string; name: string }[];
  initial: HistoryFilterState;
  activeCount: number;
  baseUrl?: string;
  dialogTitle?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const [modalOpen, setModalOpen] = useState(false);
  const [platSel, setPlatSel] = useState<string[]>(initial.platforms);
  const [projSel, setProjSel] = useState<string[]>(initial.projectIds);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalRoot(document.body);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Search: debounce + push ke URL, reset ke page 1
  const onSearchChange = (val: string) => {
    setQ(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      router.replace(buildHistoryHref(baseUrl, { q: val.trim() }));
    }, 350);
  };

  // Sinkronkan saat URL berubah dari browser back/forward
  useEffect(() => {
    setQ(initial.q);
  }, [initial.q]);

  const togglePlat = (p: string) =>
    setPlatSel((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  const toggleProj = (id: string) =>
    setProjSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const applyFilter = () => {
    setModalOpen(false);
    router.push(buildHistoryHref(baseUrl, { platforms: platSel, projectIds: projSel }));
  };

  const resetFilter = () => {
    setPlatSel([]);
    setProjSel([]);
    setModalOpen(false);
    router.push(baseUrl);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
      {/* Search input */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
        }}
      >
        <Search
          size={15}
          style={{
            position: "absolute",
            left: 10,
            color: "#94A3B8",
            pointerEvents: "none",
          }}
        />
        <input
          type="text"
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari Run ID, Nama Run..."
          style={{
            width: 220,
            padding: "0.5rem 0.75rem 0.5rem 2rem",
            borderRadius: 8,
            border: "1px solid #D1D5DB",
            background: "#fff",
            fontSize: "0.83rem",
            color: "#0F172A",
            outline: "none",
          }}
        />
      </div>

      {/* Filter button */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.5rem 0.9rem",
          borderRadius: 8,
          border: "1px solid #D1D5DB",
          background: "#fff",
          color: "#374151",
          fontWeight: 600,
          fontSize: "0.83rem",
          cursor: "pointer",
        }}
      >
        <SlidersHorizontal size={14} />
        {activeCount > 0 ? `Filter (${activeCount})` : "Filter"}
      </button>

      {modalOpen &&
        portalRoot &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filter Run History"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
            }}
            onClick={() => setModalOpen(false)}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 480,
                background: "#fff",
                borderRadius: 12,
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
                overflow: "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem 1.25rem",
                  borderBottom: "1px solid #E5E7EB",
                }}
              >
                <h3 style={{ fontSize: "1.02rem", fontWeight: 700, margin: 0, color: "#0F172A" }}>
                  {dialogTitle}
                </h3>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "#6B7280",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 4,
                    borderRadius: 6,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div
                style={{
                  padding: "1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                  maxHeight: "60vh",
                  overflowY: "auto",
                }}
              >
                {/* Platform */}
                <div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#0F172A", marginBottom: "0.5rem" }}>
                    Platform
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {PLATFORM_OPTIONS.map((p) => {
                      const on = platSel.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePlat(p)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "0.35rem 0.8rem",
                            borderRadius: 8,
                            border: on ? "1px solid #2563EB" : "1px solid #D1D5DB",
                            background: on ? "#EFF6FF" : "#fff",
                            color: on ? "#1D4ED8" : "#374151",
                            fontWeight: 600,
                            fontSize: "0.82rem",
                            cursor: "pointer",
                          }}
                        >
                          {on ? <X size={12} /> : <span style={{ width: 12 }} />}
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Projects Covered */}
                <div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#0F172A", marginBottom: "0.5rem" }}>
                    Projects Covered
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {projects.length === 0 && (
                      <div style={{ fontSize: "0.8rem", color: "#94A3B8" }}>Belum ada project.</div>
                    )}
                    {projects.map((p) => {
                      const on = projSel.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            padding: "0.35rem 0.6rem",
                            borderRadius: 8,
                            background: on ? "#F0F9FF" : "transparent",
                            cursor: "pointer",
                            fontSize: "0.85rem",
                            color: "#1F2937",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleProj(p.id)}
                            style={{ accentColor: "#2563EB", width: 15, height: 15 }}
                          />
                          {p.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.9rem 1.25rem",
                  borderTop: "1px solid #E5E7EB",
                  background: "#F8FAFC",
                }}
              >
                <button
                  type="button"
                  onClick={resetFilter}
                  style={{
                    padding: "0.45rem 1rem",
                    borderRadius: 8,
                    border: "none",
                    background: "transparent",
                    color: "#6B7280",
                    fontWeight: 600,
                    fontSize: "0.83rem",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Reset Filter
                </button>
                <button
                  type="button"
                  onClick={applyFilter}
                  style={{
                    padding: "0.5rem 1.25rem",
                    borderRadius: 8,
                    border: "none",
                    background: "#2563EB",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  Terapkan Filter
                </button>
              </div>
            </div>
          </div>,
          portalRoot
        )}
    </div>
  );
}
