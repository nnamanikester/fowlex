import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Image src="/brand/fowlex-logo-horizontal-color.svg" alt="Fowlex" width={320} height={113} priority />
      <p className="max-w-sm text-sm text-fowlex-charcoal/70">
        Farm dashboard for batches, stock, expenses, payroll, customers and forecasts.
      </p>
    </main>
  );
}
