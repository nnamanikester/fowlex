import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Image
        src="/brand/fowlex-logo-horizontal-color.svg"
        alt="Fowlex"
        width={320}
        height={113}
        loading="eager"
        className="dark:hidden"
      />
      <Image
        src="/brand/fowlex-logo-horizontal-reverse.svg"
        alt=""
        width={320}
        height={113}
        loading="eager"
        className="hidden dark:block"
      />
      <p className="max-w-sm text-sm text-fg-muted">
        Farm dashboard for batches, stock, expenses, payroll, customers and forecasts.
      </p>
    </main>
  );
}
