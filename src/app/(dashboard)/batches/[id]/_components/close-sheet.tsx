"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Field, FormAlert } from "@/components/auth";
import { Button, LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import type { BatchView } from "@/lib/batches/service";
import { formatRange } from "@/lib/dates";

const n = (x: number) => x.toLocaleString("en-NG");
const day = (d: string) => formatRange({ from: d, to: d });

/**
 * Closing a batch: every bird placed must be accounted for as dead, culled or sold. The tally shows
 * where they all went, and how many are missing if any are.
 */
export function CloseSheet({
  batch: b,
  lastRecord,
  today,
  canLog,
  onClose,
}: {
  batch: BatchView;
  /** The latest day with a log or health record: the earliest the batch can close. */
  lastRecord: string;
  today: string;
  canLog: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [closedOn, setClosedOn] = React.useState(today);
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const missing = b.liveBirds;
  const rows: [string, number][] = [
    ["Died", b.totals.deaths],
    ["Culled", b.totals.culls],
    ["Sold", b.totals.sold],
  ];

  const close = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await apiRequest(`/api/batches/${b.id}/close`, "POST", { closedOn, version: b.version });
      toast.success(`${b.code} is closed. ${b.houseName} can rest now.`);
      router.refresh();
      onClose();
    } catch (e) {
      setFailure(e as AuthError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title={`Close ${b.code}`}
      subtitle={`${b.houseName} · placed ${day(b.placedOn)}`}
      footer={
        <Button size="lg" fullWidth loading={busy} disabled={missing > 0} onClick={() => void close()}>
          Close batch
        </Button>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-fg-muted">
          Closing locks the batch&apos;s daily logs and health record, and starts the house&apos;s rest. Every bird
          placed has to be accounted for first.
        </p>
        <dl className="num divide-y divide-line rounded-xl border border-line text-sm">
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-fg-muted">Placed</dt>
            <dd className="font-semibold text-fg">{n(b.placed)}</dd>
          </div>
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between px-4 py-2.5">
              <dt className="text-fg-muted">{label}</dt>
              <dd className="text-fg">− {n(value)}</dd>
            </div>
          ))}
          <div className="flex justify-between px-4 py-2.5">
            <dt className="font-semibold text-fg">Not accounted for</dt>
            <dd className={missing ? "font-semibold text-danger-fg" : "font-semibold text-success-fg"}>{n(missing)}</dd>
          </div>
        </dl>

        {missing > 0 ? (
          <div role="alert" className="space-y-3 rounded-xl border border-danger-line bg-danger-subtle p-4 text-sm">
            <p className="flex items-start gap-2 font-semibold text-danger-fg">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {n(missing)} bird{missing === 1 ? " isn't" : "s aren't"} accounted for.
            </p>
            <p className="text-fg">
              Log {missing === 1 ? "it" : "them"} as dead, culled or taken for sale, then close the batch.
            </p>
            {canLog && (
              <LinkButton href={`/log?batch=${b.id}`} size="sm" variant="secondary">
                Log the missing birds
              </LinkButton>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm font-medium text-success-fg">
            <CircleCheck className="size-4" aria-hidden /> Every bird is accounted for.
          </p>
        )}

        <Field id="closedOn" label="House emptied on" hint={`Between ${day(lastRecord)} and today`}>
          {(a11y) => (
            <Input
              {...a11y}
              type="date"
              value={closedOn}
              min={lastRecord}
              max={today}
              onChange={(e) => setClosedOn(e.target.value)}
            />
          )}
        </Field>
        {failure && <FormAlert title={failure.message} />}
      </div>
    </Sheet>
  );
}
