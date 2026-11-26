import { Skeleton } from "@/components/ui/skeleton";

/** The frame while the session loads: the sidebar's place and the page's, without content. */
export function ShellFallback() {
  return (
    <div className="flex min-h-dvh bg-canvas" aria-busy="true" aria-label="Loading">
      <div className="hidden w-[17rem] shrink-0 bg-nav lg:block" />
      <div className="flex-1 space-y-4 px-4 pt-24 md:px-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-96 max-w-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
