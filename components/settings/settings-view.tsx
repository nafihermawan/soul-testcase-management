"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Card } from "@/components/ui";
import { ProjectsManager, type PlatformFilter } from "@/components/settings/projects-manager";
import {
  UsersManager,
  type RoleFilter,
  type UserItem,
} from "@/components/settings/users-manager";
import { SettingsTabs, type SettingsTabKey } from "@/components/settings/settings-tabs";
import { Select } from "@/components/ui/select";
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

/** Tombol utama amber di header card (dipakai tab Projects & User & Roles). */
const amberButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 32,
  padding: "0 12px",
  borderRadius: 8,
  border: "none",
  background: "#F59E0B",
  color: "#fff",
  fontWeight: 500,
  fontSize: 12,
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
  const [userQuery, setUserQuery] = useState("");
  const [userRole, setUserRole] = useState<RoleFilter>("ALL");
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [projectQuery, setProjectQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("ALL");
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
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ position: "relative" }}>
                  <Search
                    size={13}
                    style={{
                      position: "absolute",
                      left: 9,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#94A3B8",
                    }}
                  />
                  <input
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Cari nama/email user..."
                    aria-label="Cari nama atau email user"
                    style={{
                      width: 240,
                      height: 32,
                      paddingLeft: 28,
                      paddingRight: 10,
                      background: "#F8FAFC",
                      border: "1px solid #E2E8F0",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#1E293B",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <Select
                  value={userRole}
                  size="sm"
                  ariaLabel="Filter role"
                  style={{ width: 132 }}
                  onChange={(e) => setUserRole(e.target.value as RoleFilter)}
                >
                  <option value="ALL">All Roles</option>
                  <option value="QA">QA</option>
                  <option value="DEVELOPER">Developer</option>
                  <option value="PRODUCT">Product</option>
                  <option value="LEAD">Lead QA</option>
                </Select>

                <button
                  type="button"
                  onClick={() => setCreateUserOpen(true)}
                  style={amberButtonStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
                >
                  <Plus size={14} /> Tambah User
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ position: "relative" }}>
                  <Search
                    size={13}
                    style={{
                      position: "absolute",
                      left: 9,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#94A3B8",
                    }}
                  />
                  <input
                    value={projectQuery}
                    onChange={(e) => setProjectQuery(e.target.value)}
                    placeholder="Cari nama/key project..."
                    aria-label="Cari nama atau key project"
                    style={{
                      width: 240,
                      height: 32,
                      paddingLeft: 28,
                      paddingRight: 10,
                      background: "#F8FAFC",
                      border: "1px solid #E2E8F0",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "#1E293B",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <Select
                  value={platformFilter}
                  size="sm"
                  ariaLabel="Filter platform"
                  style={{ width: 140 }}
                  onChange={(e) => setPlatformFilter(e.target.value as PlatformFilter)}
                >
                  <option value="ALL">All Platforms</option>
                  <option value="WEB">WEB</option>
                  <option value="MOBILE">MOBILE</option>
                  <option value="HARDWARE">HARDWARE</option>
                  <option value="API">API</option>
                </Select>

                <button
                  type="button"
                  onClick={() => setCreateProjectOpen(true)}
                  style={amberButtonStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
                >
                  <Plus size={14} /> Tambah Project
                </button>
              </div>
            )}
          </div>
        </Card>

        {/* Tab navigation — model lama: di luar card, tepat di bawah header. */}
        <SettingsTabs active={tab} onChange={setTab} />

        {/* Card 2 — konten, full-width & full-height */}
        <Card
          style={{
            padding: 0,
            minHeight: "calc(100vh - 190px)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {tab === "projects" ? (
              <ProjectsManager
                projects={projects}
                query={projectQuery}
                platformFilter={platformFilter}
                createOpen={createProjectOpen}
                onCreateHandled={() => setCreateProjectOpen(false)}
              />
            ) : (
              <UsersManager
                users={users}
                query={userQuery}
                roleFilter={userRole}
                createOpen={createUserOpen}
                onCreateHandled={() => setCreateUserOpen(false)}
              />
            )}
          </div>
        </Card>
      </div>
    </RefreshContext.Provider>
  );
}
