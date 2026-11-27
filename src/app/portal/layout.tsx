/** The customer portal: its own plain frame, away from the farm's dashboard. */
export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return (
    <div className="min-h-dvh bg-canvas">
      <main id="main" className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8 sm:py-12">
        {children}
      </main>
    </div>
  );
}
