"use client";

import { Search } from "lucide-react";

export function DashboardSearch() {
  return (
    <div style={{ position: "relative", maxWidth: 440, width: "100%" }}>
      <Search
        size={15}
        style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--text-muted)",
        }}
      />
      <input
        type="search"
        placeholder="Search test case, id, suite, etc."
        aria-label="Search test case, id, suite, etc."
        style={{
          width: "100%",
          padding: "0.45rem 0.9rem 0.45rem 2.1rem",
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--surface)",
          fontSize: "0.85rem",
          color: "var(--text)",
        }}
      />
    </div>
  );
}
