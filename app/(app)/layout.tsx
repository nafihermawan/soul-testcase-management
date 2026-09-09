import { AppShell } from "@/components/layout/app-shell";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Layout tanpa data server: sidebar/header & identitas user di-fetch client
  // oleh AppShell dari /api/me dan /api/projects.
  return <AppShell>{children}</AppShell>;
}
