"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export function CreateRunButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push("/test-runs/create")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        padding: "10px 16px",
        borderRadius: 8,
        border: "none",
        background: "#F59E0B",
        color: "#0F172A",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "background-color 0.15s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
    >
      <Plus size={16} /> Express Run
    </button>
  );
}
