"use client";

import { useState } from "react";
import { ProjectsManager } from "@/components/settings/projects-manager";
import { UsersManager, type UserItem } from "@/components/settings/users-manager";
import { SettingsTabs, type SettingsTabKey } from "@/components/settings/settings-tabs";
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

  return (
    <RefreshContext.Provider value={reload}>
      <div>
        <SettingsTabs active={tab} onChange={setTab} />
        {tab === "projects" && <ProjectsManager projects={projects} />}
        {tab === "users" && <UsersManager users={users} />}
      </div>
    </RefreshContext.Provider>
  );
}
