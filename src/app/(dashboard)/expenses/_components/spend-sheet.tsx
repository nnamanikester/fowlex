"use client";

import * as React from "react";
import { CircleCheck, HandCoins, Plus, Send, Trash2 } from "lucide-react";

import { BankAccountField, type BankState } from "@/components/bank-account-field";
import { Field, FormAlert } from "@/components/auth";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Input, Textarea } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { ASSET_KIND_LABELS, ASSET_KINDS, type AssetKind, DEFAULT_LIFE } from "@/lib/assets/rules";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { type ExpenseInput, expenseTotal, lineTotal, type PayMethod } from "@/lib/expenses/rules";
import { type CategoryView, SYSTEM_CATEGORIES } from "@/lib/expenses/categories";
import type { ExpenseView } from "@/lib/expenses/service";
import type { ItemView } from "@/lib/inventory/items";
import {
  type Category,
  CATEGORIES,
  CATEGORY_LABELS,
  quantity as formatQuantity,
  type Unit,
  UNITS,
} from "@/lib/inventory/rules";
import { formatNaira } from "@/lib/money";
import { type BankAccount, maskAccount } from "@/lib/suppliers/rules";
import type { SupplierView } from "@/lib/suppliers/service";
import { uploadReceipt } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

export type SpendDefaults = {
  kind?: "stock" | "other";
  /** What an "other" expense is for: "equipment" opens on buying equipment. */
  category?: string;
  supplierId?: string;
  itemId?: string;
  batchId?: string;
};
type NewItem = { name: string; category: Category; unit: Unit; unitKg: number | null };
type Row = { key: number; itemId: string; newItem: NewItem | null; quantity: string; unitCostKobo: number | null };
const NEW = "__new";
const freshItem = (): NewItem => ({ name: "", category: "feed", unit: "bag", unitKg: 25 });
type Paid = "paystack" | "already" | "later";

const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/**
 * Spending money, in one sheet: buying stock (it goes into inventory) or any other expense, who
 * it's for, how it was paid, and an optional receipt. Choosing Paystack saves it as owed and then
 * hands over to the payment step (`onSaved` with `pay: true`), where an owner confirms the transfer.
 */
export function SpendSheet({
  categories,
  suppliers,
  items,
  batches,
  today,
  canPay,
  defaults = {},
  onClose,
  onSaved,
}: {
  categories: CategoryView[];
  suppliers: SupplierView[];
  items: ItemView[];
  batches: { id: string; code: string }[];
  today: string;
  canPay: boolean;
  defaults?: SpendDefaults;
  onClose: () => void;
  onSaved: (expense: ExpenseView, options: { pay: boolean }) => void;
}) {
  const active = items.filter((i) => !i.archived);
  const [kind, setKind] = React.useState<"stock" | "other">(defaults.kind ?? "stock");
  const [supplierId, setSupplierId] = React.useState(defaults.supplierId ?? "");
  const [rows, setRows] = React.useState<Row[]>(() => {
    const item = active.find((i) => i.id === defaults.itemId);
    // Nothing in stock yet: the first line is a new item.
    return [
      {
        key: 0,
        itemId: item?.id ?? "",
        newItem: active.length ? null : freshItem(),
        quantity: "",
        unitCostKobo: item?.avgCostKobo ?? null,
      },
    ];
  });
  const [deliveryKobo, setDeliveryKobo] = React.useState<number | null>(null);
  const [category, setCategory] = React.useState<string>(defaults.category ?? "transport");
  const [amountKobo, setAmountKobo] = React.useState<number | null>(null);
  const [description, setDescription] = React.useState("");
  const [payeeName, setPayeeName] = React.useState("");
  const [batchId, setBatchId] = React.useState(defaults.batchId ?? "");
  const [date, setDate] = React.useState(today);
  const [paid, setPaid] = React.useState<Paid>("already");
  const [how, setHow] = React.useState<Extract<PayMethod, "cash" | "transfer" | "pos">>("cash");
  const [files, setFiles] = React.useState<File[]>([]);
  const [notes, setNotes] = React.useState("");
  // Equipment bought outright can be tracked and its cost spread over its life.
  const [track, setTrack] = React.useState(true);
  const [assetKind, setAssetKind] = React.useState<AssetKind>("generator");
  const [life, setLife] = React.useState(String(DEFAULT_LIFE.generator));
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const [requestId] = React.useState(newRequestId);

  const supplier = suppliers.find((s) => s.id === supplierId);
  // Owners can pay a saved supplier with a bank account, or anyone whose account they enter.
  const payable = canPay && (!supplier || !!supplier.bank);
  const [bank, setBank] = React.useState<BankAccount | null>(null);
  const [bankState, setBankState] = React.useState<BankState>("empty");
  const [saveSupplier, setSaveSupplier] = React.useState(false);
  // Paystack is only on the table for a supplier with a checked account.
  const choice: Paid = paid === "paystack" && !payable ? "already" : paid;
  // Someone who isn't a saved supplier: their account, to pay now or for an owner to pay later.
  const askBank = !supplier && (choice === "paystack" || choice === "later");

  const lines = kind === "stock" ? rows.filter((r) => r.itemId || r.newItem) : [];
  const parsed = lines.map((r) => ({
    itemId: r.newItem ? "" : r.itemId,
    quantity: Number(r.quantity),
    unitCostKobo: r.unitCostKobo ?? Number.NaN,
    ...(r.newItem && { newItem: { ...r.newItem, name: r.newItem.name.trim(), reorderLevel: null, notes: "" } }),
  }));
  const total =
    kind === "stock"
      ? expenseTotal({
          lines: parsed.filter((l) => l.quantity > 0 && l.unitCostKobo >= 0),
          deliveryKobo: deliveryKobo ?? 0,
          amountKobo: 0,
        })
      : (amountKobo ?? 0);

  const setRow = (key: number, change: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));

  const save = async () => {
    setFailure(null);
    const unnamed =
      bankState === "partial" || bankState === "checking" || bankState === "not-found" || bankState === "unavailable";
    if (askBank && ((choice === "paystack" && bankState !== "found") || unnamed)) {
      setFailure({
        status: 400,
        code: "invalid",
        message:
          choice === "paystack" && bankState === "empty"
            ? "Enter the bank account to pay."
            : "Finish the bank account so the bank can name it.",
        field: "payeeBank",
      });
      document.getElementById("accountNumber")?.focus();
      return;
    }
    const body: Partial<ExpenseInput> & {
      requestId: string;
      saveSupplier?: boolean;
      asset?: Record<string, unknown>;
    } = {
      date,
      supplierId: supplierId || null,
      payeeName: supplier ? "" : payeeName,
      batchId: batchId || null,
      lines: kind === "stock" ? parsed : [],
      deliveryKobo: kind === "stock" ? (deliveryKobo ?? 0) : 0,
      ...(kind === "other" && { category, amountKobo: amountKobo ?? 0, description }),
      method: choice === "paystack" ? "paystack" : choice === "later" ? "later" : how,
      notes,
      receipt: null,
      requestId,
      ...(kind === "other" &&
        category === "equipment" &&
        track && {
          asset: { name: description, kind: assetKind, usefulLifeMonths: Number(life), salvageKobo: 0 },
        }),
      payeeBank: askBank && bank ? { bankCode: bank.bankCode, accountNumber: bank.accountNumber } : null,
      saveSupplier: askBank && !!bank && saveSupplier,
    };
    if (kind === "stock" && !parsed.length) {
      setFailure({ status: 400, code: "invalid", message: "Add what was bought.", field: "lines.0" });
      return;
    }
    setBusy(true);
    try {
      if (files[0]) body.receipt = await uploadReceipt(files[0]);
      const expense = await apiRequest<ExpenseView>("/api/expenses", "POST", body);
      onSaved(expense, { pay: choice === "paystack" });
    } catch (e) {
      setFailure(e as AuthError);
      const field = (e as AuthError).field;
      if (field) document.getElementById(field)?.focus();
    } finally {
      setBusy(false);
    }
  };

  const error = (field: string) => (failure?.field === field ? failure.message : undefined);
  const action =
    choice === "paystack" ? `Next: pay ${formatNaira(total)}` : choice === "later" ? "Save as owed" : "Save";

  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title="Spend money"
      subtitle="Stock you bought, or any other cost"
      footer={
        <div className="space-y-2">
          <p className="num flex items-baseline justify-between text-sm" aria-live="polite">
            <span className="text-fg-muted">Total</span>
            <span className="text-lg font-semibold text-fg">{formatNaira(total)}</span>
          </p>
          <Button size="lg" fullWidth loading={busy} onClick={() => void save()}>
            {choice === "paystack" && <Send />} {action}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <Segmented
          label="What kind of spending"
          className="w-full"
          value={kind}
          onChange={setKind}
          options={[
            { value: "stock", label: "Buy stock" },
            { value: "other", label: "Other expense" },
          ]}
        />
        {failure && !failure.field && <FormAlert title={failure.message} />}

        <Field
          id="supplierId"
          label={kind === "stock" ? "Bought from" : "Paid to"}
          error={error("supplierId")}
          hint={suppliers.length ? undefined : "Add suppliers to pay them from Fowlex"}
        >
          {(a11y) => (
            <Select {...a11y} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">{kind === "stock" ? "Not a saved supplier" : "Someone else"}</option>
              {suppliers
                .filter((s) => !s.archived || s.id === supplierId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.bank ? " · can pay" : ""}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        {!supplier && (
          <Field
            id="payeeName"
            label="Who was paid"
            error={error("payeeName")}
            hint="Optional: “Okada rider”, “Mama Bisi”"
          >
            {(a11y) => (
              <Input {...a11y} value={payeeName} maxLength={200} onChange={(e) => setPayeeName(e.target.value)} />
            )}
          </Field>
        )}

        {kind === "stock" ? (
          <fieldset className="min-w-0 space-y-3">
            <legend className="mb-1 text-sm font-semibold text-fg">What was bought</legend>
            {rows.map((r, i) => {
              const known = r.newItem ? null : active.find((x) => x.id === r.itemId);
              const unit = r.newItem?.unit ?? known?.unit;
              const q = Number(r.quantity);
              return (
                <div key={r.key} className="space-y-2 rounded-xl border border-line p-3">
                  <div className="flex items-end gap-2">
                    <Field id={`lines.${i}`} label="Item" error={error(`lines.${i}`)}>
                      {(a11y) => (
                        <Select
                          {...a11y}
                          value={r.newItem ? NEW : r.itemId}
                          onChange={(e) => {
                            if (e.target.value === NEW) return setRow(r.key, { itemId: "", newItem: freshItem() });
                            const chosen = active.find((x) => x.id === e.target.value);
                            setRow(r.key, {
                              itemId: e.target.value,
                              newItem: null,
                              unitCostKobo: r.unitCostKobo ?? chosen?.avgCostKobo ?? null,
                            });
                          }}
                        >
                          {active.length > 0 && <option value="">Choose an item</option>}
                          {active.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                          <option value={NEW}>+ New item</option>
                        </Select>
                      )}
                    </Field>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove ${known?.name ?? (r.newItem?.name || "this line")}`}
                        onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                        className="focus-ring mb-1 grid size-10 shrink-0 place-items-center rounded-lg text-fg-subtle hover:text-danger-fg"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                  {r.newItem && (
                    <NewItemFields index={i} value={r.newItem} onChange={(newItem) => setRow(r.key, { newItem })} />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Field id={`quantity.${i}`} label={unit ? `How many ${unit}s` : "How many"}>
                      {(a11y) => (
                        <Input
                          {...a11y}
                          inputMode="decimal"
                          className="num"
                          value={r.quantity}
                          onChange={(e) => setRow(r.key, { quantity: e.target.value.replace(/[^\d.]/g, "") })}
                        />
                      )}
                    </Field>
                    <Field id={`unitCost.${i}`} label={unit ? `Price per ${unit}` : "Price for one"}>
                      {(a11y) => (
                        <MoneyInput
                          {...a11y}
                          value={r.unitCostKobo}
                          onChange={(k) => setRow(r.key, { unitCostKobo: k })}
                        />
                      )}
                    </Field>
                  </div>
                  {unit && q > 0 && r.unitCostKobo !== null && (
                    <p className="num text-right text-xs text-fg-muted">
                      {formatQuantity(q, unit)} × {formatNaira(r.unitCostKobo)} ={" "}
                      <strong className="text-fg">
                        {formatNaira(lineTotal({ quantity: q, unitCostKobo: r.unitCostKobo }))}
                      </strong>
                    </p>
                  )}
                </div>
              );
            })}
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setRows((list) => [
                  ...list,
                  {
                    key: Date.now(),
                    itemId: "",
                    newItem: active.length ? null : freshItem(),
                    quantity: "",
                    unitCostKobo: null,
                  },
                ])
              }
            >
              <Plus /> Add another item
            </Button>
            <Field id="deliveryKobo" label="Delivery" error={error("deliveryKobo")} hint="Optional">
              {(a11y) => <MoneyInput {...a11y} value={deliveryKobo} onChange={setDeliveryKobo} placeholder="0.00" />}
            </Field>
          </fieldset>
        ) : (
          <>
            <fieldset className="min-w-0">
              <legend className="mb-2 text-sm font-semibold text-fg">What for</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What for">
                {categories
                  .filter((c) => !c.archived && !SYSTEM_CATEGORIES.includes(c.key))
                  .map(({ key: c, name }) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={category === c}
                      onClick={() => setCategory(c)}
                      className={cn(
                        "focus-ring rounded-full border px-3 py-1.5 text-sm font-medium",
                        category === c
                          ? "border-brand bg-brand-subtle text-brand-fg"
                          : "border-line bg-surface text-fg-muted",
                      )}
                    >
                      {name}
                    </button>
                  ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Field id="amountKobo" label="Amount" error={error("amountKobo")}>
                {(a11y) => <MoneyInput {...a11y} value={amountKobo} onChange={setAmountKobo} placeholder="15,000.00" />}
              </Field>
              <Field id="description" label="For" error={error("description")}>
                {(a11y) => (
                  <Input
                    {...a11y}
                    value={description}
                    maxLength={200}
                    placeholder="Feed from Ibadan"
                    onChange={(e) => setDescription(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </>
        )}

        {kind === "other" && category === "equipment" && (
          <fieldset className="min-w-0 space-y-3 rounded-xl border border-line p-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-5 accent-[rgb(var(--brand))]"
                checked={track}
                onChange={(e) => setTrack(e.target.checked)}
              />
              <span>
                <span className="block font-semibold text-fg">Track as equipment</span>
                <span className="text-fg-muted">
                  It lasts years: its cost is spread over its life instead of counting all this month.
                </span>
              </span>
            </label>
            {track && (
              <div className="grid grid-cols-2 gap-3">
                <Field id="asset.kind" label="What it is" error={error("asset.kind")}>
                  {(a11y) => (
                    <Select
                      {...a11y}
                      value={assetKind}
                      onChange={(e) => {
                        const k = e.target.value as AssetKind;
                        setAssetKind(k);
                        setLife(String(DEFAULT_LIFE[k]));
                      }}
                    >
                      {ASSET_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {ASSET_KIND_LABELS[k]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field id="asset.usefulLifeMonths" label="Lasts (months)" error={error("asset.usefulLifeMonths")}>
                  {(a11y) => (
                    <Input
                      {...a11y}
                      inputMode="numeric"
                      className="num"
                      value={life}
                      onChange={(e) => setLife(e.target.value.replace(/\D/g, ""))}
                    />
                  )}
                </Field>
              </div>
            )}
          </fieldset>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field id="batchId" label="For batch" error={error("batchId")} hint="Optional">
            {(a11y) => (
              <Select {...a11y} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                <option value="">The whole farm</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="date" label="Date" error={error("date")}>
            {(a11y) => (
              <Input {...a11y} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            )}
          </Field>
        </div>

        <fieldset className="min-w-0 space-y-2">
          <legend className="mb-1 text-sm font-semibold text-fg">How is it paid?</legend>
          <div role="radiogroup" aria-label="How is it paid?" className="grid gap-2">
            <Choice
              checked={choice === "paystack"}
              disabled={!payable}
              onSelect={() => setPaid("paystack")}
              icon={<Send />}
              title="Pay now with Paystack"
              detail={
                payable && supplier?.bank
                  ? `To ${supplier.bank.accountName}, ${supplier.bank.bankName} ${maskAccount(supplier.bank.accountNumber)}. You confirm next.`
                  : payable && bank
                    ? `To ${bank.accountName}, ${bank.bankName} ${maskAccount(bank.accountNumber)}. You confirm next.`
                    : payable
                      ? "To any bank account: enter it below."
                      : !canPay
                        ? "Only the owners send money."
                        : supplier
                          ? `Add ${supplier.name}'s bank account first.`
                          : "Choose a supplier with a bank account."
              }
            />
            <Choice
              checked={choice === "already"}
              onSelect={() => setPaid("already")}
              icon={<CircleCheck />}
              title="Already paid"
              detail="Cash, your own bank transfer or POS"
            />
            <Choice
              checked={choice === "later"}
              onSelect={() => setPaid("later")}
              icon={<HandCoins />}
              title="Pay later"
              detail={supplier ? `Shows as owed to ${supplier.name}` : "Shows as owed"}
            />
          </div>
          {askBank && (
            <div className="space-y-3 rounded-xl border border-line p-4">
              <p className="text-sm font-semibold text-fg">
                {choice === "paystack"
                  ? "Bank account to pay"
                  : "Their bank account (optional, so an owner can pay it)"}
              </p>
              <BankAccountField value={null} onChange={setBank} onState={setBankState} error={error("payeeBank")} />
              {bank && (
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-5 accent-[rgb(var(--brand))]"
                    checked={saveSupplier}
                    onChange={(e) => setSaveSupplier(e.target.checked)}
                  />
                  <span>
                    <span className="block font-semibold text-fg">Save as a supplier</span>
                    <span className="text-fg-muted">
                      To pay {payeeName.trim() || bank.accountName} again without typing the account.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}
          {choice === "already" && (
            <Segmented
              label="Paid by"
              className="w-full"
              value={how}
              onChange={setHow}
              options={[
                { value: "cash", label: "Cash" },
                { value: "transfer", label: "Transfer" },
                { value: "pos", label: "POS" },
              ]}
            />
          )}
          {error("method") && <p className="text-[13px] font-medium text-danger-fg">{error("method")}</p>}
        </fieldset>

        <FileDrop
          files={files}
          onChange={setFiles}
          label="Receipt"
          hint="Optional. A photo or PDF, up to 5 MB."
          maxSizeMB={5}
        />
        {error("receipt") && <p className="text-[13px] font-medium text-danger-fg">{error("receipt")}</p>}

        <Field id="notes" label="Notes" hint="Optional">
          {(a11y) => (
            <Textarea {...a11y} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          )}
        </Field>
      </div>
    </Sheet>
  );
}

function Choice({
  checked,
  disabled,
  onSelect,
  icon,
  title,
  detail,
}: {
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onSelect()}
      className={cn(
        "focus-ring flex items-start gap-3 rounded-xl border p-3 text-left",
        checked ? "border-brand bg-brand-subtle" : "border-line bg-surface",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span className={cn("mt-0.5 [&_svg]:size-5", checked ? "text-brand-fg" : "text-fg-subtle")}>{icon}</span>
      <span>
        <span className="block font-semibold text-fg">{title}</span>
        <span className="block text-sm text-fg-muted">{detail}</span>
      </span>
    </button>
  );
}

/** A stock item bought for the first time: made with the purchase. */
function NewItemFields({ index, value, onChange }: { index: number; value: NewItem; onChange: (v: NewItem) => void }) {
  const set = (change: Partial<NewItem>) => onChange({ ...value, ...change });
  return (
    <div className="space-y-2 rounded-lg bg-surface-subtle p-3">
      <Field id={`newItem.${index}`} label="New item's name">
        {(a11y) => (
          <Input
            {...a11y}
            value={value.name}
            maxLength={60}
            placeholder="Starter feed"
            onChange={(e) => set({ name: e.target.value })}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field id={`newItem.${index}.category`} label="Kind">
          {(a11y) => (
            <Select
              {...a11y}
              value={value.category}
              onChange={(e) => {
                const category = e.target.value as Category;
                set({ category, unitKg: category === "feed" && value.unit !== "kg" ? (value.unitKg ?? 25) : null });
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field id={`newItem.${index}.unit`} label="Counted in">
          {(a11y) => (
            <Select
              {...a11y}
              value={value.unit}
              onChange={(e) => {
                const unit = e.target.value as Unit;
                set({
                  unit,
                  unitKg: unit === "kg" ? null : value.category === "feed" ? (value.unitKg ?? 25) : value.unitKg,
                });
              }}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {value.category === "feed" && value.unit !== "kg" && (
        <Field id={`newItem.${index}.unitKg`} label={`Kg per ${value.unit}`}>
          {(a11y) => (
            <Input
              {...a11y}
              inputMode="decimal"
              className="num"
              value={value.unitKg === null ? "" : String(value.unitKg)}
              onChange={(e) => set({ unitKg: e.target.value === "" ? null : Number(e.target.value) })}
            />
          )}
        </Field>
      )}
    </div>
  );
}
