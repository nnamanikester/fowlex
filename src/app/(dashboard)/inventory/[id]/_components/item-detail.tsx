"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardCheck, MinusCircle, PackagePlus, Pencil, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ItemSheet } from "../../_components/inventory-board";
import { type SpendProps, useSpending } from "../../../expenses/_components/expenses-board";
import { Field, FormAlert } from "@/components/auth";
import { ConfirmDialog, EmptyState, Panel, StatCard } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Sheet } from "@/components/ui/sheet";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { formatRange } from "@/lib/dates";
import type { ItemView } from "@/lib/inventory/items";
import type { MovementView } from "@/lib/inventory/movements";
import { CATEGORY_LABELS, quantity } from "@/lib/inventory/rules";
import { type LedgerRow, MOVEMENT_LABELS } from "@/lib/inventory/stock";
import { formatNaira } from "@/lib/money";

const day = (d: string) => formatRange({ from: d, to: d });
type Action = "opening" | "count" | "usage";

/** One stock item: what's on hand and its value, every movement, and counting or using stock. */
export function ItemDetail({
  item,
  movements,
  batches,
  allBatches,
  today,
  canWrite,
  showMoney = true,
  spending = null,
  buyNow = false,
}: {
  /** Opens Buy more straight away (from a low-stock alert). */
  buyNow?: boolean;
  /** Costs and values are money: hidden from farm hands. */
  showMoney?: boolean;
  spending?: SpendProps | null;
  item: ItemView;
  movements: LedgerRow<MovementView>[];
  batches: { id: string; code: string }[];
  allBatches: Record<string, string>;
  today: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [action, setAction] = React.useState<Action | null>(null);
  const buying = useSpending(
    spending ?? { categories: [], suppliers: [], items: [], batches: [], today, canWrite: false, canPay: false },
    { spend: buyNow && spending ? { kind: "stock", itemId: item.id } : null },
  );
  const [editing, setEditing] = React.useState(false);
  const [removing, setRemoving] = React.useState<MovementView | null>(null);
  const q = (n: number) => quantity(n, item.unit);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/inventory"
          className="focus-ring inline-flex items-center gap-1 rounded-md text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="size-4" aria-hidden /> Inventory
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-fg-heading">{item.name}</h1>
              {item.low && <Badge tone="warning">Low</Badge>}
              {item.onHand < 0 && <Badge tone="danger">Count needed</Badge>}
              {item.archived && <Badge>Archived</Badge>}
            </div>
            <p className="text-sm text-fg-muted">
              {CATEGORY_LABELS[item.category]} · {item.unitKg ? `${item.unitKg} kg ${item.unit}` : `per ${item.unit}`}
            </p>
          </div>
          {canWrite && (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="On hand"
          value={q(item.onHand)}
          hint={item.reorderLevel !== null ? `Reorder below ${q(item.reorderLevel)}` : "No reorder level"}
        />
        {showMoney && (
          <>
            <StatCard label="Value" value={formatNaira(item.valueKobo)} hint="At average cost" />
            <StatCard
              label="Average cost"
              value={item.avgCostKobo === null ? "–" : formatNaira(item.avgCostKobo)}
              hint={`Per ${item.unit}`}
            />
          </>
        )}
        <StatCard
          label="Used this month"
          value={q(
            -movements
              .filter((m) => m.type === "usage" && m.date.slice(0, 7) === today.slice(0, 7))
              .reduce((n, m) => n + m.quantity, 0),
          )}
          hint="Logs and usage"
        />
      </div>

      {item.onHand < 0 && (
        <FormAlert title="More has been used than was recorded coming in.">
          <p>A purchase may be missing. Record it, or count what&apos;s on the shelf.</p>
        </FormAlert>
      )}

      {(canWrite || spending) && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {spending && (
            <Button onClick={() => buying.spend({ kind: "stock", itemId: item.id })}>
              <ShoppingCart /> Buy more
            </Button>
          )}
          {canWrite && !movements.length && (
            <Button variant="secondary" onClick={() => setAction("opening")}>
              <PackagePlus /> Opening stock
            </Button>
          )}
          {canWrite && (
            <>
              <Button variant="secondary" onClick={() => setAction("count")}>
                <ClipboardCheck /> Count stock
              </Button>
              <Button variant="secondary" onClick={() => setAction("usage")}>
                <MinusCircle /> Record usage
              </Button>
            </>
          )}
        </div>
      )}

      <Panel title="History" flush>
        {movements.length ? (
          <ul className="divide-y divide-line">
            {movements.map((m) => (
              <li key={m.id} className="flex items-start gap-3 px-5 py-3.5">
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block font-semibold text-fg">
                    {MOVEMENT_LABELS[m.type]}
                    {m.batchId && allBatches[m.batchId] && (
                      <span className="font-normal text-fg-muted"> · {allBatches[m.batchId]}</span>
                    )}
                  </span>
                  <span className="block text-xs text-fg-muted">
                    {[day(m.date), m.source?.kind === "daily-log" && "from the daily log", m.notes]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="num text-right">
                  <span
                    className={m.quantity < 0 ? "block font-semibold text-fg" : "block font-semibold text-success-fg"}
                  >
                    {m.quantity > 0 ? "+" : "−"}
                    {q(Math.abs(m.quantity))}
                  </span>
                  <span className="block text-xs text-fg-subtle">
                    {showMoney && `${formatNaira(Math.abs(m.valueKobo))} · `}
                    {q(m.balance)} left
                  </span>
                </span>
                {canWrite && !m.source && (
                  <button
                    type="button"
                    aria-label={`Delete this ${MOVEMENT_LABELS[m.type].toLowerCase()} record`}
                    onClick={() => setRemoving(m)}
                    className="focus-ring grid size-9 shrink-0 place-items-center rounded-lg text-fg-subtle hover:bg-surface-subtle hover:text-danger-fg"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<PackagePlus />}
            title="No stock recorded yet"
            description="Add what's on the shelf now as opening stock. Purchases add to it, and logs take feed off."
          />
        )}
      </Panel>

      {action && (
        <MovementSheet
          key={action}
          action={action}
          item={item}
          batches={batches}
          today={today}
          onClose={() => setAction(null)}
          onSaved={(message) => {
            setAction(null);
            toast.success(message);
            router.refresh();
          }}
        />
      )}
      {editing && (
        <ItemSheet
          item={item}
          onClose={() => setEditing(false)}
          onSaved={(message) => {
            setEditing(false);
            toast.success(message);
            if (message.endsWith("deleted.")) router.replace("/inventory");
            router.refresh();
          }}
        />
      )}
      {spending && buying.sheets}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Delete this stock record?"
        description="Stock on hand and its value are worked out again without it. It stays in the audit log."
        confirmLabel="Delete record"
        onConfirm={async () => {
          await apiRequest(`/api/inventory/movements/${removing!.id}`, "DELETE");
          toast.success("Stock record deleted.");
          router.refresh();
        }}
      />
    </div>
  );
}

const TITLES: Record<Action, string> = { opening: "Opening stock", count: "Count stock", usage: "Record usage" };

function MovementSheet({
  action,
  item,
  batches,
  today,
  onClose,
  onSaved,
}: {
  action: Action;
  item: ItemView;
  batches: { id: string; code: string }[];
  today: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [costKobo, setCostKobo] = React.useState<number | null>(item.avgCostKobo);
  const [batchId, setBatchId] = React.useState(batches[0]?.id ?? "");
  const [date, setDate] = React.useState(today);
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const n = amount === "" ? Number.NaN : Number(amount);
  const q = (x: number) => quantity(x, item.unit);
  const difference = action === "count" && Number.isFinite(n) ? Math.round((n - item.onHand) * 1000) / 1000 : null;

  const save = async () => {
    setFailure(null);
    setBusy(true);
    try {
      await apiRequest("/api/inventory/movements", "POST", {
        itemId: item.id,
        type: action,
        date,
        notes,
        ...(action === "count" ? { counted: n } : { quantity: n }),
        ...(action === "opening" && { unitCostKobo: costKobo }),
        ...(action === "usage" && batchId && { batchId }),
      });
      onSaved(
        action === "count"
          ? difference === 0
            ? "The count matches. Nothing to change."
            : `Stock set to ${q(n)}.`
          : action === "opening"
            ? `${q(n)} of ${item.name} added.`
            : `${q(n)} of ${item.name} used.`,
      );
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
      title={TITLES[action]}
      subtitle={item.name}
      footer={
        <div className="space-y-2">
          <ActionFeedback action={{ failure }} />
          <Button size="lg" fullWidth loading={busy} onClick={() => void save()}>
            {action === "count" ? "Save count" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="amount"
            label={
              action === "count"
                ? `Counted (${item.unit}s)`
                : action === "usage"
                  ? `Used (${item.unit}s)`
                  : `On hand (${item.unit}s)`
            }
            error={failure?.field === "quantity" || failure?.field === "counted" ? failure.message : undefined}
          >
            {(a11y) => (
              <Input
                {...a11y}
                inputMode="decimal"
                className="num"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              />
            )}
          </Field>
          {action === "opening" ? (
            <Field id="unitCostKobo" label={`Cost per ${item.unit}`} hint="What you paid">
              {(a11y) => <MoneyInput {...a11y} value={costKobo} onChange={setCostKobo} placeholder="18,000.00" />}
            </Field>
          ) : (
            <Field id="date" label="Date">
              {(a11y) => (
                <Input {...a11y} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
              )}
            </Field>
          )}
        </div>
        {difference !== null && (
          <p aria-live="polite" className="text-sm text-fg-muted">
            The app expects <strong className="num text-fg">{q(item.onHand)}</strong>.{" "}
            {difference === 0
              ? "Your count matches."
              : `${difference > 0 ? "Found" : "Missing"} ${q(Math.abs(difference))}, recorded as a stock count.`}
          </p>
        )}
        {action === "usage" && batches.length > 0 && (
          <Field id="batchId" label="Used for" hint="Charged to the batch's costs">
            {(a11y) => (
              <Select {...a11y} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code}
                  </option>
                ))}
                <option value="">The whole farm</option>
              </Select>
            )}
          </Field>
        )}
        <Field id="notes" label="Notes" hint="Optional">
          {(a11y) => <Input {...a11y} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
      </div>
    </Sheet>
  );
}
