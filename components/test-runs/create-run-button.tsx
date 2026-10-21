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
        // Samakan persis dengan tombol primer di app ini (Tambah Section,
        // Complete Run, Express Run di footer form): tinggi 40, radius 10,
        // amber brand #FFC348 dengan teks slate gelap.
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "auto",
        height: 40,
        boxSizing: "border-box",
        padding: "0 16px",
        border: "1px solid #FFC348",
        borderRadius: 10,
        background: "#FFC348",
        color: "#0F172A",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "background-color 0.15s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#F0B53D")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
    >
      <Plus size={16} strokeWidth={2.4} color="currentColor" /> Express Run
    </button>
  );
}
