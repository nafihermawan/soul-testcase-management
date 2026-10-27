"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui";
import { ProjectsManager } from "@/components/settings/projects-manager";
import { UsersManager, type UserItem } from "@/components/settings/users-manager";
import { PageTabs } from "@/components/ui/page-tabs";
import { RefreshContext } from "@/lib/client/refresh-context";

type ProjectItem = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  platform: "MOBILE" | "WEB" | "HARDWARE" | "API" | null;
  docUrl: string | null;
  _count: { suites: number };
};

type SettingsTabKey = "projects" | "users";

/** Tombol utama amber di header card (dipakai tab Projects & User & Roles). */
const amberButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 44,
  padding: "0 16px",
  borderRadius: 10,
  border: "none",
  background: "#F59E0B",
  color: "#111827",
  fontWeight: 500,
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "background-color 0.15s ease",
};

/**
 * Layout Settings mengikuti pola halaman Active Runs / QA Performance:
 * Card 1 = header (judul + deskripsi + aksi), Card 2 = konten full-height,
 * dengan tab navigation di antaranya (di luar card).
 *
 * Toolbar tiap tab (search / filter / tombol tambah) hidup di Card 1, jadi
 * state-nya diangkat ke sini lalu diturunkan ke manager-nya.
 */
export function SettingsView({
  projects,
  users,
  reload,
}: {
  projects: ProjectItem[];
  users: UserItem[];
  reload: () => void;
}) {
  const [tab, setTab] = useState<SettingsTabKey>("projects");
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  return (
    <RefreshContext.Provider value={reload}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
        {/* Card 1 — header halaman */}
        <Card style={{ padding: "0.875rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#1E293B",
                  letterSpacing: "-0.025em",
                  margin: 0,
                }}
              >
                Settings
              </h1>
              <p style={{ fontSize: 12, color: "#64748B", margin: "0.25rem 0 0" }}>
                Kelola project, struktur suite, serta hak akses user.
              </p>
            </div>

            {tab === "users" ? (
              <button
                type="button"
                onClick={() => setCreateUserOpen(true)}
                style={amberButtonStyle}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
              >
                <Plus size={14} /> Tambah User
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCreateProjectOpen(true)}
                style={amberButtonStyle}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
              >
                <Plus size={14} /> Tambah Project
              </button>
            )}
          </div>
        </Card>

        {/* Tab navigation — model lama: di luar card, tepat di bawah header. */}
        <PageTabs<SettingsTabKey>
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "projects", label: "Projects" },
            { key: "users", label: "User & Roles" },
          ]}
        />

        {/* Card 2 — konten; tinggi MENGIKUTI ISI tabel (tanpa area kosong di bawah). */}
        <Card style={{ padding: 0, border: "1px solid #E5E7EB" }}>
          {tab === "projects" ? (
            <ProjectsManager
              projects={projects}
              createOpen={createProjectOpen}
              onCreateHandled={() => setCreateProjectOpen(false)}
            />
          ) : (
            <UsersManager
              users={users}
              createOpen={createUserOpen}
              onCreateHandled={() => setCreateUserOpen(false)}
            />
          )}
        </Card>
      </div>
    </RefreshContext.Provider>
  );
}
