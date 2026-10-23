"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
import { notifySessionChange } from "@/lib/client/session-sync";

type ProjectItem = {
  id: string;
  name: string;
  code: string;
  platform: string | null;
  /** ID suite milik project (untuk memetakan /suites/<id> ke platform). */
  suiteIds?: string[];
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
  { href: "/reports", label: "Reports & Analytics", icon: BarChart3 },
  { href: "/bugs", label: "Bugs", icon: Bug },
  { href: "/automation", label: "Automation", icon: FlaskConical },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Skeleton khusus Sidebar Navigation: meniru struktur logo, item menu,
 *  submenu accordion (indent), dan footer logout. Dipakai saat data shell
 *  (identitas user + daftar project) belum siap. */
export function SidebarSkeleton({ collapsed = false }: { collapsed?: boolean }) {
  // Lebar label acak tapi stabil agar terlihat natural seperti menu asli.
  const labelWidths = [92, 74, 52, 88, 66];
  const childWidths = [120, 140, 104, 132];

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
      aria-busy="true"
      aria-label="Memuat navigasi"
    >
      {/* Logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 64,
          padding: collapsed ? "0" : "0 20px",
          justifyContent: collapsed ? "center" : "flex-start",
          flexShrink: 0,
        }}
      >
        <div className="skeleton-block" style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0 }} />
        {!collapsed && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="skeleton-block" style={{ width: 104, height: 14 }} />
            <div className="skeleton-block" style={{ width: 78, height: 8 }} />
          </div>
        )}
      </div>

      {/* Nav */}
      <nav
        style={{
          flex: 1,
          padding: "0.75rem 0",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          overflowY: "auto",
        }}
      >
        {/* Item menu utama */}
        {labelWidths.map((w, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: collapsed ? "0.5rem 0" : "0.45rem 0.75rem",
              justifyContent: collapsed ? "center" : "flex-start",
            }}
          >
            <div className="skeleton-block" style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0 }} />
            {!collapsed && <div className="skeleton-block" style={{ width: w, height: 11 }} />}
          </div>
        ))}

        {/* Item accordion + submenu (indent) untuk Test Runs & Projects */}
        {[0, 1].map((group) => (
          <div key={`grp-${group}`} style={{ marginTop: "0.35rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                padding: collapsed ? "0.5rem 0" : "0.45rem 0.75rem",
                justifyContent: collapsed ? "center" : "flex-start",
              }}
            >
              <div className="skeleton-block" style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0 }} />
              {!collapsed && (
                <>
                  <div className="skeleton-block" style={{ width: group === 0 ? 72 : 64, height: 11 }} />
                  <div
                    className="skeleton-block"
                    style={{ width: 12, height: 12, borderRadius: 3, marginLeft: "auto" }}
                  />
                </>
              )}
            </div>

            {!collapsed && (
              <div className="sidebar-submenu-list" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {childWidths
                  .slice(0, group === 0 ? 2 : 4)
                  .map((w, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", padding: "0.4rem 0.6rem" }}>
                      <div className="skeleton-block" style={{ width: w, height: 10 }} />
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Footer: logout */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "0.6rem 0.5rem 1.5rem",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: collapsed ? "0.5rem 0" : "0.45rem 0.55rem",
            justifyContent: collapsed ? "center" : "flex-start",
          }}
        >
          <div className="skeleton-block" style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0 }} />
          {!collapsed && <div className="skeleton-block" style={{ width: 56, height: 11 }} />}
        </div>
      </div>
    </aside>
  );
}

export function Sidebar({
  projects,
  collapsed,
  userRole,
  isQaLead,
}: {
  projects: ProjectItem[];
  collapsed: boolean;
  userRole?: string | null;
  isQaLead?: boolean;
}) {
  const pathname = usePathname();
  const isProjectsActive =
    pathname.startsWith("/projects") ||
    pathname.startsWith("/suites");
  const isRunsActive = pathname.startsWith("/test-runs");
  // Accordion mode: hanya satu menu utama yang boleh terbuka.
  const [openMenu, setOpenMenu] = useState<string | null>(
    isRunsActive ? "runs" : isProjectsActive ? "projects" : null
  );
  const runsOpen = openMenu === "runs";
  const projectsOpen = openMenu === "projects";
  const toggleMenu = (key: string) => setOpenMenu((cur) => (cur === key ? null : key));
  const [logoutHovered, setLogoutHovered] = useState(false);

  /**
   * Item project dianggap AKTIF jika rute sekarang:
   * - tepat di `/projects/<id>` atau nested di bawahnya (`/projects/<id>/...`), atau
   * - halaman suite milik project ini (`/suites/<id>` dengan id di `suiteIds`).
   */
  const isProjectActive = (p: ProjectItem): boolean => {
    if (pathname === `/projects/${p.id}` || pathname.startsWith(`/projects/${p.id}/`)) {
      return true;
    }
    const suiteMatch = /^\/suites\/([^/]+)/.exec(pathname);
    return !!suiteMatch && !!p.suiteIds?.includes(suiteMatch[1]);
  };
  // Buka menu parent yang sesuai saat rute berubah (mis. masuk ke halaman
  // detail project) — jangan biarkan menu tertutup saat halamannya diakses.
  useEffect(() => {
    if (isProjectsActive) setOpenMenu("projects");
    else if (isRunsActive) setOpenMenu("runs");
  }, [isProjectsActive, isRunsActive]);

  // Settings hanya untuk QA; Automation tersembunyi untuk PRODUCT; Reports &
  // Analytics hanya untuk Lead QA (role QA + flag isQaLead) — selaras dengan
  // guard halaman /reports dan 403 di /api/reports.
  const visibleNavItems = navItems.filter((i) => {
    if (i.href === "/reports") return isQaLead === true;
    if (userRole === "PRODUCT") return i.href !== "/settings" && i.href !== "/automation";
    if (userRole === "QA") return true;
    return i.href !== "/settings";
  });

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
          // Tanpa padding horizontal: baris item (dan latar child aktif)
          // mencapai tepi sidebar.
          padding: "0.75rem 0",
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
              <Icon size={18} strokeWidth={2} />
              {!collapsed && <span>{item.label}</span>}
            </SidebarItem>
          );
        })}

        {/* Test Runs (accordion: Active Runs + History) */}
        <div style={{ marginTop: "0.35rem" }}>
          <SidebarItem
            onClick={() => toggleMenu("runs")}
            active={isRunsActive}
            collapsed={collapsed}
            chevron
            open={runsOpen}
            title={collapsed ? "Test Runs" : undefined}
          >
            <Play size={18} strokeWidth={2} />
            {!collapsed && <span>Test Runs</span>}
          </SidebarItem>

          {!collapsed && (
            <div className="sidebar-submenu-collapse collapse-grid" data-open={runsOpen}>
              <div style={{ overflow: "hidden", minHeight: 0 }}>
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
              </div>
            </div>
          )}
        </div>

        {/* Projects */}
        <div style={{ marginTop: "0.35rem" }}>
          <SidebarItem
            onClick={() => toggleMenu("projects")}
            active={isProjectsActive}
            collapsed={collapsed}
            chevron
            open={projectsOpen}
            title={collapsed ? "Projects" : undefined}
          >
            <Layers size={18} strokeWidth={2} />
            {!collapsed && <span>Projects</span>}
          </SidebarItem>

          {!collapsed && (
            <div className="sidebar-submenu-collapse collapse-grid" data-open={projectsOpen}>
              <div style={{ overflow: "hidden", minHeight: 0 }}>
                <div
                  className="sidebar-submenu-list"
                  style={{
                    margin: "2px 0 4px 0",
                    display: "flex",
                    flexDirection: "column",
                    // Jarak antar grup diatur padding label grup (14px atas),
                    // jadi tidak perlu gap tambahan.
                    gap: 0,
                  }}
                >
                  {projects.length === 0 ? (
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", padding: "0.3rem 0.5rem" }}>
                      Belum ada project
                    </span>
                  ) : (
                    Object.entries(groupProjectsByEnv(projects)).map(([groupTitle, items]) => (
                      <div key={groupTitle} style={{ display: "flex", flexDirection: "column" }}>
                        {/* Label grup statis — BUKAN accordion; children selalu tampil. */}
                        <div
                          style={{
                            padding: "14px 16px 6px 24px",
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            color: "#334155",
                            background: "transparent",
                          }}
                        >
                          {groupTitle}
                        </div>
                        {items.map((p) => (
                          <SidebarItem
                            key={p.id}
                            href={`/projects/${p.id}`}
                            variant="child"
                            active={isProjectActive(p)}
                            className="sidebar-submenu-item"
                          >
                            {p.name}
                          </SidebarItem>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </div>
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
          onClick={async () => {
            // redirect:false dulu agar cookie sesi benar-benar terhapus
            // sebelum sinyal dikirim — tab lain lalu menerima 401 yang sah.
            await signOut({ redirect: false });
            notifySessionChange("logout");
            window.location.href = "/login";
          }}
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
