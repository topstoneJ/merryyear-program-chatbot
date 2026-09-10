import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/app/admin-session";

export default async function AdminLayout({ children, returnTo, requireSettings = false }: { children: ReactNode; returnTo: string; requireSettings?: boolean }) {
  const account = await getAdminSession();
  if (!account) redirect(`/admin-login?returnTo=${encodeURIComponent(returnTo)}`);
  if (requireSettings && !account.can_manage_settings && !account.is_super_admin) redirect("/knowledge?denied=settings");
  return children;
}
