import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth/session";
import { navigationFor } from "@/lib/navigation";
import { unreadCount } from "@/lib/services/notifications";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");

  const [unread] = await Promise.all([unreadCount(principal.userId)]);

  return (
    <AppShell
      navigation={navigationFor(principal)}
      user={{ name: principal.name, roles: principal.roles }}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
