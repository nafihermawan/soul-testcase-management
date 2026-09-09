"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  BarChart3,
  Bug,
  FlaskConical,
  Layers,
  LayoutDashboard,
  LogOut,
  Play,
  Settings,
} from "lucide-react";
import { SidebarItem } from "@/components/layout/sidebar-item";

type ProjectItem = {
  id: string;
  name: string;
  code: string;
  platform: string | null;
};

/** Kelompokkan project berdasarkan platform (tag), diurutkan abjad. */
function groupProjectsByEnv(projects: ProjectItem[]): Record<string, ProjectItem[]> {
  return projects.reduce<Record<string, ProjectItem[]>>((acc, project) => {
    const key = (project.platform || "Lainnya").toUpperCase();
    if (!acc[key]) acc[key] = [];
    acc[key].push(project);
    return acc;
  }, {});
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/bugs", label: "Bugs", icon: Bug },
  { href: "/automation", label: "Automation", icon: FlaskConical },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  projects,
  collapsed,
  userRole,
}: {
  projects: ProjectItem[];
  collapsed: boolean;
  userRole?: string | null;
}) {
  const pathname = usePathname();
  const isProjectsActive =
    pathname.startsWith("/projects") ||
    pathname.startsWith("/suites");
  const isRunsActive = pathname.startsWith("/test-runs");
  const [projectsOpen, setProjectsOpen] = useState(isProjectsActive);
  const [runsOpen, setRunsOpen] = useState(isRunsActive);
  const [logoutHovered, setLogoutHovered] = useState(false);

  // Settings hanya untuk QA; Automation tersembunyi untuk PRODUCT.
  const visibleNavItems =
    userRole === "PRODUCT"
      ? navItems.filter((i) => i.href !== "/settings" && i.href !== "/automation")
      : userRole === "QA"
        ? navItems
        : navItems.filter((i) => i.href !== "/settings");

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside
      style={{
        width: collapsed ? 64 : 240,
        flexShrink: 0,
        height: "100vh",
        position: "sticky",
        top: 0,
        borderRight: "1px solid #E5E7EB",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        transition: "width 0.3s ease",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {/* Logo */}
      <div
        className="brand-logo-container"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          height: 64,
          padding: collapsed ? "0" : "0 20px",
          justifyContent: collapsed ? "center" : "flex-start",
          flexShrink: 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/spn-logo.png"
          alt="Soulparking logo"
          width={34}
          height={34}
          style={{
            display: "block",
            borderRadius: 8,
            flexShrink: 0,
            objectFit: "contain",
          }}
        />
        {!collapsed && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              justifyContent: "center",
              minWidth: 0,
            }}
          >
            <div
              className="brand-title"
              style={{
                fontWeight: 900,
                fontStyle: "italic",
                letterSpacing: "-0.03em",
                color: "#0F172A",
                fontSize: "1.25rem",
                lineHeight: "1.35",
                whiteSpace: "nowrap",
                paddingLeft: 0,
                marginLeft: 0,
                textAlign: "left",
              }}
            >
              Soulparking
            </div>
            <div
              style={{
                fontStyle: "normal",
                fontWeight: 400,
                color: "#374151",
                fontSize: "0.625rem",
                lineHeight: "1.3",
                whiteSpace: "nowrap",
                paddingLeft: 0,
                marginLeft: 0,
                textAlign: "left",
              }}
            >
              Test Case Management
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav
        style={{
          flex: 1,
          padding: "0.75rem 0.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          overflowY: "auto",
        }}
      >
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <SidebarItem
              key={item.href}
              href={item.href}
              active={active}
              collapsed={collapsed}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                size={17}
                strokeWidth={2}
                color={active ? "#FFC348" : undefined}
              />
              {!collapsed && <span>{item.label}</span>}
            </SidebarItem>
          );
        })}

        {/* Test Runs (accordion: Active Runs + History) */}
        <div style={{ marginTop: "0.35rem" }}>
          <SidebarItem
            onClick={() => setRunsOpen((v) => !v)}
            active={isRunsActive}
            collapsed={collapsed}
            chevron
            open={runsOpen}
            title={collapsed ? "Test Runs" : undefined}
          >
            <Play
              size={17}
              strokeWidth={2}
              color={isRunsActive ? "#FFC348" : undefined}
            />
            {!collapsed && <span>Test Runs</span>}
          </SidebarItem>

          {!collapsed && runsOpen && (
            <div
              className="sidebar-submenu-list"
              style={{
                margin: "2px 0 4px 0",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              <SidebarItem
                href="/test-runs"
                variant="child"
                active={pathname === "/test-runs"}
                className="sidebar-submenu-item"
              >
                Active Run
              </SidebarItem>
              <SidebarItem
                href="/test-runs/history"
                variant="child"
                active={pathname === "/test-runs/history"}
                className="sidebar-submenu-item"
              >
                Run History
              </SidebarItem>
            </div>
          )}
        </div>

        {/* Projects */}
        <div style={{ marginTop: "0.35rem" }}>
          <SidebarItem
            onClick={() => setProjectsOpen((v) => !v)}
            active={isProjectsActive}
            collapsed={collapsed}
            chevron
            open={projectsOpen}
            title={collapsed ? "Projects" : undefined}
          >
            <Layers
              size={17}
              strokeWidth={2}
              color={isProjectsActive ? "#FFC348" : undefined}
            />
            {!collapsed && <span>Projects</span>}
          </SidebarItem>

          {!collapsed && projectsOpen && (
            <div
              className="sidebar-submenu-list"
              style={{
                margin: "2px 0 4px 0",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {projects.length === 0 ? (
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", padding: "0.3rem 0.5rem" }}>
                  Belum ada project
                </span>
              ) : (
                Object.entries(groupProjectsByEnv(projects)).map(([groupTitle, items]) => (
                  <div key={groupTitle} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {/* Sub-header tag (11px / bold / gray-400) */}
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#9CA3AF",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        padding: "0.25rem 0.5rem",
                      }}
                    >
                      {groupTitle}
                    </div>
                    {items.map((p) => {
                      const active = pathname === `/projects/${p.id}`;
                      return (
                        <SidebarItem
                          key={p.id}
                          href={`/projects/${p.id}`}
                          variant="child"
                          active={active}
                          className="sidebar-submenu-item"
                        >
                          {p.name}
                        </SidebarItem>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Footer: logout */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "0.6rem 0.5rem 1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={collapsed ? "Keluar" : undefined}
          aria-label="Keluar"
          onMouseEnter={() => setLogoutHovered(true)}
          onMouseLeave={() => setLogoutHovered(false)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            width: "100%",
            padding: collapsed ? "0.5rem 0" : "0.45rem 0.55rem",
            justifyContent: collapsed ? "center" : "flex-start",
            borderRadius: 8,
            border: "none",
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: "pointer",
            color: logoutHovered ? "#EF4444" : "var(--text-secondary)",
            background: logoutHovered ? "rgba(239, 68, 68, 0.08)" : "transparent",
            transition: "color 0.15s ease, background 0.15s ease",
          }}
        >
          <LogOut size={17} strokeWidth={2} color={logoutHovered ? "#EF4444" : undefined} />
          {!collapsed && <span>Keluar</span>}
        </button>
      </div>
    </aside>
  );
}
