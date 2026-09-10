"use client";

import { useState } from "react";
import { Sidebar, SidebarSkeleton } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useApi } from "@/lib/client/use-api";
import type { Me } from "@/types/api";
import type { SidebarProject } from "@/types/api";

type AppShellUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  // Data shell (identitas + daftar project sidebar) di-fetch client.
  const me = useApi<Me>("/api/me");
  const projectsApi = useApi<SidebarProject[]>("/api/projects");
  const shellReady = !!me.data && !!projectsApi.data;

  const user: AppShellUser | undefined = me.data
    ? {
        name: me.data.name,
        email: me.data.email,
        image: me.data.image,
        role: me.data.role,
      }
    : undefined;

  const projects: SidebarProject[] = projectsApi.data ?? [];

  return (
    <div
      className="app-shell-root"
      style={{ display: "flex", height: "100vh", overflow: "hidden" }}
    >
      <div className="app-sidebar">
        {shellReady ? (
          <Sidebar projects={projects} collapsed={collapsed} userRole={user?.role} />
        ) : (
          <SidebarSkeleton collapsed={collapsed} />
        )}
      </div>
      <div
        className="app-main-column"
        style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}
      >
        <div className="app-header">
          <Header user={user} onToggleSidebar={() => setCollapsed((v) => !v)} />
        </div>
        <main
          className="app-main"
          style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "1.25rem", minWidth: 0 }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
