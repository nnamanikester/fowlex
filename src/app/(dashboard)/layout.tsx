import { DashboardShell } from "@/components/shell";
import { WorkspaceProvider } from "@/lib/workspace";
import { PREVIEW_BATCHES, PREVIEW_ME } from "@/lib/workspace-preview";

/** Every signed-in page sits in the shell. The workspace comes from the session from step 1.7. */
export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <WorkspaceProvider me={PREVIEW_ME} batches={PREVIEW_BATCHES}>
      <DashboardShell>{children}</DashboardShell>
    </WorkspaceProvider>
  );
}
