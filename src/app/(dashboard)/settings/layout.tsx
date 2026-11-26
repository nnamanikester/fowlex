import { SettingsNav } from "./_components/settings-nav";
import { RequirePermission } from "../_components/require-permission";
import { PageHeader } from "@/components/kit";

/** Settings is for owners: the farm's details, who can sign in, and the audit log. */
export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <RequirePermission permission="settings.manage">
      <PageHeader
        title="Settings"
        description="Business details, invoice numbering, approval limits and who can sign in."
      />
      <SettingsNav />
      {children}
    </RequirePermission>
  );
}
