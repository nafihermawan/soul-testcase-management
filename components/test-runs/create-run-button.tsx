"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PrimaryButton } from "@/components/ui/button";

/** Tombol "+ Express Run" — memakai primitif tombol primer bersama. */
export function CreateRunButton() {
  const router = useRouter();
  return (
    <PrimaryButton onClick={() => router.push("/test-runs/create")}>
      <Plus size={16} strokeWidth={2.4} color="currentColor" /> Express Run
    </PrimaryButton>
  );
}
