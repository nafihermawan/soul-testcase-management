"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PrimaryButton } from "@/components/ui/button";

/**
 * Tombol "+ Express Run" — memakai primitif tombol primer bersama, dengan
 * ukuran RINGKAS (32px) agar sejajar dengan kolom pencarian di header
 * halaman Active Runs. Warna/radius tetap dari primitif (satu sumber gaya).
 */
export function CreateRunButton() {
  const router = useRouter();
  return (
    <PrimaryButton
      onClick={() => router.push("/test-runs/create")}
      style={{ height: 32, padding: "4px 12px", fontSize: 13 }}
    >
      <Plus size={14} strokeWidth={2.4} color="currentColor" /> Express Run
    </PrimaryButton>
  );
}
