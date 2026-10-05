import { AppShell } from "@/components/layout/app-shell";
import { SessionTimeout } from "@/components/auth/session-timeout";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Layout tanpa data server: sidebar/header & identitas user di-fetch client
  // oleh AppShell dari /api/me dan /api/projects.
  // SessionTimeout: auto-logout bila tidak ada aktivitas selama 6 jam.
  return (
    <>
      <SessionTimeout />
      <AppShell>{children}</AppShell>
    </>
  );
}
