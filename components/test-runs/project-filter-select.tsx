"use client";

import { useRouter } from "next/navigation";

export function ProjectFilterSelect({
  projects,
  defaultValue,
  action,
}: {
  projects: { id: string; name: string }[];
  defaultValue: string;
  action: string;
}) {
  const router = useRouter();
  return (
    <select
      name="project"
      defaultValue={defaultValue}
      onChange={(e) => {
        const v = e.target.value;
        router.push(v ? `${action}?project=${encodeURIComponent(v)}` : action);
      }}
      style={{
        padding: "0.5rem 0.75rem",
        border: "1px solid #D1D5DB",
        borderRadius: 8,
        fontSize: "0.85rem",
        background: "#fff",
        cursor: "pointer",
        minWidth: 180,
      }}
    >
      <option value="">Semua Project</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
