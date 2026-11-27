"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormik } from "formik";
import { Archive, Boxes, LoaderCircle, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { type SpendProps, useSpending } from "../../expenses/_components/expenses-board";
import { Field, useFocusFirstError } from "@/components/auth";
import { ConfirmDialog, EmptyState, Fab, Panel } from "@/components/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ActionFeedback } from "@/components/ui/action-feedback";
import { Sheet } from "@/components/ui/sheet";
import { type AuthError, apiRequest } from "@/lib/auth/client";
import { useAction } from "@/lib/use-action";
import type { ItemView } from "@/lib/inventory/items";
import {
  type Category,
  CATEGORIES,
  CATEGORY_LABELS,
  COMMON_ITEMS,
  type ItemInput,
  nameKey,
  quantity,
  UNITS,
  validateItem,
} from "@/lib/inventory/rules";
import { formatNaira } from "@/lib/money";
import { cn } from "@/lib/utils";

/** The farm's stock items, searchable and filtered by kind; each opens a sheet to edit it. */
export function InventoryBoard({
  items,
  canWrite,
  showMoney = true,
  spending = null,
}: {
  items: ItemView[];
  canWrite: boolean;
  /** Stock values are money: hidden from farm hands. */
  showMoney?: boolean;
  /** What buying stock needs, for those who can record spending; null hides it. */
  spending?: SpendProps | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<ItemView | ItemInput | null>(null);
  const buying = useSpending(spending ?? EMPTY_SPEND);
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<Category | "all">("all");
  const [showArchived, setShowArchived] = React.useState(false);

  const active = items.filter((i) => showArchived || !i.archived);
  const present = CATEGORIES.filter((c) => active.some((i) => i.category === c));
  const shown = active.filter(
    (i) =>
      (category === "all" || i.category === category) && (!query.trim() || nameKey(i.name).includes(nameKey(query))),
  );
  const have = new Set(items.map((i) => nameKey(i.name)));
  const suggestions = COMMON_ITEMS.filter((c) => !have.has(nameKey(c.name)));

  const adding = useAction();
  const quickAdd = (item: ItemInput) =>
    adding.run(() => apiRequest("/api/inventory/items", "POST", item), {
      key: item.name,
      success: `${item.name} added.`,
      toastError: true,
      onSuccess: () => router.refresh(),
    });

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Boxes />}
            title="Nothing in stock yet"
            description="Buy what you need, or add the feed, drugs, litter and fuel you already keep. Daily logs take feed off."
            action={
              spending || canWrite ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {spending && (
                    <Button size="sm" onClick={() => buying.spend({ kind: "stock" })}>
                      <ShoppingCart /> Buy stock
                    </Button>
                  )}
                  {canWrite && (
                    <Button size="sm" variant="secondary" onClick={() => setEditing(BLANK)}>
                      <Plus /> Add an item
                    </Button>
                  )}
                </div>
              ) : undefined
            }
          />
        </Panel>
      ) : (
        <>
          {showMoney && (
            <p className="text-sm text-fg-muted">
              Stock worth{" "}
              <span className="num font-semibold text-fg">
                {formatNaira(items.reduce((sum, i) => sum + (i.archived ? 0 : i.valueKobo), 0))}
              </span>
              {items.some((i) => i.low) && (
                <>
                  {" · "}
                  <span className="font-semibold text-warning-fg">{items.filter((i) => i.low).length} running low</span>
                </>
              )}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1 basis-56">
              <span className="sr-only">Search items</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
                aria-hidden
              />
              <Input
                type="search"
                placeholder="Search items"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </label>
            {spending && (
              <Button size="sm" onClick={() => buying.spend({ kind: "stock" })}>
                <ShoppingCart /> Buy stock
              </Button>
            )}
            {canWrite && (
              <Button size="sm" variant="secondary" className="hidden lg:inline-flex" onClick={() => setEditing(BLANK)}>
                <Plus /> Add item
              </Button>
            )}
          </div>
          <div
            role="radiogroup"
            aria-label="Kind of item"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0"
          >
            {(["all", ...present] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  "focus-ring shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium",
                  category === c
                    ? "border-brand bg-brand-subtle text-brand-fg"
                    : "border-line bg-surface text-fg-muted",
                )}
              >
                {c === "all" ? "All" : CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          {shown.length ? (
            <Panel flush>
              <ul className="divide-y divide-line">
                {shown.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/inventory/${item.id}`}
                      className="focus-ring flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-subtle"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-fg">{item.name}</span>
                          {item.low && <Badge tone="warning">Low</Badge>}
                          {item.onHand < 0 && <Badge tone="danger">Count needed</Badge>}
                          {item.archived && <Badge>Archived</Badge>}
                        </span>
                        <span className="block text-xs text-fg-muted">
                          {[
                            CATEGORY_LABELS[item.category],
                            item.unitKg ? `${item.unitKg} kg ${item.unit}` : `per ${item.unit}`,
                            item.reorderLevel !== null && `reorder below ${quantity(item.reorderLevel, item.unit)}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="num shrink-0 text-right">
                        <span className="block font-semibold text-fg">{quantity(item.onHand, item.unit)}</span>
                        {showMoney && (
                          <span className="block text-xs text-fg-subtle">{formatNaira(item.valueKobo)}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : (
            <Panel>
              <EmptyState icon={<Search />} title="No matching items" description="Try another name or kind." />
            </Panel>
          )}
          {items.some((i) => i.archived) && (
            <button
              type="button"
              className="focus-ring rounded-md text-sm font-medium text-brand-fg"
              onClick={() => setShowArchived((s) => !s)}
            >
              {showArchived ? "Hide archived items" : "Show archived items"}
            </button>
          )}
        </>
      )}

      {canWrite && suggestions.length > 0 && (
        <section aria-labelledby="common-items" className="space-y-2">
          <h2 id="common-items" className="text-sm font-semibold text-fg">
            Add common items
          </h2>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.name}
                type="button"
                disabled={adding.busy}
                aria-busy={adding.isPending(s.name) || undefined}
                onClick={() => void quickAdd(s)}
                className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3 py-1.5 text-sm text-fg enabled:hover:bg-surface-subtle disabled:cursor-wait disabled:opacity-60"
              >
                {adding.isPending(s.name) ? (
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Plus className="size-3.5" aria-hidden />
                )}{" "}
                {s.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {canWrite && <Fab label="Add item" icon={<Plus />} onClick={() => setEditing(BLANK)} />}
      {spending && buying.sheets}

      {editing && (
        <ItemSheet
          key={"id" in editing ? editing.id : "new"}
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            toast.success(message);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

const EMPTY_SPEND: SpendProps = {
  categories: [],
  suppliers: [],
  items: [],
  batches: [],
  today: "",
  canWrite: false,
  canPay: false,
};

const BLANK: ItemInput = {
  name: "",
  category: "feed",
  unit: "bag",
  unitKg: 25,
  reorderLevel: null,
  notes: "",
};

const UNIT_LABELS: Record<(typeof UNITS)[number], string> = {
  bag: "Bag",
  kg: "Kilogram",
  litre: "Litre",
  vial: "Vial",
  bottle: "Bottle",
  sachet: "Sachet",
  carton: "Carton",
  piece: "Piece",
  bird: "Bird",
};

export function ItemSheet({
  item,
  onClose,
  onSaved,
}: {
  item: ItemView | ItemInput;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const current = "id" in item ? item : null;
  const [failure, setFailure] = React.useState<AuthError | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const save = async (values: ItemInput & { archived?: boolean }) => {
    if (current)
      await apiRequest(`/api/inventory/items/${current.id}`, "PATCH", { ...values, version: current.version });
    else await apiRequest("/api/inventory/items", "POST", values);
  };

  const form = useFormik<ItemInput>({
    initialValues: {
      name: item.name,
      category: item.category,
      unit: item.unit,
      unitKg: item.unitKg,
      reorderLevel: item.reorderLevel,
      notes: item.notes,
    },
    validate: (values) => validateItem(values),
    onSubmit: async (values, helpers) => {
      setFailure(null);
      try {
        await save(values);
        onSaved(current ? `${values.name.trim()} saved.` : `${values.name.trim()} added.`);
      } catch (e) {
        const error = e as AuthError;
        if (error.field) helpers.setFieldError(error.field, error.message);
        else setFailure(error);
      }
    },
  });
  useFocusFirstError(form, ["name", "category", "unit", "unitKg", "reorderLevel", "notes"]);

  const error = (name: keyof ItemInput) =>
    (form.submitCount > 0 || form.touched[name]) && typeof form.errors[name] === "string"
      ? form.errors[name]
      : undefined;
  const numberValue = (v: number | null) => (v === null || !Number.isFinite(v) ? "" : String(v));
  const v = form.values;
  const weighed = v.category === "feed" && v.unit !== "kg";

  return (
    <>
      <Sheet
        open
        onClose={() => !form.isSubmitting && onClose()}
        title={current ? current.name : "Add an item"}
        subtitle={current ? CATEGORY_LABELS[current.category] : "Something you keep in stock"}
        footer={
          <div className="space-y-2">
            <ActionFeedback action={{ failure }} />
            <Button type="submit" form="item-form" fullWidth loading={form.isSubmitting} size="lg">
              {current ? "Save changes" : "Add item"}
            </Button>
            {current && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await save({ ...v, archived: !current.archived });
                      onSaved(current.archived ? `${current.name} is back in use.` : `${current.name} archived.`);
                    } catch (e) {
                      setFailure(e as AuthError);
                    }
                  }}
                >
                  <Archive /> {current.archived ? "Unarchive" : "Archive"}
                </Button>
                <Button variant="ghost" className="text-danger-fg" onClick={() => setDeleting(true)}>
                  <Trash2 /> Delete
                </Button>
              </div>
            )}
          </div>
        }
      >
        <form id="item-form" noValidate onSubmit={form.handleSubmit} className="space-y-5">
          <Field id="name" label="Name" error={error("name")}>
            {(a11y) => (
              <Input
                {...a11y}
                {...form.getFieldProps("name")}
                placeholder="Starter feed"
                autoComplete="off"
                maxLength={60}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="category" label="Kind" error={error("category")}>
              {(a11y) => (
                <Select
                  {...a11y}
                  {...form.getFieldProps("category")}
                  onChange={(e) => {
                    const category = e.target.value as Category;
                    void form.setValues({
                      ...v,
                      category,
                      // Feed comes in 25 kg bags; anything else needs no weight.
                      unitKg: category === "feed" ? (v.unitKg ?? 25) : null,
                    });
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
            <Field id="unit" label="Counted in" error={error("unit")}>
              {(a11y) => (
                <Select
                  {...a11y}
                  {...form.getFieldProps("unit")}
                  onChange={(e) =>
                    void form.setValues({
                      ...v,
                      unit: e.target.value as ItemInput["unit"],
                      unitKg: e.target.value === "kg" ? null : v.unitKg,
                    })
                  }
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {UNIT_LABELS[u]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(weighed || v.unitKg !== null) && v.unit !== "kg" && (
              <Field
                id="unitKg"
                label={`Kg per ${v.unit}`}
                error={error("unitKg")}
                hint={weighed ? "So daily feed in kg comes off stock" : "Optional"}
              >
                {(a11y) => (
                  <Input
                    {...a11y}
                    name="unitKg"
                    inputMode="decimal"
                    className="num"
                    placeholder="25"
                    value={numberValue(v.unitKg)}
                    onBlur={form.handleBlur}
                    onChange={(e) =>
                      void form.setFieldValue("unitKg", e.target.value === "" ? null : Number(e.target.value))
                    }
                  />
                )}
              </Field>
            )}
            <Field
              id="reorderLevel"
              label={`Reorder below (${v.unit === "kg" ? "kg" : `${v.unit}s`})`}
              error={error("reorderLevel")}
              hint="Optional: alerts you when stock runs low"
            >
              {(a11y) => (
                <Input
                  {...a11y}
                  name="reorderLevel"
                  inputMode="decimal"
                  className="num"
                  placeholder="10"
                  value={numberValue(v.reorderLevel)}
                  onBlur={form.handleBlur}
                  onChange={(e) =>
                    void form.setFieldValue("reorderLevel", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              )}
            </Field>
          </div>
          <Field id="notes" label="Notes" error={error("notes")} hint="Optional: brand, where it's kept">
            {(a11y) => <Textarea {...a11y} {...form.getFieldProps("notes")} rows={2} maxLength={500} />}
          </Field>
        </form>
      </Sheet>

      {current && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={`Delete ${current.name}?`}
          description="It leaves your inventory. An item with stock history can't be deleted; archive it instead."
          confirmLabel="Delete item"
          onConfirm={async () => {
            await apiRequest(`/api/inventory/items/${current.id}`, "DELETE");
            onSaved(`${current.name} deleted.`);
          }}
        />
      )}
    </>
  );
}
