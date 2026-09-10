import type { ReactNode } from "react";
import AdminLayout from "@/app/admin-layout";

export const dynamic = "force-dynamic";

export default function GuideLayout({ children }: { children: ReactNode }) {
  return <AdminLayout returnTo="/guide">{children}</AdminLayout>;
}
